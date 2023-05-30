import {
    _RelayResponse,
    _RelayResponse_OK,
    _RelayResponse_REQ_Message,
    EventID,
    NostrEvent,
    NostrFilters,
    RelayResponse_REQ_Message,
} from "./nostr.ts";
import { AsyncWebSocket, WebSocketClosed } from "./websocket.ts";
import * as csp from "https://raw.githubusercontent.com/BlowaterNostr/csp/master/csp.ts";

export class SubscriptionAlreadyExist extends Error {
    constructor(public subID: string, public filter: NostrFilters, public url: string) {
        super(`${subID} already exists for ${url}`);
    }
}

export class SingleRelayConnection {
    isClosedByClient = false;
    private subscriptionMap = new Map<
        string,
        [NostrFilters, csp.Channel<RelayResponse_REQ_Message>]
    >();
    private okMap = new Map<
        EventID,
        [csp.Channel<void>, _RelayResponse_OK | undefined]
    >();

    private constructor(
        readonly url: string,
        readonly ws: AsyncWebSocket,
    ) {}

    public static New(
        url: string,
        wsCreator: (url: string) => AsyncWebSocket | Error,
    ): SingleRelayConnection | Error {
        try {
            const ws = wsCreator(url);
            if (ws instanceof Error) {
                return ws;
            }
            let relay = new SingleRelayConnection(url, ws);
            (async () => {
                for (; relay.isClosed() === false;) {
                    await csp.select([
                        [relay.ws.onMessage, async (event: MessageEvent) => {
                            let nostrMessage: _RelayResponse = JSON.parse(
                                event.data,
                            );

                            if (nostrMessage[0] === "OK") {
                                const eventOK = relay.okMap.get(
                                    nostrMessage[1],
                                );
                                if (!eventOK) {
                                    throw new Error(
                                        `Event ${nostrMessage[1]} dose not exist.`,
                                    );
                                }

                                eventOK[1] = nostrMessage;
                                if (eventOK[0].closed()) {
                                    console.log(eventOK[0].closed());
                                }
                                await eventOK[0].close(
                                    `event ${nostrMessage[1]} is OK`,
                                );
                                return;
                            }

                            if (
                                nostrMessage[0] === "EVENT" ||
                                nostrMessage[0] === "EOSE"
                            ) {
                                let subID = nostrMessage[1];
                                let subscription = relay.subscriptionMap.get(
                                    subID,
                                );
                                if (subscription === undefined) {
                                    // possible solution: could close the sub
                                    throw Error(
                                        `${subID} should not exist in the relay or the client forgot to send ["Close", ${subID}]`,
                                    );
                                }
                                const chan = subscription[1];
                                if (chan.closed()) {
                                    console.log(url, subID, "has been closed");
                                } else {
                                    if (nostrMessage[0] === "EOSE") {
                                        chan.put({
                                            type: nostrMessage[0],
                                            subID: nostrMessage[1],
                                        });
                                    } else {
                                        chan.put({
                                            type: nostrMessage[0],
                                            subID: nostrMessage[1],
                                            event: nostrMessage[2],
                                        });
                                    }
                                }
                            } else {
                                console.log(url, "onMessage", event.data); // NOTICE and other non-standard message types
                            }
                        }],
                        [relay.ws.onError, async (event: Event) => {
                            console.log(url, "error");
                        }],
                    ]);
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
        this.subscriptionMap.set(subID, [filter, chan]);
        return chan;
    };

    sendEvent = async (nostrEvent: NostrEvent) => {
        this.okMap.set(nostrEvent.id, [csp.chan<void>(), undefined]);
        return await this.ws.send(JSON.stringify([
            "EVENT",
            nostrEvent,
        ]));
    };

    async waitEventOK(eventID: EventID): Promise<_RelayResponse_OK> {
        const eventOK = this.okMap.get(eventID);
        if (!eventOK) {
            throw new Error(`Event ${eventID} dose not exist.`);
        }

        await eventOK[0].pop();
        const res = eventOK[1];
        if (!res) {
            throw new Error("unreachable");
        }
        return res;
    }

    closeSub = async (subID: string) => {
        let err = await this.ws.send(JSON.stringify([
            "CLOSE",
            subID,
        ]));
        if (err) {
            console.error(err); // do not return because we still need to close sub map channels
        }
        const subscription = this.subscriptionMap.get(subID);
        if (subscription === undefined) {
            throw Error(
                `sub '${subID}' has been closed already`,
            );
        }
        // do not remove the channel from the map yet
        // because the relay might have send additional data before
        // we, as the client, send "CLOSE"
        // we still need to channel these data in
        // csp.select -> ws.onMessage
        try {
            await subscription[1].close(`close sub ${subID}`);
        } catch (e) {
            if (!(e instanceof csp.CloseChannelTwiceError)) {
                throw e;
            }
        }
    };

    close = async () => {
        await this.ws.close();
        this.isClosedByClient = true;
        for (const [subID, [_, chan]] of this.subscriptionMap.entries()) {
            if (chan.closed()) {
                continue;
            }
            await this.closeSub(subID);
        }
    };

    isClosed(): boolean {
        return this.ws.isClosedOrClosing();
    }

    untilOpen = async () => {
        return this.ws.untilOpen();
    };
}

let i = 0;

export function newSubID(): string {
    return String(++i);
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

export class ConnectionPool {
    private closed = false;
    private readonly connections = new Map<string, SingleRelayConnection>(); // url -> relay
    private readonly subscriptionMap = new Map<
        string,
        [NostrFilters, csp.Channel<[RelayResponse_REQ_Message, string]>]
    >();
    private readonly changeEmitter = csp.chan();
    private readonly changeCaster = csp.multi(this.changeEmitter);

    readonly onChange = () => {
        return this.changeCaster.copy();
    };

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

    async addRelayURL(url: string) {
        try {
            new URL(url);
        } catch (e) {
            if (e instanceof TypeError) {
                return e;
            }
            throw e; // impossible
        }

        if (this.connections.has(url)) {
            return new RelayAlreadyRegistered(url);
        }
        const relay = SingleRelayConnection.New(url, AsyncWebSocket.New);
        if (relay instanceof Error) {
            return relay;
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
        this.changeEmitter.put(undefined);
        relay.ws.onClose.pop().then(async (_) => {
            await this.changeEmitter.put(undefined);
        });

        relay.ws.isSocketOpen.pop().then(async (_) => {
            await this.changeEmitter.put(undefined);
        });

        const err = await relay.untilOpen();
        if (err) {
            this.connections.delete(relay.url);
            this.changeEmitter.put(undefined);
            return err;
        }

        // for this newly added relay, do all the subs
        for (let [subID, [filter, channel]] of this.subscriptionMap.entries()) {
            let results = await relay.newSub(subID, filter);
            if (results instanceof Error) {
                return results;
            }
            // pipe the channel
            (async () => {
                for await (let msg of results) {
                    let err = await channel.put([msg, relay.url]);
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

        await this.changeEmitter.put(undefined);
    }

    async removeRelay(url: string) {
        const relay = this.connections.get(url);
        if (relay === undefined) {
            return;
        }
        const p = relay.close();
        this.changeEmitter.put(undefined); // do not await
        await p;
        this.connections.delete(url);
        this.changeEmitter.put(undefined); // do not await
    }

    async newSub(
        subID: string,
        filter: NostrFilters,
    ): Promise<
        | csp.Channel<[RelayResponse_REQ_Message, string]>
        | SubscriptionAlreadyExist
        | WebSocketClosed
    > {
        if (this.subscriptionMap.has(subID)) {
            return new SubscriptionAlreadyExist(subID, filter, "relay pool");
        }
        let results = csp.chan<[RelayResponse_REQ_Message, string]>();
        for (let conn of this.connections.values()) {
            (async (relay: SingleRelayConnection) => {
                let channel = await relay.newSub(subID, filter);
                if (channel instanceof SubscriptionAlreadyExist) {
                    console.error(channel);
                    return;
                } else if (channel instanceof WebSocketClosed) {
                    console.error(channel);
                    return;
                }
                for await (let msg of channel) {
                    await results.put([msg, relay.url]);
                }
            })(conn);
        }
        this.subscriptionMap.set(subID, [filter, results]);
        return results;
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
                throw err; // should never happen
            }
        }
    }

    async waitEventOK(eventID: EventID, waitAll: boolean = false) {
        const ps = [];
        for (const connection of this.connections.values()) {
            ps.push(connection.waitEventOK(eventID));
        }

        return waitAll ? Promise.all(ps) : [await Promise.race(ps)];
    }

    async closeSub(subID: string) {
        for (const relay of this.connections.values()) {
            await relay.closeSub(subID);
            // do not close the subscription channel because
            // there might be pending web socket events
            // that are not consumed yet
        }
    }
    async close(): Promise<void> {
        this.closed = true;

        // this function should not be called in production
        // but we implement it for testing purpose
        for (let [subID, [_, chan]] of this.subscriptionMap.entries()) {
            await this.closeSub(subID);
            await chan.close(
                `close sub ${subID} because of pool is closed by the client`,
            );
        }
        for (let relay of this.connections.values()) {
            if (relay.isClosed()) {
                continue;
            }
            await relay.close();
        }
    }
}
