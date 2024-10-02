import type { NostrEvent, NostrFilter } from "./nostr.ts";
import { type SubscriptionStream, WebSocketClosed } from "./relay-single.ts";

export type Subscriber = {
    newSub: (subID: string, ...filters: NostrFilter[]) => Promise<
        Error | SubscriptionStream
    >;
};

export type SubscriptionCloser = {
    closeSub: (subID: string) => Promise<WebSocketClosed | Error | void>;
};

export type EventSender = {
    sendEvent: (nostrEvent: NostrEvent) => Promise<Error | string>;
};

export type Closer = {
    close: () => Promise<void>;
};
