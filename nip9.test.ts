import { assertEquals } from "https://deno.land/std@0.202.0/assert/assert_equals.ts";
import { prepareDeletionNostrEvent, prepareNormalNostrEvent } from "./nodejs/index.ts";
import { InMemoryAccountContext, NostrKind } from "./nostr.ts";
import { prepareEncryptedNostrEvent } from "./event.ts";
import { fail } from "https://deno.land/std@0.202.0/assert/fail.ts";

Deno.test("prepareDeletionEvent", async (t) => {
    const ctx1 = InMemoryAccountContext.Generate();
    const event1 = await prepareEncryptedNostrEvent(ctx1, {
        encryptKey: ctx1.publicKey,
        kind: NostrKind.DIRECT_MESSAGE,
        tags: [
            ["p", ctx1.publicKey.hex],
        ],
        content: "123",
    });
    if (event1 instanceof Error) {
        fail(event1.message);
    }

    await t.step("delete one event", async () => {
        const deletion = await prepareDeletionNostrEvent(ctx1, event1);
        if (deletion instanceof Error) {
            fail(deletion.message);
        }

        assertEquals(deletion.kind, NostrKind.DELETE);
        assertEquals(deletion.tags.length, 1);
        assertEquals(deletion.tags[0][1], event1.id);
    });

    const event2 = await prepareNormalNostrEvent(ctx1, {
        kind: NostrKind.TEXT_NOTE,
        content: "123",
    });

    await t.step("delete two events", async () => {
        const deletion = await prepareDeletionNostrEvent(ctx1, event1, event2);
        if (deletion instanceof Error) {
            fail(deletion.message);
        }

        assertEquals(deletion.tags.length, 2);
        assertEquals(deletion.tags[0][1], event1.id);
        assertEquals(deletion.tags[1][1], event2.id);
    });

});
