import { assertEquals, fail } from "@std/assert";
import { uploadFile } from "./nip96.ts";
import { InMemoryAccountContext } from "./nostr.ts";

Deno.test("Upload File", async () => {
    const ctx = InMemoryAccountContext.Generate();
    const api_url = "https://nostr.build/api/v2/nip96/upload";
    const image_url =
        "https://image.nostr.build/655007ae74f24ea1c611889f48b25cb485b83ab67408daddd98f95782f47e1b5.jpg";

    try {
        const imageBuffer = await fetch(image_url).then((res) => res.arrayBuffer());
        const image = new File([imageBuffer], "test.jpg");
        const uploaded = await uploadFile(ctx, { api_url, file: image });
        if (uploaded instanceof Error) {
            fail(uploaded.message);
        }
        if (uploaded.status === "error") {
            fail(uploaded.message);
        }
        assertEquals(uploaded.nip94_event.tags[0][0], "url");
        assertEquals(uploaded.nip94_event.tags[0][1].substring(0, 26), "https://image.nostr.build/");
        assertEquals(uploaded.nip94_event.tags[3], ["m", "image/jpeg"]);
        assertEquals(uploaded.nip94_event.tags[4], ["dim", "460x460"]);
    } catch (error) {
        fail(error);
    }
});
