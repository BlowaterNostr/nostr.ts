import { assertEquals } from "https://deno.land/std@0.202.0/assert/assert_equals.ts";
import { prepareDeletionNostrEvent, prepareNormalNostrEvent } from "./event.ts";
import { InMemoryAccountContext, NostrKind } from "./nostr.ts";
import { fail } from "https://deno.land/std@0.202.0/assert/fail.ts";
import { SingleRelayConnection } from "./relay-single.ts";

export const store_deletion_event = (url: string) => async () => {
    const relay = SingleRelayConnection.New(url, { log: true });
    const ctx = InMemoryAccountContext.Generate();
    try {
        const event = await prepareNormalNostrEvent(ctx, {
            content: "test send_deletion_event",
            kind: NostrKind.TEXT_NOTE,
        });
        const deletion = await prepareDeletionNostrEvent(ctx, "test deletion", event);
        if (deletion instanceof Error) {
            fail(deletion.message);
        }
        const err1 = await relay.sendEvent(deletion);
        if (err1 instanceof Error) fail(err1.message);
        const event_1 = await relay.getEvent(deletion.id);
        if (event_1 instanceof Error) fail(event_1.message);
        assertEquals(event_1, deletion);
    } finally {
        await relay.close();
    }
};

export const send_deletion_event = (url: string) => async () => {
    const relay = SingleRelayConnection.New(url, { log: true });
    const ctx = InMemoryAccountContext.Generate();
    const testkind = [NostrKind.TEXT_NOTE, NostrKind.DIRECT_MESSAGE];
    try {
        for (const kind of testkind) {
            const event = await prepareNormalNostrEvent(ctx, {
                content: "test send_deletion_event",
                kind,
            });
            const err1 = await relay.sendEvent(event);
            if (err1 instanceof Error) fail(err1.message);

            const event_1 = await relay.getEvent(event.id);
            if (event_1 instanceof Error) fail(event_1.message);
            assertEquals(event, event_1, "event not create");

            const deletion = await prepareDeletionNostrEvent(ctx, "test deletion", event);
            if (deletion instanceof Error) {
                fail(deletion.message);
            }
            const err2 = await relay.sendEvent(deletion);
            if (err2 instanceof Error) fail(err2.message);

            const event_2 = await relay.getEvent(event.id);
            if (event_2 instanceof Error) fail(event_2.message);
            assertEquals(event_2, undefined, "event not deleted");
        }
    } finally {
        await relay.close();
    }
};
