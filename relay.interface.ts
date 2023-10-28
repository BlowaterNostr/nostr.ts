import { Channel } from "https://raw.githubusercontent.com/BlowaterNostr/csp/master/csp.ts";
import { NostrEvent, NostrFilters, RelayResponse_REQ_Message } from "./nostr.ts";
import { WebSocketClosed } from "./relay.ts";

export type Subscriber = {
    newSub: (subID: string, filter: NostrFilters) => Promise<
        Error | {
            filter: NostrFilters;
            chan: Channel<RelayResponse_REQ_Message>;
        }
    >;
};

export type SubscriptionCloser = {
    closeSub: (subID: string) => Promise<WebSocketClosed | undefined>;
};

export type EventSender = {
    sendEvent: (nostrEvent: NostrEvent) => Promise<Error | undefined>;
};

export type Closer = {
    close: () => Promise<void>;
};
