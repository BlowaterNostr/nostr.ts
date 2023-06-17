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
            console.log("---------------------------------------");
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
    const chan = await relay.newSub("1", { kinds: [0], limit: 1 });
    if (chan instanceof Error) {
        console.log(chan);
        fail();
    }
    await relay.close();
    if (chan instanceof SubscriptionAlreadyExist) {
        fail("unreachable");
    }
    assertEquals(chan.closed(), "close sub 1");
});

Deno.test("SingleRelayConnection subscription already exist", async () => {
    const relay = SingleRelayConnection.New(relays[0], AsyncWebSocket.New);
    if (relay instanceof Error) {
        fail();
    }
    const subID = "1";
    const chan = await relay.newSub(subID, { kinds: [0], limit: 1 });
    if (chan instanceof Error) {
        fail();
    }
    await relay.closeSub(subID);
    const chan2 = await relay.newSub(subID, { kinds: [0], limit: 1 });
    assertInstanceOf(chan2, SubscriptionAlreadyExist);
    await relay.close();
});
