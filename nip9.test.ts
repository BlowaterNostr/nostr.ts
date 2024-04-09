import {
    prepareNormalDeletionEvent,
    prepareReplacementDeletionEvent,
    sendDeletionEvent,
} from "./nip9-test.ts";
import { relays } from "./relay-list.test.ts";

Deno.test("prepare deletion event for normal event", prepareNormalDeletionEvent());

Deno.test("prepare deletion event for replacement event", prepareReplacementDeletionEvent());

Deno.test("Deletion against a strfry relay", sendDeletionEvent(relays[1]));
