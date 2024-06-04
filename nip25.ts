import { NostrAccountContext, NostrEvent, NostrKind, Tag } from "./nostr.ts";
import { prepareNormalNostrEvent } from "./event.ts";
import * as nostr from "./nostr.ts";

export async function prepareReactionEvent(
    author: NostrAccountContext,
    args: {
        content: string;
        targetEvent: nostr.NostrEvent;
    },
): Promise<NostrEvent<NostrKind.REACTION> | Error> {
    const { content, targetEvent } = args;

    // https://github.com/nostr-protocol/nips/blob/master/25.md#tags
    // There is currently no need to support replaceable events
    const tags: Tag[] = [
        ["e", targetEvent.id],
        ["p", targetEvent.pubkey],
    ];
    return prepareNormalNostrEvent(
        author,
        {
            kind: NostrKind.REACTION,
            content,
            tags,
        },
    );
}
