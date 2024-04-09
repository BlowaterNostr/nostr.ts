import {
    normal_event,
    replacement_event,
    replacement_event_without_dtag,
    send_deletion_event,
} from "./nip9-test.ts";
import { relays } from "./relay-list.test.ts";

Deno.test("prepare deletion event for normal event", normal_event());

Deno.test("prepare deletion event for replacement event", replacement_event());

Deno.test(
    "prepare deletion event for replacement event without d tag",
    replacement_event_without_dtag(),
);

Deno.test("Deletion against a strfry relay", send_deletion_event(relays[1]));
