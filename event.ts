import { PublicKey } from "./key.ts";
import {
    NostrAccountContext,
    NostrEvent,
    NostrKind,
    Tag,
    TagIdentifier,
    UnsignedNostrEvent,
} from "./nostr.ts";

export async function prepareEncryptedNostrEvent<T extends NostrKind>(
    sender: NostrAccountContext,
    args: {
        encryptKey: PublicKey;
        kind: T;
        tags: Tag[];
        content: string;
    },
): Promise<NostrEvent<T> | Error> {
    const encrypted = await sender.encrypt(args.encryptKey.hex, args.content);
    if (encrypted instanceof Error) {
        return encrypted;
    }
    return prepareNormalNostrEvent(
        sender,
        args.kind,
        args.tags,
        encrypted,
    );
}

export async function prepareNormalNostrEvent<Kind extends NostrKind = NostrKind>(
    sender: NostrAccountContext,
    kind: Kind,
    tags: Tag[],
    content: string,
): Promise<NostrEvent<Kind>> {
    // prepare nostr event
    const event: UnsignedNostrEvent<Kind> = {
        created_at: Math.floor(Date.now() / 1000),
        kind: kind,
        pubkey: sender.publicKey.hex,
        tags: tags,
        content,
    };
    return sender.signEvent<Kind>(event);
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
