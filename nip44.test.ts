import * as nip44 from "./nip44.ts";
import { default as vec } from "./nip44.json" with { type: "json" };
import { schnorr } from "@noble/curves/secp256k1";
import { assertEquals, assertMatch, fail } from "@std/assert";
import { decodeHex, encodeHex } from "@std/encoding";
const v2vec = vec.v2;

Deno.test("get_conversation_key", () => {
    for (const v of v2vec.valid.get_conversation_key) {
        const key = nip44.getConversationKey(v.sec1, v.pub2);
        if (key instanceof Error) fail(key.message);

        assertEquals(encodeHex(key), v.conversation_key);
    }
});

Deno.test("encrypt_decrypt", () => {
    for (const v of v2vec.valid.encrypt_decrypt) {
        const pub2 = encodeHex(schnorr.getPublicKey(v.sec2));
        const key = nip44.getConversationKey(v.sec1, pub2);
        if (key instanceof Error) fail(key.message);

        assertEquals(encodeHex(key), v.conversation_key);
        const ciphertext = nip44.encrypt(v.plaintext, key, decodeHex(v.nonce));
        if (ciphertext instanceof Error) {
            fail(ciphertext.message);
        }
        assertEquals(ciphertext, v.payload);
        const decrypted = nip44.decrypt(ciphertext, key);
        assertEquals(decrypted, v.plaintext);
    }
});

Deno.test("calc_padded_len", () => {
    for (const [len, shouldBePaddedTo] of v2vec.valid.calc_padded_len) {
        const actual = nip44.calcPaddedLen(len);
        assertEquals(actual, shouldBePaddedTo);
    }
});

Deno.test("decrypt", async () => {
    for (const v of v2vec.invalid.decrypt) {
        const err = nip44.decrypt(v.payload, decodeHex(v.conversation_key)) as Error;
        assertMatch(err.message, new RegExp(v.note));
    }
});

Deno.test("get_conversation_key", async () => {
    for (const v of v2vec.invalid.get_conversation_key) {
        const err = nip44.getConversationKey(v.sec1, v.pub2) as Error;
        assertMatch(err.message, /Cannot find square root|Point is not on curve/);
    }
});
