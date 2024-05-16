import { delete_regular_events, store_deletion_event } from "./nip9-test.ts";
import { relayed } from "./relay-list.test.ts";
import { blowater } from "./relay-list.test.ts";
import { damus } from "./relay-list.test.ts";
import { wirednet } from "./relay-list.test.ts";

Deno.test("relay store deletion event", async () => {
    await store_deletion_event(damus)();
    await store_deletion_event(wirednet)();
    await store_deletion_event(relayed)();
});

Deno.test("delete regular events", async () => {
    await delete_regular_events(damus)();
    await delete_regular_events(wirednet)();
    await delete_regular_events(relayed)();
});
