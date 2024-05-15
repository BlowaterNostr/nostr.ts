import { prepareHttpAuthEvent } from "./event.ts";
import { NostrAccountContext } from "./nostr.ts";

export type UploadFileResponse = {
    status: "success" | "error";
    message: string;
    processing_url?: string;
    nip94_event?: {
        tags: string[];
        content: "";
    };
};

export async function uploadFile(
    author: NostrAccountContext,
    args: {
        url: string;
        file: Blob;
    },
) {
    const formData = new FormData();
    formData.append("file[]", args.file);

    const httpAuthEvent = await prepareHttpAuthEvent(author, {
        url: args.url,
        method: "POST",
        body: formData,
    });
    if (httpAuthEvent instanceof Error) {
        return httpAuthEvent;
    }
    console.log("httpAuthEvent", httpAuthEvent);

    const result = await fetch(args.url, {
        method: "POST",
        headers: {
            "Authorization": `Nostr ${btoa(JSON.stringify(httpAuthEvent))}`,
        },
        body: formData,
    });
    return result.json() as Promise<UploadFileResponse>;
}
