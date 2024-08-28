import { assertEquals } from "@std/assert";
import { PrivateKey, PublicKey } from "../key.ts";
import { InMemoryAccountContext, NostrEvent, NostrKind, prepareNostrEvent } from "../nostr.ts";
import { SingleRelayConnection } from "../relay-single.ts";
import * as relayList from "./relay-list.test.ts";
import { Signer } from "../nostr.ts";

Deno.test("SingleRelayConnection", async () => {
    const relay = SingleRelayConnection.New(relayList.blowater);
    if (relay instanceof Error) {
        console.error(relay);
        return;
    }
    const privateKey = PrivateKey.Generate();
    const signer = InMemoryAccountContext.New(privateKey);
    const event = await prepareNostrEvent(signer, {
        content: "this is an example",
        kind: NostrKind.TEXT_NOTE,
        tags: [
            ["p", signer.publicKey.hex],
        ],
    }) as NostrEvent;
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
    await relay.close();
});

Deno.test("Key Handling", async () => {
    {
        const pubkey = PublicKey.FromString("invalid");
        console.log(pubkey); // will be an error
    }
    {
        // construct a public key instance from hex
        const pubkey1 = PublicKey.FromString(
            "4191aff8d9b30ce6653a8eb5cb53c18cd0bd9827563783fe56563919a4616d4f",
        );
        console.log(pubkey1);
        const pubkey2 = PublicKey.FromHex("4191aff8d9b30ce6653a8eb5cb53c18cd0bd9827563783fe56563919a4616d4f");
        console.log(pubkey1);
        assertEquals(pubkey1, pubkey2); // same
    }
    {
        // construct a public key instance from npub
        const pubkey1 = PublicKey.FromString(
            "npub1gxg6l7xekvxwvef6366uk57p3ngtmxp82cmc8ljk2cu3nfrpd48sc67nft",
        );
        console.log(pubkey1);
        const pubkey2 = PublicKey.FromBech32(
            "npub1gxg6l7xekvxwvef6366uk57p3ngtmxp82cmc8ljk2cu3nfrpd48sc67nft",
        );
        console.log(pubkey2);
        assertEquals(pubkey1, pubkey2); // same
    }
    /////////////////
    // Private Key //
    /////////////////
    {
        const pri = PrivateKey.Generate();
        // usually the program reads
        // a stored private string from a secure storage
        // instead of having plain text in source code
        const pri2 = PrivateKey.FromString(
            "6a59b5296384f9eebd3afbea52c4b921d8ec3fc9ea8b2f56d31185663bab561d",
        );
        const pri3 = PrivateKey.FromHex("hex format");
        const pri4 = PrivateKey.FromBech32("nsec format");

        // get the corresponding public key from this private key
        const pub = pri.toPublicKey();
    }
    ////////////
    // Signer //
    ////////////
    const pri = PrivateKey.Generate();
    // constructing a signer from a private key
    const signer1: Signer = InMemoryAccountContext.New(pri);
    // generate a signer
    const signer2: Signer = InMemoryAccountContext.Generate();
    // constructing a Signer from string may result in an error
    // because the string may be malformed
    const signer3: Signer | Error = InMemoryAccountContext.FromString(
        "private key string in either hex or nsec format",
    );
});
