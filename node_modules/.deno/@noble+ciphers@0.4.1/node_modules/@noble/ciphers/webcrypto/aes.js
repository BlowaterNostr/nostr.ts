"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.gcm = exports.ctr = exports.cbc = exports.utils = void 0;
const utils_js_1 = require("./utils.js");
const utils_js_2 = require("../utils.js");
// Overridable
exports.utils = {
    async encrypt(key, keyParams, cryptParams, plaintext) {
        const cr = (0, utils_js_1.getWebcryptoSubtle)();
        const iKey = await cr.importKey('raw', key, keyParams, true, ['encrypt']);
        const ciphertext = await cr.encrypt(cryptParams, iKey, plaintext);
        return new Uint8Array(ciphertext);
    },
    async decrypt(key, keyParams, cryptParams, ciphertext) {
        const cr = (0, utils_js_1.getWebcryptoSubtle)();
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
        (0, utils_js_2.ensureBytes)(key);
        (0, utils_js_2.ensureBytes)(nonce);
        // const keyLength = key.length;
        const keyParams = { name: algo, length: key.length * 8 };
        const cryptParams = getCryptParams(algo, nonce, AAD);
        return {
            // keyLength,
            encrypt(plaintext) {
                (0, utils_js_2.ensureBytes)(plaintext);
                return exports.utils.encrypt(key, keyParams, cryptParams, plaintext);
            },
            decrypt(ciphertext) {
                (0, utils_js_2.ensureBytes)(ciphertext);
                return exports.utils.decrypt(key, keyParams, cryptParams, ciphertext);
            },
        };
    };
}
exports.cbc = generate("AES-CBC" /* BlockMode.CBC */);
exports.ctr = generate("AES-CTR" /* BlockMode.CTR */);
exports.gcm = generate("AES-GCM" /* BlockMode.GCM */);
//# sourceMappingURL=aes.js.map