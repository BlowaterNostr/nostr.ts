import { prepareNostrEvent } from "./event.ts";
import { type NostrAccountContext, type NostrEvent, NostrKind, type Tag } from "./nostr.ts";

export type UploadFileResponse = {
    status: "success";
    message: string;
    nip94_event: {
        tags: string[][];
        content: "";
    };
    processing_url?: string;
} | {
    status: "error";
    message: string;
};

export async function uploadFile(
    author: NostrAccountContext,
    args: {
        api_url: string;
        file: Blob;
    },
): Promise<UploadFileResponse | Error> {
    const formData = new FormData();
    formData.append("file[]", args.file);

    const httpAuthEvent = await prepareHttpAuthEvent(author, {
        url: args.api_url,
        method: "POST",
        body: formData,
    });
    if (httpAuthEvent instanceof Error) {
        return httpAuthEvent;
    }
    try {
        const response = await fetch(args.api_url, {
            method: "POST",
            headers: {
                "Authorization": `Nostr ${btoa(JSON.stringify(httpAuthEvent))}`,
            },
            body: formData,
        });
        if (response.status !== 200) {
            return new Error(`Failed to upload file: ${response.statusText}`);
        }
        const json = await response.json();
        return json;
    } catch (error) {
        if (error instanceof Error) {
            return error;
        } else {
            throw error; // impossible
        }
    }
}

async function prepareHttpAuthEvent(
    author: NostrAccountContext,
    args: {
        url: string;
        method: string;
        body?: FormData;
    },
): Promise<NostrEvent<NostrKind.HTTP_AUTH> | Error> {
    const { url, method, body } = args;
    const tags: Tag[] = [
        ["u", url],
        ["method", method],
    ];
    if (body) {
        const encoder = new TextEncoder();
        const data = encoder.encode(JSON.stringify(body));
        const hashBuffer = await crypto.subtle.digest("SHA-256", data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashString = hashArray.map((byte) => byte.toString(16).padStart(2, "0")).join("");
        tags.push(["payload", hashString]);
    }
    return prepareNostrEvent(
        author,
        {
            kind: NostrKind.HTTP_AUTH,
            content: "",
            tags,
        },
    );
}
