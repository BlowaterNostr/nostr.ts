import { send_deletion_event, send_deletion_event_for_replaceable_events } from "./nip9-test.ts";
import { relays } from "./relay-list.test.ts";

Deno.test("Deletion against a strfry relay", send_deletion_event(relays[1]));

Deno.test(
    "Send deletion event for replaceable events",
    send_deletion_event_for_replaceable_events(relays[2]),
);
