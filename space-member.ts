import { Kind_V2, Signer, SpaceMember } from "./nostr.ts";
import { InvalidKey, PublicKey } from "./key.ts";
import { nowRFC3339 } from "./_helper.ts";

export function prepareAddMember(author: Signer, member: string): Error | Promise<SpaceMember> {
    const pubkey = PublicKey.FromString(member);
    if (pubkey instanceof InvalidKey) {
        return new Error(pubkey.message);
    }
    return author.signEventV2({
        pubkey: author.publicKey.hex,
        kind: Kind_V2.SpaceMember,
        member,
        created_at: nowRFC3339(),
    });
}
