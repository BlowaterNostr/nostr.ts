import { PublicKey } from "./key.ts";
import { NostrAccountContext, NostrEvent, NostrKind, Tag, UnsignedNostrEvent } from "./nostr.ts";

export async function prepareEncryptedNostrEvent<T extends NostrKind>(
    sender: NostrAccountContext,
    args: {
        encryptKey: PublicKey;
        kind: T;
        content: string;
        tags?: Tag[];
        algorithm?: "nip4" | "nip44";
    },
): Promise<NostrEvent<T> | Error> {
    const encrypted = await sender.encrypt(
        args.encryptKey.hex,
        args.content,
        args.algorithm ? args.algorithm : "nip44",
    );
    if (encrypted instanceof Error) {
        return encrypted;
    }
    return prepareNormalNostrEvent(
        sender,
        {
            kind: args.kind,
            tags: args.tags,
            content: encrypted,
        },
    );
}

export async function prepareNormalNostrEvent<Kind extends NostrKind = NostrKind>(
    sender: NostrAccountContext,
    args: {
        kind: Kind;
        content: string;
        tags?: Tag[];
        created_at?: number;
    },
): Promise<NostrEvent<Kind>> {
    const event: UnsignedNostrEvent<Kind> = {
        created_at: args.created_at ? Math.floor(args.created_at) : Math.floor(Date.now() / 1000),
        kind: args.kind,
        pubkey: sender.publicKey.hex,
        tags: args.tags || [],
        content: args.content,
    };
    return sender.signEvent<Kind>(event);
}

export async function prepareDeletionEvent(
    sender: NostrAccountContext,
    content: string,
    ...events: NostrEvent<NostrKind>[]
): Promise<NostrEvent<NostrKind.DELETE> | Error> {
    const eTags = new Set<string>();
    const tags: Tag[] = [];

    events.forEach((e) => {
        if (eTags.has(e.id)) return;
        eTags.add(e.id);
        tags.push(["e", e.id]);
    });

    return prepareNormalNostrEvent(
        sender,
        {
            kind: NostrKind.DELETE,
            content,
            tags,
            created_at: Math.floor(Date.now() / 1000),
        },
    );
}
