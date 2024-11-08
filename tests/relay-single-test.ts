import { assertEquals, assertInstanceOf, fail } from "@std/assert";
import { prepareNostrEvent } from "../event.ts";
import { SingleRelayConnection, SubscriptionAlreadyExist } from "../relay-single.ts";
import * as csp from "@blowater/csp";
import { PrivateKey } from "../key.ts";

import { getSpaceMembers } from "../space-member.ts";
import {
    InMemoryAccountContext,
    type NostrEvent,
    NostrKind,
    type RelayResponse_Event,
    type Signer,
} from "../nostr.ts";
import type { Signer_V2 } from "../v2.ts";

export const open_close = (urls: string[]) => async () => {
    for (let url of urls) {
        const client = SingleRelayConnection.New(url) as SingleRelayConnection;
        await client.close();
    }
};

export const newSub_close = (url: string) => async () => {
    // able to open & close
    const client = SingleRelayConnection.New(url) as SingleRelayConnection;
    const sub = await client.newSub("1", { kinds: [0], limit: 1 });
    if (sub instanceof Error) fail(sub.message);

    await client.close();
    if (sub instanceof SubscriptionAlreadyExist) {
        fail("unreachable");
    }
    assertEquals(sub.chan.closed(), true);
    await client.close();
};

export const sub_exits = (url: string) => async () => {
    const client = SingleRelayConnection.New(url) as SingleRelayConnection;
    {
        // open
        const subID = "1";
        const chan = await client.newSub(subID, { kinds: [0], limit: 1 });
        if (chan instanceof Error) fail(chan.message);

        // close
        await client.closeSub(subID);
        assertEquals(chan.chan.closed(), true);

        // open again
        const sub2 = await client.newSub(subID, { kinds: [0], limit: 1 });
        if (sub2 instanceof Error) fail(sub2.message);
        assertEquals(sub2.chan.closed(), false);
    }
    {
        const _ = await client.newSub("hi", { limit: 1 });
        const sub = await client.newSub("hi", { limit: 1 });
        assertInstanceOf(sub, SubscriptionAlreadyExist);
    }
    await client.close();
};

export const close_sub_keep_reading = (url: string) => async () => {
    const client = SingleRelayConnection.New(url) as SingleRelayConnection;
    {
        const subID = "1";
        const sub = await client.newSub(subID, { limit: 1 });
        if (sub instanceof Error) fail(sub.message);
        await client.closeSub(subID);
        assertEquals(sub.chan.closed(), true);
    }
    await client.close();
};

export const send_event = (url: string) => async () => {
    const client = SingleRelayConnection.New(url) as SingleRelayConnection;
    {
        const event = await prepareNostrEvent(InMemoryAccountContext.Generate(), {
            content: "",
            kind: NostrKind.TEXT_NOTE,
        }) as NostrEvent;
        const err = client.sendEvent(event);
        if (err instanceof Error) fail(err.message);
    }
    await client.close();
};

export const get_correct_kind = (url: string) => async () => {
    const relay = SingleRelayConnection.New(url) as SingleRelayConnection;
    {
        const err = await relay.sendEvent(
            await prepareNostrEvent(InMemoryAccountContext.Generate(), {
                kind: NostrKind.Encrypted_Custom_App_Data,
                content: "test",
            }) as NostrEvent,
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
    const relay = SingleRelayConnection.New(url) as SingleRelayConnection;
    const event_1 = await prepareNostrEvent(InMemoryAccountContext.Generate(), {
        kind: NostrKind.TEXT_NOTE,
        content: "test1",
    }) as NostrEvent;
    const event_2 = await prepareNostrEvent(InMemoryAccountContext.Generate(), {
        kind: NostrKind.Long_Form,
        content: "test2",
    }) as NostrEvent;
    {
        const err1 = await relay.sendEvent(event_1 as NostrEvent);
        if (err1 instanceof Error) fail(err1.message);
        const err2 = await relay.sendEvent(event_2 as NostrEvent);
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
    const relay = SingleRelayConnection.New(url) as SingleRelayConnection;
    {
        const err = await relay.sendEvent(
            await prepareNostrEvent(ctx, {
                kind: NostrKind.TEXT_NOTE,
                content: "1",
            }) as NostrEvent,
        );
        if (err instanceof Error) fail(err.message);
        const err2 = await relay.sendEvent(
            await prepareNostrEvent(ctx, {
                kind: NostrKind.TEXT_NOTE,
                content: "2",
            }) as NostrEvent,
        );
        if (err2 instanceof Error) fail(err2.message);
        const err3 = await relay.sendEvent(
            await prepareNostrEvent(ctx, {
                kind: NostrKind.TEXT_NOTE,
                content: "3",
            }) as NostrEvent,
        );
        if (err3 instanceof Error) fail(err3.message);
        const err4 = await relay.sendEvent(
            await prepareNostrEvent(ctx, {
                kind: NostrKind.TEXT_NOTE,
                content: "4",
            }) as NostrEvent,
        );
        if (err4 instanceof Error) fail(err4.message);

        const subID = "limit";
        const sub = await relay.newSub(subID, { kinds: [NostrKind.TEXT_NOTE], limit: 3 });
        if (sub instanceof Error) fail(sub.message);

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
    const relay = SingleRelayConnection.New(url) as SingleRelayConnection;
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
    const relay1 = SingleRelayConnection.New(url) as SingleRelayConnection;
    const relay2 = SingleRelayConnection.New(url) as SingleRelayConnection;
    {
        const sub = await relay1.newSub("relay1", {
            authors: [ctx.publicKey.hex],
        });
        if (sub instanceof Error) fail(sub.message);

        const err = await relay2.sendEvent(
            await prepareNostrEvent(ctx, {
                content: "test",
                kind: NostrKind.TEXT_NOTE,
            }) as NostrEvent,
        );
        if (err instanceof Error) fail(err.message);

        for await (const msg of sub.chan) {
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
    const client = SingleRelayConnection.New(url) as SingleRelayConnection;
    const ctx = InMemoryAccountContext.Generate();
    {
        const event_1 = await client.getEvent(PrivateKey.Generate().hex);
        assertEquals(event_1, undefined);

        const event = await prepareNostrEvent(ctx, {
            content: "get_event_by_id",
            kind: NostrKind.TEXT_NOTE,
        }) as NostrEvent;
        const err = await client.sendEvent(event);
        if (err instanceof Error) fail(err.message);

        const event_2 = await client.getEvent(event.id);
        if (event_2 instanceof Error) fail(event_2.message);

        assertEquals(event, event_2);
    }
    await client.close();
};

export const get_replaceable_event = (url: string) => async () => {
    const client = SingleRelayConnection.New(url) as SingleRelayConnection;
    const ctx = InMemoryAccountContext.Generate();

    const created_at = Date.now() / 1000;
    const event1 = await prepareNostrEvent(ctx, {
        content: "1",
        kind: NostrKind.META_DATA,
        created_at: created_at,
    }) as NostrEvent;
    {
        const err = await client.sendEvent(event1);
        if (err instanceof Error) fail(err.message);
    }

    const event2 = await prepareNostrEvent(ctx, {
        content: "2",
        kind: NostrKind.META_DATA,
        created_at: created_at + 100,
    }) as NostrEvent;
    {
        const err = await client.sendEvent(event2);
        if (err instanceof Error) fail(err.message);
    }

    const event_got = await client.getReplaceableEvent(ctx.publicKey, NostrKind.META_DATA);
    assertEquals(event_got, event2);
    await client.close();
};

export const get_space_members = (url: URL) => async () => {
    const members = await getSpaceMembers(url);
    if (members instanceof Error) fail(members.message);
};

export const add_space_member = (url: string, args: {
    signer: Signer;
    signer_v2: Signer_V2;
}) =>
async () => {
    const client = SingleRelayConnection.New(url, args) as SingleRelayConnection;
    {
        const new_member = PrivateKey.Generate().toPublicKey();
        const added = await client.unstable.addSpaceMember(new_member);
        if (added instanceof Error) fail(added.message);
        assertEquals(added.status, 200);
        assertEquals(await added.text(), "");
    }
    await client.close();
};
