import { assertEquals, assertNotInstanceOf, fail } from "https://deno.land/std@0.176.0/testing/asserts.ts";
import { PrivateKey } from "./key.ts";
import {
    decryptNostrEvent,
    getTags,
    InMemoryAccountContext,
    NostrKind,
    RelayResponse_REQ_Message,
    verifyEvent,
} from "./nostr.ts";
import { prepareEncryptedNostrEvent, prepareNormalNostrEvent, prepareParameterizedEvent } from "./event.ts";
import { SingleRelayConnection } from "./relay.ts";
import { relays } from "./relay-list.test.ts";
import { sleep } from "https://raw.githubusercontent.com/BlowaterNostr/csp/master/csp.ts";

Deno.test("Verify Event", async (t) => {
    let pri = PrivateKey.Generate();
    let event = await prepareNormalNostrEvent(InMemoryAccountContext.New(pri), {
        kind: NostrKind.TEXT_NOTE,
        content: "",
    });
    let ok = await verifyEvent(event);
    assertEquals(ok, true);

    await t.step("invalid", async () => {
        let ok = await verifyEvent({
            content: "",
            created_at: 1,
            id: "",
            kind: 1,
            pubkey: "",
            sig: "",
            tags: [],
        });
        assertEquals(ok, false);
    });
});

Deno.test("Encrypt & Decript Event", async () => {
    let ctx = InMemoryAccountContext.New(PrivateKey.Generate());
    let event = await prepareEncryptedNostrEvent(
        ctx,
        {
            encryptKey: ctx.publicKey,
            kind: 1,
            tags: [
                ["p", "some pubkey 1"],
                ["p", "some pubkey 2"],
                ["e", "some event id 1"],
                ["e", "some event id 2"],
            ],
            content: "test",
        },
    );
    assertNotInstanceOf(event, Error);
    let ok = await verifyEvent(event);
    assertEquals(ok, true);

    assertEquals(getTags(event), {
        p: ["some pubkey 1", "some pubkey 2"],
        e: ["some event id 1", "some event id 2"],
    });

    const decrypted = await decryptNostrEvent(event, ctx, ctx.publicKey.hex);
    if (decrypted instanceof Error) {
        fail(decrypted.message);
    }
    assertEquals(decrypted.content, "test");
});

Deno.test("Parameterized Event", async () => {
    const ctx = InMemoryAccountContext.New(PrivateKey.Generate());

    const identifier = "some id";
    const now = Math.floor(Date.now() / 1000);
    const event_v1 = await prepareParameterizedEvent(ctx, {
        content: "v1",
        d: identifier,
        kind: NostrKind.Custom_App_Data,
        created_at: now,
    });
    const event_v2 = await prepareParameterizedEvent(ctx, {
        content: "v2",
        d: identifier,
        kind: NostrKind.Custom_App_Data,
        created_at: now + 10,
    });
    const event_v3 = await prepareParameterizedEvent(ctx, {
        content: "v3",
        d: identifier,
        kind: NostrKind.Custom_App_Data,
        created_at: now + 20,
    });

    const relay = SingleRelayConnection.New(relays[1]);
    assertNotInstanceOf(relay, Error);
    {
        const err = await relay.sendEvent(event_v1);
        if (err instanceof Error) fail(err.message);
        const err2 = await relay.sendEvent(event_v2);
        if (err2 instanceof Error) fail(err2.message);
        await sleep(1000);

        const stream = await relay.newSub("sub", {
            "#d": [identifier],
            authors: [ctx.publicKey.hex],
            kinds: [NostrKind.Custom_App_Data],
        });
        assertNotInstanceOf(stream, Error);
        {
            // will only get v2
            const msg = await stream.chan.pop() as RelayResponse_REQ_Message;
            if (msg.type == "EOSE") fail(JSON.stringify(msg));
            assertEquals(msg.event, event_v2);

            // and then EOSE
            const msg2 = await stream.chan.pop() as RelayResponse_REQ_Message;
            assertEquals(msg2.type, "EOSE");
        }
        {
            const err = await relay.sendEvent(event_v3);
            assertNotInstanceOf(err, Error);
            await sleep(500);

            // will now get v3
            const msg = await stream.chan.pop() as RelayResponse_REQ_Message;
            if (msg.type == "EOSE") fail(JSON.stringify(msg));
            assertEquals(msg.event, event_v3);

            // and not necessarily an EOSE
        }
    }

    await relay.close();
});

Deno.test("wrong encryption key causing decryption failure", async () => {
    const ctx = InMemoryAccountContext.New(PrivateKey.Generate());
    const key = PrivateKey.Generate().hex;
    const event = await prepareEncryptedNostrEvent(ctx, {
        encryptKey: ctx.publicKey,
        kind: NostrKind.DIRECT_MESSAGE,
        tags: [
            ["p", key],
        ],
        content: "123",
    });
    if (event instanceof Error) fail(event.message);
    const err = await ctx.decrypt(key, event.content);
    if (err instanceof Error) {
        // ok
    } else {
        fail(`should have error, get ${err}`);
    }
});
