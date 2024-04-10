import { assertEquals } from "https://deno.land/std@0.202.0/assert/assert_equals.ts";
import { prepareDeletionNostrEvent, prepareNormalNostrEvent } from "./nodejs/index.ts";
import { InMemoryAccountContext, NostrKind } from "./nostr.ts";
import { fail } from "https://deno.land/std@0.202.0/assert/fail.ts";
import { SingleRelayConnection } from "./relay-single.ts";

export const send_deletion_event = (url: string) => async () => {
    const relay = SingleRelayConnection.New(url, { log: true });
    const ctx = InMemoryAccountContext.Generate();
    {
        const event = await prepareNormalNostrEvent(ctx, {
            content: "test send_deletion_event",
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

export const send_deletion_event_for_replaceable_events = (url: string) => async () => {
    const relay = SingleRelayConnection.New(url, { log: true });
    const ctx = InMemoryAccountContext.Generate();
    try {
        const event = await prepareNormalNostrEvent(ctx, {
            content: JSON.stringify({ name: `test${Math.random()}` }),
            kind: NostrKind.META_DATA,
            created_at: Math.floor(Date.now() / 1000),
        });
        const err1 = await relay.sendEvent(event);
        if (err1 instanceof Error) fail(`Send Meta data error: ${err1.message}`);

        const event_1 = await relay.getEvent(event.id, `replaceable_events${Math.random()}`);
        if (event_1 instanceof Error) fail(`Get event ${event.id} error: ${event_1.message}`);
        assertEquals(event_1, event, "event should be created");

        const deletion = await prepareDeletionNostrEvent(ctx, "test deletion", event);
        if (deletion instanceof Error) {
            fail(`Prepare deletion event error: ${deletion.message}`);
        }
        console.log(`deletion: ${JSON.stringify(deletion)}`);

        const err2 = relay.sendEvent(deletion);
        if (err2 instanceof Error) fail(`Send deletion event error: ${err2.message}`);

        const event_2 = await relay.getEvent(event.id, `replaceable_events${Math.random()}`);
        if (event_2 instanceof Error) fail(`Get event ${event.id} again error: ${event_2.message}`);
        assertEquals(event_2, undefined, "event should be deleted");
    } finally {
        await relay.close();
    }
};
