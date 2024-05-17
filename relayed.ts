import { run } from "https://raw.githubusercontent.com/BlowaterNostr/relayed/main/main.tsx";

const relay = await run({
    port: 8080,
    default_policy: {
        allowed_kinds: "all", // or none,
    },
    system_key: "nsec1geplx78d053a7554j8xtrfgffknukmyc6w206r2dszdsl2t2zhnqw0g3fg",
    default_information: {
        name: "Test Relay",
        description: "only for testing",
    },
});
if (relay instanceof Error) {
    console.error(relay);
}
