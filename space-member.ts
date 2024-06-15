import { Kind_V2, Signer_V2, SpaceMember } from "./nostr.ts";
import { InvalidKey, PublicKey } from "./key.ts";
import { RFC3339 } from "./_helper.ts";
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
