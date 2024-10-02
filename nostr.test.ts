import { assertEquals } from "@std/assert";
import { RFC3339 } from "./_helper.ts";
import { format } from "@std/datetime";
import { verify_event_v2 } from "./v2.ts";
import { prepareNostrEvent } from "./event.ts";
import { PrivateKey } from "./key.ts";
import { getTags, InMemoryAccountContext, type NostrEvent, NostrKind } from "./nostr.ts";

Deno.test("verify event v2", async () => {
    const ctx = InMemoryAccountContext.Generate();
    const event = await ctx.signEventV2({
        pubkey: ctx.publicKey.hex,
        kind: "SpaceMember",
        created_at: format(new Date(), RFC3339),
    });
    const ok = await verify_event_v2(event);
    assertEquals(ok, true);
});

Deno.test("getTags", async () => {
    const d = PrivateKey.Generate().hex;
    const e = PrivateKey.Generate().hex;
    const p = PrivateKey.Generate().hex;
    const event = await prepareNostrEvent(InMemoryAccountContext.Generate(), {
        kind: NostrKind.TEXT_NOTE,
        content: "",
        tags: [
            ["d", d],
            ["e", e],
            ["p", p],
            ["client", "Deno"],
            ["t", "food"],
        ],
    }) as NostrEvent;
    const tags = getTags(event);
    assertEquals(tags, {
        e: [e],
        p: [p],
        d: d,
        t: ["food"],
        client: "Deno",
    });
});
