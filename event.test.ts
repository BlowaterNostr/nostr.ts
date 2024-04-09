import { fail } from "https://deno.land/std@0.202.0/assert/fail.ts";
import { assertEquals } from "https://deno.land/std@0.202.0/assert/assert_equals.ts";
import { PrivateKey } from "./key.ts";
import { InMemoryAccountContext, NostrKind, verifyEvent } from "./nostr.ts";
import { prepareDeletionNostrEvent, prepareEncryptedNostrEvent, prepareNormalNostrEvent } from "./event.ts";

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

Deno.test("delete normal event", async () => {
    const ctx = InMemoryAccountContext.Generate();
    const event = await prepareNormalNostrEvent(ctx, {
        content: "test deletion",
        kind: NostrKind.TEXT_NOTE,
    });
    if (event instanceof Error) {
        fail(event.message);
    }
    const deletion = await prepareDeletionNostrEvent(ctx, "test deletion", event);
    if (deletion instanceof Error) {
        fail(deletion.message);
    }
    assertEquals(deletion.kind, NostrKind.DELETE);
    assertEquals(deletion.content, "test deletion");
    assertEquals(deletion.tags[0], ["e", event.id]);
});

Deno.test("delete replacement event ", async () => {
    const ctx = InMemoryAccountContext.Generate();
    const event = await prepareNormalNostrEvent(ctx, {
        kind: NostrKind.CONTACTS,
        content: "test deletion",
        tags: [["d", "test"]],
    });
    if (event instanceof Error) {
        fail(event.message);
    }
    const deletion = await prepareDeletionNostrEvent(ctx, "test deletion", event);
    if (deletion instanceof Error) {
        fail(deletion.message);
    }
    assertEquals(deletion.kind, NostrKind.DELETE);
    assertEquals(deletion.content, "test deletion");
    assertEquals(deletion.tags[0], ["a", `${NostrKind.CONTACTS}:${event.pubkey}:test`]);
});

Deno.test("delete parameterized replacement event", async () => {
    const ctx = InMemoryAccountContext.Generate();
    const event = await prepareNormalNostrEvent(ctx, {
        kind: NostrKind.CONTACTS,
        content: "test deletion",
    });
    if (event instanceof Error) {
        fail(event.message);
    }
    const deletion = await prepareDeletionNostrEvent(ctx, "test deletion", event);
    if (deletion instanceof Error) {
        fail(deletion.message);
    }
    assertEquals(deletion.kind, NostrKind.DELETE);
    assertEquals(deletion.content, "test deletion");
    assertEquals(deletion.tags[0], ["a", `${NostrKind.CONTACTS}:${event.pubkey}:`]);
});
