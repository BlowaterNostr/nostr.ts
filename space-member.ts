import { Kind_V2, Signer, SpaceMember } from "./nostr.ts";
import { PublicKey } from "./key.ts";
import { nowTime } from "./_helper.ts";

export function prepareAddMember(author: Signer, member: string): Error | Promise<SpaceMember> {
    if (PublicKey.FromString(member) instanceof Error) {
        return new Error("The member's public key is incorrect.");
    }
    return author.signEventV2({
        pubkey: author.publicKey.hex,
        kind: Kind_V2.SpaceMember,
        member,
        created_at: nowTime(),
    });
}
