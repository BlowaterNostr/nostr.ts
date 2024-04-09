import { assertEquals } from "https://deno.land/std@0.202.0/assert/assert_equals.ts";
import { prepareDeletionNostrEvent, prepareNormalNostrEvent, PrivateKey } from "./nodejs/index.ts";
import { InMemoryAccountContext, NostrKind } from "./nostr.ts";
import { fail } from "https://deno.land/std@0.202.0/assert/fail.ts";
import { SingleRelayConnection } from "./relay-single.ts";

export const prepareNormalDeletionEvent = () => async () => {
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
}

export const prepareReplacementDeletionEvent = () => async () => {
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
    assertEquals(deletion.tags[0], ["a", `${NostrKind.CONTACTS}:${event.id}:test`]);
}

export const sendDeletionEvent = (url: string) => async () => {
    const relay = SingleRelayConnection.New(url);
    const ctx = InMemoryAccountContext.Generate();
    {
        const event = await prepareNormalNostrEvent(ctx, {
            content: "get_event_by_id",
            kind: NostrKind.TEXT_NOTE,
        });
        const err1 = await relay.sendEvent(event);
        if (err1 instanceof Error) fail(err1.message);

        const event_1 = await relay.getEvent(event.id);
        if (event_1 instanceof Error) fail(event_1.message);
        assertEquals(event, event_1);

        const deletion = await prepareDeletionNostrEvent(ctx, "test deletion", event);
        if (deletion instanceof Error) {
            fail(deletion.message);
        }
        const err2 = relay.sendEvent(deletion);
        if (err2 instanceof Error) fail(err2.message);

        const event_2 = await relay.getEvent(event.id);
        if (event_2 instanceof Error) fail(event_2.message);
        assertEquals(event_2, undefined);
    }
    await relay.close();
};
