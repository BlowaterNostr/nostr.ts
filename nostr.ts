import { encodeHex } from "https://deno.land/std@0.224.0/encoding/hex.ts";
import { PrivateKey, PublicKey } from "./key.ts";
import { getSharedSecret, schnorr, utils } from "./vendor/secp256k1.js";
import { decrypt_with_shared_secret, encrypt, utf8Encode } from "./nip4.ts";
import nip44 from "./nip44.ts";
import stringify from "https://esm.sh/json-stable-stringify@1.1.1";

export enum Kind_V2 {
    ChannelCreation = "ChannelCreation",
    ChannelEdition = "ChannelEdition",
    SpaceMember = "SpaceMember",
}

type Event_Base = {
    pubkey: string;
    id: string;
    sig: string;
    created_at: string;
};

export type ChannelCreation = Event_Base & {
    kind: Kind_V2.ChannelCreation;
    name: string;
    scope: "server";
};

// EditChannel is a different type from CreateChannel because
// a channel only has one creator but could have multiple admin to modify it
export type ChannelEdition = Event_Base & {
    kind: Kind_V2.ChannelEdition;
    channel_id: string;
    name: string;
};

export type SpaceMember = Event_Base & {
    kind: Kind_V2.SpaceMember;
    member: string; // the pubkey of member
};

export type Event_V2 = ChannelCreation | ChannelEdition | SpaceMember;

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

export interface Signer_V2 {
    readonly publicKey: PublicKey;
    signEventV2<T extends { pubkey: string; kind: Kind_V2; created_at: string }>(
        event: T,
    ): Promise<T & { sig: string; id: string }>;
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
    const sha256 = utils.sha256;
    const buf = utf8Encode(commit);
    return hexEncode(await sha256(buf));
}

function eventCommitment(event: UnsignedNostrEvent): string {
    const { pubkey, created_at, kind, tags, content } = event;
    return JSON.stringify([0, pubkey, created_at, kind, tags, content]);
}

function hexEncode(buf: Uint8Array) {
    let str = "";
    for (let i = 0; i < buf.length; i++) {
        const c = buf[i];
        str += hexChar(c >> 4);
        str += hexChar(c & 0xF);
    }
    return str;
}

function hexChar(val: number) {
    if (val < 10) {
        return String.fromCharCode(48 + val);
    }
    if (val < 16) {
        return String.fromCharCode(97 + val - 10);
    }
}

export async function signId(id: string, privateKey: string) {
    return await schnorr.sign(id, privateKey);
}

export function blobToBase64(blob: Blob): Promise<string> {
    const reader = new FileReader();
    return new Promise((resolve, _) => {
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
    });
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
        const sha256 = utils.sha256;
        {
            const buf = utf8Encode(stringify(event));
            const id = hexEncode(await sha256(buf));
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

export async function verify_event_v2<T extends { sig: string; pubkey: string }>(
    event: T,
) {
    const sha256 = utils.sha256;
    try {
        const event_copy: any = { ...event };
        delete event_copy.sig;
        delete event_copy.id;
        const buf = utf8Encode(stringify(event_copy));
        const id = hexEncode(await sha256(buf));
        return schnorr.verify(event.sig, id, event.pubkey);
    } catch (err) {
        return false;
    }
}
