import { Kind_V2, NostrEvent, Signer_V2, SpaceMember } from "./nostr.ts";
import { InvalidKey, PublicKey } from "./key.ts";
import { parseJSON, RFC3339 } from "./_helper.ts";
import { format } from "https://deno.land/std@0.224.0/datetime/format.ts";

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
    try {
        const httpURL = (url instanceof URL) ? url : new URL(url);
        httpURL.protocol = httpURL.protocol == "wss:" ? "https" : "http";
        httpURL.pathname = "/api/members";

        const res = await fetch(httpURL);
        if (!res.ok) {
            return new RESTRequestFailed(res.status, await res.text());
        }
        return parseJSON<SpaceMember[]>(await res.text());
    } catch (e) {
        return e as Error;
    }
}

export class RESTRequestFailed extends Error {
    constructor(public readonly status: number, public readonly message: string) {
        super(`Failed to request rest api, ${status}: ${message}`);
        this.name = RESTRequestFailed.name;
    }
}
