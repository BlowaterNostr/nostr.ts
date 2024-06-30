import { InMemoryAccountContext, NostrKind } from "./nostr.ts";
import { relays } from "./relay-list.test.ts";
import { SingleRelayConnection, SubscriptionAlreadyExist } from "./relay-single.ts";
import { AsyncWebSocket } from "./websocket.ts";
import * as csp from "@blowater/csp";
import { ConnectionPool } from "./relay-pool.ts";
import { prepareNormalNostrEvent } from "./event.ts";
import { assertEquals, assertNotInstanceOf, fail } from "@std/assert";
import { run } from "https://raw.githubusercontent.com/BlowaterNostr/relayed/main/mod.ts";
import { PrivateKey } from "./key.ts";

Deno.test("ConnectionPool close gracefully 1", async () => {
    const pool = new ConnectionPool();
    await pool.close(); // otherwise the coroutine in the constructor will run forever
});

Deno.test("ConnectionPool close gracefully 2", async () => {
    const relay = await run({
        port: 8001,
        default_policy: {
            allowed_kinds: "all",
        },
        admin: PrivateKey.Generate().toPublicKey(),
        auth_required: false,
    });
    if (relay instanceof Error) fail(relay.message);
    // able to open & close
    const client = SingleRelayConnection.New(relay.ws_url);
    if (client instanceof Error) {
        fail(client.message);
    }
    const pool = new ConnectionPool();
    {
        const err = await pool.addRelay(client);
        assertNotInstanceOf(err, Error);
        await csp.sleep(10);
    }
    await pool.close();
    await relay.shutdown();
});

Deno.test("ConnectionPool open multiple relays concurrently & close", async () => {
    const pool = new ConnectionPool();
    const errs = await pool.addRelayURLs(relays);
    if (errs != undefined) {
        if (errs.length >= relays.length / 2) { // as long as 50%+ relays are available
            for (const err of errs) {
                console.error(err);
            }
            fail();
        }
    }
    await pool.close();
});

Deno.test("ConnectionPool newSub & close", async () => {
    // able to open & close
    const relay = await run({
        port: 8001,
        default_policy: {
            allowed_kinds: "all",
        },
        auth_required: false,
        admin: PrivateKey.Generate().toPublicKey().hex,
    });
    if (relay instanceof Error) fail(relay.message);
    const client = SingleRelayConnection.New(relay.ws_url);
    if (client instanceof Error) {
        fail(client.message);
    }
    const connectionPool = new ConnectionPool();
    {
        const _relay = await connectionPool.addRelay(client);
        assertEquals(_relay, client);
    }
    const sub = await connectionPool.newSub("1", { kinds: [0], limit: 1 });
    if (sub instanceof Error) {
        console.log(sub);
        fail();
    }
    await connectionPool.close();
    if (sub instanceof SubscriptionAlreadyExist) fail(sub.message);
    assertEquals(
        sub.chan.closed(),
        true,
    );
    await relay.shutdown();
});

Deno.test("ConnectionPool: open,close,open again | no relay", async () => {
    const pool = new ConnectionPool();
    {
        // open
        const subID = "1";
        const sub = await pool.newSub(subID, { kinds: [0], limit: 1 });
        if (sub instanceof Error) fail(sub.message);
        assertEquals(sub.chan.closed(), false);

        // close
        await pool.closeSub(subID);
        assertEquals(sub.chan.closed(), true);

        // open again
        const sub2 = await pool.newSub(subID, { kinds: [0], limit: 1 });
        if (sub2 instanceof Error) fail(sub2.message);
        assertEquals(sub2.chan.closed(), false);
    }
    await pool.close();
});

Deno.test("ConnectionPool close subscription", async (t) => {
    await t.step("single relay", async () => {
        const pool = new ConnectionPool();
        const err = await pool.addRelayURLs(relays);
        if (err instanceof Error) fail(err.message);
        {
            const subID = "x";
            const sub = await pool.newSub(subID, { limit: 1 });
            assertNotInstanceOf(sub, Error);
            await pool.closeSub(subID);
            assertEquals(sub.chan.closed(), true);
        }
        await pool.close();
    });
});

Deno.test("ConnectionPool register the same relay twice", async () => {
    const relay = await run({
        port: 8001,
        default_policy: {
            allowed_kinds: "all",
        },
        auth_required: false,
        admin: PrivateKey.Generate().toPublicKey().hex,
    });
    if (relay instanceof Error) fail(relay.message);

    const pool = new ConnectionPool();
    const client = SingleRelayConnection.New(relay.ws_url);
    if (client instanceof Error) {
        fail(client.message);
    }

    {
        const _relay = await pool.addRelay(client);
        assertEquals(_relay, client);
    }

    const _relay = await pool.addRelay(client);
    if (_relay instanceof SingleRelayConnection) {
        assertEquals(_relay.url, client.url);
    } else {
        fail(_relay?.message);
    }

    await pool.close();
    await relay.shutdown();
});

Deno.test("ConnectionPool able to subscribe before adding relays", async () => {
    const relay = await run({
        port: 8001,
        default_policy: {
            allowed_kinds: "all",
        },
        auth_required: false,
        admin: PrivateKey.Generate().toPublicKey().hex,
    });
    if (relay instanceof Error) fail(relay.message);
    const pool = new ConnectionPool();

    const chan = await pool.newSub("1", {
        kinds: [NostrKind.DELETE],
        limit: 1,
    });
    if (chan instanceof Error) {
        fail(chan.message);
    }

    const client = SingleRelayConnection.New(relay.ws_url);
    if (client instanceof Error) {
        fail(client.message);
    }

    const _relay = await pool.addRelay(client);
    assertEquals(_relay, client);

    await pool.sendEvent(
        await prepareNormalNostrEvent(InMemoryAccountContext.Generate(), {
            kind: NostrKind.DELETE,
            content: "",
        }),
    );

    const msg = await chan.chan.pop();
    if (msg === csp.closed) {
        fail();
    }
    // don't care the value, just need to make sure that it's from the same relay
    assertEquals(msg.url, relay.ws_url);
    await pool.close();
    await relay.shutdown();
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
            kinds: [NostrKind.Custom_App_Data],
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

Deno.test("send & get event", async (t) => {
    const pool = new ConnectionPool();
    const err = await pool.addRelayURLs(relays);
    if (err && err.length == relays.length) { // if all relays failed to connect
        console.log(err);
        fail();
    }
    {
        const event = await prepareNormalNostrEvent(InMemoryAccountContext.Generate(), {
            kind: NostrKind.CONTACTS,
            content: "",
        });
        const err = await pool.sendEvent(event);
        if (err) fail(err.message);

        const e = await pool.getEvent(event.id);
        if (e instanceof Error) fail(e.message);

        assertEquals(e, event);
    }
    await pool.close();
});
