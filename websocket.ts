// deno-lint-ignore-file no-explicit-any no-unused-vars require-await ban-unused-ignore
import * as csp from "@blowater/csp";
import { BidirectionalNetwork, NextMessageType, WebSocketClosed } from "./relay-single.ts";

export enum CloseReason {
    ByClient = 4000,
}

export type WebSocketError = {
    readonly message: string;
    readonly error: any;
};

export type WebSocketClosedEvent = {
    // Returns the WebSocket connection close code provided by the server.
    readonly code: number;
    // Returns the WebSocket connection close reason provided by the server.
    readonly reason: string;
    // Returns true if the connection closed cleanly; false otherwise.
    readonly wasClean: boolean;
};

export class AsyncWebSocket implements BidirectionalNetwork {
    private readonly isSocketOpen = csp.chan<never>();
    private readonly messageChannel = csp.chan<
        | {
            type: "message";
            data: string;
        }
        | {
            type: "error";
            error: WebSocketError;
        }
        | { type: "open" }
        | {
            type: "closed";
            event: WebSocketClosedEvent;
        }
    >();
    private readonly onClose = csp.chan<never>();
    private closedEvent?: WebSocketClosedEvent;
    public readonly url: string;

    static New(url: string, log: boolean): AsyncWebSocket | Error {
        try {
            const ws = new WebSocket(url); // could throw, caller should catch it, not part of the MDN doc
            return new AsyncWebSocket(ws, log);
        } catch (err) {
            return err;
        }
    }

    private constructor(
        private readonly ws: WebSocket,
        public log: boolean,
    ) {
        this.url = ws.url;
        this.ws.onopen = async (event: Event) => {
            if (log) {
                console.log(ws.url, "openned");
            }
            await this.isSocketOpen.close();
            await this.messageChannel.put({
                type: "open",
            });
        };

        this.ws.onmessage = (event: MessageEvent) => {
            this.messageChannel.put({
                type: "message",
                data: event.data,
            });
        };

        // @ts-ignore
        this.ws.onerror = async (event: ErrorEvent) => {
            const err = await this.messageChannel.put({
                type: "error",
                error: event,
            });
            if (err instanceof Error) {
                console.error(err);
            }
        };

        this.ws.onclose = async (event: CloseEvent) => {
            if (this.log) {
                console.log(ws.url, "closed", event.code, event.reason);
            }
            this.closedEvent = {
                code: event.code,
                reason: event.reason,
                wasClean: event.wasClean,
            };
            await this.onClose.close();
            await this.messageChannel.put({
                type: "closed",
                event: {
                    code: event.code,
                    reason: event.reason,
                    wasClean: event.wasClean,
                },
            });
        };
    }

    async nextMessage(): Promise<NextMessageType> {
        const msg = await this.messageChannel.pop();
        if (msg == csp.closed) {
            return {
                type: "WebSocketClosed",
                error: new WebSocketClosed(this.url, this.status()),
            };
        }
        if (msg.type == "error") {
            if (
                msg.error.message ==
                    "Error: failed to lookup address information: nodename nor servname provided, or not known"
            ) {
                return {
                    type: "FailedToLookupAddress",
                    error: msg.error.message,
                };
            } else {
                return {
                    type: "OtherError",
                    error: msg.error,
                };
            }
        }
        if (msg.type == "open" || msg.type == "closed") {
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
            // https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/send#invalidstateerror
            if (e.message == "readyState not OPEN") {
                return new WebSocketClosed(this.url, this.status());
            }
            return e as DOMException;
        }
    }

    async close(
        code?: number,
        reason?: string,
        force?: boolean,
    ): Promise<CloseTwice | WebSocketClosedEvent | undefined> {
        if (
            this.ws.readyState == WebSocket.CLOSED ||
            this.ws.readyState == WebSocket.CLOSING
        ) {
            return new CloseTwice(this.ws.url);
        }

        this.ws.close(code, reason);
        const url = new URL(this.url);
        console.log(this.status(), url.host + url.pathname);
        if (force) {
            return;
        }
        await this.onClose.pop();
        console.log(this.status(), url.host + url.pathname, this.closedEvent);
        return this.closedEvent;
    }

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
            const signal = csp.chan<undefined | WebSocketClosedEvent>();
            (async () => {
                await this.isSocketOpen.pop();
                await signal.put(undefined);
            })();
            (async () => {
                await this.onClose.pop();
                await signal.put(this.closedEvent);
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
