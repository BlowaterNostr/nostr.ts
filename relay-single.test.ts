import { assertEquals, fail } from "https://deno.land/std@0.176.0/testing/asserts.ts";
import { InMemoryAccountContext, NostrEvent, NostrKind } from "./nostr.ts";
import { blowater, relays } from "./relay-list.test.ts";
import {
    AsyncWebSocketInterface,
    SingleRelayConnection,
    SubscriptionAlreadyExist,
    WebSocketClosed,
} from "./relay-single.ts";
import { AsyncWebSocket, CloseTwice, WebSocketReadyState } from "./websocket.ts";
import { Channel } from "https://raw.githubusercontent.com/BlowaterNostr/csp/master/csp.ts";
import { prepareNormalNostrEvent } from "./event.ts";

Deno.test("SingleRelayConnection open & close", async () => {
    const ps = [];
    for (let url of relays) {
        const p = (async () => {
            const relay = SingleRelayConnection.New(url, AsyncWebSocket.New);
            if (relay instanceof Error) {
                fail(relay.message);
            }
            await relay.sendEvent({ id: "test id" } as NostrEvent);
            await relay.close();
        })();
        ps.push(p);
    }
    await Promise.all(ps);
});

Deno.test("SingleRelayConnection newSub & close", async () => {
    // able to open & close
    const url = relays[0];
    const relay = SingleRelayConnection.New(url, AsyncWebSocket.New);
    if (relay instanceof Error) {
        fail(relay.message);
    }
    const sub = await relay.newSub("1", { kinds: [0], limit: 1 });
    if (sub instanceof Error) fail(sub.message);

    await relay.close();
    if (sub instanceof SubscriptionAlreadyExist) {
        fail("unreachable");
    }
    assertEquals(sub.chan.closed(), true);
});

Deno.test("SingleRelayConnection subscription already exists", async () => {
    const relay = SingleRelayConnection.New(relays[0], AsyncWebSocket.New);
    if (relay instanceof Error) fail(relay.message);
    {
        // open
        const subID = "1";
        const chan = await relay.newSub(subID, { kinds: [0], limit: 1 });
        if (chan instanceof Error) fail(chan.message);

        // close
        await relay.closeSub(subID);
        assertEquals(chan.chan.closed(), true);

        // open again
        const sub2 = await relay.newSub(subID, { kinds: [0], limit: 1 });
        if (sub2 instanceof Error) fail(sub2.message);
        assertEquals(sub2.chan.closed(), false);
    }
    await relay.close();
});

Deno.test("SingleRelayConnection: close subscription and keep reading", async () => {
    const relay = SingleRelayConnection.New(relays[0], AsyncWebSocket.New);
    if (relay instanceof Error) {
        fail();
    }
    {
        const subID = "1";
        const sub = await relay.newSub(subID, { limit: 1 });
        if (sub instanceof Error) {
            fail();
        }
        await relay.closeSub(subID);
        assertEquals(sub.chan.closed(), true);
    }
    await relay.close();
});

Deno.test("auto reconnection", async () => {
    let _state: WebSocketReadyState = "Open";
    const ws: AsyncWebSocketInterface = {
        async close() {
            _state = "Closed";
            return new CloseTwice("");
        },
        async nextMessage() {
            return new WebSocketClosed();
        },
        onError: new Channel(),
        async send() {
            return new WebSocketClosed();
        },
        status() {
            return _state;
        },
        async untilOpen() {
            return new WebSocketClosed();
        },
    };
    const relay = SingleRelayConnection.New("", () => {
        return ws;
    });
    if (relay instanceof Error) fail(relay.message);
    assertEquals(relay.isClosed(), false);
    await ws.close();
    assertEquals(relay.isClosed(), true);
    assertEquals(relay.isClosedByClient, false);
});

Deno.test("send event", async () => {
    const relay = SingleRelayConnection.New(blowater);
    if (relay instanceof Error) fail(relay.message);

    {
        const err = relay.sendEvent(
            await prepareNormalNostrEvent(InMemoryAccountContext.Generate(), {
                content: "",
                kind: NostrKind.TEXT_NOTE,
            }),
        );
        if (err instanceof Error) fail(err.message);
    }
    await relay.close();
});
