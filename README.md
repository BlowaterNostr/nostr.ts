A strongly typed, fast nostr client protocol implementation.

# how to use
### Examples
```ts
import { ConnectionPool } from "https://deno.land/x/nostrts@1.0.0/relay.ts";

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
