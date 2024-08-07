import { assertEquals } from "@std/assert";
import { InMemoryAccountContext } from "./nostr.ts";
import { RFC3339 } from "./_helper.ts";
import { format } from "@std/datetime";
import { Kind_V2, verify_event_v2 } from "./v2.ts";

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
