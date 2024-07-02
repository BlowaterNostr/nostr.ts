import { bech32 } from "./scure.ts";
import { decodeHex, encodeHex } from "@std/encoding";
import { utils } from "@noble/secp256k1";
import { schnorr } from "@noble/curves/secp256k1";

export class PrivateKey {
    static Generate() {
        const pri = utils.randomPrivateKey();
        const key = new PrivateKey(pri);
        return key;
    }

    static FromHex(key: string) {
        if (!isValidHexKey(key)) {
            return new Error(`${key} is not valid`);
        }
        const hex = decodeHex(key);
        return new PrivateKey(hex);
    }

    static FromBech32(key: string) {
        if (key.substring(0, 4) === "nsec") {
            try {
                const code = bech32.decode(key, 1500);
                const data = new Uint8Array(bech32.fromWords(code.words));
                const hex = encodeHex(data);
                return PrivateKey.FromHex(hex);
            } catch (e) {
                return e as Error;
            }
        }
        return new Error(`${key} is not valid`);
    }

    static FromString(raw: string) {
        const key = PrivateKey.FromBech32(raw);
        if (key instanceof Error) {
            return PrivateKey.FromHex(raw);
        }
        return key;
    }

    public readonly bech32: string;
    public readonly hex: string;

    private constructor(private key: Uint8Array) {
        this.hex = encodeHex(key);
        const words = bech32.toWords(key);
        this.bech32 = bech32.encode("nsec", words, 1500);
    }

    toPublicKey(): PublicKey {
        const pub_bytes = schnorr.getPublicKey(this.key);
        const pub = PublicKey.FromHex(encodeHex(pub_bytes));
        if (pub instanceof Error) {
            throw pub; // impossible
        }
        return pub;
    }
}

export class PublicKey {
    static FromString(key: string) {
        if (!isValidPublicKey(key)) {
            return new InvalidKey(key);
        }
        const hex = publicKeyHexFromNpub(key);
        if (hex instanceof Error) {
            return hex;
        }
        return new PublicKey(hex);
    }

    static FromHex(key: string) {
        if (!isValidPublicKey(key)) {
            return new InvalidKey(key);
        }
        return new PublicKey(key);
    }

    static FromBech32(key: string) {
        const hex = publicKeyHexFromNpub(key);
        if (hex instanceof Error) {
            return hex;
        }
        return new PublicKey(hex);
    }

    bech32(): string {
        const array = decodeHex(this.hex);
        const words = bech32.toWords(array);
        return bech32.encode("npub", words, 1500);
    }

    public readonly hex: string;

    private constructor(key: string) {
        this.hex = key;
    }
}

function publicKeyHexFromNpub(key: string) {
    try {
        const ok = isValidPublicKey(key);
        if (!ok) {
            return new InvalidKey(key);
        }
        if (key.substring(0, 4) === "npub") {
            const code = bech32.decode(key, 1500);
            const data = new Uint8Array(bech32.fromWords(code.words));
            return encodeHex(data);
        }
        return key;
    } catch (e) {
        return e as Error;
    }
}

function isValidPublicKey(key: string) {
    return /^[0-9a-f]{64}$/.test(key) || /^npub[0-9a-z]{59}$/.test(key);
}

export function isValidHexKey(key: string) {
    return /^[0-9a-f]{64}$/.test(key);
}

export class InvalidKey extends Error {
    constructor(key: string) {
        super(`key '${key}' is invalid`);
        this.name = "InvalidKey";
    }
}
