import { parseJSON } from "./_helper.ts";
import { NoteID } from "./nip19.ts";
import {
    _RelayResponse,
    _RelayResponse_OK,
    _RelayResponse_REQ_Message,
    NostrEvent,
    NostrFilters,
    RelayResponse_REQ_Message,
} from "./nostr.ts";
import { Closer, EventSender, Subscriber, SubscriptionCloser } from "./relay.interface.ts";
import {
    AsyncWebSocket,
    CloseTwice,
    WebSocketClosedEvent,
    WebSocketError,
    WebSocketReadyState,
} from "./websocket.ts";
import * as csp from "https://raw.githubusercontent.com/BlowaterNostr/csp/master/csp.ts";

export class WebSocketClosed extends Error {
    constructor(
        public url: string,
        public state: WebSocketReadyState,
        public reason?: WebSocketClosedEvent,
    ) {
        super(`${url} is in state ${state}, code ${reason?.code}`);
        this.name = WebSocketClosed.name;
    }
}

export class RelayDisconnectedByClient extends Error {
    constructor() {
        super();
        this.name = RelayDisconnectedByClient.name;
    }
}

export class FailedToLookupAddress extends Error {}

export type NextMessageType = {
    type: "messsage";
    data: string;
} | {
    type: "WebSocketClosed";
    error: WebSocketClosed;
} | {
    type: "RelayDisconnectedByClient";
    error: RelayDisconnectedByClient;
} | {
    type: "FailedToLookupAddress";
    error: string;
} | {
    type: "OtherError";
    error: WebSocketError;
} | {
    type: "open";
} | {
    type: "closed";
    event: WebSocketClosedEvent;
};

export type BidirectionalNetwork = {
    status(): WebSocketReadyState;
    untilOpen(): Promise<WebSocketClosed | undefined>;
    nextMessage(): Promise<
        NextMessageType
    >;
    send: (
        str: string | ArrayBufferLike | Blob | ArrayBufferView,
    ) => Promise<WebSocketClosed | Error | undefined>;
    close: (
        code?: number,
        reason?: string,
        force?: boolean,
    ) => Promise<CloseTwice | WebSocketClosedEvent | undefined>;
};

export class SubscriptionAlreadyExist extends Error {
    constructor(
        public subID: string,
        public filter: NostrFilters,
        public url: string,
    ) {
        super(`subscription '${subID}' already exists for ${url}`);
    }
}

export class SingleRelayConnection implements Subscriber, SubscriptionCloser, EventSender, Closer {
    private _isClosedByClient = false;
    isClosedByClient() {
        return this._isClosedByClient;
    }

    private subscriptionMap = new Map<
        string,
        { filter: NostrFilters; chan: csp.Channel<RelayResponse_REQ_Message> }
    >();
    readonly send_promise_resolvers = new Map<
        string,
        (res: { ok: boolean; message: string }) => void
    >();
    private error: Error | string | WebSocketError | undefined; // todo: check this error in public APIs
    private ws: BidirectionalNetwork | undefined;

    status(): WebSocketReadyState {
        if (this.ws == undefined) {
            return "Closed";
        }
        return this.ws.status();
    }

    private constructor(
        readonly url: string,
        readonly wsCreator: (
            url: string,
            log: boolean,
        ) => BidirectionalNetwork | Error,
        public log: boolean,
    ) {
        (async () => {
            const ws = await this.connect();
            if (ws instanceof Error || ws == undefined) {
                console.error(ws);
                return;
            }
            this.ws = ws;
            for (;;) {
                const messsage = await this.nextMessage(this.ws);
                if (messsage.type == "RelayDisconnectedByClient") {
                    this.error = messsage.error;
                    // exit the coroutine
                    return "RelayDisconnectedByClient";
                } else if (
                    messsage.type == "WebSocketClosed" ||
                    messsage.type == "FailedToLookupAddress" ||
                    messsage.type == "OtherError" || messsage.type == "closed"
                ) {
                    if (messsage.type != "closed") {
                        this.error = messsage.error;
                    }
                    console.log(messsage);
                    const err = await this.connect();
                    if (err instanceof RelayDisconnectedByClient) {
                        return err;
                    }
                    if (err instanceof Error) {
                        console.error(err);
                        this.error = err;
                    }
                    continue;
                } else if (messsage.type == "open") {
                    if (this.log) {
                        console.log(`relay connection ${this.url} is openned`);
                    }
                    // the websocket is just openned
                    // send all the subscriptions to the relay
                    for (const [subID, data] of this.subscriptionMap.entries()) {
                        if (this.ws == undefined) {
                            console.error("impossible state");
                            break;
                        }
                        const err = await sendSubscription(this.ws, subID, data.filter);
                        if (err instanceof Error) {
                            console.error(err);
                        }
                    }
                } else {
                    const relayResponse = parseJSON<_RelayResponse>(messsage.data);
                    if (relayResponse instanceof Error) {
                        console.error(relayResponse);
                        continue;
                    }

                    if (
                        relayResponse[0] === "EVENT" ||
                        relayResponse[0] === "EOSE"
                    ) {
                        const subID = relayResponse[1];
                        const subscription = this.subscriptionMap.get(
                            subID,
                        );
                        if (subscription === undefined) {
                            // the subscription has been closed locally before receiving remote messages
                            // or the relay sends to the wrong connection
                            continue;
                        }
                        const chan = subscription.chan;
                        if (!chan.closed()) {
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
                    } else if (relayResponse[0] == "OK") {
                        const resolver = this.send_promise_resolvers.get(relayResponse[1]);
                        if (resolver) {
                            const ok = relayResponse[2];
                            const message = relayResponse[3];
                            resolver({ ok, message });
                        }
                    } else {
                        for (const sub of this.subscriptionMap.values()) {
                            sub.chan.put({
                                type: "NOTICE",
                                note: relayResponse[1],
                            });
                        }
                        console.log(url, relayResponse); // NOTICE, OK and other non-standard response types
                    }
                }
            }
        })().then((res) => {
            if (res instanceof RelayDisconnectedByClient) return;
            if (res != "RelayDisconnectedByClient") {
                throw new Error("this promise should never resolve");
            }
        });
    }

    public static New(
        url: string,
        args?: {
            wsCreator?: (url: string, log: boolean) => BidirectionalNetwork | Error;
            connect?: boolean;
            log?: boolean;
        },
    ): SingleRelayConnection {
        if (args == undefined) {
            args = {};
        }
        try {
            if (!url.startsWith("wss://") && !url.startsWith("ws://")) {
                url = "wss://" + url;
            }
            if (args.wsCreator == undefined) {
                args.wsCreator = AsyncWebSocket.New;
            }
            const relay = new SingleRelayConnection(url, args.wsCreator, args.log || false);
            return relay;
        } catch (e) {
            return e;
        }
    }

    async newSub(subID: string, filter: NostrFilters): Promise<
        SubscriptionAlreadyExist | RelayDisconnectedByClient | {
            filter: NostrFilters;
            chan: csp.Channel<RelayResponse_REQ_Message>;
        }
    > {
        if (this.log) {
            console.log(`${this.url} registers subscription ${subID}`, filter);
        }
        const subscription = this.subscriptionMap.get(subID);
        if (subscription !== undefined) {
            return new SubscriptionAlreadyExist(subID, filter, this.url);
        }

        if (this.ws != undefined) {
            const err = await sendSubscription(this.ws, subID, filter);
            if (err instanceof Error) {
                console.error(err);
            }
        }

        const chan = csp.chan<RelayResponse_REQ_Message>();
        this.subscriptionMap.set(subID, { filter, chan });
        return { filter, chan };
    }

    async sendEvent(event: NostrEvent) {
        if (this.ws == undefined) {
            return new WebSocketClosed(this.url, this.status());
        }
        const err = await this.ws.send(JSON.stringify([
            "EVENT",
            event,
        ]));
        if (err instanceof Error) {
            return err;
        }
        const res = await new Promise<{ ok: boolean; message: string }>(
            (resolve) => {
                this.send_promise_resolvers.set(event.id, resolve);
            },
        );
        if (!res.ok) {
            return new RelayRejectedEvent(res.message, event);
        }
        return res.message;
    }

    async getEvent(id: NoteID | string) {
        if (id instanceof NoteID) {
            id = id.hex;
        }

        const err = await this.closeSub(id);
        if (err instanceof Error) return err;

        const events = await this.newSub(id, { ids: [id] });
        if (events instanceof Error) {
            return events;
        }
        for await (const msg of events.chan) {
            const err = await this.closeSub(id);
            if (err instanceof Error) return err;

            if (msg.type == "EVENT") {
                return msg.event;
            } else if (msg.type == "NOTICE") {
                return new Error(msg.note);
            } else if (msg.type == "EOSE") {
                return;
            }
        }
    }

    async closeSub(subID: string) {
        let err;
        if (this.ws != undefined) {
            err = await this.ws.send(JSON.stringify([
                "CLOSE",
                subID, // multiplex marker / channel
            ]));
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
        return err;
    }

    close = async (force?: boolean) => {
        this._isClosedByClient = true;
        for (const [subID, { chan }] of this.subscriptionMap.entries()) {
            if (chan.closed()) {
                continue;
            }
            await this.closeSub(subID);
        }
        if (this.ws) {
            await this.ws.close(undefined, undefined, force ? true : false);
        }
        // the WebSocket constructor is async underneath but since it's too old,
        // it does not have an awaitable interface so that exiting the program may cause
        // unresolved event underneath
        // this is a quick & dirty way for me to address it
        // old browser API sucks
        await csp.sleep(1);
        console.log(`relay ${this.url} closed, status: ${this.status()}`);
    };

    isClosed(): boolean {
        if (this.ws == undefined) {
            return true;
        }
        return this.ws.status() == "Closed" || this.ws.status() == "Closing";
    }

    public async connect() {
        let ws: BidirectionalNetwork | Error | undefined;
        for (;;) {
            if (this.log) {
                console.log(`(re)connecting ${this.url}, reason: ${JSON.stringify(this.error)}`);
            }
            if (this.isClosedByClient()) {
                return new RelayDisconnectedByClient();
            }
            if (this.ws) {
                const status = this.ws.status();
                if (status == "Connecting" || status == "Open") {
                    return this.ws;
                }
            }

            ws = this.wsCreator(this.url, this.log);
            if (ws instanceof Error) {
                console.error(ws.name, ws.message, ws.cause);
                if (ws.name == "SecurityError") {
                    return ws;
                }
                continue;
            }
            break;
        }
        this.ws = ws;
        return this.ws;
    }

    private async nextMessage(ws: BidirectionalNetwork): Promise<NextMessageType> {
        if (this.isClosedByClient()) {
            return {
                type: "RelayDisconnectedByClient",
                error: new RelayDisconnectedByClient(),
            };
        }
        const message = await ws.nextMessage();
        return message;
    }
}

async function sendSubscription(ws: BidirectionalNetwork, subID: string, filter: NostrFilters) {
    const err = await ws.send(JSON.stringify([
        "REQ",
        subID,
        filter,
    ]));
    if (err) {
        return err;
    }
}

export class RelayRejectedEvent extends Error {
    constructor(msg: string, public readonly event: NostrEvent) {
        super(`${event.id}: ${msg}`);
        this.name = RelayRejectedEvent.name;
    }
}
