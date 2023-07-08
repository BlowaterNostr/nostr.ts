import * as hex from "https://deno.land/std@0.176.0/encoding/hex.ts";
import { PrivateKey, PublicKey, publicKeyHexFromNpub } from "./key.ts";
import { schnorr, utils } from "./vendor/esm.sh/v106/@noble/secp256k1@1.7.1/es2022/secp256k1.js";
import { decrypt, encrypt, utf8Decode, utf8Encode } from "./ende.ts";

export enum NostrKind {
    META_DATA = 0,
    TEXT_NOTE = 1,
    RECOMMED_SERVER = 2,
    CONTACTS = 3,
    DIRECT_MESSAGE = 4,
    DELETE = 5,
    CustomAppData = 1078, // https://github.com/nostr-protocol/nips/blob/master/78.mds
}

export interface NostrFilters {
    ids?: Array<string>;
    authors?: Array<string>;
    kinds?: Array<NostrKind>;
    "#e"?: Array<string>;
    "#p"?: Array<string>;
    "#d"?: Array<string>; // https://github.com/nostr-protocol/nips/blob/master/33.md
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

export type RelayResponse = RelayResponse_REQ_Message | RelayResponse_OK | RelayResponse_Notice;
export type RelayResponse_REQ_Message = RelayResponse_Event | RelayResponse_EOSE;

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
export type ClientRequest_REQ = ["REQ", SubID, NostrFilters];
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
export interface NostrEvent<TagType = Tag> extends UnsignedNostrEvent<TagType> {
    readonly id: EventID;
    readonly sig: string;
}

export interface UnsignedNostrEvent<TagType = Tag> {
    readonly pubkey: string;
    readonly kind: NostrKind;
    readonly created_at: number;
    readonly tags: TagType[];
    readonly content: string;
}

export type Tag = TagPubKey | TagEvent | [string, ...string[]];
export type TagPubKey = ["p", string];
export type TagEvent = ["e", string];

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
export interface NostrAccountContext {
    readonly publicKey: PublicKey;
    signEvent(event: UnsignedNostrEvent): Promise<NostrEvent>;
    encrypt(pubkey: string, plaintext: string): Promise<string | Error>;
    decrypt(pubkey: string, ciphertext: string): Promise<string | Error>;
}

export async function prepareEncryptedNostrEvent(
    sender: NostrAccountContext,
    pubkeyHexOrBech32: string, /* used to encrypt*/
    kind: NostrKind,
    tags: Tag[],
    content: string,
): Promise<NostrEvent | Error> {
    const pubkeyHex = publicKeyHexFromNpub(pubkeyHexOrBech32);

    const encrypted = await sender.encrypt(pubkeyHex, content);
    if (encrypted instanceof Error) {
        return encrypted;
    }
    return prepareNormalNostrEvent(
        sender,
        kind,
        tags,
        encrypted,
    );
}

export async function prepareNormalNostrEvent(
    sender: NostrAccountContext,
    kind: NostrKind,
    tags: Tag[],
    content: string,
): Promise<NostrEvent> {
    // prepare nostr event
    const event: UnsignedNostrEvent = {
        created_at: Math.floor(Date.now() / 1000),
        kind: kind,
        pubkey: sender.publicKey.hex,
        tags: tags,
        content,
    };
    return sender.signEvent(event);
}

export async function prepareCustomAppDataEvent(sender: NostrAccountContext, data: Object) {
    const hex = sender.publicKey.hex;
    const encrypted = await sender.encrypt(hex, JSON.stringify(data));
    if (encrypted instanceof Error) {
        return encrypted;
    }
    const event: UnsignedNostrEvent = {
        created_at: Math.floor(Date.now() / 1000),
        content: encrypted,
        kind: NostrKind.CustomAppData,
        pubkey: hex,
        tags: [],
    };
    return sender.signEvent(event);
}

export function groupBy<group, T>(
    sequence: Iterable<T>,
    grouper: (element: T) => group,
): Map<group, T[]> {
    const map = new Map<group, T[]>();
    for (const event of sequence) {
        const groupID = grouper(event);
        const group = map.get(groupID);
        if (group) {
            group.push(event);
        } else {
            map.set(groupID, [event]);
        }
    }
    return map;
}

export class DecryptionFailure extends Error {
    constructor(
        public event: NostrEvent,
    ) {
        super(`Failed to decrypt event ${event.id}`);
    }
}

export async function decryptNostrEvent(
    nostrEvent: NostrEvent,
    accountContext: NostrAccountContext,
    publicKeyHex: string,
): Promise<NostrEvent | DecryptionFailure> {
    const content = nostrEvent.content;
    if (content.length === 0) {
        return nostrEvent;
    }
    const created_at = nostrEvent.created_at;
    try {
        const msg = await accountContext.decrypt(publicKeyHex, content);
        if (msg instanceof Error) {
            console.error(msg.message);
            return new DecryptionFailure(nostrEvent);
        }
        return {
            content: msg,
            created_at,
            kind: nostrEvent.kind,
            tags: nostrEvent.tags,
            pubkey: nostrEvent.pubkey,
            id: nostrEvent.id,
            sig: nostrEvent.sig,
        };
    } catch (e) {
        if (e instanceof DOMException) {
            return new DecryptionFailure(nostrEvent);
        } else {
            throw e;
        }
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

export class InMemoryAccountContext implements NostrAccountContext {
    static New(privateKey: PrivateKey) {
        return new InMemoryAccountContext(privateKey);
    }

    readonly publicKey: PublicKey;

    private constructor(
        readonly privateKey: PrivateKey,
    ) {
        this.publicKey = privateKey.toPublicKey();
    }

    async signEvent(event: UnsignedNostrEvent): Promise<NostrEvent> {
        const id = await calculateId(event);
        const sig = utf8Decode(hex.encode(await signId(id, this.privateKey.hex)));
        return { ...event, id, sig };
    }

    encrypt = (pubkey: string, plaintext: string): Promise<string> => {
        return encrypt(pubkey, plaintext, this.privateKey.hex);
    };
    decrypt = (pubkey: string, ciphertext: string): Promise<string | Error> => {
        return decrypt(this.privateKey.hex, pubkey, ciphertext);
    };
}

export async function verifyEvent(event: NostrEvent) {
    try {
        return schnorr.verify(event.sig, await calculateId(event), event.pubkey);
    } catch (err) {
        return false;
    }
}

////////////
// NIP 78 //
////////////
export interface Signed_CustomAppData_Decrypted_Raw_Event extends NostrEvent {
    readonly pubkey: string;
    readonly kind: NostrKind.CustomAppData;
    readonly created_at: number;
    readonly tags: Tag[];
    readonly content: string;
}
