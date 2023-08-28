import {
    assertEquals,
    assertInstanceOf,
    assertNotInstanceOf,
    fail,
} from "https://deno.land/std@0.176.0/testing/asserts.ts";
import { NostrKind } from "./nostr.ts";
import { relays } from "./relay-list.test.ts";
import {
    ConnectionPool,
    RelayAlreadyRegistered,
    SingleRelayConnection,
    SubscriptionAlreadyExist,
} from "./relay.ts";
import { AsyncWebSocket, WebSocketClosed } from "./websocket.ts";
import * as csp from "https://raw.githubusercontent.com/BlowaterNostr/csp/master/csp.ts";

Deno.test("ConnectionPool close gracefully 1", async () => {
    const pool = new ConnectionPool();
    await pool.close(); // otherwise the coroutine in the constructor will run forever
});

Deno.test("ConnectionPool close gracefully 2", async () => {
    // able to open & close
    const relay = SingleRelayConnection.New(relays[0], AsyncWebSocket.New);
    if (relay instanceof Error) {
        fail(relay.message);
    }
    await relay.untilOpen();

    const pool = new ConnectionPool();
    const err = await pool.addRelay(relay);
    assertNotInstanceOf(err, Error);
    assertEquals(pool.getClosedRelaysThatShouldBeReconnected().length, 0);
    await relay.close(); // if a relay is closed by us instead of the server,
    //                      the pool should not add it back
    await csp.sleep(300);
    assertEquals(pool.getClosedRelaysThatShouldBeReconnected().length, 0);
    await pool.close();
});

Deno.test("ConnectionPool open multiple relays concurrently & close", async () => {
    const pool = new ConnectionPool();
    const errs = await pool.addRelayURLs(relays);
    if (errs != undefined) {
        assertEquals(errs.length < relays.length / 2, true); // as long as 50%+ relays are available
    }
    await pool.close();
});

Deno.test("ConnectionPool newSub & close", async () => {
    // able to open & close
    const url = relays[0];
    const relay = SingleRelayConnection.New(url, AsyncWebSocket.New);
    if (relay instanceof Error) {
        fail(relay.message);
    }
    const connectionPool = new ConnectionPool();
    {
        const err = await connectionPool.addRelay(relay);
        assertEquals(err, undefined);
    }
    const sub = await connectionPool.newSub("1", { kinds: [0], limit: 1 });
    if (sub instanceof Error) {
        console.log(sub);
        fail();
    }
    await connectionPool.close();
    if (sub instanceof SubscriptionAlreadyExist) {
        fail("unreachable");
    }
    assertEquals(
        sub.chan.closed(),
        "close sub 1 because of pool is closed by the client",
    );
});

Deno.test("ConnectionPool subscription already exist", async () => {
    const pool = new ConnectionPool();
    const subID = "1";
    const chan = await pool.newSub(subID, { kinds: [0], limit: 1 });
    if (chan instanceof Error) {
        fail();
    }
    await pool.closeSub(subID);
    const chan2 = await pool.newSub(subID, { kinds: [0], limit: 1 });
    assertInstanceOf(chan2, SubscriptionAlreadyExist);
    await pool.close();
});

Deno.test("ConnectionPool close subscription", async () => {
    const pool = new ConnectionPool();
    pool.addRelayURL(relays[0]);
    {
        const subID = "x";
        const sub = await pool.newSub(subID, { kinds: [0], limit: 1 });
        assertNotInstanceOf(sub, Error);
        await pool.closeSub(subID);
        // even if the subscription is closed,
        // we don't close the consumer channel
        assertEquals(sub.chan.closed(), false);
        const result = await sub.chan.pop();
        if (result == csp.closed) {
            fail();
        }
        assertEquals(result.res.type, "EVENT");
    }
    await pool.close();
});

Deno.test("ConnectionPool register the same relay twice", async () => {
    const pool = new ConnectionPool();

    const relay = SingleRelayConnection.New(relays[0], AsyncWebSocket.New);
    if (relay instanceof Error) {
        fail(relay.message);
    }

    const err1 = await pool.addRelay(relay);
    assertEquals(err1, undefined);

    const err2 = await pool.addRelay(relay);
    assertInstanceOf(err2, RelayAlreadyRegistered);

    await pool.close();
});

Deno.test("ConnectionPool able to subscribe before adding relays", async () => {
    const pool = new ConnectionPool();

    const chan = await pool.newSub("1", {
        kinds: [NostrKind.DELETE],
        limit: 1,
    });
    if (chan instanceof Error) {
        fail(chan.message);
    }

    const relay = SingleRelayConnection.New(relays[0], AsyncWebSocket.New);
    if (relay instanceof Error) {
        fail(relay.message);
    }

    const err1 = await pool.addRelay(relay);
    assertEquals(err1, undefined);

    const msg = await chan.chan.pop();
    if (msg === csp.closed) {
        fail();
    }
    // don't care the value, just need to make sure that it's from the same relay
    assertEquals(msg.url, relays[0]);
    await pool.close();
});

Deno.test("updateSub", async (t) => {
    const pool = new ConnectionPool({ ws: AsyncWebSocket.New });

    await t.step("no sub & no relays", async () => {
        const sub1 = await pool.updateSub("x", {}) as Error;
        if (sub1 instanceof Error) {
            fail(sub1.message);
        }

        const sub2 = await pool.updateSub("x", {});
        if (sub2 instanceof Error) {
            fail(sub2.message);
        }
        assertEquals(sub1 == sub2, true); // same reference
    });

    const err = await pool.addRelayURLs(relays);
    assertEquals(err, undefined);
    await t.step("connected to relays", async () => {
        const sub1 = await pool.newSub("y", { kinds: [NostrKind.TEXT_NOTE], limit: 1000 });
        if (sub1 instanceof Error) {
            fail(sub1.message);
        }
        const r = await sub1.chan.pop();
        if (r == csp.closed) {
            fail();
        }
        if (r.res.type == "EOSE") {
            fail();
        }
        assertEquals(r.res.event.kind, NostrKind.TEXT_NOTE);
        const sub2 = await pool.updateSub("y", { kinds: [NostrKind.DIRECT_MESSAGE] });
        if (sub2 instanceof Error) {
            fail(sub2.message);
        }
        assertEquals(sub1 == sub2, true); // same reference

        { // need to consume old events that are already in the channel
            let i = 0;
            for await (const e of sub2.chan) {
                if (e.res.type == "EOSE") {
                    continue;
                }
                if (e.res.event.kind == 1) {
                    console.log("skip", ++i);
                    continue;
                }
                break;
            }
        }

        const r2 = await sub2.chan.pop();
        if (r2 == csp.closed) {
            fail();
        }
        if (r2.res.type == "EOSE") {
            fail(r2.res.type);
        }
        assertEquals(r2.res.event.kind, NostrKind.DIRECT_MESSAGE);
    });

    await t.step("create new sub if the sub name does not exist", async () => {
        const sub = await pool.updateSub("new sub", { limit: 1 });
        if (sub instanceof Error) {
            fail(sub.message);
        }
    });

    await pool.close();
});

Deno.test("updateSub 2 times & add relay url later", async (t) => {
    const pool = new ConnectionPool({ ws: AsyncWebSocket.New });
    {
        const stream1 = await pool.updateSub("profilesStream", {
            kinds: [NostrKind.META_DATA],
            limit: 1,
        });
        if (stream1 instanceof Error) {
            fail(stream1.message);
        }

        const stream2 = await pool.updateSub("profilesStream", {
            kinds: [NostrKind.CustomAppData],
            limit: 1,
        });
        if (stream2 instanceof Error) {
            fail(stream2.message);
        }

        assertEquals(stream1, stream2);

        // add relay after creating subscriptions
        // should not create starvation for readers
        await pool.addRelayURL(relays[1]);

        const res1 = await stream1.chan.pop();
        const res2 = await stream2.chan.pop();

        if (res1 == csp.closed || res2 == csp.closed) {
            fail();
        }
        if (res1.res.type != "EVENT" || res1.res.event.kind != NostrKind.CustomAppData) {
            fail(JSON.stringify(res1.res));
        }
        assertEquals(res2.res.type, "EOSE");
    }
    await pool.close();
});

Deno.test("newSub 2 times & add relay url later", async (t) => {
    const pool = new ConnectionPool({ ws: AsyncWebSocket.New });
    {
        const stream1 = await pool.newSub("sub1", {
            kinds: [NostrKind.META_DATA],
            limit: 1,
        });
        if (stream1 instanceof Error) {
            fail(stream1.message);
        }
        const stream2 = await pool.newSub("sub2", {
            kinds: [NostrKind.CustomAppData],
            limit: 1,
        });
        if (stream2 instanceof Error) {
            fail(stream2.message);
        }

        // add relay after creating subscriptions
        // should not create starvation for readers
        await pool.addRelayURL(relays[1]);

        const res1 = await stream1.chan.pop();
        const res2 = await stream1.chan.pop();
        const res3 = await stream2.chan.pop();
        const res4 = await stream2.chan.pop();
        // as long as it does not block
    }
    await pool.close();
});

Deno.test("websocket offline", async () => {
    // a host that can not be reached / not exist
    let pool = new ConnectionPool();
    let relay = SingleRelayConnection.New(
        "wss://relay0.damus.io", // does not exist
        AsyncWebSocket.New,
    );
    if (relay instanceof Error) {
        fail();
    }
    let err = await pool.addRelay(relay);
    assertInstanceOf(err, WebSocketClosed);
    assertEquals(pool.getRelays().length, 0);
    await pool.close();
});

Deno.test("concurrent execution", async () => {
    let pool = new ConnectionPool();
    {
        const kind_1 = (async ()=>{
            const stream = await pool.newSub("kind 1", {
                kinds: [NostrKind.TEXT_NOTE],
                limit: 1
            })
            if( stream instanceof Error) {
                fail(stream.message)
            }
            const msg = await stream.chan.pop();
            if(msg == csp.closed) {
                fail()
            }
            if(msg.res.type == "EOSE") {
                fail()
            }
            assertEquals(msg.res.event.kind, NostrKind.TEXT_NOTE)
        })();

        const kind_0 = (async ()=>{
            const stream = await pool.updateSub("kind 0", {
                kinds: [NostrKind.META_DATA],
                limit: 1
            })
            if( stream instanceof Error) {
                fail(stream.message)
            }
            const stream2 = await pool.updateSub("kind 0", {
                kinds: [NostrKind.META_DATA],
                limit: 2
            })
            if( stream2 instanceof Error) {
                fail(stream2.message)
            }
            const msg = await stream2.chan.pop();
            if(msg == csp.closed) {
                fail()
            }
            if(msg.res.type == "EOSE") {
                fail()
            }
            assertEquals(msg.res.event.kind, NostrKind.META_DATA)
        })();

        // add relays
        const err = await pool.addRelayURL(relays[0]);
        if(err instanceof Error) {
            throw err
        }
        await kind_1;
        await kind_0;
    }
    await pool.close();
})
