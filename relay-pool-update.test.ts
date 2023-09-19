import { assertEquals, fail } from "https://deno.land/std@0.176.0/testing/asserts.ts";
import { NostrKind } from "./nostr.ts";
import { relays } from "./relay-list.test.ts";
import { ConnectionPool } from "./relay.ts";
import { AsyncWebSocket } from "./websocket.ts";
import * as csp from "https://raw.githubusercontent.com/BlowaterNostr/csp/master/csp.ts";

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
            kinds: [NostrKind.Custom_App_Data],
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
        if (res1.res.type != "EVENT" || res1.res.event.kind != NostrKind.Custom_App_Data) {
            fail(JSON.stringify(res1.res));
        }
        assertEquals(res2.res.type, "EOSE");
    }
    await pool.close();
});

Deno.test("concurrent execution", async () => {
    let pool = new ConnectionPool();
    {
        const kind_1 = (async () => {
            const stream = await pool.newSub("kind 1", {
                kinds: [NostrKind.TEXT_NOTE],
                limit: 1,
            });
            if (stream instanceof Error) {
                fail(stream.message);
            }
            const msg = await stream.chan.pop();
            if (msg == csp.closed) {
                fail();
            }
            if (msg.res.type == "EOSE") {
                fail();
            }
            assertEquals(msg.res.event.kind, NostrKind.TEXT_NOTE);
        })();

        const kind_0 = (async () => {
            const stream = await pool.updateSub("kind 0", {
                kinds: [NostrKind.CONTACTS],
                limit: 1,
            });
            if (stream instanceof Error) {
                fail(stream.message);
            }
            const stream2 = await pool.updateSub("kind 0", {
                kinds: [NostrKind.META_DATA],
                limit: 2,
            });
            if (stream2 instanceof Error) {
                fail(stream2.message);
            }
            const msg = await stream2.chan.pop();
            if (msg == csp.closed) {
                fail();
            }
            if (msg.res.type == "EOSE") {
                fail();
            }
            assertEquals(msg.res.event.kind, NostrKind.META_DATA);
        })();

        const kind_4 = (async () => {
            const stream = await pool.updateSub("DIRECT_MESSAGE", {
                kinds: [NostrKind.DIRECT_MESSAGE],
            });
            if (stream instanceof Error) {
                fail(stream.message);
            }
            const msg = await stream.chan.pop();
            if (msg == csp.closed) {
                fail();
            }
            if (msg.res.type == "EOSE") {
                fail();
            }
            await pool.closeSub("DIRECT_MESSAGE");
            assertEquals(msg.res.event.kind, NostrKind.DIRECT_MESSAGE);
        })();

        // add relays
        const err = await pool.addRelayURL(relays[0]);
        if (err instanceof Error) {
            throw err;
        }
        await kind_1;
        await kind_0;
        await kind_4;
    }
    await pool.close();
});
