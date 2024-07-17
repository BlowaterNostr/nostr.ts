import { PrivateKey, PublicKey } from "./key.ts";
import { decrypt_with_shared_secret, encrypt, utf8Encode } from "./nip4.ts";
import * as nip44 from "./nip44.ts";

import { encodeHex } from "@std/encoding";
import { getSharedSecret } from "@noble/secp256k1";
import { schnorr } from "@noble/curves/secp256k1";
import { sha256 } from "@noble/hashes/sha256";

import stringify from "npm:json-stable-stringify@1.1.1";
import { Kind_V2, Signer_V2 } from "./v2.ts";

export enum NostrKind {
    META_DATA = 0,
    TEXT_NOTE = 1,
    RECOMMED_SERVER = 2,
    CONTACTS = 3,
    DIRECT_MESSAGE = 4,
    DIRECT_MESSAGE_V2 = 44,
    DELETE = 5,
    REACTION = 7,
    Encrypted_Custom_App_Data = 20231125,
    Custom_App_Data = 30078, // https://github.com/nostr-protocol/nips/blob/master/78.md
    Long_Form = 30023, // https://github.com/nostr-protocol/nips/blob/master/23.md
    HTTP_AUTH = 27235, // https://github.com/nostr-protocol/nips/blob/master/98.md
}

export interface NostrFilter {
    ids?: Array<string>;
    authors?: Array<string>;
    kinds?: Array<NostrKind>;
    "#e"?: Array<string>;
    "#p"?: Array<string>;
    "#d"?: Array<string>; // https://github.com/nostr-protocol/nips/blob/master/33.md
    "#a"?: string[]; // https://github.com/nostr-protocol/nips/blob/master/01.md#tags
    since?: number;
    until?: number;
    limit?: number;
}

export interface ProfileInfo {
    name?: string;
    picture?: string;
    about?: string;
    relays?: Array<{ url: string; read: boolean; write: boolean }>;
    following?: Array<{ publicKey: string; name: string }>;
    follower?: Array<{ publicKey: string; name: string }>;
}

////////////////////
// Relay Response //
////////////////////
export type SubID = string;
export type EventID = string;

export type _RelayResponse =
    | _RelayResponse_REQ_Message
    | _RelayResponse_OK
    | _RelayResponse_Notice;

export type _RelayResponse_REQ_Message =
    | _RelayResponse_Event
    | _RelayResponse_EOSE;

export type _RelayResponse_Event = ["EVENT", SubID, NostrEvent];
export type _RelayResponse_EOSE = ["EOSE", SubID]; // https://github.com/nostr-protocol/nips/blob/master/15.md
export type _RelayResponse_Notice = ["NOTICE", string];
export type _RelayResponse_OK = ["OK", EventID, boolean, string];

export type RelayResponse = RelayResponse_REQ_Message | RelayResponse_OK;
export type RelayResponse_REQ_Message = RelayResponse_Event | RelayResponse_EOSE | RelayResponse_Notice;

export type RelayResponse_Event = {
    type: "EVENT";
    subID: SubID;
    event: NostrEvent;
};

export type RelayResponse_EOSE = {
    type: "EOSE";
    subID: SubID;
};

export type RelayResponse_OK = {
    type: "OK";
    eventID: EventID;
    ok: boolean;
    note: string;
};

export type RelayResponse_Notice = {
    type: "NOTICE";
    note: string;
};

// Nostr Web Socket Message
// https://github.com/nostr-protocol/nips/blob/master/01.md#from-client-to-relay-sending-events-and-creating-subscriptions
export type ClientRequest_Message =
    | ClientRequest_Event
    | ClientRequest_REQ
    | ClientRequest_Close;
export type ClientRequest_Event = ["EVENT", NostrEvent];
// potentially more filters, but I don't know how to represent in TS type
export type ClientRequest_REQ = ["REQ", SubID, ...NostrFilter[]];
export type ClientRequest_Close = ["CLOSE", SubID];

export interface RequestFilter {
    "ids"?: string[];
    "authors"?: string[];
    "kinds"?: NostrKind[];
    "#e"?: string[];
    "#p"?: string[];
    "since"?: number;
    "until"?: number;
    "limit"?: number;
}

// https://github.com/nostr-protocol/nips/blob/master/04.md
export interface NostrEvent<Kind extends NostrKind = NostrKind, TagType extends Tag = Tag>
    extends UnsignedNostrEvent<Kind, TagType> {
    readonly id: EventID;
    readonly sig: string;
}

export interface UnsignedNostrEvent<Kind extends NostrKind = NostrKind, TagType extends Tag = Tag> {
    readonly pubkey: string;
    readonly kind: Kind;
    readonly created_at: number;
    readonly tags: TagType[];
    readonly content: string;
}

export type Tag = TagPubKey | TagEvent | TagIdentifier | [string, ...string[]];
export type TagPubKey = ["p", string];
export type TagEvent = ["e", string];
export type TagIdentifier = ["d", string];

export type Tags = {
    p: string[];
    e: string[];
    client?: string;
};

export function getTags(event: NostrEvent): Tags {
    const tags: Tags = {
        p: [],
        e: [],
    };
    for (const tag of event.tags) {
        switch (tag[0]) {
            case "p":
                tags.p.push(tag[1]);
                break;
            case "e":
                tags.e.push(tag[1]);
                break;
        }
    }
    return tags;
}

// https://github.com/nostr-protocol/nips/blob/master/07.md
export interface NostrAccountContext extends Signer {
    encrypt(pubkey: string, plaintext: string, algorithm: "nip44" | "nip4"): Promise<string | Error>;
    decrypt(pubkey: string, ciphertext: string, algorithm?: "nip44" | "nip4"): Promise<string | Error>;
}

export interface Signer {
    readonly publicKey: PublicKey;
    signEvent<Kind extends NostrKind = NostrKind>(event: UnsignedNostrEvent<Kind>): Promise<NostrEvent<Kind>>;
}

export class DecryptionFailure extends Error {
    constructor(
        public event: NostrEvent,
    ) {
        super(`Failed to decrypt event ${event.id}`);
    }
}

export async function calculateId(event: UnsignedNostrEvent) {
    const commit = eventCommitment(event);
    const buf = utf8Encode(commit);
    return encodeHex(sha256(buf));
}

function eventCommitment(event: UnsignedNostrEvent): string {
    const { pubkey, created_at, kind, tags, content } = event;
    return JSON.stringify([0, pubkey, created_at, kind, tags, content]);
}

export async function signId(id: string, privateKey: string) {
    return schnorr.sign(id, privateKey);
}

export class InMemoryAccountContext implements NostrAccountContext, Signer_V2 {
    static New(privateKey: PrivateKey) {
        return new InMemoryAccountContext(privateKey);
    }

    static FromString(prikey: string) {
        const key = PrivateKey.FromString(prikey);
        if (key instanceof Error) {
            return key;
        }
        return new InMemoryAccountContext(key);
    }

    static Generate() {
        return new InMemoryAccountContext(PrivateKey.Generate());
    }

    readonly publicKey: PublicKey;

    private readonly sharedSecretsMap = new Map<string, Uint8Array>();

    private constructor(
        readonly privateKey: PrivateKey,
    ) {
        this.publicKey = privateKey.toPublicKey();
    }

    async signEvent<Kind extends NostrKind = NostrKind>(
        event: UnsignedNostrEvent<Kind>,
    ): Promise<NostrEvent<Kind>> {
        const id = await calculateId(event);
        const sig = encodeHex(await signId(id, this.privateKey.hex));
        return { ...event, id, sig };
    }

    async signEventV2<T extends { pubkey: string; kind: Kind_V2; created_at: string }>(
        event: T,
    ): Promise<T & { sig: string; id: string }> {
        {
            const buf = utf8Encode(stringify(event));
            const id = encodeHex(sha256(buf));
            const sig = encodeHex(await signId(id, this.privateKey.hex));
            return { ...event, id, sig };
        }
    }

    async encrypt(pubkey: string, plaintext: string, algorithm: "nip44" | "nip4"): Promise<string | Error> {
        if (algorithm == "nip44") {
            const key = nip44.getConversationKey(this.privateKey.hex, pubkey);
            if (key instanceof Error) return key;
            return nip44.encrypt(plaintext, key);
        } else {
            return encrypt(pubkey, plaintext, this.privateKey.hex);
        }
    }

    async decrypt(
        decryptionPublicKey: string,
        ciphertext: string,
        algorithm?: "nip44" | "nip4",
    ): Promise<string | Error> {
        if (algorithm != "nip4" && (algorithm == "nip44" || !ciphertext.includes("?iv"))) {
            const key = nip44.getConversationKey(this.privateKey.hex, decryptionPublicKey);
            if (key instanceof Error) return key;
            return nip44.decrypt(ciphertext, key);
        } else {
            let key = this.sharedSecretsMap.get(decryptionPublicKey);
            if (key == undefined) {
                try {
                    key = getSharedSecret(this.privateKey.hex, "02" + decryptionPublicKey) as Uint8Array;
                } catch (e) {
                    return e as Error;
                }
                this.sharedSecretsMap.set(decryptionPublicKey, key);
            }
            return decrypt_with_shared_secret(ciphertext, key);
        }
    }
}

export async function verifyEvent(event: NostrEvent) {
    try {
        return schnorr.verify(event.sig, await calculateId(event), event.pubkey);
    } catch (err) {
        return false;
    }
}

export * from "./nip4.ts";
export * as nip44 from "./nip44.ts";
export * from "./nip06.ts";
export * from "./nip11.ts";
export * from "./nip19.ts";
export * from "./nip25.ts";
export * from "./nip96.ts";
export * from "./relay-single.ts";
export * from "./relay-pool.ts";
export * from "./websocket.ts";
export * from "./event.ts";
export * from "./key.ts";
export * from "./relay.interface.ts";
export * from "./_helper.ts";
export * as v2 from "./v2.ts";
