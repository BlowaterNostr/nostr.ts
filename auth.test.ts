import { sleep } from "https://raw.githubusercontent.com/BlowaterNostr/csp/master/csp.ts";
import { AuthError, SingleRelayConnection } from "./relay-single.ts";
import { assertEquals } from "https://deno.land/std@0.202.0/assert/assert_equals.ts";
import { fail } from "https://deno.land/std@0.202.0/assert/fail.ts";
import { prepareNormalNostrEvent } from "./event.ts";
import { InMemoryAccountContext, NostrKind } from "./nostr.ts";
import { Relay, run } from "https://raw.githubusercontent.com/BlowaterNostr/relayed/main/main.tsx";
import { assertIsError } from "https://deno.land/std@0.202.0/assert/assert_is_error.ts";

Deno.test({
    name: "auth rejected",
    ignore: false,
    fn: async () => {
        const relay = await run({
            port: 8001,
            default_policy: {
                allowed_kinds: "all",
            },
            default_information: {
                auth_required: true,
            },
        }) as Relay;
        const client = SingleRelayConnection.New(relay.ws_url);
        const ctx = InMemoryAccountContext.Generate();
        const event = await prepareNormalNostrEvent(ctx, {
            kind: NostrKind.TEXT_NOTE,
            content: "",
        });

        await sleep(5);
        const res = await client.sendEvent(
            event,
        );
        assertIsError(res, AuthError, "no auth event found");

        const event_ = await client.getEvent(event.id);
        assertIsError(event_, AuthError, "no auth event found");
        assertEquals(client.status(), "Closed");

        await client.close();
        await relay.shutdown();
    },
});

Deno.test({
    name: "auth accepted",
    ignore: false,
    fn: async () => {
        const ctx = InMemoryAccountContext.Generate();
        const relay = await run({
            port: 8001,
            default_policy: {
                allowed_kinds: "all",
            },
            default_information: {
                auth_required: true,
                pubkey: ctx.publicKey.hex,
            },
        }) as Relay;

        const client = SingleRelayConnection.New(relay.ws_url, {
            signer: ctx,
        });
        await sleep(1);

        const sub = await client.newSub("1", {});
        if (sub instanceof Error) {
            // sub will not be an error because the websocket has connected successfully
            // which is a design flaw of the Nostr protocol here
            fail(sub.message);
        }
        await sleep(1); // wait some time

        const sub2 = await client.newSub("2", { kinds: [1] });
        if (sub2 instanceof Error) {
            fail(sub2.message);
        }

        const res = await client.sendEvent(
            await prepareNormalNostrEvent(ctx, {
                kind: NostrKind.TEXT_NOTE,
                content: "",
            }),
        );
        if (res instanceof Error) {
            fail(JSON.stringify(res));
        }
        assertEquals(client.status(), "Open");

        await client.close();
        await relay.shutdown();
    },
});
