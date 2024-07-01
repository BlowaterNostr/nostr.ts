import { getWebcryptoSubtle } from './utils.js';
import { ensureBytes } from '../utils.js';
// Overridable
export const utils = {
    async encrypt(key, keyParams, cryptParams, plaintext) {
        const cr = getWebcryptoSubtle();
        const iKey = await cr.importKey('raw', key, keyParams, true, ['encrypt']);
        const ciphertext = await cr.encrypt(cryptParams, iKey, plaintext);
        return new Uint8Array(ciphertext);
    },
    async decrypt(key, keyParams, cryptParams, ciphertext) {
        const cr = getWebcryptoSubtle();
        const iKey = await cr.importKey('raw', key, keyParams, true, ['decrypt']);
        const plaintext = await cr.decrypt(cryptParams, iKey, ciphertext);
        return new Uint8Array(plaintext);
    },
};
function getCryptParams(algo, nonce, AAD) {
    if (algo === "AES-CBC" /* BlockMode.CBC */)
        return { name: "AES-CBC" /* BlockMode.CBC */, iv: nonce };
    if (algo === "AES-CTR" /* BlockMode.CTR */)
        return { name: "AES-CTR" /* BlockMode.CTR */, counter: nonce, length: 64 };
    if (algo === "AES-GCM" /* BlockMode.GCM */)
        return { name: "AES-GCM" /* BlockMode.GCM */, iv: nonce, additionalData: AAD };
    throw new Error('unknown aes block mode');
}
function generate(algo) {
    return (key, nonce, AAD) => {
        ensureBytes(key);
        ensureBytes(nonce);
        // const keyLength = key.length;
        const keyParams = { name: algo, length: key.length * 8 };
        const cryptParams = getCryptParams(algo, nonce, AAD);
        return {
            // keyLength,
            encrypt(plaintext) {
                ensureBytes(plaintext);
                return utils.encrypt(key, keyParams, cryptParams, plaintext);
            },
            decrypt(ciphertext) {
                ensureBytes(ciphertext);
                return utils.decrypt(key, keyParams, cryptParams, ciphertext);
            },
        };
    };
}
export const cbc = generate("AES-CBC" /* BlockMode.CBC */);
export const ctr = generate("AES-CTR" /* BlockMode.CTR */);
export const gcm = generate("AES-GCM" /* BlockMode.GCM */);
//# sourceMappingURL=aes.js.map