import { assertEquals, assertInstanceOf, fail } from "https://deno.land/std@0.176.0/testing/asserts.ts";
import { AsyncWebSocket, CloseReason, CloseTwice, WebSocketClosed } from "./websocket.ts";

const damus = "wss://relay.damus.io";
const nos = "wss://nos.lol";

const relays = [
    nos,
    damus,
];

Deno.test("websocket open & close", async () => {
    let ps = [];
    for (let url of relays) {
        let p = (async () => {
            let ws = AsyncWebSocket.New(url); // todo: maybe use a local ws server to speed up
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

Deno.test("websocket call untilOpen N times", async () => {
    let ws = AsyncWebSocket.New(relays[0]); // todo: maybe use a local ws server to speed up
    if (ws instanceof Error) {
        fail();
    }
    let p = ws.untilOpen();
    let p2 = ws.untilOpen();
    await Promise.all([p, p2]);
    await ws.close();
});

Deno.test("websocket call untilOpen after closed", async () => {
    {
        const ws = AsyncWebSocket.New(relays[0]);
        if (ws instanceof Error) {
            fail();
        }
        const err1 = await ws.close();
        assertEquals(false, err1 instanceof CloseTwice);
        const err2 = await ws.untilOpen();
        assertInstanceOf(err2, Error);
    }
    {
        const ws2 = AsyncWebSocket.New(relays[0]);
        if (ws2 instanceof Error) {
            fail();
        }
        const p = ws2.close(); // do not wait
        const err3 = await ws2.untilOpen();
        assertInstanceOf(err3, Error);
        const err4 = await p;
        assertEquals(false, err4 instanceof CloseTwice);
    }
});

Deno.test("websocket close without waiting for openning", async () => {
    let ps = [];
    for (let url of relays) {
        let p = (async () => {
            let ws = AsyncWebSocket.New(url); // todo: maybe use a local ws server to speed up
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
        let ws = AsyncWebSocket.New(url); // todo: maybe use a local ws server to speed up
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
        ) as CloseEvent;
        // the only thing we can be sure is that there is a code
        // but relay implementations may have whatever number
        assertEquals(typeof event.code, "number");

        let err = await ws.close() as CloseTwice;
        assertEquals(true, err instanceof CloseTwice);
        assertEquals(err.url, ws.url);
    }
    assertEquals(true, skipped < relays.length / 2, `skipped: ${skipped}`); // at least half of the relays have to succeed
});

Deno.test("websocket offline", async () => {
    // a host that can not be reached / not exist
    let ws = AsyncWebSocket.New("wss://relay0.damus.io");
    if (ws instanceof Error) {
        fail();
    }

    let err = await ws.untilOpen();
    assertInstanceOf(err, WebSocketClosed);
    await ws.close();
});
