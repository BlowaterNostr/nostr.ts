import { assertEquals, fail } from "https://deno.land/std@0.176.0/testing/asserts.ts";
import { PrivateKey } from "./key.ts";
import {
    decryptNostrEvent,
    InMemoryAccountContext,
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
        [],
        "test",
    );
    if (event instanceof Error) {
        fail(event.message);
    }
    let ok = await verifyEvent(event);
    assertEquals(ok, true);

    const decrypted = await decryptNostrEvent(event, ctx, ctx.publicKey.hex);
    if (decrypted instanceof Error) {
        fail(decrypted.message);
    }
    assertEquals(decrypted.content, "test");
});
