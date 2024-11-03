import { sleep } from "@blowater/csp";
import { nos } from "./relay-list.test.ts";
import { wirednet } from "./relay-list.test.ts";
import { damus, relays, satlantis } from "./relay-list.test.ts";
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

Deno.test("SingleRelayConnection open & close", open_close(relays));

Deno.test("SingleRelayConnection newSub & close", async () => {
    await newSub_close(damus)();
});

Deno.test("Single Relay Connection", async (t) => {
    const relay = {
        ws_url: wirednet,
    };
    await t.step("SingleRelayConnection subscription already exists", sub_exits(relay.ws_url));
    await sleep(100);
    await t.step(
        "SingleRelayConnection: close subscription and keep reading",
        close_sub_keep_reading(relay.ws_url),
    );
    await sleep(100);
    await t.step("send event", send_event(relay.ws_url));
    await sleep(100);
    await t.step("get_correct_kind", get_correct_kind(relay.ws_url));
    await sleep(100);
    await t.step("limit", limit(relay.ws_url));
    await sleep(100);
    await t.step("no_event", no_event(relay.ws_url));
    await sleep(100);
    await t.step("two_clients_communicate", two_clients_communicate(relay.ws_url));
});

Deno.test("multiple filters", newSub_multiple_filters(damus));

Deno.test("get_event_by_id", async () => {
    await get_event_by_id(wirednet)();
    await get_event_by_id(damus)();
});

Deno.test("get replaceable event", async () => {
    await get_replaceable_event(damus)();
    await get_replaceable_event(satlantis)();
});
