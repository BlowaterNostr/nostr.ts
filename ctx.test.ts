import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { PrivateKey } from "./key.ts";
import { InMemoryAccountContext } from "./nostr.ts";

Deno.test("InMemoryAccountContext nip44", async () => {
    const ctx = InMemoryAccountContext.Generate();

    const pri = PrivateKey.Generate();
    const pub = pri.toPublicKey().hex;
    const encrypted_text = await ctx.encrypt(pub, "test", "nip44") as string;

    const plain_text = await ctx.decrypt(pub, encrypted_text) as string;
    assertEquals(plain_text, "test");
});
