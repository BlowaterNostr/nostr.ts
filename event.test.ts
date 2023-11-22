import { assertEquals, assertNotInstanceOf, fail } from "https://deno.land/std@0.176.0/testing/asserts.ts";
import { PrivateKey } from "./key.ts";
import { decryptNostrEvent, getTags, InMemoryAccountContext, NostrKind, verifyEvent } from "./nostr.ts";
import { prepareEncryptedNostrEvent, prepareNormalNostrEvent } from "./event.ts";

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
