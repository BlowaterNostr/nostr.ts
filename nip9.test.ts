import {
    send_deletion_event,
    send_deletion_event_for_replaceable_events,
    store_deletion_event,
} from "./nip9-test.ts";
import { relays } from "./relay-list.test.ts";

Deno.test("relay store deletion event", store_deletion_event(relays[1]));

Deno.test.ignore("Deletion against a strfry relay", send_deletion_event(relays[1]));

Deno.test.ignore(
    "Send deletion event for replaceable events",
    send_deletion_event_for_replaceable_events(relays[1]),
);
