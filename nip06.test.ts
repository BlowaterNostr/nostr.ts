import { assertEquals, assertNotInstanceOf } from "https://deno.land/std@0.176.0/testing/asserts.ts";
import { generateSeedWords, privateKeyFromSeedWords, validateWords } from "./nip06.ts";
import { PrivateKey } from "./key.ts";

Deno.test("generate private key from a mnemonic", async () => {
    const mnemonic = "zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong";
    const privateKey = privateKeyFromSeedWords(mnemonic) as PrivateKey;
    assertEquals(privateKey.hex, "c26cf31d8ba425b555ca27d00ca71b5008004f2f662470f8c8131822ec129fe2");
});

Deno.test("generate private key from a mnemonic and passphrase", async () => {
    const mnemonic = "zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong";
    const passphrase = "123";
    const privateKey = privateKeyFromSeedWords(mnemonic, passphrase) as PrivateKey;
    assertEquals(privateKey.hex, "55a22b8203273d0aaf24c22c8fbe99608e70c524b17265641074281c8b978ae4");
});

Deno.test("generateSeedWords & validateWords", async () => {
    for (const bitsize of [128, 192, 256]) {
        const words = generateSeedWords(bitsize as 128 | 192 | 256);
        assertEquals(true, validateWords(words));
        const privateKey = privateKeyFromSeedWords(words);
        assertNotInstanceOf(privateKey, Error, `${bitsize}`);
    }
});
