import { assertEquals, assertInstanceOf, fail } from "https://deno.land/std@0.202.0/testing/asserts.ts";
import { blowater, relays } from "./relay-list.test.ts";
import {
    BidirectionalNetwork,
    SingleRelayConnection,
    SubscriptionAlreadyExist,
    WebSocketClosed,
} from "./relay-single.ts";
import { CloseTwice, WebSocketReadyState } from "./websocket.ts";
import {
    close_sub_keep_reading,
    newSub_close,
    open_close,
    send_event,
    sub_before_socket_open,
    sub_exits,
} from "./relay-single-test.ts";

Deno.test("SingleRelayConnection open & close", open_close(relays));

Deno.test("SingleRelayConnection newSub & close", newSub_close(relays[0]));

Deno.test("SingleRelayConnection subscription already exists", sub_exits(relays[0]));

Deno.test("SingleRelayConnection: close subscription and keep reading", close_sub_keep_reading(blowater));

Deno.test("auto reconnection", async () => {
    let _state: WebSocketReadyState = "Open";
    const ws: BidirectionalNetwork = {
        async close() {
            _state = "Closed";
            return new CloseTwice("");
        },
        async nextMessage() {
            return {
                type: "WebSocketClosed",
                error: new WebSocketClosed("", "Closed"),
            };
        },
        async send() {
            return new WebSocketClosed("", "Closing");
        },
        status() {
            return _state;
        },
        async untilOpen() {
            return new WebSocketClosed("", "Closed");
        },
    };
    const relay = SingleRelayConnection.New("", {
        wsCreator: () => {
            return ws;
        },
    });
    if (relay instanceof Error) fail(relay.message);
    {
        relay.log = true;
        assertEquals(relay.isClosed(), false);
        await ws.close();
        assertEquals(relay.isClosed(), true);
        assertEquals(relay.isClosedByClient(), false);
    }
    await relay.close();
});

Deno.test("send event", send_event(blowater));

Deno.test(
    "SingleRelayConnection.newSub able to sub before web socket connection is openned",
    sub_before_socket_open(blowater),
);
