import { Kind_V2, Signer_V2, SpaceMember } from "./nostr.ts";
import { PublicKey } from "./key.ts";
import { parseJSON, RESTRequestFailed, RFC3339 } from "./_helper.ts";
import { format } from "@std/datetime";
import { z } from "zod";

export function prepareSpaceMember(
    author: Signer_V2,
    member: PublicKey | string,
): Error | Promise<SpaceMember> {
    const pubkey = (member instanceof PublicKey) ? member : PublicKey.FromString(member);
    if (pubkey instanceof Error) return pubkey;
    return author.signEventV2({
        pubkey: author.publicKey.hex,
        kind: Kind_V2.SpaceMember,
        member: pubkey.hex,
        created_at: format(new Date(), RFC3339),
    });
}

export async function getSpaceMembers(url: URL | string) {
    const SpaceMembers = z.object({
        pubkey: z.string(),
        id: z.string(),
        sig: z.string(),
        created_at: z.string(),
        kind: z.literal(Kind_V2.SpaceMember),
        member: z.string(),
    }).array();

    try {
        const httpURL = new URL(url);
        httpURL.protocol = httpURL.protocol == "wss:" ? "https" : "http";
        httpURL.pathname = "/api/members";

        const res = await fetch(httpURL);
        if (!res.ok) {
            return new RESTRequestFailed(res.status, await res.text());
        }
        const data = parseJSON<SpaceMember[]>(await res.text());
        if (data instanceof Error) return data;
        return SpaceMembers.parse(data);
    } catch (e) {
        return e as Error;
    }
}
