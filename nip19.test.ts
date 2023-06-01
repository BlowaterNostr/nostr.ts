import { assertEquals, assertIsError, fail } from "https://deno.land/std@0.176.0/testing/asserts.ts";
import { PrivateKey, PublicKey, toPublicKeyHex } from "./key.ts";

Deno.test("nip19 public key", () => {
    const key = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const npub = "npub1424242424242424242424242424242424242424242424242424qamrcaj";

    const pkey = PublicKey.FromHex(key);
    if (pkey instanceof Error) fail();
    assertEquals(key, pkey.hex);
    assertEquals(npub, pkey.bech32);

    const pkey2 = PublicKey.FromBech32(npub);
    if (pkey2 instanceof Error) fail();
    assertEquals(pkey.hex, pkey2.hex);
    assertEquals(npub, pkey2.bech32);

    const pkey3 = PublicKey.FromHex("");
    assertIsError(pkey3);

    const pkey4 = PublicKey.FromString(key);
    if (pkey4 instanceof Error) fail();
    const pkey5 = PublicKey.FromString(npub);
    if (pkey5 instanceof Error) fail();

    assertEquals(pkey4.hex, pkey5.hex);
});

Deno.test("nip19 private key", () => {
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
});
