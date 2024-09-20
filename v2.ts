import { schnorr } from "@noble/curves/secp256k1";
import { sha256 } from "@noble/hashes/sha256";
import { utf8Encode } from "./nip4.ts";
import { encodeHex } from "@std/encoding";
import stringify from "npm:json-stable-stringify@1.1.1";
import { PublicKey } from "./key.ts";

export type Kind_V2 = "ChannelCreation" | "ChannelEdition" | "SpaceMember";

type Event_Base = {
    pubkey: string;
    id: string;
    sig: string;
    created_at: string;
};

export type ChannelCreation = Event_Base & {
    kind: "ChannelCreation";
    name: string;
    scope: "server";
};

// EditChannel is a different type from CreateChannel because
// a channel only has one creator but could have multiple admin to modify it
export type ChannelEdition = Event_Base & {
    kind: "ChannelEdition";
    channel_id: string;
    name: string;
};

export type SpaceMember = Event_Base & {
    kind: "SpaceMember";
    member: string; // the pubkey of member
};

export type Event_V2 = ChannelCreation | ChannelEdition | SpaceMember;

export async function verify_event_v2<T extends { sig: string; pubkey: string; id: string }>(
    event: T,
) {
    try {
        const event_copy: { sig?: string; pubkey: string; id?: string } = { ...event };
        delete event_copy.sig;
        delete event_copy.id;
        const buf = utf8Encode(stringify(event_copy));
        const id = encodeHex(sha256(buf));
        return schnorr.verify(event.sig, id, event.pubkey);
    } catch {
        return false;
    }
}

export interface Signer_V2 {
    readonly publicKey: PublicKey;
    signEventV2<T extends { pubkey: string; kind: Kind_V2; created_at: string }>(
        event: T,
    ): Promise<T & { sig: string; id: string }>;
}

export * from "./space-member.ts";
