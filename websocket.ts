// deno-lint-ignore-file no-explicit-any no-unused-vars require-await ban-unused-ignore
import * as csp from "https://raw.githubusercontent.com/BlowaterNostr/csp/master/csp.ts";
import { AsyncWebSocketInterface, WebSocketClosed } from "./relay.ts";

export enum CloseReason {
    ByClient = 4000,
}

export class AsyncWebSocket implements AsyncWebSocketInterface {
    public readonly onError = csp.chan<Event>();
    private readonly isSocketOpen = csp.chan<Event>();
    private readonly onMessage = csp.chan<MessageEvent>();
    private readonly onClose = csp.chan<CloseEvent>();
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
                console.log(ws.url, "openned", event);
            }
            await this.isSocketOpen.put(event);
            await this.isSocketOpen.close(`ws ${ws.url} is open`);
        };

        this.ws.onmessage = (event: MessageEvent) => {
            this.onMessage.put(event);
        };

        // @ts-ignore para type should be ErrorEvent
        this.ws.onerror = async (event: ErrorEvent) => {
            const err = await this.onError.put(event);
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

    async nextMessage(): Promise<WebSocketClosed | MessageEvent> {
        const msg = await this.onMessage.pop();
        if (msg == csp.closed) {
            return new WebSocketClosed();
        }
        return msg;
    }

    send = async (str: string | ArrayBufferLike | Blob | ArrayBufferView) => {
        let err = await this.untilOpen();
        if (err) {
            return err;
        }
        try {
            this.ws.send(str);
        } catch (e) {
            return e as Error;
        }
    };

    close = async (
        code?: number | undefined,
        reason?: string | undefined,
    ): Promise<CloseEvent | CloseTwice | typeof csp.closed> => {
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
        if (
            this.ws.readyState === WebSocket.CLOSED ||
            this.ws.readyState === WebSocket.CLOSING
        ) {
            return new WebSocketClosed(
                `${this.ws.url} has been closed, can't wait for it to open`,
            );
        } else if (this.ws.readyState === WebSocket.OPEN) {
            return;
        } else if (this.ws.readyState === WebSocket.CONNECTING) {
            let isOpen = await csp.select([
                [this.isSocketOpen, async () => true],
                [this.onClose, async () => false],
            ]);
            if (!isOpen) {
                return new WebSocketClosed(
                    `${this.ws.url} has been closed, can't wait for it to open`,
                );
            }
            return;
        }
        // should be unreachable
        console.log(this.ws.url, "readyState:", this.ws.readyState);
        throw new Error(
            `readyState:${this.ws.readyState}, should be ${WebSocket.CONNECTING}`,
        );
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
