import { assertEquals } from "https://deno.land/std@0.202.0/assert/assert_equals.ts";
import { assertInstanceOf } from "https://deno.land/std@0.202.0/assert/assert_instance_of.ts";
import { fail } from "https://deno.land/std@0.202.0/assert/fail.ts";
import { prepareNormalNostrEvent } from "./event.ts";
import { InMemoryAccountContext, NostrEvent, NostrKind } from "./nostr.ts";
import { SingleRelayConnection, SubscriptionAlreadyExist } from "./relay-single.ts";
import * as csp from "https://raw.githubusercontent.com/BlowaterNostr/csp/master/csp.ts";

export const open_close = (urls: string[]) => async () => {
    const ps = [];
    for (let url of urls) {
        const p = (async () => {
            const relay = SingleRelayConnection.New(url);
            if (relay instanceof Error) {
                fail(relay.message);
            }
            await relay.sendEvent({ id: "test id" } as NostrEvent);
            await relay.close();
        })();
        ps.push(p);
    }
    await Promise.all(ps);
};

export const newSub_close = (url: string) => async () => {
    // able to open & close
    const relay = SingleRelayConnection.New(url);
    if (relay instanceof Error) {
        fail(relay.message);
    }
    const sub = await relay.newSub("1", { kinds: [0], limit: 1 });
    if (sub instanceof Error) fail(sub.message);

    await relay.close();
    if (sub instanceof SubscriptionAlreadyExist) {
        fail("unreachable");
    }
    assertEquals(sub.chan.closed(), true);
};

export const sub_exits = (url: string) => async () => {
    const relay = SingleRelayConnection.New(url);
    if (relay instanceof Error) fail(relay.message);
    {
        // open
        const subID = "1";
        const chan = await relay.newSub(subID, { kinds: [0], limit: 1 });
        if (chan instanceof Error) fail(chan.message);

        // close
        await relay.closeSub(subID);
        assertEquals(chan.chan.closed(), true);

        // open again
        const sub2 = await relay.newSub(subID, { kinds: [0], limit: 1 });
        if (sub2 instanceof Error) fail(sub2.message);
        assertEquals(sub2.chan.closed(), false);
    }
    {
        const _ = await relay.newSub("hi", { limit: 1 });
        const sub = await relay.newSub("hi", { limit: 1 });
        assertInstanceOf(sub, SubscriptionAlreadyExist);
    }
    await relay.close();
};

export const close_sub_keep_reading = (url: string) => async () => {
    const relay = SingleRelayConnection.New(url);
    if (relay instanceof Error) fail(relay.message);

    {
        const subID = "1";
        const sub = await relay.newSub(subID, { limit: 1 });
        if (sub instanceof Error) fail(sub.message);
        await relay.closeSub(subID);
        assertEquals(sub.chan.closed(), true);
    }
    await relay.close();
};

export const send_event = (url: string) => async () => {
    const relay = SingleRelayConnection.New(url);
    if (relay instanceof Error) fail(relay.message);

    {
        const err = relay.sendEvent(
            await prepareNormalNostrEvent(InMemoryAccountContext.Generate(), {
                content: "",
                kind: NostrKind.TEXT_NOTE,
            }),
        );
        if (err instanceof Error) fail(err.message);
    }
    await relay.close();
};

export const sub_before_socket_open = (url: string) => async () => {
    const relay = SingleRelayConnection.New(url, { log: true, connect: false });
    {
        assertEquals(relay.status(), "Connecting");
        const stream = await relay.newSub("test", { limit: 1 });
        if (stream instanceof Error) fail(stream.message);

        // connect
        await relay.connect();
        if (relay.status() != "Open" && relay.status() != "Connecting") {
            fail(relay.status());
        }

        await relay.sendEvent(
            await prepareNormalNostrEvent(InMemoryAccountContext.Generate(), {
                kind: NostrKind.TEXT_NOTE,
                content: "test",
            }),
        );

        console.log("a");
        const msg = await stream.chan.pop();
        console.log("b");
        if (msg == csp.closed) {
            fail();
        }
        assertEquals(msg.subID, "test");
        assertEquals(msg.type, "EVENT");
    }
    await relay.close();
};
