import { PublicKey } from "./key.ts";
import { parseJSON, RESTRequestFailed, RFC3339 } from "./_helper.ts";
import { format } from "@std/datetime";
import { z } from "zod";
import type { Signer_V2, SpaceMember } from "./v2.ts";

export function prepareSpaceMember(
    author: Signer_V2,
    member: PublicKey | string,
): Error | Promise<SpaceMember> {
    const pubkey = (member instanceof PublicKey) ? member : PublicKey.FromString(member);
    if (pubkey instanceof Error) return pubkey;
    return author.signEventV2({
        pubkey: author.publicKey.hex,
        kind: "SpaceMember",
        member: pubkey.hex,
        created_at: format(new Date(), RFC3339),
    });
}

const SpaceMembers_Schema = z.object({
    pubkey: z.string(),
    id: z.string(),
    sig: z.string(),
    created_at: z.string(),
    kind: z.literal("SpaceMember"),
    member: z.string(),
}).array();

export async function getSpaceMembers(url: URL) {
    // construct a new URL so that we don't change the old instance
    const httpURL = new URL(url);
    httpURL.protocol = httpURL.protocol == "wss:" ? "https" : "http";
    httpURL.pathname = "/api/members";

    let res;
    try {
        res = await fetch(httpURL);
    } catch (e) {
        // https://developer.mozilla.org/en-US/docs/Web/API/fetch#exceptions
        if (e instanceof TypeError) {
            return e;
        }
        throw e; // impossible
    }

    let body;
    try {
        body = await res.text();
    } catch (e) {
        if (e instanceof TypeError) {
            return e;
        }
        throw e; // impossible
    }

    if (!res.ok) {
        return new RESTRequestFailed(res, body);
    }
    const data = parseJSON(body);
    if (data instanceof SyntaxError) {
        return data;
    }
    return SpaceMembers_Schema.parse(data) as SpaceMember[];
}
