import { Kind_V2, Signer, SpaceMember } from "./nostr.ts";
import { InvalidKey, PublicKey } from "./key.ts";

export function prepareAddMember(author: Signer, member: string): Error | Promise<SpaceMember> {
    const pubkey = PublicKey.FromString(member);
    if (pubkey instanceof InvalidKey) {
        return new Error(pubkey.message);
    }
    return author.signEventV2({
        kind: Kind_V2.SpaceMember,
        member,
    });
}
