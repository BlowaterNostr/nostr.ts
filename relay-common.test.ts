import { assertInstanceOf, fail } from "https://deno.land/std@0.176.0/testing/asserts.ts";
import { SingleRelayConnection } from "./relay-single.ts";
import { AsyncWebSocket } from "./websocket.ts";
import { ConnectionPool, RelayAlreadyRegistered } from "./relay-pool.ts";

Deno.test("url acceptance", async (t) => {
    {
        const relay = SingleRelayConnection.New("nos.lol");
        if (relay instanceof Error) {
            fail(relay.message);
        }
        await relay.close();
    }
    {
        const relay = SingleRelayConnection.New("wss://nos.lol");
        if (relay instanceof Error) {
            fail(relay.message);
        }
        await relay.close();
    }
    {
        const pool = new ConnectionPool();
        const err = await pool.addRelayURL("nos.lol");
        if (err instanceof Error) {
            fail(err.message);
        }
        await pool.close();
    }
    {
        const pool = new ConnectionPool();
        const err = await pool.addRelayURL("wss://nos.lol");
        if (err instanceof Error) {
            fail(err.message);
        }
        const err2 = await pool.addRelayURL("nos.lol");
        assertInstanceOf(err2, RelayAlreadyRegistered);
        await pool.close();
    }
    {
        // now switch the order of urls
        const pool = new ConnectionPool();
        const err = await pool.addRelayURL("nos.lol");
        if (err instanceof Error) {
            fail(err.message);
        }
        const err2 = await pool.addRelayURL("wss://nos.lol");
        assertInstanceOf(err2, RelayAlreadyRegistered);
        await pool.close();
    }
});
