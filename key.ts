import * as secp256k1 from "https://esm.sh/v106/@noble/secp256k1@1.7.1/es2022/secp256k1.js";
import { bech32 } from "./scure.js";

// NIP 1 https://github.com/nostr-protocol/nips/blob/master/01.md
export function generatePrivateKey(): string {
    return secp256k1.utils.bytesToHex(secp256k1.utils.randomPrivateKey());
}

export function toPublicKey(privateKey: string): string {
    return secp256k1.utils.bytesToHex(
        secp256k1.schnorr.getPublicKey(privateKey),
    );
}

export function isValidHexKey(key: string) {
    return /^[0-9a-f]{64}$/.test(key);
}

export function publicKeyFromNpub(key: string) {
    if (key.substring(0, 4) === "npub") {
        const code = bech32.decode(key, 1500);
        const data = new Uint8Array(bech32.fromWords(code.words));
        return secp256k1.utils.bytesToHex(data);
    }
    return key;
}

export class PrivateKey {
    static Generate() {
        const str = generatePrivateKey();
        const key = PrivateKey.FromHex(str);
        if (key instanceof Error) {
            throw key; // impossible
        }
        return key;
    }

    static FromHex(key: string) {
        if (!isValidHexKey(key)) {
            return new Error(`${key} is not valid`);
        }
        return new PrivateKey(key);
    }

    static FromBech32(key: string) {
        if (key.substring(0, 4) === "nsec") {
            const code = bech32.decode(key, 1500);
            const data = new Uint8Array(bech32.fromWords(code.words));
            const hex = secp256k1.utils.bytesToHex(data);
            return PrivateKey.FromHex(hex);
        }
        return new Error(`${key} is not valid`);
    }

    public readonly bech32: string;
    public readonly hex: string;

    private constructor(key: string) {
        const array = secp256k1.utils.hexToBytes(key);
        const words = bech32.toWords(array);
        this.bech32 = bech32.encode("nsec", words, 1500);
        this.hex = key;
    }
}

export class InvalidKey extends Error {
    constructor(key: string) {
        super(`${key} is invalid`);
        this.name = "InvalidKey";
    }
}

export class PublicKey {
    static FromString(key: string) {
        if (!isValidPublicKey(key)) {
            return new InvalidKey(key);
        }
        return new PublicKey(publicKeyFromNpub(key));
    }

    static FromHex(key: string) {
        if (!isValidPublicKey(key)) {
            return new InvalidKey(key);
        }
        return new PublicKey(key);
    }

    static FromBech32(key: string) {
        return new PublicKey(publicKeyFromNpub(key));
    }

    public readonly bech32: string;
    public readonly hex: string;

    private constructor(key: string) {
        const array = secp256k1.utils.hexToBytes(key);
        const words = bech32.toWords(array);
        this.bech32 = bech32.encode("npub", words, 1500);
        this.hex = key;
    }
}

function isValidPublicKey(key: string) {
    return /^[0-9a-f]{64}$/.test(key) || /^npub[0-9a-z]{59}$/.test(key);
}
