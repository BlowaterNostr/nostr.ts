import { AsyncCipher } from '../utils.js';
export declare const utils: {
    encrypt(key: Uint8Array, keyParams: any, cryptParams: any, plaintext: Uint8Array): Promise<Uint8Array>;
    decrypt(key: Uint8Array, keyParams: any, cryptParams: any, ciphertext: Uint8Array): Promise<Uint8Array>;
};
export declare const cbc: (key: Uint8Array, nonce: Uint8Array, AAD?: Uint8Array) => AsyncCipher;
export declare const ctr: (key: Uint8Array, nonce: Uint8Array, AAD?: Uint8Array) => AsyncCipher;
export declare const gcm: (key: Uint8Array, nonce: Uint8Array, AAD?: Uint8Array) => AsyncCipher;
//# sourceMappingURL=aes.d.ts.map