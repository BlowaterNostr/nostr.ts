import {
    _RelayResponse,
    _RelayResponse_OK,
    _RelayResponse_REQ_Message,
    NostrEvent,
    NostrFilters,
    RelayResponse_REQ_Message,
} from "./nostr.ts";
import { Closer, EventSender, Subscriber, SubscriptionCloser } from "./relay.interface.ts";
import { AsyncWebSocket, CloseTwice, WebSocketReadyState } from "./websocket.ts";
import * as csp from "https://raw.githubusercontent.com/BlowaterNostr/csp/master/csp.ts";

export class WebSocketClosed extends Error {
    constructor(
        public url: string,
        public state: WebSocketReadyState,
        public reason?: NetworkCloseEvent,
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

export type NetworkCloseEvent = {
    readonly code: number;
    readonly reason: string;
    readonly wasClean: boolean;
};

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
    error: Error;
} | {
    type: "open";
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
    close: (code?: number, reason?: string) => Promise<NetworkCloseEvent | CloseTwice | typeof csp.closed>;
};

export class SubscriptionAlreadyExist extends Error {
    constructor(public subID: string, public filter: NostrFilters, public url: string) {
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
    private error: any; // todo: check this error in public APIs
    private ws: BidirectionalNetwork | undefined;
    private readonly pendingSend = new Set<string>();

    public getWebSocket(): BidirectionalNetwork | undefined {
        return this.ws;
    }
    status(): WebSocketReadyState {
        if (this.ws == undefined) {
            return "Closed";
        }
        return this.ws.status();
    }

    private constructor(
        readonly url: string,
        readonly wsCreator: (url: string) => BidirectionalNetwork | Error,
        public log: boolean,
    ) {
        (async () => {
            for (;;) {
                const ws = this.wsCreator(url);
                if (ws instanceof Error) {
                    console.error(ws);
                } else {
                    this.ws = ws;
                    break;
                }
                await csp.sleep(1000);
                console.log("retry to connect to", url);
            }
            for (;;) {
                const messsage = await this.nextMessage(this.ws);
                if (messsage.type == "RelayDisconnectedByClient") {
                    // exit the coroutine
                    this.error = messsage;
                    if (this.log) {
                        console.log(`exiting the relay coroutine of ${this.url}`);
                    }
                    return;
                } else if (
                    messsage.type == "WebSocketClosed" || messsage.type == "FailedToLookupAddress"
                ) {
                    if (this.ws.status() != "Closed") {
                        console.log(messsage);
                    }
                    this.error = messsage.error;
                    const err = this.reconnect();
                    if (err instanceof Error) {
                        this.error = err;
                    }
                    continue;
                } else if (messsage.type == "OtherError") {
                    // in this case, we don't know what to do, exit
                    console.error(messsage);
                    console.log("exiting the relay connection");
                    this.error = messsage;
                    return;
                } else if (messsage.type == "open") {
                    // the websocket is just openned
                    for (const data of this.pendingSend) {
                        const err = await this.send(data);
                        if (err instanceof Error) {
                            console.error(err);
                        } else {
                            this.pendingSend.delete(data);
                        }
                    }
                } else {
                    let relayResponse = parseJSON<_RelayResponse>(messsage.data);
                    if (relayResponse instanceof Error) {
                        console.error(relayResponse.message);
                        return;
                    }

                    if (
                        relayResponse[0] === "EVENT" ||
                        relayResponse[0] === "EOSE"
                    ) {
                        let subID = relayResponse[1];
                        let subscription = this.subscriptionMap.get(
                            subID,
                        );
                        if (subscription === undefined) {
                            return; // the subscription has been closed locally before receiving remote messages
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
                    } else {
                        if (this.log) {
                            console.log(url, messsage); // NOTICE, OK and other non-standard response types
                        }
                    }
                }
            }
        })();
    }

    public static New(
        url: string,
        args?: {
            wsCreator?: (url: string) => BidirectionalNetwork | Error;
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
            let relay = new SingleRelayConnection(url, args.wsCreator, args.log || false);
            return relay;
        } catch (e) {
            return e;
        }
    }

    newSub = async (subID: string, filter: NostrFilters) => {
        if (this.log) {
            console.log(this.url, "newSub", subID, filter);
        }
        let subscription = this.subscriptionMap.get(subID);
        if (subscription !== undefined) {
            return new SubscriptionAlreadyExist(subID, filter, this.url);
        }

        const err = await this.send(JSON.stringify([
            "REQ",
            subID,
            filter,
        ]));
        if (err) {
            return err;
        }

        const chan = csp.chan<RelayResponse_REQ_Message>();

        this.subscriptionMap.set(subID, { filter, chan });
        return { filter, chan };
    };

    private async send(data: string) {
        if (this.ws == undefined) {
            this.pendingSend.add(data);
            return;
        }
        const err = await this.ws.send(data);
        if (err instanceof WebSocketClosed) {
            if (this.isClosedByClient()) {
                return new RelayDisconnectedByClient();
            } else {
                return this.reconnect();
            }
        }
        return err;
    }

    // todo: add waitForOk back
    sendEvent = async (nostrEvent: NostrEvent) => {
        return this.send(JSON.stringify([
            "EVENT",
            nostrEvent,
        ]));
    };

    closeSub = async (subID: string) => {
        const err = await this.send(JSON.stringify([
            "CLOSE",
            subID, // multiplex marker / channel
        ]));

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
    };

    close = async () => {
        this._isClosedByClient = true;
        for (const [subID, { chan }] of this.subscriptionMap.entries()) {
            if (chan.closed()) {
                continue;
            }
            await this.closeSub(subID);
        }
        if (this.ws) {
            await this.ws.close();
        }
        // the WebSocket constructor is async underneath but since it's too old,
        // it does not have an awaitable interface so that exiting the program may cause
        // unresolved event underneath
        // this is a quick & dirty way for me to address it
        // old browser API sucks
        await csp.sleep(1);
    };

    isClosed(): boolean {
        if (this.ws == undefined) {
            return true;
        }
        return this.ws.status() == "Closed" || this.ws.status() == "Closing";
    }

    private reconnect() {
        if (this.log) {
            console.log("reconnecting", this.url, "reason", this.error);
        }
        const ws = this.wsCreator(this.url);
        if (ws instanceof Error) {
            return ws;
        }
        this.ws = ws;
        if (this._isClosedByClient) {
            console.log("close the new ws");
            this.ws.close();
        }
    }

    private async nextMessage(ws: BidirectionalNetwork): Promise<NextMessageType> {
        if (this.isClosedByClient()) {
            return {
                type: "RelayDisconnectedByClient",
                error: new RelayDisconnectedByClient(),
            };
        }
        return ws.nextMessage();
    }
}

function parseJSON<T>(content: string): T | Error {
    try {
        return JSON.parse(content) as T;
    } catch (e) {
        return e as Error;
    }
}
