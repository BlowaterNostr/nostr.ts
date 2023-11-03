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

export class WebSocketClosed extends Error {}
type NetworkCloseEvent = {
    readonly code: number;
    readonly reason: string;
    readonly wasClean: boolean;
};

export type BidirectionalNetwork = {
    status(): WebSocketReadyState;
    untilOpen(): Promise<WebSocketClosed | undefined>;
    nextMessage(): Promise<string | WebSocketClosed>;
    send: (str: string | ArrayBufferLike | Blob | ArrayBufferView) => Promise<WebSocketClosed | undefined>;
    close: (code?: number, reason?: string) => Promise<NetworkCloseEvent | CloseTwice | typeof csp.closed>;
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
        readonly ws: BidirectionalNetwork,
        public log: boolean,
    ) {}

    public static New(
        url: string,
        wsCreator?: (url: string) => BidirectionalNetwork | Error,
        log?: boolean,
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
            let relay = new SingleRelayConnection(url, ws, log || false);
            (async () => {
                for (;;) {
                    const wsMessage = await relay.ws.nextMessage();
                    if (wsMessage instanceof WebSocketClosed) {
                        if (relay.ws.status() != "Closed") {
                            console.log(wsMessage);
                        }
                        // todo: reconnection logic here
                        return;
                    }
                    let relayResponse = parseJSON<_RelayResponse>(wsMessage);
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
                        if (log) {
                            console.log(url, wsMessage); // NOTICE, OK and other non-standard response types
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
        const err = await this.ws.send(JSON.stringify([
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
        return this.ws.status() == "Closed" || this.ws.status() == "Closing";
    }
}

function parseJSON<T>(content: string): T | Error {
    try {
        return JSON.parse(content) as T;
    } catch (e) {
        return e as Error;
    }
}
