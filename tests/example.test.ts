import { PrivateKey } from "../key.ts";
import { InMemoryAccountContext, NostrKind, prepareNormalNostrEvent } from "../nostr.ts";
import { SingleRelayConnection } from "../relay-single.ts";
import * as relayList from "./relay-list.test.ts";

Deno.test("example", async () => {
    const relay = SingleRelayConnection.New(relayList.blowater);
    if (relay instanceof Error) {
        console.error(relay);
        return;
    }
    const privateKey = PrivateKey.Generate();
    const signer = InMemoryAccountContext.New(privateKey);
    const event = await prepareNormalNostrEvent(signer, {
        content: "this is an example",
        kind: NostrKind.TEXT_NOTE,
        tags: [
            ["p", signer.publicKey.hex],
        ],
    });
    const ok = await relay.sendEvent(event);
    if (ok instanceof Error) {
        console.error(ok);
        return;
    }
    console.log("send ok", ok);
    const event_got = await relay.getEvent(event.id);
    if (event_got instanceof Error) {
        console.error(event_got);
        return;
    }
    console.log("event_got", event_got);

    // get all events created by this pubkey
    const stream = await relay.newSub("sub ID", {
        authors: [signer.publicKey.hex],
    });
    if (stream instanceof Error) {
        console.error(stream);
        return;
    }
    for await (const response_message of stream.chan) {
        if (response_message.type == "EVENT") {
            console.log(response_message.event);
        } else if (response_message.type == "NOTICE") {
            console.log(response_message.note);
        } else if (response_message.type == "EOSE") {
            break;
        } else {
            console.log(response_message);
        }
    }
});
