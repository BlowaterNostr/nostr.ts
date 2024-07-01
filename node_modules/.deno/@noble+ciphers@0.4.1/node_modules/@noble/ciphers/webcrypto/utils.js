"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.managedNonce = exports.getWebcryptoSubtle = exports.randomBytes = void 0;
// We use WebCrypto aka globalThis.crypto, which exists in browsers and node.js 16+.
// node.js versions earlier than v19 don't declare it in global scope.
// For node.js, package.js on#exports field mapping rewrites import
// from `crypto` to `cryptoNode`, which imports native module.
// Makes the utils un-importable in browsers without a bundler.
// Once node.js 18 is deprecated, we can just drop the import.
const crypto_1 = require("@noble/ciphers/webcrypto/crypto");
const utils_js_1 = require("../utils.js");
const _assert_js_1 = require("../_assert.js");
/**
 * Secure PRNG. Uses `crypto.getRandomValues`, which defers to OS.
 */
function randomBytes(bytesLength = 32) {
    if (crypto_1.crypto && typeof crypto_1.crypto.getRandomValues === 'function') {
        return crypto_1.crypto.getRandomValues(new Uint8Array(bytesLength));
    }
    throw new Error('crypto.getRandomValues must be defined');
}
exports.randomBytes = randomBytes;
function getWebcryptoSubtle() {
    if (crypto_1.crypto && typeof crypto_1.crypto.subtle === 'object' && crypto_1.crypto.subtle != null)
        return crypto_1.crypto.subtle;
    throw new Error('crypto.subtle must be defined');
}
exports.getWebcryptoSubtle = getWebcryptoSubtle;
// Uses CSPRG for nonce, nonce injected in ciphertext
function managedNonce(fn) {
    (0, _assert_js_1.number)(fn.nonceLength);
    return ((key, ...args) => ({
        encrypt: (plaintext, ...argsEnc) => {
            const { nonceLength } = fn;
            const nonce = randomBytes(nonceLength);
            const ciphertext = fn(key, nonce, ...args).encrypt(plaintext, ...argsEnc);
            const out = (0, utils_js_1.concatBytes)(nonce, ciphertext);
            ciphertext.fill(0);
            return out;
        },
        decrypt: (ciphertext, ...argsDec) => {
            const { nonceLength } = fn;
            const nonce = ciphertext.subarray(0, nonceLength);
            const data = ciphertext.subarray(nonceLength);
            return fn(key, nonce, ...args).decrypt(data, ...argsDec);
        },
    }));
}
exports.managedNonce = managedNonce;
// // Type tests
// import { siv, gcm, ctr, ecb, cbc } from '../aes.js';
// import { xsalsa20poly1305 } from '../salsa.js';
// import { chacha20poly1305, xchacha20poly1305 } from '../chacha.js';
// const wsiv = managedNonce(siv);
// const wgcm = managedNonce(gcm);
// const wctr = managedNonce(ctr);
// const wcbc = managedNonce(cbc);
// const wsalsapoly = managedNonce(xsalsa20poly1305);
// const wchacha = managedNonce(chacha20poly1305);
// const wxchacha = managedNonce(xchacha20poly1305);
// // should fail
// const wcbc2 = managedNonce(managedNonce(cbc));
// const wecb = managedNonce(ecb);
//# sourceMappingURL=utils.js.map