import { Channel } from "https://raw.githubusercontent.com/BlowaterNostr/csp/master/csp.ts";
import {
    _RelayResponse,
    _RelayResponse_OK,
    _RelayResponse_REQ_Message,
    NostrEvent,
    NostrFilters,
    RelayResponse_REQ_Message,
} from "./nostr.ts";
import { Closer, EventSender, Subscriber, SubscriptionCloser } from "./relay.interface.ts";
import { AsyncWebSocket, CloseTwice } from "./websocket.ts";
import * as csp from "https://raw.githubusercontent.com/BlowaterNostr/csp/master/csp.ts";

export class WebSocketClosed extends Error {}

export type AsyncWebSocketInterface = {
    onMessage: Channel<MessageEvent>;
    onError: Channel<Event>;
    onClose: Channel<CloseEvent>;
    send: (str: string | ArrayBufferLike | Blob | ArrayBufferView) => Promise<WebSocketClosed | undefined>;
    close: (
        code?: number,
        reason?: string,
    ) => Promise<CloseEvent | CloseTwice | typeof csp.closed>;
    isClosedOrClosing(): boolean;
    untilOpen(): Promise<WebSocketClosed | undefined>;
};

export class SubscriptionAlreadyExist extends Error {
    constructor(public subID: string, public filter: NostrFilters, public url: string) {
        super(`subscription '${subID}' already exists for ${url}`);
    }
}

export class ConnectionPoolClosed extends Error {}
export class NoRelayRegistered extends Error {
    constructor() {
        super();
        this.name = "NoRelayRegistered";
    }
}

export class RelayAlreadyRegistered extends Error {
    constructor(public url: string) {
        super(`relay ${url} has been registered already`);
    }
}

export class SingleRelayConnection implements Subscriber, SubscriptionCloser, EventSender, Closer {
    isClosedByClient = false;
    private subscriptionMap = new Map<
        string,
        { filter: NostrFilters; chan: csp.Channel<RelayResponse_REQ_Message> }
    >();

    private constructor(
        readonly url: string,
        readonly ws: AsyncWebSocketInterface,
    ) {}

    public static New(
        url: string,
        wsCreator?: (url: string) => AsyncWebSocketInterface | Error,
    ): SingleRelayConnection | Error {
        try {
            if (!url.startsWith("wss://") && !url.startsWith("ws://")) {
                url = "wss://" + url;
            }
            if (wsCreator == undefined) {
                wsCreator = AsyncWebSocket.New;
            }
            const ws = wsCreator(url);
            if (ws instanceof Error) {
                return ws;
            }
            let relay = new SingleRelayConnection(url, ws);
            (async () => {
                for await (const wsMessage of relay.ws.onMessage) {
                    let relayResponse = parseJSON<_RelayResponse>(
                        wsMessage.data,
                    );
                    if (relayResponse instanceof Error) {
                        console.error(relayResponse.message);
                        return;
                    }

                    if (
                        relayResponse[0] === "EVENT" ||
                        relayResponse[0] === "EOSE"
                    ) {
                        let subID = relayResponse[1];
                        let subscription = relay.subscriptionMap.get(
                            subID,
                        );
                        if (subscription === undefined) {
                            return; // the subscription has been closed locally before receiving remote messages
                        }
                        const chan = subscription.chan;
                        if (chan.closed()) {
                            console.log(url, subID, "has been closed", chan.closed());
                        } else {
                            if (relayResponse[0] === "EOSE") {
                                chan.put({
                                    type: relayResponse[0],
                                    subID: relayResponse[1],
                                });
                            } else {
                                chan.put({
                                    type: relayResponse[0],
                                    subID: relayResponse[1],
                                    event: relayResponse[2],
                                });
                            }
                        }
                    } else {
                        console.log(url, wsMessage.data); // NOTICE, OK and other non-standard response types
                    }
                }
            })();
            (async () => {
                for await (const event of relay.ws.onError) {
                    console.log(url, "error", event);
                }
            })();
            return relay;
        } catch (e) {
            console.log("failed to create WebSocket connection for", url);
            return e;
        }
    }

    newSub = async (subID: string, filter: NostrFilters) => {
        console.info(this.url, "newSub", subID, filter);
        let subscription = this.subscriptionMap.get(subID);
        if (subscription !== undefined) {
            return new SubscriptionAlreadyExist(subID, filter, this.url);
        }

        const err = await this.ws.send(JSON.stringify([
            "REQ",
            subID,
            filter,
        ]));
        if (err) {
            return err;
        }

        const chan = csp.chan<RelayResponse_REQ_Message>();
        // @ts-ignore debug id
        chan.id = subID;
        this.subscriptionMap.set(subID, { filter, chan });
        return { filter, chan };
    };

    // todo: add waitForOk back
    sendEvent = async (nostrEvent: NostrEvent) => {
        return await this.ws.send(JSON.stringify([
            "EVENT",
            nostrEvent,
        ]));
    };

    closeSub = async (subID: string) => {
        let err = await this.ws.send(JSON.stringify([
            "CLOSE",
            subID, // multiplex marker / channel
        ]));
        if (err) {
            console.error(err); // do not return because we still need to close sub map channels
        }
        const subscription = this.subscriptionMap.get(subID);
        if (subscription === undefined) {
            return;
        }

        try {
            await subscription.chan.close();
        } catch (e) {
            if (!(e instanceof csp.CloseChannelTwiceError)) {
                throw e;
            }
        }
        this.subscriptionMap.delete(subID);
    };

    close = async () => {
        this.isClosedByClient = true;
        for (const [subID, { chan }] of this.subscriptionMap.entries()) {
            if (chan.closed()) {
                continue;
            }
            await this.closeSub(subID);
        }
        await this.ws.close();
    };

    isClosed(): boolean {
        return this.ws.isClosedOrClosing();
    }

    untilOpen = async () => {
        return this.ws.untilOpen();
    };
}

export class ConnectionPool implements SubscriptionCloser, EventSender, Closer {
    private closed = false;
    private readonly connections = new Map<string, SingleRelayConnection>(); // url -> relay
    private readonly subscriptionMap = new Map<
        string,
        {
            filter: NostrFilters;
            chan: csp.Channel<{ res: RelayResponse_REQ_Message; url: string }>;
        }
    >();

    private readonly wsCreator: (url: string) => AsyncWebSocket | Error;

    constructor(
        private args?: {
            ws: (url: string) => AsyncWebSocket | Error;
        },
    ) {
        if (!args) {
            this.wsCreator = AsyncWebSocket.New;
        } else {
            this.wsCreator = args.ws;
        }
    }

    getClosedRelaysThatShouldBeReconnected() {
        const closed: string[] = [];
        for (let relay of this.connections.values()) {
            if (relay.isClosed() && !relay.isClosedByClient) {
                console.info(relay.url, "is closed by remote");
                closed.push(relay.url);
            }
        }
        return closed;
    }

    getRelays(): SingleRelayConnection[] {
        return Array.from(this.connections.values());
    }

    getRelay(url: string | URL): SingleRelayConnection | undefined {
        if (url instanceof URL) {
            url = url.toString();
        }
        return this.connections.get(url);
    }

    async addRelayURL(url: string): Promise<RelayAlreadyRegistered | Error | void> {
        if (this.connections.has(url)) {
            return new RelayAlreadyRegistered(url);
        }
        const relay = SingleRelayConnection.New(url, this.wsCreator);
        if (relay instanceof Error) {
            return relay;
        }
        if (this.connections.has(relay.url)) {
            await relay.close();
            return new RelayAlreadyRegistered(relay.url);
        }
        return this.addRelay(relay);
    }

    async addRelayURLs(urls: string[]) {
        const ps = [];
        for (const url of urls) {
            ps.push(this.addRelayURL(url));
        }
        const errs = await Promise.all(ps);
        const errs2 = new Array<Error>();
        for (const err of errs) {
            if (err != undefined) {
                errs2.push(err);
            }
        }
        if (errs2.length === 0) {
            return undefined;
        }
        return errs2;
    }

    async addRelay(relay: SingleRelayConnection) {
        if (this.closed) {
            return new ConnectionPoolClosed("connection pool has been closed");
        }
        if (this.connections.has(relay.url)) {
            return new RelayAlreadyRegistered(relay.url);
        }

        this.connections.set(relay.url, relay);

        const err = await relay.untilOpen();
        if (err) {
            this.connections.delete(relay.url);
            return err;
        }

        // for this newly added relay, do all the subs
        for (let [subID, { filter, chan }] of this.subscriptionMap.entries()) {
            let sub = await relay.newSub(subID, filter);
            if (sub instanceof Error) {
                return sub;
            }
            // pipe the channel
            (async () => {
                for await (let msg of sub.chan) {
                    // console.log(subID, filter, msg)
                    let err = await chan.put({ res: msg, url: relay.url });
                    if (err instanceof csp.PutToClosedChannelError) {
                        if (this.closed === true) {
                            // we only expect the destination channel to be closed
                            // if the ConnectionPool itself it closed
                        } else {
                            throw Error(
                                "should not close the destination channel",
                            );
                        }
                    }
                }
            })();
        }
    }

    async removeRelay(url: string) {
        const relay = this.connections.get(url);
        if (relay === undefined) {
            return;
        }
        const p = relay.close();
        await p;
        this.connections.delete(url);
    }

    async newSub(
        subID: string,
        filter: NostrFilters,
    ) {
        if (this.subscriptionMap.has(subID)) {
            return new SubscriptionAlreadyExist(subID, filter, "relay pool");
        }
        const results = csp.chan<{ res: RelayResponse_REQ_Message; url: string }>();
        for (let conn of this.connections.values()) {
            (async (relay: SingleRelayConnection) => {
                const sub = await relay.newSub(subID, filter);
                if (sub instanceof Error) {
                    console.error(sub);
                    return;
                }
                for await (let msg of sub.chan) {
                    await results.put({ res: msg, url: relay.url });
                }
            })(conn);
        }
        const sub = { filter, chan: results };
        this.subscriptionMap.set(subID, sub);
        return sub;
    }

    async sendEvent(nostrEvent: NostrEvent) {
        if (this.connections.size === 0) {
            return new NoRelayRegistered();
        }
        for (let relay of this.connections.values()) {
            if (relay.isClosed() && !relay.isClosedByClient) {
                continue;
            }
            const err = await relay.sendEvent(nostrEvent);
            if (err instanceof WebSocketClosed) {
                console.error(err);
            }
        }
        const closed = this.getClosedRelaysThatShouldBeReconnected();
        for (let url of closed) {
            const relay = SingleRelayConnection.New(url, AsyncWebSocket.New);
            if (relay instanceof Error) {
                console.error("SingleRelayConnection construction", relay);
                continue;
            }
            {
                const err = await relay.sendEvent(nostrEvent);
                if (err) {
                    console.error("relay.sendEvent", err);
                    continue;
                }
            }

            this.connections.delete(relay.url);
            const err = await this.addRelay(relay);
            if (err instanceof Error) {
                return err; // should never happen
            }
        }
    }

    async closeSub(subID: string) {
        for (const relay of this.connections.values()) {
            await relay.closeSub(subID);
        }
        const subscription = this.subscriptionMap.get(subID);
        if (subscription && subscription.chan.closed() == false) {
            await subscription.chan.close();
        }
        this.subscriptionMap.delete(subID);
    }
    async close(): Promise<void> {
        this.closed = true;
        for (const relay of this.connections.values()) {
            if (relay.isClosed()) {
                continue;
            }
            await relay.close();
        }
        // this function should not be called in production
        // but we implement it for testing purpose
        for (const [subID, { chan }] of this.subscriptionMap.entries()) {
            await this.closeSub(subID);
        }
    }
}

function parseJSON<T>(content: string): T | Error {
    try {
        return JSON.parse(content) as T;
    } catch (e) {
        return e as Error;
    }
}
