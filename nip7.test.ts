import { assertEquals, fail } from "https://deno.land/std@0.176.0/testing/asserts.ts";
import { PrivateKey } from "./key.ts";
import { InMemoryAccountContext } from "./nostr.ts";

Deno.test("nip07", async () => {
    const pri = PrivateKey.Generate();
    const ctx = InMemoryAccountContext.New(pri);

    const f = await ctx.decrypt(ctx.publicKey.hex, "{}");
    if (f instanceof Error) {
        assertEquals(f.message, "Invalid padding: string should have whole number of bytes");
    } else {
        fail(`${f} should be an error`);
    }
});
