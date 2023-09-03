import {
    assertEquals,
    assertIsError,
    fail,
} from "https://deno.land/std@0.176.0/testing/asserts.ts";
import { PrivateKey, PublicKey } from "./key.ts";
import { AddressPointer, NostrAddress, NostrProfile, NoteID } from "./nip19.ts";
import { relays } from "./relay-list.test.ts";

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
    const naddr =
        "naddr1qq2ksdtww994xkt0w4gxxuf3tf342snz25uyxq3qmqcwu7muxz3kfvfyfdme47a579t8x0lm3jrjx5yxuf4sknnpe43qxpqqqp65wq55g62";
    const identifier = "h5nqKSYouPcq1ZcUBbU8C";
    const kind = 30023;
    const relays: string[] = [];
    const pubkeyhex = "d830ee7b7c30a364b1244b779afbb4f156733ffb8c87235086e26b0b4e61cd62";
    const addressPointer: AddressPointer = {
        identifier: identifier,
        kind: kind,
        relays: relays,
        pubkey: pubkeyhex,
    };
    {
        const nostraddress = new NostrAddress(addressPointer);
        const naddr_encode = nostraddress.encode();
        assertEquals(naddr_encode, naddr);
    }
    {
        const naddr_decode = NostrAddress.decode(naddr) as NostrAddress;

        assertEquals(naddr_decode.addr, addressPointer);
    }
});

Deno.test("nip19 nprofile", async () => {
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
