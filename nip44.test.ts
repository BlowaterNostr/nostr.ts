import nip44 from "./nip44.ts";
import { bytesToHex, hexToBytes } from "https://esm.sh/@noble/hashes@1.3.3/utils";
import { default as vec } from "./nip44.json" assert { type: "json" };
import { schnorr } from "https://esm.sh/@noble/curves@1.3.0/secp256k1";
import { assertEquals, assertMatch, fail } from "@std/assert";
const v2vec = vec.v2;

Deno.test("get_conversation_key", () => {
    for (const v of v2vec.valid.get_conversation_key) {
        const key = nip44.getConversationKey(v.sec1, v.pub2);
        if (key instanceof Error) fail(key.message);

        assertEquals(bytesToHex(key), v.conversation_key);
    }
});

Deno.test("encrypt_decrypt", () => {
    for (const v of v2vec.valid.encrypt_decrypt) {
        const pub2 = bytesToHex(schnorr.getPublicKey(v.sec2));
        const key = nip44.getConversationKey(v.sec1, pub2);
        if (key instanceof Error) fail(key.message);

        assertEquals(bytesToHex(key), v.conversation_key);
        const ciphertext = nip44.encrypt(v.plaintext, key, hexToBytes(v.nonce));
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
        const err = nip44.decrypt(v.payload, hexToBytes(v.conversation_key)) as Error;
        assertMatch(err.message, new RegExp(v.note));
    }
});

Deno.test("get_conversation_key", async () => {
    for (const v of v2vec.invalid.get_conversation_key) {
        const err = nip44.getConversationKey(v.sec1, v.pub2) as Error;
        assertMatch(err.message, /Cannot find square root|Point is not on curve/);
    }
});
