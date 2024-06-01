import { Relay, run } from "https://raw.githubusercontent.com/BlowaterNostr/relayed/main/main.tsx";
import { delete_regular_events, store_deletion_event } from "./nip9-test.ts";
import { damus } from "./relay-list.test.ts";
import { wirednet } from "./relay-list.test.ts";

Deno.test("relay store deletion event", async () => {
    await using relay = await run({
        port: 8001,
        default_policy: {
            allowed_kinds: "all",
        },
        default_information: {
            auth_required: false,
        },
    }) as Relay;

    await store_deletion_event(damus)();
    await store_deletion_event(wirednet)();
    await store_deletion_event(relay.ws_url)();
});

Deno.test("delete regular events", async () => {
    await delete_regular_events(damus)();
    await delete_regular_events(wirednet)();
    await using relay = await run({
        port: 8001,
        default_policy: {
            allowed_kinds: "all",
        },
        default_information: {
            auth_required: false,
        },
    }) as Relay;
    await delete_regular_events(relay.ws_url)();
});
