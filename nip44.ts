import { decodeBase64, encodeBase64 } from "@std/encoding";

import { chacha20 } from "@noble/ciphers/chacha";
import { ensureBytes, equalBytes } from "@noble/ciphers/utils";
import { expand as hkdf_expand, extract as hkdf_extract } from "@noble/hashes/hkdf";
import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha256";
import { concatBytes, randomBytes } from "@noble/hashes/utils";
import { secp256k1 } from "@noble/curves/secp256k1";

const decoder = new TextDecoder();
const encoder = new TextEncoder();

const minPlaintextSize = 0x0001; // 1b msg => padded to 32b
const maxPlaintextSize = 0xffff; // 65535 (64kb-1) => padded to 64kb

export function encrypt(
    plaintext: string,
    conversationKey: Uint8Array,
    nonce = randomBytes(32),
): string | Error {
    const { chacha_key, chacha_nonce, hmac_key } = getMessageKeys(conversationKey, nonce);
    const padded = pad(plaintext);
    if (padded instanceof Error) {
        return padded;
    }
    const ciphertext = chacha20(chacha_key, chacha_nonce, padded);
    const mac = hmacAad(hmac_key, ciphertext, nonce);
    if (mac instanceof Error) {
        return mac;
    }
    return encodeBase64(concatBytes(new Uint8Array([2]), nonce, ciphertext, mac));
}

export function decrypt(payload: string, conversationKey: Uint8Array): string | Error {
    const decoded = decodePayload(payload);
    if (decoded instanceof Error) {
        return decoded;
    }
    const { nonce, ciphertext, mac } = decoded;
    const { chacha_key, chacha_nonce, hmac_key } = getMessageKeys(conversationKey, nonce);
    const calculatedMac = hmacAad(hmac_key, ciphertext, nonce);
    if (calculatedMac instanceof Error) {
        return calculatedMac;
    }
    if (!equalBytes(calculatedMac, mac)) {
        return new Error("invalid MAC");
    }
    const padded = chacha20(chacha_key, chacha_nonce, ciphertext);
    return unpad(padded);
}

export function getConversationKey(privkeyA: string, pubkeyB: string): Uint8Array | Error {
    try {
        const sharedX = secp256k1.getSharedSecret(privkeyA, "02" + pubkeyB).subarray(1, 33);
        return hkdf_extract(sha256, sharedX, "nip44-v2");
    } catch (e) {
        if (e instanceof Error == false) {
            throw e; // impossible
        }
        return e;
    }
}

export function calcPaddedLen(len: number): number | Error {
    if (!Number.isSafeInteger(len) || len < 1) return new Error("expected positive integer");
    if (len <= 32) return 32;
    const nextPower = 1 << (Math.floor(Math.log2(len - 1)) + 1);
    const chunk = nextPower <= 256 ? 32 : nextPower / 8;
    return chunk * (Math.floor((len - 1) / chunk) + 1);
}

function pad(plaintext: string): Uint8Array | Error {
    const unpadded = encoder.encode(plaintext);
    const unpaddedLen = unpadded.length;
    const prefix = writeU16BE(unpaddedLen);
    if (prefix instanceof Error) return prefix;
    const padded_len = calcPaddedLen(unpaddedLen);
    if (padded_len instanceof Error) {
        return padded_len;
    }
    const suffix = new Uint8Array(padded_len - unpaddedLen);
    return concatBytes(prefix, unpadded, suffix);
}

function writeU16BE(num: number) {
    if (!Number.isSafeInteger(num) || num < minPlaintextSize || num > maxPlaintextSize) {
        return new Error("invalid plaintext size: must be between 1 and 65535 bytes");
    }
    const arr = new Uint8Array(2);
    new DataView(arr.buffer).setUint16(0, num, false);
    return arr;
}

function unpad(padded: Uint8Array): string | Error {
    const unpaddedLen = new DataView(padded.buffer).getUint16(0);
    const unpadded = padded.subarray(2, 2 + unpaddedLen);
    if (
        unpaddedLen < minPlaintextSize ||
        unpaddedLen > maxPlaintextSize ||
        unpadded.length !== unpaddedLen
    ) {
        return new Error("invalid padding");
    }
    const padded_len = calcPaddedLen(unpaddedLen);
    if (padded_len instanceof Error) {
        return padded_len;
    }
    if (padded.length !== 2 + padded_len) {
        return new Error("invalid padding");
    }
    return decoder.decode(unpadded);
}

// metadata: always 65b (version: 1b, nonce: 32b, max: 32b)
// plaintext: 1b to 0xffff
// padded plaintext: 32b to 0xffff
// ciphertext: 32b+2 to 0xffff+2
// raw payload: 99 (65+32+2) to 65603 (65+0xffff+2)
// compressed payload (base64): 132b to 87472b
function decodePayload(payload: string) {
    if (typeof payload !== "string") return new Error("payload must be a valid string");
    const plen = payload.length;
    if (plen < 132 || plen > 87472) return new Error("invalid payload length: " + plen);
    if (payload[0] === "#") return new Error("unknown encryption version");
    let data: Uint8Array;
    try {
        data = decodeBase64(payload);
    } catch (error) {
        if (error instanceof Error == false) {
            throw error; // impossible
        }
        return new Error("invalid base64: " + error.message);
    }
    const dlen = data.length;
    if (dlen < 99 || dlen > 65603) return new Error("invalid data length: " + dlen);
    const vers = data[0];
    if (vers !== 2) return new Error("unknown encryption version " + vers);
    return {
        nonce: data.subarray(1, 33),
        ciphertext: data.subarray(33, -32),
        mac: data.subarray(-32),
    };
}

function getMessageKeys(conversationKey: Uint8Array, nonce: Uint8Array) {
    ensureBytes(conversationKey, 32);
    ensureBytes(nonce, 32);
    const keys = hkdf_expand(sha256, conversationKey, nonce, 76);
    return {
        chacha_key: keys.subarray(0, 32),
        chacha_nonce: keys.subarray(32, 44),
        hmac_key: keys.subarray(44, 76),
    };
}

function hmacAad(key: Uint8Array, message: Uint8Array, aad: Uint8Array) {
    if (aad.length !== 32) return new Error("AAD associated data must be 32 bytes");
    const combined = concatBytes(aad, message);
    return hmac(sha256, key, combined);
}
