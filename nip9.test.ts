import { run } from "https://raw.githubusercontent.com/BlowaterNostr/relayed/main/mod.ts";
import { delete_regular_events, store_deletion_event } from "./nip9-test.ts";
import { damus } from "./relay-list.test.ts";
import { wirednet } from "./relay-list.test.ts";
import { PrivateKey } from "./key.ts";
import { fail } from "https://deno.land/std@0.202.0/assert/mod.ts";

Deno.test("relay store deletion event", async () => {
    await store_deletion_event(damus)();
    await store_deletion_event(wirednet)();
    {
        const relay = await run({
            port: 8001,
            default_policy: {
                allowed_kinds: "all",
            },
            auth_required: false,
            admin: PrivateKey.Generate().toPublicKey(),
        });
        if (relay instanceof Error) fail(relay.message);

        await store_deletion_event(relay.ws_url)();
        await relay.shutdown();
    }
});

Deno.test("delete regular events", async () => {
    await delete_regular_events(damus)();
    await delete_regular_events(wirednet)();
    const relay = await run({
        port: 8001,
        default_policy: {
            allowed_kinds: "all",
        },
        auth_required: false,
        admin: PrivateKey.Generate().toPublicKey(),
    });
    if (relay instanceof Error) fail(relay.message);
    await delete_regular_events(relay.ws_url)();
    await relay.shutdown();
});
