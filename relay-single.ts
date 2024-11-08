import { sleep } from "@blowater/csp";
import { newURL, parseJSON, RESTRequestFailed } from "./_helper.ts";
import { prepareNostrEvent } from "./event.ts";
import { PublicKey } from "./key.ts";
import { getRelayInformation, type RelayInformation } from "./nip11.ts";
import { NoteID } from "./nip19.ts";
import {
    type _RelayResponse,
    type ClientRequest_REQ,
    type NostrEvent,
    type NostrFilter,
    NostrKind,
    type RelayResponse_REQ_Message,
    type Signer,
} from "./nostr.ts";
import type { Closer, EventSender, Subscriber, SubscriptionCloser } from "./relay.interface.ts";
import {
    AsyncWebSocket,
    CloseTwice,
    type WebSocketClosedEvent,
    type WebSocketError,
    type WebSocketReadyState,
} from "./websocket.ts";
import * as csp from "@blowater/csp";
import { getSpaceMembers, prepareSpaceMember } from "./space-member.ts";
import { assertEquals } from "@std/assert";
import type { Event_V2, Signer_V2, SpaceMember } from "./v2.ts";

export class WebSocketClosed extends Error {
    constructor(
        public url: string | URL,
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
    constructor(public subID: string, public url: string) {
        super(`subscription '${subID}' already exists for ${url}`);
    }
}

export type SubscriptionStream = {
    filters: NostrFilter[];
    chan: csp.Channel<RelayResponse_REQ_Message>;
};

/**
 * [examples](./tests/example.test.ts)
 */
export class SingleRelayConnection implements Subscriber, SubscriptionCloser, EventSender, Closer {
    private _isClosedByClient = false;
    isClosedByClient() {
        return this._isClosedByClient;
    }

    private subscriptionMap = new Map<
        string,
        SubscriptionStream
    >();
    readonly send_promise_resolvers = new Map<
        string,
        (res: { ok: boolean; message: string }) => void
    >();
    private error: AuthError | RelayDisconnectedByClient | undefined; // todo: check this error in public APIs
    private ws: BidirectionalNetwork | undefined;

    status(): WebSocketReadyState {
        if (this.ws == undefined) {
            return "Closed";
        }
        return this.ws.status();
    }

    private constructor(
        readonly url: URL,
        readonly wsCreator: (url: string, log: boolean) => BidirectionalNetwork | Error,
        public log: boolean,
        readonly signer?: Signer,
        readonly signer_v2?: Signer_V2,
    ) {
        (async () => {
            const ws = await this.connect();
            if (ws instanceof Error) {
                this.error = ws;
                return ws;
            }
            this.ws = ws;
            for (;;) {
                const messsage = await this.nextMessage(this.ws);
                if (messsage.type == "RelayDisconnectedByClient") {
                    this.error = messsage.error;
                    // exit the coroutine
                    return messsage.error;
                } else if (
                    messsage.type == "WebSocketClosed" ||
                    messsage.type == "FailedToLookupAddress" ||
                    messsage.type == "OtherError" || messsage.type == "closed"
                ) {
                    if (messsage.type != "closed") {
                        if (messsage.error instanceof Error) {
                            this.error = messsage.error;
                        } else if (typeof messsage.error == "string") {
                            this.error = new Error(messsage.error);
                        } else {
                            console.error(messsage);
                            this.error = new Error(messsage.error.error);
                        }
                    }
                    if (messsage.type == "closed") {
                        // https://www.rfc-editor.org/rfc/rfc6455.html#section-7.4
                        // https://www.iana.org/assignments/websocket/websocket.xml#close-code-number
                        if (messsage.event.code == 3000) {
                            // close all sub channels
                            for (const stream of this.subscriptionMap) {
                                const e = await this.closeSub(stream[0]);
                                if (e instanceof Error) {
                                    console.error(e);
                                }
                            }
                            const err = new AuthError(messsage.event.reason);
                            // resolve all send_promise_resolvers to false
                            for (const [_, resolver] of this.send_promise_resolvers) {
                                resolver({
                                    ok: false,
                                    message: err.message,
                                });
                            }
                            return err;
                        }
                    }
                    if (this._isClosedByClient == false) {
                        console.log("connection error", messsage);
                        const err = await this.connect();
                        if (err instanceof RelayDisconnectedByClient) {
                            return err;
                        }
                        if (err instanceof Error) {
                            console.error(err);
                            this.error = err;
                        }
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
                        const err = await sendSubscription(this.ws, subID, ...data.filters);
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
            if (res instanceof RelayDisconnectedByClient) {
                if (this.log) {
                    console.log(res);
                }
                return;
            }
            if (res instanceof Error) {
                this.error = res;
            } else {
                console.error(res);
            }
        });
    }

    public static New(
        urlString: string,
        args?: {
            wsCreator?: (url: string, log: boolean) => BidirectionalNetwork | Error;
            connect?: boolean;
            log?: boolean;
            signer?: Signer; // used for authentication
            signer_v2?: Signer_V2; // used for sign event v2
        },
    ): SingleRelayConnection | TypeError {
        if (args == undefined) {
            args = {};
        }
        try {
            if (!urlString.startsWith("wss://") && !urlString.startsWith("ws://")) {
                urlString = "wss://" + urlString;
            }
            if (args.wsCreator == undefined) {
                args.wsCreator = AsyncWebSocket.New;
            }
            const url = newURL(urlString);
            if (url instanceof TypeError) {
                return url;
            }
            return new SingleRelayConnection(
                url,
                args.wsCreator,
                args.log || false,
                args.signer,
                args.signer_v2,
            );
        } catch (e) {
            if (e instanceof Error) {
                return e;
            } else {
                throw e; // impossible
            }
        }
    }

    async newSub(subID: string, ...filters: NostrFilter[]) {
        if (this.error instanceof AuthError) {
            return this.error;
        }
        if (this.log) {
            console.log(`${this.url} registers subscription ${subID}`, ...filters);
        }

        const subscription = this.subscriptionMap.get(subID);
        if (subscription !== undefined) {
            return new SubscriptionAlreadyExist(subID, this.url.toString());
        }

        if (this.ws != undefined) {
            const err = await sendSubscription(this.ws, subID, ...filters);
            if (err instanceof Error) {
                console.error(err);
            }
        }

        const chan = csp.chan<RelayResponse_REQ_Message>();
        this.subscriptionMap.set(subID, { filters, chan });
        return { filters, chan };
    }

    async sendEvent(event: NostrEvent) {
        if (this.ws == undefined) {
            return new WebSocketClosed(this.url.toString(), this.status());
        }
        if (this.error) {
            return this.error;
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
        if (this.error) {
            return this.error;
        }
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
                // todo: give a concrete type
                return new Error(msg.note);
            } else if (msg.type == "EOSE") {
                return;
            }
        }
    }

    async getReplaceableEvent(pubkey: PublicKey, kind: NostrKind) {
        const subID = `${pubkey.bech32()}:${kind}`;
        const err = await this.closeSub(subID);
        if (err instanceof Error) return err;

        const events = await this.newSub(subID, {
            authors: [pubkey.hex],
            kinds: [kind],
            limit: 1,
        });
        if (events instanceof Error) {
            return events;
        }
        for await (const msg of events.chan) {
            const err = await this.closeSub(subID);
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
        if (this.log) {
            console.log(`relay ${this.url} closed, status: ${this.status()}`);
        }
    };

    [Symbol.asyncDispose] = () => {
        return this.close();
    };

    isClosed(): boolean {
        if (this.ws == undefined) {
            return true;
        }
        return this.ws.status() == "Closed" || this.ws.status() == "Closing";
    }

    private async connect() {
        if (this.error instanceof Error) {
            return this.error;
        }
        let ws: BidirectionalNetwork | Error | undefined;
        for (;;) {
            if (this.log) {
                console.log(`(re)connecting ${this.url}`);
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

            if (this.signer) {
                this.url.searchParams.set(
                    "auth",
                    btoa(JSON.stringify(
                        await prepareNostrEvent(this.signer, {
                            kind: NostrKind.HTTP_AUTH,
                            content: "",
                        }),
                    )),
                );
            }
            ws = this.wsCreator(this.url.toString(), this.log);
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

    unstable = {
        /**
         * before we have relay info as events,
         * let's pull it periodically to have an async iterable API
         */
        getRelayInformationStream: () => {
            const chan = csp.chan<Error | RelayInformation>();
            (async () => {
                let spaceInformation: RelayInformation | Error | undefined;
                for (;;) {
                    if (chan.closed()) return;
                    const info = await this.unstable.getSpaceInformation();
                    if (info instanceof Error || !deepEqual(spaceInformation, info)) {
                        spaceInformation = info;
                        const err = await chan.put(info);
                        if (err instanceof Error) {
                            // the channel is closed by outside, stop the stream
                            return;
                        }
                    }
                    await sleep(3000); // every 3 sec
                }
            })();
            return chan;
        },
        postEventV2: async (event: Event_V2): Promise<Error | Response> => {
            const httpURL = new URL(this.url);
            httpURL.protocol = httpURL.protocol == "wss:" ? "https" : "http";
            try {
                return await fetch(httpURL, { method: "POST", body: JSON.stringify(event) });
            } catch (e) {
                return e as Error;
            }
        },
        /**
         * v2 API, unstable
         * add a public key to this relay as its member
         */
        addSpaceMember: async (member: PublicKey | string): Promise<Error | Response> => {
            if (!this.signer_v2) {
                return new SignerV2NotExist();
            }
            const spaceMemberEvent = await prepareSpaceMember(this.signer_v2, member);
            if (spaceMemberEvent instanceof Error) {
                return spaceMemberEvent;
            }
            return await this.unstable.postEventV2(spaceMemberEvent);
        },
        /**
         * v2 API, unstable
         * a stream of space members
         */
        getSpaceMembersStream: () => {
            const chan = csp.chan<
                RESTRequestFailed | TypeError | SyntaxError | Error | SpaceMember[]
            >();
            (async () => {
                let spaceMembers:
                    | SpaceMember[]
                    | RESTRequestFailed
                    | TypeError
                    | SyntaxError
                    | Error
                    | undefined;
                for (;;) {
                    if (chan.closed()) return;
                    const members = await getSpaceMembers(this.url);
                    if (members instanceof Error) {
                        if (members instanceof RESTRequestFailed) {
                            if (members.res.status == 404) {
                                await chan.put(members);
                                await chan.close();
                            } else {
                                await chan.put(members);
                            }
                        } else {
                            await chan.put(members);
                        }
                    } else if (!deepEqual(spaceMembers, members)) {
                        spaceMembers = members;
                        const err = await chan.put(members);
                        if (err instanceof Error) {
                            // the channel is closed by outside, stop the stream
                            return;
                        }
                    }
                    await sleep(3000); // every 3 sec
                }
            })();
            return chan;
        },
        getSpaceInformation: () => {
            return getRelayInformation(this.url);
        },
    };
}

async function sendSubscription(ws: BidirectionalNetwork, subID: string, ...filters: NostrFilter[]) {
    const req: ClientRequest_REQ = ["REQ", subID, ...filters];
    const err = await ws.send(JSON.stringify(req));
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

export class AuthError extends Error {
    constructor(msg: string) {
        super(msg);
        this.name = AuthError.name;
    }
}

export class SignerV2NotExist extends Error {
    constructor() {
        super(`Signer V2 does not exist`);
        this.name = SignerV2NotExist.name;
    }
}

// deno-lint-ignore no-explicit-any
function deepEqual(a: any, b: any) {
    try {
        assertEquals(a, b);
        return true;
    } catch {
        return false;
    }
}
