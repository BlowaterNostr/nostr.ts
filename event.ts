import { PublicKey } from "./key.ts";
import { Encrypter, NostrEvent, NostrKind, Signer, Tag, UnsignedNostrEvent } from "./nostr.ts";

export async function prepareEncryptedNostrEvent<T extends NostrKind>(
    sender: Signer & Encrypter,
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
    return prepareNostrEvent(
        sender,
        {
            kind: args.kind,
            tags: args.tags,
            content: encrypted,
        },
    );
}

export async function prepareNostrEvent<Kind extends NostrKind = NostrKind>(
    sender: Signer,
    args: {
        kind: Kind;
        content: string;
        tags?: Tag[];
        created_at?: number;
    },
): Promise<NostrEvent<Kind> | Error> {
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
    author: Signer,
    content: string,
    ...events: NostrEvent<NostrKind>[]
): Promise<NostrEvent<NostrKind.DELETE> | Error> {
    const eTags = new Set<string>();
    const tags: Tag[] = [];

    for (const e of events) {
        if (eTags.has(e.id)) {
            continue;
        }
        eTags.add(e.id);
        tags.push(["e", e.id]);
    }

    return prepareNostrEvent(
        author,
        {
            kind: NostrKind.DELETE,
            content,
            tags,
            created_at: Math.floor(Date.now() / 1000),
        },
    );
}
