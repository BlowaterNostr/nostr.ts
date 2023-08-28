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
    const sub = await relay.newSub("1", { kinds: [0], limit: 1 });
    if (sub instanceof Error) {
        console.log(sub);
        fail();
    }
    await relay.close();
    if (sub instanceof SubscriptionAlreadyExist) {
        fail("unreachable");
    }
    assertEquals(sub.chan.closed(), "close sub 1");
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
        const sub = await relay.newSub(subID, { limit: 1 });
        if (sub instanceof Error) {
            fail();
        }
        await relay.closeSub(subID);
        assertEquals(sub.chan.closed() != false, true);
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
        const sub = await relay.newSub(subID, { kinds: [0], limit: 1 });
        if (sub instanceof Error) {
            fail(sub.message);
        }
        const e = await sub.chan.pop();
        if (e == closed) {
            fail();
        }
        if (e.type != "EVENT") {
            fail();
        }
        assertEquals(e.event.kind, 0);
        console.log("1");
        // update
        const sub2 = await relay.updateSub(subID, { kinds: [4], limit: 1 });
        assertNotInstanceOf(sub2, Error);
        assertEquals(sub, sub2);

        const e2 = await sub2.chan.pop();
        if (e2 == closed) {
            fail();
        }
        assertEquals(e2.type, "EOSE");

        const e3 = await sub2.chan.pop();
        if (e3 == closed) {
            fail();
        }
        if (e3.type != "EVENT") {
            fail(e3.type);
        }
        assertEquals(e3.event.kind, 4);

        const e4 = await sub2.chan.pop();
        if (e4 == closed) {
            fail();
        }
        assertEquals(e4.type, "EOSE");
    }
    await relay.close();
});

Deno.test("updateSub", async (t) => {
    await t.step("update an absent sub id", async () => {
        const relay = SingleRelayConnection.New(relays[1], AsyncWebSocket.New);
        if (relay instanceof Error) {
            fail(relay.message);
        }
        {
            const err = await relay.updateSub("test", {});
            if (err instanceof Error) {
                fail(err.message);
            }
        }
        await relay.close();
    });
});
