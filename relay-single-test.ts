import { assert } from "https://deno.land/std@0.202.0/assert/assert.ts";
import { assertEquals } from "https://deno.land/std@0.202.0/assert/assert_equals.ts";
import { assertInstanceOf } from "https://deno.land/std@0.202.0/assert/assert_instance_of.ts";
import { fail } from "https://deno.land/std@0.202.0/assert/fail.ts";
import { prepareEncryptedNostrEvent, prepareNormalNostrEvent } from "./event.ts";
import { InMemoryAccountContext, NostrEvent, NostrKind } from "./nostr.ts";
import { SingleRelayConnection, SubscriptionAlreadyExist } from "./relay-single.ts";
import * as csp from "https://raw.githubusercontent.com/BlowaterNostr/csp/master/csp.ts";
import { PrivateKey, PublicKey } from "./key.ts";

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
        const stream = await relay.newSub("test", { limit: 1, kinds: [NostrKind.Encrypted_Custom_App_Data] });
        if (stream instanceof Error) fail(stream.message);

        await relay.sendEvent(
            await prepareNormalNostrEvent(InMemoryAccountContext.Generate(), {
                kind: NostrKind.Encrypted_Custom_App_Data,
                content: "test",
            }),
        );

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
    try {
        const stream = await relay.newSub("multiple_filters", { kinds: [NostrKind.TEXT_NOTE], limit: 1 }, {
            kinds: [NostrKind.META_DATA],
            limit: 1,
        });
        if (stream instanceof Error) fail(stream.message);

        await relay.sendEvent(
            await prepareNormalNostrEvent(InMemoryAccountContext.Generate(), {
                kind: NostrKind.TEXT_NOTE,
                content: "test1",
            }),
        );

        await relay.sendEvent(
            await prepareNormalNostrEvent(InMemoryAccountContext.Generate(), {
                kind: NostrKind.META_DATA,
                content: "test2",
            }),
        );

        const msg1 = await stream.chan.pop();
        const msg2 = await stream.chan.pop();
        if (msg1 == csp.closed || msg2 == csp.closed) {
            fail();
        }
        if (msg1.type != "EVENT" || msg2.type != "EVENT") {
            fail();
        }
        assertEquals(msg1.subID, "multiple_filters");
        assertEquals(msg2.subID, "multiple_filters");
        assert(msg1.event.kind != msg2.event.kind);
        assert([NostrKind.TEXT_NOTE, NostrKind.META_DATA].includes(msg1.event.kind));
        assert([NostrKind.TEXT_NOTE, NostrKind.META_DATA].includes(msg2.event.kind));
    } finally {
        await relay.close();
    }
};

export const limit = (url: string) => async () => {
    const ctx = InMemoryAccountContext.Generate();
    const relay = SingleRelayConnection.New(url);
    {
        const subID = "limit";
        const sub = await relay.newSub(subID, { limit: 3 });
        if (sub instanceof Error) fail(sub.message);

        await relay.sendEvent(
            await prepareNormalNostrEvent(ctx, {
                kind: NostrKind.TEXT_NOTE,
                content: "1",
            }),
        );
        await relay.sendEvent(
            await prepareNormalNostrEvent(ctx, {
                kind: NostrKind.TEXT_NOTE,
                content: "2",
            }),
        );
        await relay.sendEvent(
            await prepareNormalNostrEvent(ctx, {
                kind: NostrKind.TEXT_NOTE,
                content: "3",
            }),
        );

        let i = 0;
        for await (const msg of sub.chan) {
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
            assertEquals(msg.type, "EOSE");
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
