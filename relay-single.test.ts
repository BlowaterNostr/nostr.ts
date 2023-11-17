import { assertEquals, assertInstanceOf, fail } from "https://deno.land/std@0.176.0/testing/asserts.ts";
import { InMemoryAccountContext, NostrEvent, NostrKind } from "./nostr.ts";
import { blowater, relays } from "./relay-list.test.ts";
import {
    BidirectionalNetwork,
    SingleRelayConnection,
    SubscriptionAlreadyExist,
    WebSocketClosed,
} from "./relay-single.ts";
import { CloseTwice, WebSocketReadyState } from "./websocket.ts";
import { prepareNormalNostrEvent } from "./event.ts";
import * as csp from "https://raw.githubusercontent.com/BlowaterNostr/csp/master/csp.ts";

Deno.test("SingleRelayConnection open & close", async () => {
    const ps = [];
    for (let url of relays) {
        const p = (async () => {
            const relay = SingleRelayConnection.New(url);
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
    const relay = SingleRelayConnection.New(url);
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
    const relay = SingleRelayConnection.New(relays[0]);
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
    const relay = SingleRelayConnection.New(blowater);
    if (relay instanceof Error) fail(relay.message);

    {
        const subID = "1";
        const sub = await relay.newSub(subID, { limit: 1 });
        if (sub instanceof Error) fail(sub.message);
        await relay.closeSub(subID);
        assertEquals(sub.chan.closed(), true);
    }
    await relay.close();
});

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

Deno.test("SubscriptionAlreadyExist", async () => {
    const relay = SingleRelayConnection.New(blowater, { log: true });
    {
        const _ = await relay.newSub("hi", { limit: 1 });
        const sub = await relay.newSub("hi", { limit: 1 });
        assertInstanceOf(sub, SubscriptionAlreadyExist);
    }
    await relay.close();
});

Deno.test("SingleRelayConnection.newSub able to sub before web socket connection is openned", async () => {
    const relay = SingleRelayConnection.New(blowater, { log: true, connect: false });
    {
        assertEquals(relay.status(), "Connecting");
        const stream = await relay.newSub("test", { limit: 1 });
        if (stream instanceof Error) fail(stream.message);

        // connect
        await relay.connect();
        assertEquals(relay.status(), "Connecting");

        const msg = await stream.chan.pop();
        if (msg == csp.closed) {
            fail();
        }
        assertEquals(msg.subID, "test");
        assertEquals(msg.type, "EVENT");
    }
    await relay.close();
});
