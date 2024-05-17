import { run } from "https://raw.githubusercontent.com/BlowaterNostr/relayed/main/main.tsx";
import { InMemoryAccountContext } from "./nostr.ts";

const ctx = InMemoryAccountContext.Generate();

const relay = await run({
    port: 8000,
    default_policy: {
        allowed_kinds: "all", // or none,
    },
    system_key: ctx.privateKey.hex,
    default_information: {
        name: "Test Relay",
        description: "only for testing",
        pubkey: ctx.publicKey.hex,
    },
});
if (relay instanceof Error) {
    console.error(relay);
}
