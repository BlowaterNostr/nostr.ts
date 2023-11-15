// deno-lint-ignore-file no-explicit-any no-unused-vars require-await ban-unused-ignore
import * as csp from "https://raw.githubusercontent.com/BlowaterNostr/csp/master/csp.ts";
import { BidirectionalNetwork, NetworkCloseEvent, NextMessageType, WebSocketClosed } from "./relay-single.ts";

export enum CloseReason {
    ByClient = 4000,
}

export class AsyncWebSocket implements BidirectionalNetwork {
    private readonly isSocketOpen = csp.chan<never>();
    private readonly onMessage = csp.chan<
        {
            type: "message" | "error";
            data: string;
        } | { type: "open" }
    >();
    private readonly onClose = csp.chan<NetworkCloseEvent>();
    public readonly url: string;

    static New(url: string): AsyncWebSocket | Error {
        try {
            const ws = new WebSocket(url); // could throw, caller should catch it, not part of the MDN doc
            return new AsyncWebSocket(ws);
        } catch (err) {
            return err;
        }
    }

    private constructor(
        private readonly ws: WebSocket,
        public log?: boolean,
    ) {
        this.url = ws.url;
        this.ws.onopen = async (event: Event) => {
            if (log) {
                console.log(ws.url, "openned");
            }
            await this.isSocketOpen.close();
            await this.onMessage.put({
                type: "open",
            });
        };

        this.ws.onmessage = (event: MessageEvent) => {
            this.onMessage.put({
                type: "message",
                data: event.data,
            });
        };

        // @ts-ignore
        this.ws.onerror = async (event: ErrorEvent) => {
            const err = await this.onMessage.put({
                type: "error",
                data: event.message,
            });
            if (err instanceof Error) {
                console.error(err);
            }
        };

        this.ws.onclose = async (event: CloseEvent) => {
            if (this.log) {
                console.log(ws.url, "closed", event.code, event.reason);
            }
            await this.onClose.put(event);
            await this.onClose.close(`ws ${ws.url} is closed`);
        };
    }

    async nextMessage(): Promise<NextMessageType> {
        const msg = await this.onMessage.pop();
        if (msg == csp.closed) {
            return {
                type: "WebSocketClosed",
                error: new WebSocketClosed(this.url, this.status()),
            };
        }
        if (msg.type == "error") {
            if (
                msg.data ==
                    "Error: failed to lookup address information: nodename nor servname provided, or not known"
            ) {
                return {
                    type: "FailedToLookupAddress",
                    error: msg.data,
                };
            } else {
                return {
                    type: "OtherError",
                    error: new Error(msg.data),
                };
            }
        }
        if (msg.type == "open") {
            return msg;
        }
        return {
            type: "messsage",
            data: msg.data,
        };
    }

    async send(str: string | ArrayBufferLike | Blob | ArrayBufferView) {
        let err = await this.untilOpen();
        if (err) {
            return err;
        }
        try {
            this.ws.send(str);
        } catch (e) {
            return e as Error;
        }
    }

    close = async (
        code?: number | undefined,
        reason?: string | undefined,
    ): Promise<NetworkCloseEvent | CloseTwice | typeof csp.closed> => {
        if (
            this.ws.readyState == WebSocket.CLOSED ||
            this.ws.readyState == WebSocket.CLOSING
        ) {
            return new CloseTwice(this.ws.url);
        }
        this.ws.close(code, reason);
        return await this.onClose.pop();
    };

    // only unblocks when the socket is open
    // if the socket is closed or closing, blocks forever
    async untilOpen() {
        if (this.ws.readyState === WebSocket.CLOSED) {
            return new WebSocketClosed(this.url, this.status());
        }
        if (this.ws.readyState === WebSocket.CLOSING) {
            return new WebSocketClosed(this.url, this.status());
        }
        if (this.ws.readyState === WebSocket.OPEN) {
            return;
        }
        if (this.ws.readyState === WebSocket.CONNECTING) {
            const signal = csp.chan<undefined | NetworkCloseEvent | typeof csp.closed>();
            (async () => {
                await this.isSocketOpen.pop();
                await signal.put(undefined);
            })();
            (async () => {
                const close = await this.onClose.pop();
                await signal.put(close);
            })();
            const sig = await signal.pop();
            if (sig != undefined) {
                if (sig == csp.closed) {
                    return new WebSocketClosed(this.url, this.status());
                } else {
                    return new WebSocketClosed(this.url, this.status(), sig);
                }
            }
            return;
        }
        // unreachable
        throw new Error(`readyState:${this.ws.readyState}`);
    }

    status = (): WebSocketReadyState => {
        switch (this.ws.readyState) {
            case WebSocket.CONNECTING:
                return "Connecting";
            case WebSocket.OPEN:
                return "Open";
            case WebSocket.CLOSING:
                return "Closing";
            case WebSocket.CLOSED:
                return "Closed";
        }
        throw new Error("unreachable");
    };
}
export type WebSocketReadyState = "Connecting" | "Open" | "Closing" | "Closed";

export class CloseTwice extends Error {
    constructor(public url: string) {
        super(`can not close Web Socket ${url} twice`);
        this.url = url;
    }
}
