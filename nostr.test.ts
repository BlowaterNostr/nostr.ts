import { assertEquals } from "https://deno.land/std@0.202.0/assert/assert_equals.ts";
import { PrivateKey } from "./key.ts";
import { sign_event_v2 } from "./nostr.ts";
import { verify_event_v2 } from "./nostr.ts";

Deno.test("verify event v2", async () => {
    const pri = PrivateKey.Generate();
    const event = await sign_event_v2(pri, {
        pubkey: pri.toPublicKey().hex,
        kind: "v2",
        data: {
            text: "whatever",
        },
    });
    const ok = await verify_event_v2(event);
    assertEquals(ok, true);
});
