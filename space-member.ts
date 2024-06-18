import { Kind_V2, Signer_V2, SpaceMember } from "./nostr.ts";
import { InvalidKey, PublicKey } from "./key.ts";
import { parseJSON, RFC3339 } from "./_helper.ts";
import { format } from "https://deno.land/std@0.224.0/datetime/format.ts";

export function prepareSpaceMember(author: Signer_V2, member: string): Error | Promise<SpaceMember> {
    const pubkey = PublicKey.FromString(member);
    if (pubkey instanceof InvalidKey) {
        return new Error(pubkey.message);
    }
    return author.signEventV2({
        pubkey: author.publicKey.hex,
        kind: Kind_V2.SpaceMember,
        member,
        created_at: format(new Date(), RFC3339),
    });
}

export async function getSpaceMembers(url: string) {
    try {
        const httpURL = new URL(url);
        httpURL.protocol = httpURL.protocol == "wss:" ? "https" : "http";
        httpURL.pathname = "/api/members";

        const res = await fetch(httpURL);
        if (!res.ok) {
            return new Error(`Failed to get space members, ${res.status}: ${await res.text()}`);
        }
        return parseJSON<SpaceMember[]>(await res.text());
    } catch (e) {
        return e as Error;
    }
}
