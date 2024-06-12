import { Kind_V2, Signer } from "./nostr.ts";
import { PublicKey } from "./key.ts";

export function prepareInvitation(author: Signer, invitee: string) {
    if (PublicKey.FromString(invitee) instanceof Error) {
        return new Error("The invitee's public key is incorrect.");
    }
    return author.signEventV2({
        pubkey: author.publicKey.hex,
        kind: Kind_V2.InviteToSpace,
        invitee,
    });
}
