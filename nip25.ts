import { prepareNostrEvent } from "./event.ts";
import * as nostr from "./nostr.ts";

export async function prepareReactionEvent(
    author: nostr.Signer,
    args: {
        content: string;
        targetEvent: nostr.NostrEvent;
    },
): Promise<nostr.NostrEvent<nostr.NostrKind.REACTION> | Error> {
    const { content, targetEvent } = args;

    // https://github.com/nostr-protocol/nips/blob/master/25.md#tags
    // There is currently no need to support replaceable events
    const tags: nostr.Tag[] = [
        ["e", targetEvent.id],
        ["p", targetEvent.pubkey],
    ];
    return prepareNostrEvent(
        author,
        {
            kind: nostr.NostrKind.REACTION,
            content,
            tags,
        },
    );
}
