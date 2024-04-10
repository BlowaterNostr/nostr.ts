import { send_deletion_event, store_deletion_event } from "./nip9-test.ts";
import { relays } from "./relay-list.test.ts";

Deno.test("relay store deletion event", store_deletion_event(relays[1]));

Deno.test("Deletion against a strfry relay", send_deletion_event(relays[1]));
