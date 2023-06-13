import { assertEquals } from "https://deno.land/std@0.176.0/testing/asserts.ts";
import { PrivateKey } from "./key.ts";
import { InMemoryAccountContext, prepareNormalNostrEvent, verifyEvent } from "./nostr.ts";

Deno.test("Verify Event", async () => {
    let pri = PrivateKey.Generate();
    let event = await prepareNormalNostrEvent(InMemoryAccountContext.New(pri), 1, [], "");
    let ok = await verifyEvent(event);
    assertEquals(ok, true);
});
