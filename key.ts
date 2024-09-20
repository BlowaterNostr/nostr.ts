import { bech32 } from "./scure.ts";
import { decodeHex, encodeHex } from "@std/encoding";
import { getPublicKey, ProjectivePoint, utils } from "@noble/secp256k1";

/**
 * see examples [here](./tests/example.test.ts)
 */
export class PrivateKey {
    static Generate() {
        const pri = utils.randomPrivateKey();
        const key = new PrivateKey(pri);
        return key;
    }

    static FromHex(key: string) {
        const err = isValidHexKey(key);
        if (err instanceof Error) {
            return err;
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
        console.log("pri key", this.hex.length)
        const words = bech32.toWords(key);
        this.bech32 = bech32.encode("nsec", words, 1500);
    }

    toPublicKey(): PublicKey {
        const pub_bytes = getPublicKey(this.key, true);
        const _2 = getPublicKey(this.key, false)
        console.log("pub len", pub_bytes.length, _2.length)
        const hex = encodeHex(pub_bytes)
        console.log(hex.length, encodeHex(_2).length)
        const pub = PublicKey.FromHex(hex);
        if (pub instanceof Error) {
            throw pub; // impossible
        }
        return pub;
    }
}

/**
 * see examples [here](./tests/example.test.ts)
 */
export class PublicKey {
    static FromString(key: string) {
        const pub = PublicKey.FromBech32(key);
        if (pub instanceof Error) {
            return PublicKey.FromHex(key);
        }
        return pub;
    }

    static FromHex(key: string) {
        const err = isValidHexKey(key);
        if (err instanceof Error) {
            return err;
        }
        try {
            ProjectivePoint.fromHex(key);
        } catch (e) {
            return e as Error;
        }
        return new PublicKey(key);
    }

    static FromBech32(key: string) {
        if (key.substring(0, 4) != "npub") {
            return new Error(`${key} is not a npub`);
        }
        const code = bech32.decode(key, 1500);
        const data = new Uint8Array(bech32.fromWords(code.words));
        const hex = encodeHex(data);
        return PublicKey.FromHex(hex);
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

// function publicKeyHexFromNpub(key: string) {
//     try {
//         const ok = isValidPublicKey(key);
//         if (!ok) {
//             return new InvalidKey(key);
//         }
//         if (key.substring(0, 4) === "npub") {
//             const code = bech32.decode(key, 1500);
//             const data = new Uint8Array(bech32.fromWords(code.words));
//             return encodeHex(data);
//         }
//         return key;
//     } catch (e) {
//         return e as Error;
//     }
// }

function isValidPublicKey(key: string) {
    return /^[0-9a-f]{64}$/.test(key) || /^npub[0-9a-z]{59}$/.test(key);
}

export function isValidHexKey(key: string) {
    const ok = /^[0-9a-f]{64}$/.test(key);
    if (!ok) {
        return new InvalidKey(key);
    }
}

export class InvalidKey extends Error {
    constructor(key: string) {
        super(`key '${key}' is invalid`);
        this.name = "InvalidKey";
    }
}
