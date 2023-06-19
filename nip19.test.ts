import { assertEquals, assertIsError, fail } from "https://deno.land/std@0.176.0/testing/asserts.ts";
import { PrivateKey, PublicKey, toPublicKeyHex } from "./key.ts";

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

    assertEquals(pkey.toPublicKey().hex, toPublicKeyHex(pkey.hex));

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
