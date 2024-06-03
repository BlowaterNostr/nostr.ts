import { AsyncWebSocket, CloseReason, CloseTwice } from "./websocket.ts";
import { relays } from "./relay-list.test.ts";
import { WebSocketClosed } from "./relay-single.ts";
import { assertEquals } from "https://deno.land/std@0.202.0/assert/assert_equals.ts";
import { assertInstanceOf } from "https://deno.land/std@0.202.0/assert/assert_instance_of.ts";
import { fail } from "https://deno.land/std@0.202.0/assert/fail.ts";
import { Relay, run } from "https://raw.githubusercontent.com/BlowaterNostr/relayed/main/main.tsx";
import { PrivateKey } from "./key.ts";

Deno.test("websocket open & close", async () => {
    let ps = [];
    for (let url of relays) {
        let p = (async () => {
            let ws = AsyncWebSocket.New(url, true); // todo: maybe use a local ws server to speed up
            if (ws instanceof Error) {
                fail();
            }
            await ws.untilOpen();
            await ws.close();
        })();
        ps.push(p);
    }
    // no exception should happen
    await Promise.all(ps);
});

Deno.test("websocket call untilOpen after closed", async () => {
    const relay = await run({
        port: 8001,
        default_policy: {
            allowed_kinds: "all",
        },
        default_information: {
            auth_required: false,
            pubkey: PrivateKey.Generate().toPublicKey().hex,
        },
    }) as Relay;
    {
        const ws = AsyncWebSocket.New(relay.ws_url, true);
        if (ws instanceof Error) {
            fail();
        }
        const err1 = await ws.close();
        assertEquals(false, err1 instanceof CloseTwice);
        const err2 = await ws.untilOpen();
        assertInstanceOf(err2, Error);
    }
    {
        const ws2 = AsyncWebSocket.New(relay.ws_url, true);
        if (ws2 instanceof Error) {
            fail();
        }
        const p = ws2.close(); // do not wait
        const err3 = await ws2.untilOpen();
        assertInstanceOf(err3, Error);
        const err4 = await p;
        assertEquals(false, err4 instanceof CloseTwice);
    }
    await relay.shutdown();
});

Deno.test("websocket close without waiting for openning", async () => {
    let ps = [];
    for (let url of relays) {
        let p = (async () => {
            let ws = AsyncWebSocket.New(url, true); // todo: maybe use a local ws server to speed up
            if (ws instanceof Error) {
                fail();
            }
            await ws.close(); // ----------------------------error event will happen but don't care in this test
        })();
        ps.push(p);
    }

    // no exception should happen
    await Promise.all(ps);
});

Deno.test("websocket close with a code & reason", async () => {
    let skipped = 0;
    for (let url of relays) {
        let ws = AsyncWebSocket.New(url, true); // todo: maybe use a local ws server to speed up
        if (ws instanceof Error) {
            fail();
        }
        {
            let err = await ws.untilOpen();
            if (err instanceof WebSocketClosed) {
                console.log(`${ws.url} is clsoed, skip`);
                skipped++;
                continue;
            }
            assertEquals(err, undefined);
        }
        let event = await ws.close(
            CloseReason.ByClient,
            "some reason",
        );
        // the only thing we can be sure is that there is a code
        // but relay implementations may have whatever number
        if (event instanceof CloseTwice) {
            console.error(event);
            fail();
        }

        let err = await ws.close();
        if (err instanceof CloseTwice) {
            assertEquals(err.url, ws.url);
        } else {
            console.error(err);
            fail();
        }
    }
    assertEquals(true, skipped < relays.length / 2, `skipped: ${skipped}`); // at least half of the relays have to succeed
});
