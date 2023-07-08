import {
    _RelayResponse,
    _RelayResponse_OK,
    _RelayResponse_REQ_Message,
    NostrEvent,
    NostrFilters,
    RelayResponse_REQ_Message,
} from "./nostr.ts";
import { AsyncWebSocket, WebSocketClosed } from "./websocket.ts";
import * as csp from "https://raw.githubusercontent.com/BlowaterNostr/csp/master/csp.ts";

export class SubscriptionAlreadyExist extends Error {
    // breaking-todo: remove filter
    constructor(public subID: string, public filter: NostrFilters, public url: string) {
        super(`${subID} already exists for ${url}`);
    }
}

export class SubscriptionNotExist extends Error {
    constructor(public subID: string, public url: string) {
        super(`sub '${subID}' not exist for ${url}`);
    }
}

export class SingleRelayConnection {
    isClosedByClient = false;
    private subscriptionMap = new Map<
        string,
        { filter: NostrFilters; chan: csp.Channel<RelayResponse_REQ_Message> }
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
                        [relay.ws.onMessage, async (wsMessage: MessageEvent) => {
                            let relayResponse: _RelayResponse = JSON.parse(
                                wsMessage.data,
                            );

                            if (
                                relayResponse[0] === "EVENT" ||
                                relayResponse[0] === "EOSE"
                            ) {
                                let subID = relayResponse[1];
                                let subscription = relay.subscriptionMap.get(
                                    subID,
                                );
                                if (subscription === undefined) {
                                    // possible solution: could close the sub
                                    throw Error(
                                        `${subID} should not exist in the relay or the client forgot to send ["Close", ${subID}]`,
                                    );
                                }
                                const chan = subscription.chan;
                                if (chan.closed()) {
                                    console.log(url, subID, "has been closed");
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
        this.subscriptionMap.set(subID, { filter, chan });
        return chan;
    };

    updateSub = async (subID: string, filter: NostrFilters) => {
        const sub = this.subscriptionMap.get(subID);
        if (sub == undefined) {
            return new SubscriptionNotExist(subID, this.url);
        }
        {
            const err = await this.ws.send(JSON.stringify([
                "CLOSE",
                subID, // multiplex marker / channel
            ]));
            if (err) {
                return err;
            }
        }
        {
            const err = await this.ws.send(JSON.stringify([
                "REQ",
                subID,
                filter,
            ]));
            if (err) {
                return err;
            }
        }
        return sub.chan;
    };

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
            await subscription.chan.close(`close sub ${subID}`);
        } catch (e) {
            if (!(e instanceof csp.CloseChannelTwiceError)) {
                throw e;
            }
        }
    };

    close = async () => {
        await this.ws.close();
        this.isClosedByClient = true;
        for (const [subID, { chan }] of this.subscriptionMap.entries()) {
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
export class RelayGroupNotExist extends Error {
    constructor(public readonly group: string) {
        super(`relay group ${group} does not exist`);
        this.name = "RelayGroupNotExist";
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
        {
            filter: NostrFilters;
            chan: csp.Channel<{ res: RelayResponse_REQ_Message; url: string }>;
        }
    >();

    // Groups
    private readonly groups = new Map<string, Set<string>>();
    addGroup(group: string, url: string) {
        let g = this.groups.get(group);
        if (!g) {
            g = new Set();
            this.groups.set(group, g);
        }
        if (this.connections.has(url)) {
            g.add(url);
        } else {
            return new NoRelayRegistered(); // todo: use a different error
        }
    }

    private readonly changeEmitter = csp.chan();
    private readonly changeCaster = csp.multi(this.changeEmitter);
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
        const relay = SingleRelayConnection.New(url, this.wsCreator);
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
        for (let [subID, { filter, chan }] of this.subscriptionMap.entries()) {
            let results = await relay.newSub(subID, filter);
            if (results instanceof Error) {
                return results;
            }
            // pipe the channel
            (async () => {
                for await (let msg of results) {
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
        | csp.Channel<{ res: RelayResponse_REQ_Message; url: string }>
        | SubscriptionAlreadyExist
        | WebSocketClosed
    > {
        if (this.subscriptionMap.has(subID)) {
            return new SubscriptionAlreadyExist(subID, filter, "relay pool");
        }
        let results = csp.chan<{ res: RelayResponse_REQ_Message; url: string }>();
        for (let conn of this.connections.values()) {
            (async (relay: SingleRelayConnection) => {
                let channel = await relay.newSub(subID, filter);
                if (channel instanceof Error) {
                    console.error(channel);
                    return;
                }
                for await (let msg of channel) {
                    await results.put({ res: msg, url: relay.url });
                }
            })(conn);
        }
        this.subscriptionMap.set(subID, { filter, chan: results });
        return results;
    }

    async updateSub(subID: string, filter: NostrFilters) {
        const sub = this.subscriptionMap.get(subID);
        if (!sub) {
            return new SubscriptionNotExist(subID, "relay pool");
        }
        for (const relay of this.connections.values()) {
            const err = await relay.updateSub(subID, filter);
            if (err instanceof Error) {
                return err;
            }
        }
        return sub.chan;
    }

    async sendEvent(nostrEvent: NostrEvent, group?: string) {
        if (this.connections.size === 0) {
            return new NoRelayRegistered();
        }
        if (group && !this.groups.has(group)) {
            return new RelayGroupNotExist(group);
        }
        for (let relay of this.connections.values()) {
            if (group) {
                const g = this.groups.get(group);
                if (g && !g.has(relay.url)) {
                    continue; // skip because this relay is not in the group
                }
            }
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
        for (let [subID, { chan }] of this.subscriptionMap.entries()) {
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
