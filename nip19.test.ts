import { assertEquals, assertIsError, fail } from "@std/assert";
import { InvalidKey, PrivateKey, PublicKey } from "./key.ts";
import {
    type AddressPointer,
    type EventPointer,
    Nevent,
    NostrAddress,
    NostrProfile,
    NoteID,
} from "./nip19.ts";
import { relays } from "./tests/relay-list.test.ts";
import { NostrKind } from "./nostr.ts";

Deno.test("nip19 public key", () => {
    const key = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const npub = "npub1424242424242424242424242424242424242424242424242424qamrcaj";

    const pkey = PublicKey.FromHex(key);
    if (pkey instanceof Error) fail();
    assertEquals(key, pkey.hex);
    assertEquals(npub, pkey.bech32());

    const pkey2 = PublicKey.FromBech32(npub);
    if (pkey2 instanceof Error) fail();
    assertEquals(pkey.hex, pkey2.hex);
    assertEquals(npub, pkey2.bech32());

    const pkey3 = PublicKey.FromHex("");
    assertIsError(pkey3);

    const pkey4 = PublicKey.FromString(key);
    if (pkey4 instanceof Error) fail();
    const pkey5 = PublicKey.FromString(npub);
    if (pkey5 instanceof Error) fail();

    assertEquals(pkey4.hex, pkey5.hex);
});

Deno.test("nip19 public key incorrect", () => {
    const pub = PublicKey.FromBech32("invalid");
    if (pub instanceof Error) {
        assertEquals(pub.message, "key 'invalid' is invalid, reason: not a npub");
    } else {
        fail("should be error");
    }

    const pub2 = PublicKey.FromBech32(
        "npub1xxxxxxxxrhgtk4fgqdmpuqxv05u9raau3w0shay7msmr0dzs4m7sxxxxxx",
    ) as InvalidKey;
    assertEquals(
        pub2.message,
        `key 'npub1xxxxxxxxrhgtk4fgqdmpuqxv05u9raau3w0shay7msmr0dzs4m7sxxxxxx' is invalid, reason: Invalid checksum in npub1xxxxxxxxrhgtk4fgqdmpuqxv05u9raau3w0shay7msmr0dzs4m7sxxxxxx: expected "ym976l"`,
    );
});

Deno.test("nip19 public key performance", async (t) => {
    const key = PrivateKey.Generate().toPublicKey().hex;
    const count = 100000;
    await t.step(`${count}`, () => {
        for (let i = 0; i < count; i++) {
            PublicKey.FromHex(key);
        }
    });
});

Deno.test("nip19 private key", async (t) => {
    const key = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const nsec = "nsec1424242424242424242424242424242424242424242424242424q3dgem8";

    const pkey = PrivateKey.FromHex(key);
    if (pkey instanceof Error) fail();
    assertEquals(key, pkey.hex);
    assertEquals(nsec, pkey.bech32);

    const pkey2 = PrivateKey.FromBech32(nsec);
    if (pkey2 instanceof Error) fail();
    assertEquals(pkey.hex, pkey2.hex);
    assertEquals(nsec, pkey2.bech32);

    const pkey3 = PrivateKey.FromHex("");
    assertIsError(pkey3);
    const pkey4 = PrivateKey.FromBech32(key);
    assertIsError(pkey4);

    await t.step("Invalid checksum", () => {
        const key = "nsec1alwevw7n7xxapp4g7c2v3l5qr7zkmxjrhlwqteh6rkh2527gm3qqgj3jh";
        const pri = PrivateKey.FromBech32(key) as Error;
        assertEquals(pri instanceof Error, true);
        assertEquals(
            pri.message,
            `Invalid checksum in nsec1alwevw7n7xxapp4g7c2v3l5qr7zkmxjrhlwqteh6rkh2527gm3qqgj3jh: expected "29r5am"`,
        );
    });

    await t.step("private key from string", () => {
        const pri = PrivateKey.Generate();
        const pri_1 = PrivateKey.FromString(pri.bech32) as PrivateKey;
        const pri_2 = PrivateKey.FromString(pri.hex) as PrivateKey;
        assertEquals(pri_1.hex, pri_2.hex);
        assertEquals(pri_1.bech32, pri_2.bech32);
    });
});

Deno.test("nip19 note", async () => {
    const note = "note16rqxdnalykdjm422plpc8056a2w9r5g8w6f9cy8ct9tfa5c493nqkp2ypm";
    const hex = "d0c066cfbf259b2dd54a0fc383be9aea9c51d10776925c10f859569ed3152c66";
    {
        const noteID = NoteID.FromBech32(note) as NoteID;
        assertEquals(noteID.hex, hex);
        assertEquals(noteID.bech32(), note);
    }
    {
        const noteID = NoteID.FromHex(hex) as NoteID;
        assertEquals(noteID.hex, hex);
        assertEquals(noteID.bech32(), note);
    }
    {
        const noteID1 = NoteID.FromString(hex) as NoteID;
        const noteID2 = NoteID.FromString(note) as NoteID;
        assertEquals(noteID1.hex, noteID2.hex);
        assertEquals(noteID1.hex, hex);
        assertEquals(noteID1.bech32(), noteID2.bech32());
        assertEquals(noteID1.bech32(), note);
    }
});
Deno.test("nip19 naddr", async () => {
    const identifier = "h5nqKSYouPcq1ZcUBbU8C";
    const kind = NostrKind.Long_Form;
    const relays: string[] = [];
    const pubkeyhex = PrivateKey.Generate().toPublicKey();
    const addressPointer: AddressPointer = {
        identifier: identifier,
        kind: kind,
        relays: relays,
        pubkey: pubkeyhex,
    };

    const nostraddress = new NostrAddress(addressPointer);
    const naddr_encoded = nostraddress.encode();
    if (naddr_encoded instanceof Error) {
        fail(naddr_encoded.message);
    }

    const naddr_decoded = NostrAddress.decode(naddr_encoded);
    if (naddr_decoded instanceof Error) {
        fail(naddr_decoded.message);
    }

    assertEquals(naddr_decoded.addr, addressPointer);
});

Deno.test("nevent", async () => {
    const relays: string[] = [
        "wss://yabu.me",
    ];
    const pubkeyhex = PrivateKey.Generate().toPublicKey();

    {
        const eventPointer: EventPointer = {
            id: "25524798c2182d1b20c87ba208aa5085a7ba34c9b54eb851977f7206591ab407",
            kind: NostrKind.META_DATA, // 0
            relays: relays,
            pubkey: pubkeyhex,
        };

        const nostrevent = new Nevent(eventPointer);
        const nevent_encoded = nostrevent.encode();
        const nevent_decoded = Nevent.decode(nevent_encoded);
        if (nevent_decoded instanceof Error) fail(nevent_decoded.message);

        assertEquals(nevent_decoded.pointer, eventPointer);
    }
    {
        const eventPointer: EventPointer = {
            id: "25524798c2182d1b20c87ba208aa5085a7ba34c9b54eb851977f7206591ab407",
            relays: relays,
            pubkey: pubkeyhex,
        };

        const nostrevent = new Nevent(eventPointer);
        const nevent_encoded = nostrevent.encode();
        const nevent_decoded = Nevent.decode(nevent_encoded);
        if (nevent_decoded instanceof Error) fail(nevent_decoded.message);

        assertEquals(nevent_decoded.pointer, eventPointer);
    }
});

Deno.test("nip19 nprofile", async (t) => {
    await t.step("success case", () => {
        const pubkey = PrivateKey.Generate().toPublicKey();
        const nProfile = new NostrProfile(pubkey, relays);

        const encoded_nProfile = nProfile.encode();
        if (encoded_nProfile instanceof Error) {
            fail(encoded_nProfile.message);
        }

        const decoded_nProfile = NostrProfile.decode(encoded_nProfile);
        if (decoded_nProfile instanceof Error) {
            fail(decoded_nProfile.message);
        }

        assertEquals(decoded_nProfile.pubkey.hex, nProfile.pubkey.hex);
        assertEquals(decoded_nProfile.relays, nProfile.relays);
    });

    await t.step("failure case", () => {
        const randomnProfile = "nprofilexxxxxxxx";
        const decode_random = NostrProfile.decode(randomnProfile);
        if (decode_random instanceof Error) {
            assertEquals(
                decode_random.message,
                `failed to decode ${randomnProfile}, Letter "1" must be present between prefix and data only`,
            );
        } else {
            fail();
        }
    });
});

Deno.test("point is not on curve", () => {
    const hex = "ac68c5e86deed0cc0f5b36ddb7eda5d5a1c59f9cc773453a986141a02430de3a";
    const err_message =
        "key 'ac68c5e86deed0cc0f5b36ddb7eda5d5a1c59f9cc773453a986141a02430de3a' is invalid, reason: Cannot find square root";
    {
        const key1 = PublicKey.FromHex(hex) as Error;
        assertEquals(key1.message, err_message);

        const key2 = PublicKey.FromString(hex) as Error;
        assertEquals(key2.message, err_message);
    }
    {
        const key1 = PrivateKey.FromHex(hex) as PrivateKey;
        assertEquals(key1.hex, hex);

        const key2 = PrivateKey.FromString(hex) as PrivateKey;
        assertEquals(key2, key1);

        const pub1 = key1.toPublicKey();
        const pub2 = PublicKey.FromString(pub1.bech32()) as PublicKey;
        const pub3 = PublicKey.FromString(pub1.hex) as PublicKey;
        assertEquals(pub2, pub3);
        assertEquals(pub1, pub2);
    }
});
