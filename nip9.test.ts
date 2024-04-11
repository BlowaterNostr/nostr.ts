import { delete_replaceable_events } from "./nip9-test.ts";
import { delete_regular_events, store_deletion_event } from "./nip9-test.ts";
import { nos, relayed, wirednet } from "./relay-list.test.ts";

Deno.test("relay store deletion event", async () => {
    await store_deletion_event(nos)();
    await store_deletion_event(wirednet)();
    await store_deletion_event(relayed)();
});

Deno.test("delete regular events", async () => {
    await delete_regular_events(nos)();
    await delete_regular_events(wirednet)();
    await delete_regular_events(relayed)();
});

Deno.test("delete replaceable events", async () => {
    await delete_replaceable_events(nos)();
    await delete_replaceable_events(wirednet)();
});
