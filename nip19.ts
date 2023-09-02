import { utils } from "./vendor/esm.sh/v106/@noble/secp256k1@1.7.1/es2022/secp256k1.js";
import { bech32 } from "./scure.js";
import { utf8Decode, utf8Encode } from "./ende.ts";



export class NoteID {
    static FromBech32(id: string): NoteID | Error {
        if (id.substring(0, 4) === "note") {
            try {
                return new NoteID(toHex(id));
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

function toBech32(hex: string, prefix: string) {
    const array = utils.hexToBytes(hex);
    const words = bech32.toWords(array);
    return bech32.encode(prefix, words, 1500);
}

function toHex(bech: string) {
    const code = bech32.decode(bech, 1500);
    const data = new Uint8Array(bech32.fromWords(code.words));
    return utils.bytesToHex(data);
}
type TLV = { [t: number]: Uint8Array[] };
function encodeTLV(tlv: TLV): Uint8Array {
    let entries: Uint8Array[] = [];

    Object.entries(tlv).forEach(([t, vs]) => {
        vs.forEach((v) => {
            let entry = new Uint8Array(v.length + 2);
            entry.set([parseInt(t)], 0);
            entry.set([v.length], 1);
            entry.set(v, 2);
            entries.push(entry);
        });
    });

    return utils.concatBytes(...entries);
}
function parseTLV(data: Uint8Array): TLV {
    let result: TLV = {};
    let rest = data;
    while (rest.length > 0) {
        let t = rest[0];
        let l = rest[1];
        if (!l) throw new Error(`malformed TLV ${t}`);
        let v = rest.slice(2, 2 + l);
        rest = rest.slice(2 + l);
        if (v.length < l) throw new Error(`not enough data to read on TLV ${t}`);
        result[t] = result[t] || [];
        result[t].push(v);
    }
    return result;
}
export type AddressPointer = {
    identifier: string;
    pubkey: string;
    kind: number;
    relays?: string[];
};

// https://github.com/nostr-protocol/nips/blob/master/19.md#shareable-identifiers-with-extra-metadata
export class NostrAddress {
    static encode(addr: AddressPointer): string | Error {
        let kind = new ArrayBuffer(4);
        new DataView(kind).setUint32(0, addr.kind, false);

        let data = encodeTLV({
            0: [utf8Encode(addr.identifier)],
            1: (addr.relays || []).map((url) => utf8Encode(url)),
            2: [utils.hexToBytes(addr.pubkey)],
            3: [new Uint8Array(kind)],
        });

            const words = bech32.toWords(data);
    return bech32.encode("naddr", words, 1500);

    }
    static decode(naddr: string) {
        let { prefix, words } = bech32.decode(naddr, 1500);
        let data = new Uint8Array(bech32.fromWords(words));
        let tlv = parseTLV(data);
        if (!tlv[0]?.[0]) return new Error("missing TLV 0 for naddr");
        if (!tlv[2]?.[0]) return new Error("missing TLV 2 for naddr");
        if (tlv[2][0].length !== 32) return new Error("TLV 2 should be 32 bytes");
        if (!tlv[3]?.[0]) return new Error("missing TLV 3 for naddr");
        if (tlv[3][0].length !== 4) return new Error("TLV 3 should be 4 bytes");
        return new NostrAddress({
            identifier: utf8Decode(tlv[0][0]),
            pubkey: utils.bytesToHex(tlv[2][0]),
            kind: parseInt(utils.bytesToHex(tlv[3][0]), 16),
            relays: tlv[1] ? tlv[1].map((d) => utf8Decode(d)) : [],
        });
    }

    private constructor(public readonly addr: AddressPointer) {}
}
