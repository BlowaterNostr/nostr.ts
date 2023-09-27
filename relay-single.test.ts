import { assertEquals, assertInstanceOf, fail } from "https://deno.land/std@0.176.0/testing/asserts.ts";
import { NostrEvent } from "./nostr.ts";
import { relays } from "./relay-list.test.ts";
import { SingleRelayConnection, SubscriptionAlreadyExist } from "./relay.ts";
import { AsyncWebSocket } from "./websocket.ts";

Deno.test("SingleRelayConnection open & close", async () => {
    const ps = [];
    for (let url of relays) {
        const p = (async () => {
            const relay = SingleRelayConnection.New(url, AsyncWebSocket.New);
            if (relay instanceof Error) {
                fail(relay.message);
            }
            await relay.untilOpen();
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
    await relay.untilOpen();
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
