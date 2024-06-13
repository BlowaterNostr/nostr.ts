import { blowater, relays } from "./relay-list.test.ts";
import {
    close_sub_keep_reading,
    get_correct_kind,
    get_event_by_id,
    get_replaceable_event,
    limit,
    newSub_close,
    newSub_multiple_filters,
    no_event,
    open_close,
    send_event,
    sub_exits,
    two_clients_communicate,
} from "./relay-single-test.ts";
import { wirednet } from "./relay-list.test.ts";
import { run } from "https://raw.githubusercontent.com/BlowaterNostr/relayed/main/mod.ts";
import { PrivateKey } from "./key.ts";
import { fail } from "https://deno.land/std@0.202.0/assert/fail.ts";

Deno.test("SingleRelayConnection open & close", open_close(relays));

Deno.test("SingleRelayConnection newSub & close", async () => {
    const relay = await run({
        port: 8001,
        default_policy: {
            allowed_kinds: "all",
        },
        auth_required: false,
        admin: PrivateKey.Generate().toPublicKey(),
    });
    if (relay instanceof Error) return fail(relay.message);
    await newSub_close(relay.ws_url)();
    await relay.shutdown();
});

Deno.test("Single Relay Connection", async (t) => {
    const relay = await run({
        port: 8001,
        default_policy: {
            allowed_kinds: "all",
        },
        auth_required: false,
        admin: PrivateKey.Generate().toPublicKey(),
    });
    if (relay instanceof Error) return fail(relay.message);
    await t.step("SingleRelayConnection subscription already exists", sub_exits(relay.ws_url));
    await t.step(
        "SingleRelayConnection: close subscription and keep reading",
        close_sub_keep_reading(relay.ws_url),
    );
    await t.step("send event", send_event(relay.ws_url));
    await t.step("get_correct_kind", get_correct_kind(relay.ws_url));

    await t.step("multiple filters", newSub_multiple_filters(relay.ws_url));

    await t.step("limit", limit(relay.ws_url));

    await t.step("no_event", no_event(relay.ws_url));

    await t.step("two_clients_communicate", two_clients_communicate(relay.ws_url));

    await t.step("get_event_by_id", async () => {
        await get_event_by_id(relay.ws_url)();
        await get_event_by_id(blowater)();
    });
    await relay.shutdown();
});

Deno.test("get replaceable event", async () => {
    await get_replaceable_event(blowater)();
    await get_replaceable_event(wirednet)();
});
