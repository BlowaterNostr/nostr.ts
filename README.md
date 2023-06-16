A strongly typed, fast nostr client protocol implementation.

#### Copilot Bot Nostr Pubkey

npub1dd56gu2v8cvc9nn8ne0u7az48zel62t59cc3shv32n6g6zutmcesvrhf83

One interesting way of learning this library is to DM with this bot. It can tell you much more than the doc.

## Guide

This package is divided into 3 modules:

1. Network [`relay.ts`](./relay.ts) provides functionalities for connecting a single relay and connection
   pools.
2. Computation [`nostr.ts`](./nostr.ts) provides functions for event creation and transformation.
3. Storage coming soon

### Examples

```ts
import { ConnectionPool } from "https://deno.land/x/nostrts/relay.ts";

const pool = new ConnectionPool();
/* optional await */ pool.addRelayURLs([
    "wss://relay.damus.io",
    "wss://nos.lol",
]);

// https://github.com/nostr-protocol/nips/blob/master/01.md#from-client-to-relay-sending-events-and-creating-subscriptions
const results = await pool.newSub("sub ID", {
    // standard nostr filter here
    kinds: [0],
    limit: 1,
});
if (results instanceof Error) {
    // handle the error
}

for await (const [msg, url] of results) {
    // handle each msg
}

await pool.sendEvent(/* standard nostr event here */);
```

The auto complete provided by your editors should give you enough information to get started!

Have fun.
