import { assertEquals, fail } from "@std/assert";
import { prepareDeletionEvent, prepareNostrEvent } from "./event.ts";
import { InMemoryAccountContext, NostrKind } from "./nostr.ts";
import { SingleRelayConnection } from "./relay-single.ts";

export const store_deletion_event = (url: string) => async () => {
    const relay = SingleRelayConnection.New(url, { log: true }) as SingleRelayConnection;
    const ctx = InMemoryAccountContext.Generate();
    try {
        const event = await prepareNostrEvent(ctx, {
            content: "test send_deletion_event",
            kind: NostrKind.TEXT_NOTE,
        });
        const deletion = await prepareDeletionEvent(ctx, "test deletion", event);
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

export const delete_regular_events = (url: string) => async () => {
    const relay = SingleRelayConnection.New(url, { log: true }) as SingleRelayConnection;
    const ctx = InMemoryAccountContext.Generate();
    const testkind = [NostrKind.TEXT_NOTE, NostrKind.DIRECT_MESSAGE];
    try {
        for (const kind of testkind) {
            const event = await prepareNostrEvent(ctx, {
                content: "test send_deletion_event",
                kind,
            });
            const err1 = await relay.sendEvent(event);
            if (err1 instanceof Error) fail(err1.message);

            const event_1 = await relay.getEvent(event.id);
            if (event_1 instanceof Error) fail(event_1.message);
            assertEquals(event, event_1, "event not create");

            const deletion = await prepareDeletionEvent(ctx, "test deletion", event);
            if (deletion instanceof Error) {
                fail(deletion.message);
            }
            const err2 = await relay.sendEvent(deletion);
            if (err2 instanceof Error) {
                console.log(err2);
                fail(err2.message);
            }

            const nothing = await relay.getEvent(event.id);
            if (nothing instanceof Error) fail(nothing.message);
            assertEquals(nothing, undefined, "event not deleted");
        }
    } finally {
        await relay.close();
    }
};
