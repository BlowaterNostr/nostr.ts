import { chan, Channel, PutToClosedChannelError } from "@blowater/csp";
import { NoteID } from "./nip19.ts";
import { NostrEvent, NostrFilter, RelayResponse_REQ_Message, Signer } from "./nostr.ts";
import { Closer, EventSender, SubscriptionCloser } from "./relay.interface.ts";
import {
    RelayDisconnectedByClient,
    SingleRelayConnection,
    SubscriptionAlreadyExist,
} from "./relay-single.ts";
import { AsyncWebSocket } from "./websocket.ts";
import { Signer_V2 } from "./v2.ts";
import { ValueMap } from "@blowater/collections";
import { newURL } from "./_helper.ts";

export interface RelayAdder {
    addRelayURL(url: string): Promise<Error | SingleRelayConnection>;
}

export interface RelayRemover {
    removeRelay(url: string): Promise<void>;
}

export interface RelayGetter {
    getRelay(
        url: string | URL,
    ): SingleRelayConnection | undefined | SingleRelayConnection | undefined | typeof url extends string
        ? TypeError
        : void;
}

export class ConnectionPoolClosed extends Error {}
export class NoRelayRegistered extends Error {
    constructor() {
        super();
        this.name = "NoRelayRegistered";
    }
}

export class ConnectionPool
    implements SubscriptionCloser, EventSender, Closer, RelayAdder, RelayRemover, RelayGetter {
    private closed = false;
    private readonly connections = new ValueMap<URL, SingleRelayConnection>((url) => {
        return url.origin + url.pathname;
    });
    private readonly subscriptionMap = new Map<
        string,
        {
            filters: NostrFilter[];
            chan: Channel<{ res: RelayResponse_REQ_Message; url: URL }>;
        }
    >();

    private readonly wsCreator: (url: string, log: boolean) => AsyncWebSocket | Error;

    constructor(
        private args?: {
            ws?: (url: string, log: boolean) => AsyncWebSocket | Error;
            signer?: Signer;
            signer_v2?: Signer_V2;
        },
        public log?: boolean,
    ) {
        if (args?.ws == undefined) {
            this.wsCreator = AsyncWebSocket.New;
        } else {
            this.wsCreator = args.ws;
        }
    }

    getRelays() {
        return this.connections.values();
    }

    getRelay(url: string | URL): SingleRelayConnection | undefined {
        if (typeof url == "string") {
            const theURL = newURL(url);
            if (theURL instanceof TypeError) {
                console.error(theURL);
                return undefined;
            }
            url = theURL;
        }
        return this.connections.get(url);
    }

    async addRelayURL(url: string | URL) {
        if (typeof url == "string") {
            if (!url.startsWith("ws://") && !url.startsWith("wss://")) {
                url = "wss://" + url;
            }
        }
        const theURL = newURL(url);
        if (theURL instanceof Error) {
            return theURL;
        }
        {
            const relay = this.connections.get(theURL);
            if (relay) {
                return relay;
            }
        }
        const client = SingleRelayConnection.New(url.toString(), {
            wsCreator: this.wsCreator,
            log: true,
            signer: this.args?.signer,
            signer_v2: this.args?.signer_v2,
        }) as SingleRelayConnection;
        const err = await this.addRelay(client);
        if (err instanceof Error) {
            return err;
        }
        return client;
    }

    async addRelayURLs(urls: string[]) {
        const ps = [];
        for (const url of urls) {
            ps.push(this.addRelayURL(url));
        }
        const errs = await Promise.all(ps);
        const errs2 = new Array<Error>();
        for (const err of errs) {
            if (err instanceof Error) {
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
        if (relay.signer?.publicKey.hex != this.args?.signer?.publicKey.hex) {
            return new Error("relay has a different signer than the pool's");
        }
        const _relay = this.connections.get(relay.url);
        if (_relay) {
            // should almost never happen because addRelay is not called that often
            // addRelayURL is called usually
            // close the new relay
            await relay.close();
            return _relay;
        }

        this.connections.set(relay.url, relay);

        // for this newly added relay, do all the subs
        for (let [subID, { filters, chan }] of this.subscriptionMap.entries()) {
            let sub = await relay.newSub(subID, ...filters);
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
        return relay;
    }

    async removeRelay(url: string | URL) {
        const theURL = newURL(url);
        if (theURL instanceof Error) {
            return;
        }
        const relay = this.connections.get(theURL);
        if (relay === undefined) {
            return;
        }
        const p = relay.close();
        await p;
        this.connections.delete(theURL);
    }

    async newSub(
        subID: string,
        ...filters: NostrFilter[]
    ) {
        if (this.subscriptionMap.has(subID)) {
            return new SubscriptionAlreadyExist(subID, "relay pool");
        }
        const results = chan<{ res: RelayResponse_REQ_Message; url: URL }>();
        for (const conn of this.connections.values()) {
            (async (relay: SingleRelayConnection) => {
                const sub = await relay.newSub(subID, ...filters);
                if (sub instanceof Error) {
                    console.error(sub);
                    return;
                }
                for await (const msg of sub.chan) {
                    await results.put({ res: msg, url: relay.url });
                }
            })(conn);
        }
        const sub = { filters, chan: results };
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
        const ps = [];
        for (let relay of this.connections.values()) {
            if (relay.isClosed() && !relay.isClosedByClient) {
                continue;
            }
            const p = relay.sendEvent(nostrEvent);
            ps.push(p);
        }

        for (const p of ps) {
            const err = await p;
            if (err instanceof RelayDisconnectedByClient) {
                console.log(err);
            }
        }
        return "";
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
        for (const [subID, _] of this.subscriptionMap.entries()) {
            await this.closeSub(subID);
        }
    }
}
