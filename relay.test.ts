import * as csp from "https://raw.githubusercontent.com/BlowaterNostr/csp/master/csp.ts";
import {
    assertEquals,
    assertInstanceOf,
    assertNotEquals,
    assertNotInstanceOf,
    fail,
} from "https://deno.land/std@0.176.0/testing/asserts.ts";
import { NostrEvent, NostrKind, RelayResponse_REQ_Message } from "./nostr.ts";
import {
    ConnectionPool,
    RelayAlreadyRegistered,
    SingleRelayConnection,
    SubscriptionAlreadyExist,
    SubscriptionNotExist,
} from "./relay.ts";

import { relays } from "./relay-list.test.ts";
import { AsyncWebSocket, AsyncWebSocketInterface, CloseTwice, WebSocketClosed } from "./websocket.ts";

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
    const chan = await connectionPool.newSub("1", { kinds: [0], limit: 1 });
    if (chan instanceof Error) {
        console.log(chan);
        fail();
    }
    await connectionPool.close();
    if (chan instanceof SubscriptionAlreadyExist) {
        fail("unreachable");
    }
    assertEquals(
        chan.closed(),
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
        const chan = await pool.newSub(subID, { kinds: [0], limit: 1 });
        assertNotInstanceOf(chan, Error);
        await pool.closeSub(subID);
        // even if the subscription is closed,
        // we don't close the consumer channel
        assertEquals(chan.closed(), false);
        const result = await chan.pop();
        if (result == csp.closed) {
            fail();
        }
        assertEquals(result[0].type, "EVENT");
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

    const msg = await chan.pop();
    if (msg === csp.closed) {
        fail();
    }
    // don't care the value, just need to make sure that it's from the same relay
    assertEquals(msg[1], relays[0]);
    await pool.close();
});

Deno.test("updateSub", async (t) => {
    const pool = new ConnectionPool({ ws: AsyncWebSocket.New });
    await t.step("no sub", async () => {
        const err = await pool.updateSub("x", {}) as Error;
        assertEquals(err instanceof SubscriptionNotExist, true);
        assertEquals(err.message, "sub 'x' not exist for relay pool");
    });
    await t.step("no relays", async () => {
        const sub1 = await pool.newSub("x", {});
        if (sub1 instanceof Error) {
            fail(sub1.message);
        }
        const sub2 = await pool.updateSub("x", {});
        if (sub2 instanceof Error) {
            fail(sub2.message);
        }
        assertEquals(sub1 == sub2, true); // same reference
    });

    const err = await pool.addRelayURL(relays[0]);
    assertEquals(err, undefined);
    await t.step("connected to relays", async () => {
        const sub1 = await pool.newSub("y", { kinds: [NostrKind.TEXT_NOTE] });
        if (sub1 instanceof Error) {
            fail(sub1.message);
        }
        const r = await sub1.pop() as [RelayResponse_REQ_Message, string];
        if (r[0].type == "EOSE") {
            fail();
        }
        assertEquals(r[0].event.kind, NostrKind.TEXT_NOTE);
        const sub2 = await pool.updateSub("y", { kinds: [NostrKind.META_DATA] });
        if (sub2 instanceof Error) {
            fail(sub2.message);
        }
        assertEquals(sub1 == sub2, true); // same reference
        const r2 = await sub2.pop() as [RelayResponse_REQ_Message, string];
        if (r2[0].type == "EOSE") {
            fail();
        }
        assertEquals(r2[0].event.kind, NostrKind.META_DATA);
    });

    await pool.close();
});

// todo: limit is not supported by some relays
// Deno.test("ConnectionPool open & close", async () => {
//     let pool = new ConnectionPool();

//     let err = await pool.sendEvent({} as NostrEvent);
//     assertEquals(true, err instanceof NoRelayRegistered);

//     // differ from sendEvent,
//     // when there is no relays in the pool,
//     // the pool will remember this subscription
//     // and when a relay is registered to the pool,
//     // the REQ will be send to this relay
//     let chan = await pool.newSub("subxxx", { kinds: [4], limit: 1 });
//     if (chan instanceof Error) {
//         console.log(chan);
//         fail();
//     }
//     assertInstanceOf(chan, csp.Channel);

//     let err2 = await pool.newSub("subxxx", {});
//     assertInstanceOf(err2, SubscriptionAlreadyExist);

//     const ps = [];
//     for (let url of relays) {
//         const relay = SingleRelayConnection.New(url, AsyncWebSocket.New);
//         if (relay instanceof Error) {
//             fail(relay.message);
//         }
//         let p = pool.addRelay(relay);
//         ps.push(p);
//     }
//     for (let p of ps) {
//         console.log("waiting")
//         let err3 = await p;
//         if (err3 instanceof WebSocketClosed) {
//             console.log("WebSocketClosed", err3.message);
//             continue;
//         }
//         assertEquals(undefined, err3);
//     }
//     // assertEquals(pool.getRelays().length > relays.length / 2, true); // at least half of the relays are open

//     let seenMap = new Map<string, boolean>();
//     for (;;) {
//         // continue to pull the data until all relays' responses have been seen
//         console.log("pop chan")
//         let msg = await chan.pop();
//         if(msg === csp.closed) {
//             console.log("channel is clsoed")
//             break
//         }
//         if (msg[0][0] === "EVENT") {
//             console.log(msg[0][2], msg[1])
//             assertEquals(msg[0][2]?.kind, 4);
//         } else {
//             console.log(msg)
//         }
//         assertEquals(relays.includes(msg[1]), true);
//         seenMap.set(msg[1], true);
//         if (seenMap.size === pool.getRelays().length) {
//             console.log("has seen all", seenMap.size)
//             break;
//         }
//     }

//     for (let relay of pool.getRelays()) {
//         assertEquals(seenMap.get(relay.url), true);
//     }

//     console.log("about to close the pool")
//     await pool.close(); // will close all relays
// });

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
