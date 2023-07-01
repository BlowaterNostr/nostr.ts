import { utils } from "https://esm.sh/v106/@noble/secp256k1@1.7.1/es2022/secp256k1.js";
import { bech32 } from "./scure.js";

export class NoteID {
    static FromBech32(id: string): NoteID | Error {
        if (id.substring(0, 4) === "note") {
            try {
                const code = bech32.decode(id, 1500);
                const data = new Uint8Array(bech32.fromWords(code.words));
                const hex = utils.bytesToHex(data);
                return new NoteID(hex);
            } catch (e) {
                return e as Error;
            }
        }
        return new Error(`${id} is not valid`);
    }

    static FromHex(id: string) {
        return new NoteID(id);
    }

    static FromString(raw: string) {
        const key = this.FromBech32(raw);
        if (key instanceof Error) {
            return this.FromHex(raw);
        }
        return key;
    }

    private _bech32: string | undefined;
    private constructor(public readonly hex: string) {}

    bech32() {
        if (this._bech32) {
            return this._bech32;
        }
        this._bech32 = toBech32(this.hex, "note");
        return this._bech32;
    }
}

function toBech32(v: string, prefix: string) {
    const array = utils.hexToBytes(v);
    const words = bech32.toWords(array);
    return bech32.encode(prefix, words, 1500);
}
