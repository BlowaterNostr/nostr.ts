import { sleep } from "https://raw.githubusercontent.com/BlowaterNostr/csp/master/csp.ts";
import { AuthError, SingleRelayConnection } from "./relay-single.ts";
import { assertEquals } from "https://deno.land/std@0.202.0/assert/assert_equals.ts";
import { relayed } from "./relay-list.test.ts";
import { fail } from "https://deno.land/std@0.202.0/assert/fail.ts";
import { prepareNormalNostrEvent } from "./event.ts";
import { InMemoryAccountContext, NostrKind } from "./nostr.ts";

Deno.test({
    name: "auth rejected",
    ignore: true,
    fn: async () => {
    await using client = SingleRelayConnection.New(relayed);
    const ctx = InMemoryAccountContext.Generate();
    const sub = await client.newSub("1", {});
    if (sub instanceof Error) {
        // sub will not be an error because the websocket has connected successfully
        // which is a design flaw of the Nostr protocol here
        fail(sub.message);
    }
    assertEquals(client.status(), "Open");
    await sleep(1000); // wait some time
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
}});

Deno.test("auth accepted", async () => {
    const ctx = InMemoryAccountContext.Generate();
    await using client = SingleRelayConnection.New(relayed, {
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
    await client.close()
});
