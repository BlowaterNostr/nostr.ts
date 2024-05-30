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
        await using relay = await run({
            port: 8001,
            default_policy: {
                allowed_kinds: "all",
            },
            default_information: {
                auth_required: false,
            },
        }) as Relay;
        await using client = SingleRelayConnection.New(relay.ws_url);

        const ctx = InMemoryAccountContext.Generate();

        const sub = await client.newSub("1", {});
        assertIsError(sub, DOMException, "readyState not OPEN");

        await sleep(0); // wait 1 tick
        assertEquals(client.status(), "Closed");
        const sub2 = await client.newSub("2", {});
        if (!(sub2 instanceof AuthError)) {
            fail(JSON.stringify(sub2));
        }

        const res = await client.sendEvent(
            await prepareNormalNostrEvent(ctx, {
                kind: NostrKind.TEXT_NOTE,
                content: "",
            }),
        );
        if (!(res instanceof AuthError)) {
            fail(JSON.stringify(res));
        }
        assertEquals(client.status(), "Closed");
    },
});

Deno.test({
    name: "auth accepted",
    ignore: true,
    fn: async () => {
        await using relay = await run({
            port: 8001,
            default_policy: {
                allowed_kinds: "all",
            },
            default_information: {
                auth_required: true,
            },
        }) as Relay;

        const ctx = InMemoryAccountContext.Generate();
        const client = SingleRelayConnection.New(relay.ws_url, {
            signer: ctx,
        });

        const sub = await client.newSub("1", {});
        if (sub instanceof Error) {
            // sub will not be an error because the websocket has connected successfully
            // which is a design flaw of the Nostr protocol here
            fail(sub.message);
        }
        await sleep(1); // wait some time

        const sub2 = await client.newSub("2", {});
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
    },
});
