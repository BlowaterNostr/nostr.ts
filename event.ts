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
        created_at: args.created_at ? args.created_at : Math.floor(Date.now() / 1000),
        kind: args.kind,
        pubkey: sender.publicKey.hex,
        tags: args.tags || [],
        content: args.content,
    };
    return sender.signEvent<Kind>(event);
}

export async function prepareDeletionNostrEvent(
    sender: NostrAccountContext,
    content: string,
    ...events: NostrEvent<NostrKind>[]
): Promise<NostrEvent<NostrKind.DELETE> | Error> {
    const eTags = new Set<string>();
    const aTags = new Set<string>();

    const isReplaceableEvent = (e: NostrEvent<NostrKind>) => {
        if (
            e.kind === NostrKind.META_DATA || e.kind === NostrKind.CONTACTS ||
            (e.kind >= 10000 && e.kind < 20000) ||
            (e.kind >= 30000 && e.kind < 40000)
        ) {
            return true;
        }
        return false;
    };

    events.forEach((e) => {
        if (isReplaceableEvent(e)) {
            const dTag = e.tags.find((
                tag,
            ) => (tag.length === 2 && tag[0] === "d" && typeof tag[1] === "string"));
            aTags.add(`${e.kind}:${e.pubkey}:${dTag?.[1] || ""}`);
        } else {
            eTags.add(e.id);
        }
    });

    const eTagsArr: Tag[] = Array.from(eTags).map((event_id: string) => ["e", event_id]);
    const aTagsArr: Tag[] = Array.from(aTags).map((identifier_str: string) => ["a", identifier_str]);

    return prepareNormalNostrEvent(
        sender,
        {
            kind: NostrKind.DELETE,
            content,
            tags: eTagsArr.concat(aTagsArr),
            created_at: Math.floor(Date.now() / 1000),
        },
    );
}
