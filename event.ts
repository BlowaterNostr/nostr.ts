import { publicKeyHexFromNpub } from "./key.ts";
import {
    NostrAccountContext,
    NostrEvent,
    NostrKind,
    Tag,
    TagIdentifier,
    UnsignedNostrEvent,
} from "./nostr.ts";

export async function prepareEncryptedNostrEvent(
    sender: NostrAccountContext,
    pubkeyHexOrBech32: string, /* used to encrypt*/
    kind: NostrKind,
    tags: Tag[],
    content: string,
): Promise<NostrEvent | Error> {
    const pubkeyHex = publicKeyHexFromNpub(pubkeyHexOrBech32);
    if (pubkeyHex instanceof Error) {
        return pubkeyHex;
    }

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

export type CustomAppData = {
    type: string;
    client?: string;
};
export async function prepareCustomAppDataEvent<T extends CustomAppData>(
    sender: NostrAccountContext,
    data: T,
) {
    const hex = sender.publicKey.hex;
    const encrypted = await sender.encrypt(hex, JSON.stringify(data));
    if (encrypted instanceof Error) {
        return encrypted;
    }
    const event: UnsignedNostrEvent<NostrKind.CustomAppData> = {
        created_at: Math.floor(Date.now() / 1000),
        content: encrypted,
        kind: NostrKind.CustomAppData,
        pubkey: hex,
        tags: [],
    };
    return sender.signEvent(event);
}

export function prepareParameterizedEvent<Kind extends NostrKind>(author: NostrAccountContext, args: {
    content: string;
    kind: Kind;
    d: string;
    created_at?: number;
}) {
    const event: UnsignedNostrEvent<Kind, TagIdentifier> = {
        created_at: args.created_at || Math.floor(Date.now() / 1000),
        content: args.content,
        kind: args.kind,
        pubkey: author.publicKey.hex,
        tags: [
            ["d", args.d],
        ],
    };
    return author.signEvent(event);
}
