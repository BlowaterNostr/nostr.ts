import {
    assertEquals,
    assertInstanceOf,
    assertNotInstanceOf,
    fail,
} from "https://deno.land/std@0.176.0/testing/asserts.ts";
import { NostrEvent } from "./nostr.ts";
import { relays } from "./relay-list.test.ts";
import { SingleRelayConnection, SubscriptionAlreadyExist } from "./relay.ts";
import { AsyncWebSocket } from "./websocket.ts";
import { closed } from "https://raw.githubusercontent.com/BlowaterNostr/csp/master/csp.ts";

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

Deno.test("SingleRelayConnection subscription already exists", async () => {
    const relay = SingleRelayConnection.New(relays[0], AsyncWebSocket.New);
    if (relay instanceof Error) {
        fail();
    }
    {
        const subID = "1";
        const chan = await relay.newSub(subID, { kinds: [0], limit: 1 });
        if (chan instanceof Error) {
            fail(chan.message);
        }
        await relay.closeSub(subID);
        const chan2 = await relay.newSub(subID, { kinds: [0], limit: 1 });
        assertInstanceOf(chan2, SubscriptionAlreadyExist);
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
        const chan = await relay.newSub(subID, { limit: 1 });
        if (chan instanceof Error) {
            fail();
        }
        await relay.closeSub(subID);
        assertEquals(chan.closed() != false, true);
    }
    await relay.close();
});

Deno.test("SingleRelayConnection: update subscription", async () => {
    const relay = SingleRelayConnection.New(relays[1], AsyncWebSocket.New);
    if (relay instanceof Error) {
        fail(relay.message);
    }
    {
        const subID = "1";
        const chan = await relay.newSub(subID, { kinds: [0], limit: 1 });
        if (chan instanceof Error) {
            fail(chan.message);
        }
        const e = await chan.pop();
        if (e == closed) {
            fail();
        }
        if (e.type != "EVENT") {
            fail();
        }
        assertEquals(e.event.kind, 0);
        console.log("1");
        // update
        const chan2 = await relay.updateSub(subID, { kinds: [4], limit: 1 });
        assertNotInstanceOf(chan2, Error);
        assertEquals(chan === chan2, true);

        const e2 = await chan2.pop();
        if (e2 == closed) {
            fail();
        }
        assertEquals(e2.type, "EOSE");

        const e3 = await chan2.pop();
        if (e3 == closed) {
            fail();
        }
        if (e3.type != "EVENT") {
            fail(e3.type);
        }
        assertEquals(e3.event.kind, 4);

        const e4 = await chan2.pop();
        if (e4 == closed) {
            fail();
        }
        assertEquals(e4.type, "EOSE");
    }
    await relay.close();
});
