import { relays } from "./relay-list.test.ts";
import { BidirectionalNetwork, SingleRelayConnection, WebSocketClosed } from "./relay-single.ts";
import { CloseTwice, WebSocketReadyState } from "./websocket.ts";
import {
    close_sub_keep_reading,
    get_correct_kind,
    get_event_by_id,
    limit,
    newSub_close,
    newSub_multiple_filters,
    no_event,
    open_close,
    send_event,
    sub_exits,
    two_clients_communicate,
} from "./relay-single-test.ts";
import { assertEquals } from "https://deno.land/std@0.202.0/assert/assert_equals.ts";
import { fail } from "https://deno.land/std@0.202.0/assert/fail.ts";

Deno.test("SingleRelayConnection open & close", open_close(relays));

Deno.test("SingleRelayConnection newSub & close", newSub_close(relays[0]));

Deno.test("SingleRelayConnection subscription already exists", sub_exits(relays[0]));

Deno.test("SingleRelayConnection: close subscription and keep reading", close_sub_keep_reading(relays[0]));

Deno.test("send event", send_event(relays[0]));

Deno.test("get_correct_kind", get_correct_kind(relays[0]));

Deno.test("multiple filters", newSub_multiple_filters(relays[0]));

Deno.test("limit", limit(relays[0]));

Deno.test("no_event", no_event(relays[0]));

Deno.test("two_clients_communicate", two_clients_communicate(relays[0]));

Deno.test("get_event_by_id", get_event_by_id(relays[2]));

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
