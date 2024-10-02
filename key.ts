import { bech32 } from "./scure.ts";
import { decodeHex, encodeHex } from "@std/encoding";
import { utils } from "@noble/secp256k1";
import { schnorr } from "@noble/curves/secp256k1";
import { hexToNumber } from "@noble/ciphers/utils";

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
        const ok = is64Hex(key);
        if (!ok) {
            return new InvalidKey(key, "length " + key.length);
        }
        if (!utils.isValidPrivateKey(key)) {
            return new InvalidKey(key, "not a valid private key");
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
        const hex = encodeHex(pub_bytes);
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
        const ok = is64Hex(key);
        if (!ok) {
            return new InvalidKey(key, "length " + key.length);
        }
        try {
            schnorr.utils.lift_x(hexToNumber(key));
        } catch (e) {
            if (e instanceof Error) {
                return new InvalidKey(key, e.message);
            } else {
                throw e; // impossible
            }
        }
        return new PublicKey(key);
    }

    static FromBech32(key: string) {
        if (key.substring(0, 4) != "npub") {
            return new InvalidKey(key, "not a npub");
        }
        try {
            const code = bech32.decode(key, 1500);
            const data = new Uint8Array(bech32.fromWords(code.words));
            const hex = encodeHex(data);
            return PublicKey.FromHex(hex);
        } catch (e) {
            if (e instanceof Error) {
                return new InvalidKey(key, e.message);
            } else {
                throw e; // impossible
            }
        }
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

export function is64Hex(key: string) {
    return /^[0-9a-f]{64}$/.test(key);
}

export class InvalidKey extends Error {
    constructor(key: string, reason: string) {
        super(`key '${key}' is invalid, reason: ${reason}`);
        this.name = "InvalidKey";
    }
}
