import { assertEquals } from "https://deno.land/std@0.202.0/assert/assert_equals.ts";
import { uploadFile } from "./nip96.ts";
import { InMemoryAccountContext } from "./nostr.ts";

Deno.test("Upload File", async () => {
    const ctx = InMemoryAccountContext.Generate();
    const url = "https://nostr.build/api/v2/nip96/upload";
    const file = new Blob([await Deno.readFile("./test.jpeg")], { type: "image/jpeg" });
    const result = await uploadFile(ctx, { url, file });
    console.log(result);
    assertEquals(result instanceof Error, false);
});
