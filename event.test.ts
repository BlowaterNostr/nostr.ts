import { assertEquals, fail } from "@std/assert";
import { PrivateKey } from "./key.ts";
import { InMemoryAccountContext, type NostrEvent, NostrKind, verifyEvent } from "./nostr.ts";
import { prepareEncryptedNostrEvent, prepareNostrEvent } from "./event.ts";

Deno.test("Verify Event", async (t) => {
    let pri = PrivateKey.Generate();
    let event = await prepareNostrEvent(InMemoryAccountContext.New(pri), {
        kind: NostrKind.TEXT_NOTE,
        content: "",
    }) as NostrEvent;
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

Deno.test({
    name: "wrong encryption key causing decryption failure",
    ignore: false,
    fn: async () => {
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
    },
});
