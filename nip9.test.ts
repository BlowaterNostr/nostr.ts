import { assertEquals } from "https://deno.land/std@0.202.0/assert/assert_equals.ts";
import { prepareDeletionNostrEvent, prepareNormalNostrEvent, PrivateKey } from "./nodejs/index.ts";
import { InMemoryAccountContext, NostrKind } from "./nostr.ts";
import { prepareEncryptedNostrEvent } from "./event.ts";
import { fail } from "https://deno.land/std@0.202.0/assert/fail.ts";
import { SingleRelayConnection } from "./relay-single.ts";
import { relays } from "./relay-list.test.ts";

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
        const deletion = await prepareDeletionNostrEvent(ctx1, "test1", event1);
        if (deletion instanceof Error) {
            fail(deletion.message);
        }

        assertEquals(deletion.kind, NostrKind.DELETE);
        assertEquals(deletion.content, "test1");
        assertEquals(deletion.tags.length, 1);
        assertEquals(deletion.tags[0][1], event1.id);
    });

    const event2 = await prepareNormalNostrEvent(ctx1, {
        kind: NostrKind.TEXT_NOTE,
        content: "123",
    });

    await t.step("delete two events", async () => {
        const deletion = await prepareDeletionNostrEvent(ctx1, "test2", event1, event2);
        if (deletion instanceof Error) {
            fail(deletion.message);
        }

        assertEquals(deletion.tags.length, 2);
        assertEquals(deletion.content, "test2");
        assertEquals(deletion.tags[0][1], event1.id);
        assertEquals(deletion.tags[1][1], event2.id);
    });
});

Deno.test("Deletion against a strfry relay", async (t) => {
    const relay = SingleRelayConnection.New(relays[2]);
    const ctx = InMemoryAccountContext.Generate();
    const event = await prepareNormalNostrEvent(ctx, {
        kind: NostrKind.TEXT_NOTE,
        content: "test",
    });
    {
        const err = relay.sendEvent(event);
        if (err instanceof Error) fail(err.message);
    }
    {
        const event_2 = await relay.getEvent(event.id);
        if (event_2 instanceof Error) fail(event_2.message);
        assertEquals(event_2, event);
    }
    {
        const deletion = await prepareDeletionNostrEvent(ctx, "test deletion", event);
        if (deletion instanceof Error) {
            fail(deletion.message);
        }
    }
    {
        const event_3 = await relay.getEvent(event.id);
        if (event_3 instanceof Error) fail(event_3.message);
        assertEquals(event_3, undefined);
    }
    await relay.close();
});
