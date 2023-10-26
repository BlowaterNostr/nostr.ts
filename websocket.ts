// deno-lint-ignore-file no-explicit-any no-unused-vars require-await ban-unused-ignore
import * as csp from "https://raw.githubusercontent.com/BlowaterNostr/csp/master/csp.ts";
import { AsyncWebSocketInterface, WebSocketClosed } from "./relay.ts";

export enum CloseReason {
    ByClient = 4000,
}

export class AsyncWebSocket implements AsyncWebSocketInterface {
    public readonly isSocketOpen = csp.chan<Event>();
    public readonly onMessage = csp.chan<MessageEvent>();
    public readonly onError = csp.chan<Event>();
    public readonly onClose = csp.chan<CloseEvent>();

    static New(url: string): AsyncWebSocket | Error {
        try {
            const ws = new WebSocket(url); // could throw, caller should catch it, not part of the MDN doc
            return new AsyncWebSocket(url, ws);
        } catch (err) {
            return err;
        }
    }

    private constructor(
        public readonly url: string,
        private readonly ws: WebSocket,
    ) {
        this.ws.onopen = async (event: Event) => {
            console.log(url, "openned");
            await this.isSocketOpen.put(event);
            await this.isSocketOpen.close(`ws ${url} is open`);
        };

        this.ws.onmessage = (event: MessageEvent) => {
            this.onMessage.put(event);
        };

        // @ts-ignore para type should be ErrorEvent
        this.ws.onerror = (event: ErrorEvent) => {
            console.log(url, "error", event.message);
            this.onError.put(event);
        };

        this.ws.onclose = async (event: CloseEvent) => {
            console.log(url, "closed", event.code, event.reason);
            await this.onClose.put(event);
            await this.onClose.close(`ws ${this.url} is closed`);
        };
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
            return new CloseTwice(this.url);
        }
        console.log("closing", this.url);
        this.ws.close(code, reason);
        return await this.onClose.pop();
    };

    public isClosedOrClosing(): boolean {
        return this.ws.readyState == WebSocket.CLOSED ||
            this.ws.readyState == WebSocket.CLOSING;
    }

    // only unblocks when the socket is open
    // if the socket is closed or closing, blocks forever
    async untilOpen() {
        if (
            this.ws.readyState === WebSocket.CLOSED ||
            this.ws.readyState === WebSocket.CLOSING
        ) {
            return new WebSocketClosed(
                `${this.url} has been closed, can't wait for it to open`,
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
                    `${this.url} has been closed, can't wait for it to open`,
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
