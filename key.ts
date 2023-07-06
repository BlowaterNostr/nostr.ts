import * as secp256k1 from "./vendor/esm.sh/v106/@noble/secp256k1@1.7.1/es2022/secp256k1.js";
import { bech32 } from "./scure.js";

export class PrivateKey {
    static Generate() {
        const str = generatePrivateKeyHex();
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
            try {
                const code = bech32.decode(key, 1500);
                const data = new Uint8Array(bech32.fromWords(code.words));
                const hex = secp256k1.utils.bytesToHex(data);
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

    private constructor(key: string) {
        const array = secp256k1.utils.hexToBytes(key);
        const words = bech32.toWords(array);
        this.bech32 = bech32.encode("nsec", words, 1500);
        this.hex = key;
    }

    toPublicKey(): PublicKey {
        const hex = toPublicKeyHex(this.hex);
        const pub = PublicKey.FromHex(hex);
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
        return new PublicKey(publicKeyHexFromNpub(key));
    }

    static FromHex(key: string) {
        if (!isValidPublicKey(key)) {
            return new InvalidKey(key);
        }
        return new PublicKey(key);
    }

    static FromBech32(key: string) {
        return new PublicKey(publicKeyHexFromNpub(key));
    }

    public bech32 = (): string => {
        const array = secp256k1.utils.hexToBytes(this.hex);
        const words = bech32.toWords(array);
        return bech32.encode("npub", words, 1500);
    };

    public readonly hex: string;

    private constructor(key: string) {
        this.hex = key;
    }
}

function toPublicKeyHex(privateKey: string): string {
    return secp256k1.utils.bytesToHex(
        secp256k1.schnorr.getPublicKey(privateKey),
    );
}

export function isValidHexKey(key: string) {
    return /^[0-9a-f]{64}$/.test(key);
}

export function publicKeyHexFromNpub(key: string) {
    if (key.substring(0, 4) === "npub") {
        const code = bech32.decode(key, 1500);
        const data = new Uint8Array(bech32.fromWords(code.words));
        return secp256k1.utils.bytesToHex(data);
    }
    return key;
}

// NIP 1 https://github.com/nostr-protocol/nips/blob/master/01.md
function generatePrivateKeyHex(): string {
    return secp256k1.utils.bytesToHex(secp256k1.utils.randomPrivateKey());
}

function isValidPublicKey(key: string) {
    return /^[0-9a-f]{64}$/.test(key) || /^npub[0-9a-z]{59}$/.test(key);
}

export class InvalidKey extends Error {
    constructor(key: string) {
        super(`${key} is invalid`);
        this.name = "InvalidKey";
    }
}
