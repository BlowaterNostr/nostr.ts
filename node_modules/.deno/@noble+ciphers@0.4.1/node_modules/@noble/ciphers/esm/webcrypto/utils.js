// We use WebCrypto aka globalThis.crypto, which exists in browsers and node.js 16+.
// node.js versions earlier than v19 don't declare it in global scope.
// For node.js, package.js on#exports field mapping rewrites import
// from `crypto` to `cryptoNode`, which imports native module.
// Makes the utils un-importable in browsers without a bundler.
// Once node.js 18 is deprecated, we can just drop the import.
import { crypto } from '@noble/ciphers/webcrypto/crypto';
import { concatBytes } from '../utils.js';
import { number } from '../_assert.js';
/**
 * Secure PRNG. Uses `crypto.getRandomValues`, which defers to OS.
 */
export function randomBytes(bytesLength = 32) {
    if (crypto && typeof crypto.getRandomValues === 'function') {
        return crypto.getRandomValues(new Uint8Array(bytesLength));
    }
    throw new Error('crypto.getRandomValues must be defined');
}
export function getWebcryptoSubtle() {
    if (crypto && typeof crypto.subtle === 'object' && crypto.subtle != null)
        return crypto.subtle;
    throw new Error('crypto.subtle must be defined');
}
// Uses CSPRG for nonce, nonce injected in ciphertext
export function managedNonce(fn) {
    number(fn.nonceLength);
    return ((key, ...args) => ({
        encrypt: (plaintext, ...argsEnc) => {
            const { nonceLength } = fn;
            const nonce = randomBytes(nonceLength);
            const ciphertext = fn(key, nonce, ...args).encrypt(plaintext, ...argsEnc);
            const out = concatBytes(nonce, ciphertext);
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