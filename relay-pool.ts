import {
    chan,
    Channel,
    PutToClosedChannelError,
} from "https://raw.githubusercontent.com/BlowaterNostr/csp/master/csp.ts";
import { NoteID } from "./nip19.ts";
import { NostrEvent, NostrFilters, RelayResponse_REQ_Message } from "./nostr.ts";
import { Closer, EventSender, SubscriptionCloser } from "./relay.interface.ts";
import {
    ConnectionPoolClosed,
    NoRelayRegistered,
    RelayAlreadyRegistered,
    SingleRelayConnection,
    SubscriptionAlreadyExist,
    WebSocketClosed,
} from "./relay-single.ts";
import { AsyncWebSocket } from "./websocket.ts";

export class ConnectionPool implements SubscriptionCloser, EventSender, Closer {
    private closed = false;
    private readonly connections = new Map<string, SingleRelayConnection>(); // url -> relay
    private readonly subscriptionMap = new Map<
        string,
        {
            filter: NostrFilters;
            chan: Channel<{ res: RelayResponse_REQ_Message; url: string }>;
        }
    >();

    private readonly wsCreator: (url: string) => AsyncWebSocket | Error;

    constructor(
        private args?: {
            ws: (url: string) => AsyncWebSocket | Error;
        },
        public log?: boolean,
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

        const err = await relay.ws.untilOpen();
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
                    let err = await chan.put({ res: msg, url: relay.url });
                    if (err instanceof PutToClosedChannelError) {
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
        const results = chan<{ res: RelayResponse_REQ_Message; url: string }>();
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

    async getEvent(id: NoteID | string) {
        if (id instanceof NoteID) {
            id = id.hex;
        }
        const stream = await this.newSub(id, {
            "ids": [id],
        });
        if (stream instanceof Error) {
            return stream;
        }
        const url_set = new Set();
        for await (const msg of stream.chan) {
            if (msg.res.type == "EOSE") {
                url_set.add(msg.url);
            } else if (msg.res.type == "EVENT") {
                await this.closeSub(id);
                return msg.res.event;
            }
            if (url_set.size >= this.connections.size) {
                return undefined;
            }
        }
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
        return undefined;
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
