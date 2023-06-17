import { assertEquals, assertNotInstanceOf, fail } from "https://deno.land/std@0.176.0/testing/asserts.ts";
import { PrivateKey } from "./key.ts";
import {
    decryptNostrEvent,
    getTags,
    InMemoryAccountContext,
    prepareCustomAppDataEvent,
    prepareEncryptedNostrEvent,
    prepareNormalNostrEvent,
    verifyEvent,
} from "./nostr.ts";

Deno.test("Verify Event", async (t) => {
    let pri = PrivateKey.Generate();
    let event = await prepareNormalNostrEvent(InMemoryAccountContext.New(pri), 1, [], "");
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
        ctx.publicKey.hex,
        1,
        [
            ["p", "some pubkey 1"],
            ["p", "some pubkey 2"],
            ["e", "some event id 1"],
            ["e", "some event id 2"],
        ],
        "test",
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

Deno.test("Custom Event", async () => {
    let ctx = InMemoryAccountContext.New(PrivateKey.Generate());
    const event = await prepareCustomAppDataEvent(ctx, { whatever: "whatever" });
    assertNotInstanceOf(event, Error);

    const decrypted = await decryptNostrEvent(event, ctx, ctx.publicKey.hex);
    assertNotInstanceOf(decrypted, Error);

    assertEquals(decrypted.content, `{"whatever":"whatever"}`);

    assertEquals(getTags(event).p, []);
});
