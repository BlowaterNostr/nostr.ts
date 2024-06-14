import { assertEquals, fail } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { PrivateKey } from "./key.ts";
import { InMemoryAccountContext, NostrKind, verifyEvent } from "./nostr.ts";
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
    const err = await ctx.decrypt(key, event.content, "nip4");
    if (err instanceof Error) {
        // ok
    } else {
        fail(`should have error, get ${err}`);
    }
});
