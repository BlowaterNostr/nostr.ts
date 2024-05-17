import { assertEquals } from "https://deno.land/std@0.202.0/assert/assert_equals.ts";
import { assertInstanceOf } from "https://deno.land/std@0.202.0/assert/assert_instance_of.ts";
import { fail } from "https://deno.land/std@0.202.0/assert/fail.ts";
import { prepareNormalNostrEvent } from "./event.ts";
import { InMemoryAccountContext, NostrKind, RelayResponse_Event } from "./nostr.ts";
import { SingleRelayConnection, SubscriptionAlreadyExist } from "./relay-single.ts";
import * as csp from "https://raw.githubusercontent.com/BlowaterNostr/csp/master/csp.ts";
import { PrivateKey } from "./key.ts";

export const open_close = (urls: string[]) => async () => {
    for (let url of urls) {
        const relay = SingleRelayConnection.New(url);
        await relay.close();
    }
};

export const newSub_close = (url: string) => async () => {
    // able to open & close
    const relay = SingleRelayConnection.New(url);
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

export const get_correct_kind = (url: string) => async () => {
    const relay = SingleRelayConnection.New(url);
    {
        const err = await relay.sendEvent(
            await prepareNormalNostrEvent(InMemoryAccountContext.Generate(), {
                kind: NostrKind.Encrypted_Custom_App_Data,
                content: "test",
            }),
        );
        if (err instanceof Error) fail(err.message);
    }
    {
        const stream = await relay.newSub("test", { limit: 1, kinds: [NostrKind.Encrypted_Custom_App_Data] });
        if (stream instanceof Error) fail(stream.message);

        const msg = await stream.chan.pop();
        if (msg == csp.closed) {
            fail();
        }
        if (msg.type != "EVENT") {
            fail(`msg.type is ${msg.type}`);
        }
        assertEquals(msg.subID, "test");
        assertEquals(msg.event.kind, NostrKind.Encrypted_Custom_App_Data);
    }
    await relay.close();
};

export const newSub_multiple_filters = (url: string) => async () => {
    const relay = SingleRelayConnection.New(url);
    const event_1 = await prepareNormalNostrEvent(InMemoryAccountContext.Generate(), {
        kind: NostrKind.TEXT_NOTE,
        content: "test1",
    });
    const event_2 = await prepareNormalNostrEvent(InMemoryAccountContext.Generate(), {
        kind: NostrKind.Long_Form,
        content: "test2",
    });
    {
        const err1 = await relay.sendEvent(event_1);
        if (err1 instanceof Error) fail(err1.message);
        const err2 = await relay.sendEvent(event_2);
        if (err2 instanceof Error) fail(err2.message);
    }

    const stream = await relay.newSub(
        "multiple filters",
        {
            ids: [event_1.id],
            limit: 1,
        },
        {
            authors: [event_2.pubkey],
            limit: 1,
        },
    );
    if (stream instanceof Error) fail(stream.message);

    const msg1 = await stream.chan.pop() as RelayResponse_Event;
    const msg2 = await stream.chan.pop() as RelayResponse_Event;

    assertEquals(event_1, msg1.event);
    assertEquals(event_2, msg2.event);

    await relay.close();
};

// maximum number of events relays SHOULD return in the initial query
export const limit = (url: string) => async () => {
    const ctx = InMemoryAccountContext.Generate();
    const relay = SingleRelayConnection.New(url);

    {
        const subID = "limit";
        const sub = await relay.newSub(subID, { kinds: [NostrKind.TEXT_NOTE], limit: 3 });
        if (sub instanceof Error) fail(sub.message);

        const err = await relay.sendEvent(
            await prepareNormalNostrEvent(ctx, {
                kind: NostrKind.TEXT_NOTE,
                content: "1",
            }),
        );
        if (err instanceof Error) fail(err.message);
        const err2 = await relay.sendEvent(
            await prepareNormalNostrEvent(ctx, {
                kind: NostrKind.TEXT_NOTE,
                content: "2",
            }),
        );
        if (err2 instanceof Error) fail(err2.message);
        const err3 = await relay.sendEvent(
            await prepareNormalNostrEvent(ctx, {
                kind: NostrKind.TEXT_NOTE,
                content: "3",
            }),
        );
        if (err3 instanceof Error) fail(err3.message);
        const err4 = await relay.sendEvent(
            await prepareNormalNostrEvent(ctx, {
                kind: NostrKind.TEXT_NOTE,
                content: "4",
            }),
        );
        if (err4 instanceof Error) fail(err4.message);

        let i = 0;
        for await (const msg of sub.chan) {
            console.log("msg", msg);
            if (msg.type == "EOSE") {
                break;
            }
            i++;
        }
        assertEquals(i, 3);
    }
    await relay.close();
};

export const no_event = (url: string) => async () => {
    const ctx = InMemoryAccountContext.Generate();
    const relay = SingleRelayConnection.New(url);
    {
        const subID = "NoEvent";
        const sub = await relay.newSub(subID, {
            "authors": [ctx.publicKey.hex],
            "kinds": [NostrKind.CONTACTS],
        });
        if (sub instanceof Error) fail(sub.message);

        for await (const msg of sub.chan) {
            assertEquals(msg, { type: "EOSE", subID: "NoEvent" });
            break;
        }
    }
    await relay.close();
};

export const two_clients_communicate = (url: string) => async () => {
    const ctx = InMemoryAccountContext.Generate();
    const relay1 = SingleRelayConnection.New(url);
    const relay2 = SingleRelayConnection.New(url);
    {
        const sub = await relay1.newSub("relay1", {
            authors: [ctx.publicKey.hex],
        });
        if (sub instanceof Error) fail(sub.message);

        const err = await relay2.sendEvent(
            await prepareNormalNostrEvent(ctx, {
                content: "test",
                kind: NostrKind.TEXT_NOTE,
            }),
        );
        if (err instanceof Error) fail(err.message);

        for await (const msg of sub.chan) {
            console.log(msg);
            if (msg.type == "EVENT") {
                assertEquals(msg.event.content, "test");
                assertEquals(msg.event.pubkey, ctx.publicKey.hex);
                break;
            }
        }
    }
    await relay1.close();
    await relay2.close();
};

export const get_event_by_id = (url: string) => async () => {
    const relay1 = SingleRelayConnection.New(url, { log: true });
    const ctx = InMemoryAccountContext.Generate();
    {
        const event_1 = await relay1.getEvent(PrivateKey.Generate().hex);
        assertEquals(event_1, undefined);

        const event = await prepareNormalNostrEvent(ctx, {
            content: "get_event_by_id",
            kind: NostrKind.TEXT_NOTE,
        });
        const err = await relay1.sendEvent(event);
        if (err instanceof Error) fail(err.message);

        const event_2 = await relay1.getEvent(event.id);
        if (event_2 instanceof Error) fail(event_2.message);

        assertEquals(event, event_2);
    }
    await relay1.close();
};

export const get_replaceable_event = (url: string) => async () => {
    const relay = SingleRelayConnection.New(url);
    const ctx = InMemoryAccountContext.Generate();

    const event1 = await prepareNormalNostrEvent(ctx, {
        content: "1",
        kind: NostrKind.META_DATA,
        created_at: Date.now() / 1000,
    });
    {
        const err = await relay.sendEvent(event1);
        if (err instanceof Error) fail(err.message);
    }

    const event2 = await prepareNormalNostrEvent(ctx, {
        content: "2",
        kind: NostrKind.META_DATA,
        created_at: Date.now() / 1000 + 1,
    });
    {
        const err = await relay.sendEvent(event2);
        if (err instanceof Error) fail(err.message);
    }

    const event_got = await relay.getReplaceableEvent(ctx.publicKey, NostrKind.META_DATA);
    assertEquals(event_got, event2);
    await relay.close();
};
