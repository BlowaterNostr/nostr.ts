import { Cipher } from '../utils.js';
/**
 * Secure PRNG. Uses `crypto.getRandomValues`, which defers to OS.
 */
export declare function randomBytes(bytesLength?: number): Uint8Array;
export declare function getWebcryptoSubtle(): any;
type RemoveNonceInner<T extends any[], Ret> = ((...args: T) => Ret) extends (arg0: any, arg1: any, ...rest: infer R) => any ? (key: Uint8Array, ...args: R) => Ret : never;
type RemoveNonce<T extends (...args: any) => any> = RemoveNonceInner<Parameters<T>, ReturnType<T>>;
type CipherWithNonce = ((key: Uint8Array, nonce: Uint8Array, ...args: any[]) => Cipher) & {
    nonceLength: number;
};
export declare function managedNonce<T extends CipherWithNonce>(fn: T): RemoveNonce<T>;
export {};
//# sourceMappingURL=utils.d.ts.map