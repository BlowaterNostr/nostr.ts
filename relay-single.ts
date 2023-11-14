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

export type NetworkCloseEvent = {
    readonly code: number;
    readonly reason: string;
    readonly wasClean: boolean;
};

export type BidirectionalNetwork = {
    status(): WebSocketReadyState;
    untilOpen(): Promise<WebSocketClosed | undefined>;
    nextMessage(): Promise<string | WebSocketClosed | RelayDisconnectedByClient>;
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

    private constructor(
        readonly url: string,
        public ws: BidirectionalNetwork,
        readonly wsCreator: (url: string) => BidirectionalNetwork | Error,
        public log: boolean,
    ) {}

    public static New(
        url: string,
        args?: {
            wsCreator?: (url: string) => BidirectionalNetwork | Error;
            log?: boolean;
        },
    ): SingleRelayConnection | Error {
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
            const ws = args.wsCreator(url);
            if (ws instanceof Error) {
                return ws;
            }
            let relay = new SingleRelayConnection(url, ws, args.wsCreator, args.log || false);
            (async () => {
                for (;;) {
                    const messsage = await relay.nextMessage();
                    if (messsage instanceof WebSocketClosed) {
                        if (relay.ws.status() != "Closed") {
                            console.log(messsage);
                        }
                        const err = relay.reconnect();
                        if (err instanceof Error) {
                            relay.error = err;
                        }
                        continue;
                    } else if (messsage instanceof RelayDisconnectedByClient) {
                        // exit the coroutine
                        relay.error = messsage;
                        if (relay.log) {
                            console.log(`exiting the relay coroutine of ${relay.url}`);
                        }
                        return;
                    }
                    let relayResponse = parseJSON<_RelayResponse>(messsage);
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
                        if (args.log) {
                            console.log(url, messsage); // NOTICE, OK and other non-standard response types
                        }
                    }
                }
            })();
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
        await this.ws.close();
    };

    isClosed(): boolean {
        return this.ws.status() == "Closed" || this.ws.status() == "Closing";
    }

    private reconnect() {
        if (this.log) {
            console.log("reconnecting", this.url);
        }
        const ws = this.wsCreator(this.url);
        if (ws instanceof Error) {
            return ws;
        }
        this.ws = ws;
    }

    private async nextMessage() {
        if (this.isClosedByClient()) {
            return new RelayDisconnectedByClient();
        }
        return this.ws.nextMessage();
    }
}

function parseJSON<T>(content: string): T | Error {
    try {
        return JSON.parse(content) as T;
    } catch (e) {
        return e as Error;
    }
}
