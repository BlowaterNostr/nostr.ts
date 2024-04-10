import { send_deletion_event, store_deletion_event } from "./nip9-test.ts";
import { nos, wirednet } from "./relay-list.test.ts";

Deno.test("relay store deletion event", async () => {
    await store_deletion_event(nos)();
    await store_deletion_event(wirednet)();
});

Deno.test("Deletion against a strfry relay", async () => {
    await send_deletion_event(nos)();
    await send_deletion_event(wirednet)();
});
