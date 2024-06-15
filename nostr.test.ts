import { assertEquals } from "https://deno.land/std@0.224.0/assert/assert_equals.ts";
import { InMemoryAccountContext, Kind_V2, verify_event_v2 } from "./nostr.ts";
import { RFC3339 } from "./_helper.ts";
import { format } from "https://deno.land/std@0.224.0/datetime/format.ts";

Deno.test("verify event v2", async () => {
    const ctx = InMemoryAccountContext.Generate();
    const event = await ctx.signEventV2({
        pubkey: ctx.publicKey.hex,
        kind: Kind_V2.SpaceMember,
        created_at: format(new Date(), RFC3339),
    });
    const ok = await verify_event_v2(event);
    assertEquals(ok, true);
});
