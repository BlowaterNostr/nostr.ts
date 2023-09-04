import { utils } from "./vendor/secp256k1.js";
import { bech32 } from "./scure.js";
import { utf8Decode, utf8Encode } from "./ende.ts";
import { PublicKey } from "./key.ts";
import { NostrKind } from "./nostr.ts";

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
    const entries: Uint8Array[] = [];
    for (const [t, vs] of Object.entries(tlv)) {
        for (const v of vs) {
            const entry = new Uint8Array(v.length + 2);
            entry.set([parseInt(t)], 0);
            entry.set([v.length], 1);
            entry.set(v, 2);
            entries.push(entry);
        }
    }
    return utils.concatBytes(...entries);
}

export function parseTLV(data: Uint8Array): TLV | Error {
    const result: TLV = {};
    let rest = data;
    while (rest.length > 0) {
        const t = rest[0];
        const l = rest[1];
        if (!l) {
            return new Error(`malformed TLV ${t}`);
        }
        const v = rest.slice(2, 2 + l);
        rest = rest.slice(2 + l);
        if (v.length < l) {
            return new Error(`not enough data to read on TLV ${t}`);
        }
        result[t] = result[t] || [];
        result[t].push(v);
    }
    return result;
}
export type AddressPointer = {
    identifier: string;
    pubkey: PublicKey;
    kind: NostrKind;
    relays?: string[];
};

// https://github.com/nostr-protocol/nips/blob/master/19.md#shareable-identifiers-with-extra-metadata
export class NostrAddress {
    encode(): string | Error {
        const kind = new ArrayBuffer(4);
        new DataView(kind).setUint32(0, this.addr.kind, false);

        const data = encodeTLV({
            0: [utf8Encode(this.addr.identifier)],
            1: (this.addr.relays || []).map((url) => utf8Encode(url)),
            2: [utils.hexToBytes(this.addr.pubkey.hex)],
            3: [new Uint8Array(kind)],
        });

        const words = bech32.toWords(data);
        return bech32.encode("naddr", words, 1500);
    }
    static decode(naddr: string) {
        const { prefix, words } = bech32.decode(naddr, 1500);
        const data = new Uint8Array(bech32.fromWords(words));
        const tlv = parseTLV(data);
        if (tlv instanceof Error) return tlv;
        if (!tlv[0][0]) return new Error("missing TLV 0 for naddr");
        if (!tlv[2][0]) return new Error("missing TLV 2 for naddr");
        if (tlv[2][0].length !== 32) return new Error("TLV 2 should be 32 bytes");
        if (!tlv[3][0]) return new Error("missing TLV 3 for naddr");
        if (tlv[3][0].length !== 4) return new Error("TLV 3 should be 4 bytes");
        const pubkey = PublicKey.FromHex(utils.bytesToHex(tlv[2][0]));
        if (pubkey instanceof Error) {
            return pubkey;
        }
        return new NostrAddress({
            identifier: utf8Decode(tlv[0][0]),
            pubkey,
            kind: parseInt(utils.bytesToHex(tlv[3][0]), 16),
            relays: tlv[1] ? tlv[1].map((d) => utf8Decode(d)) : [],
        });
    }
    public constructor(public readonly addr: AddressPointer) {}
}

// https://github.com/nostr-protocol/nips/blob/master/19.md#shareable-identifiers-with-extra-metadata
export class NostrProfile {
    encode(): string | Error {
        const data = encodeTLV({
            0: [utils.hexToBytes(this.pubkey.hex)],
            1: (this.relays || []).map((url) => utf8Encode(url)),
        });
        const words = bech32.toWords(data);
        return bech32.encode("nprofile", words, 1500);
    }
    static decode(nprofile: string) {
        const { prefix, words } = bech32.decode(nprofile, 1500);
        const data = new Uint8Array(bech32.fromWords(words));
        const tlv = parseTLV(data);
        if (tlv instanceof Error) {
            return tlv;
        }
        if (!tlv[0][0]) {
            return new Error("missing TLV 0 for nprofile");
        }
        if (tlv[0][0].length !== 32) {
            return new Error("TLV 0 should be 32 bytes");
        }
        const pubkey = PublicKey.FromHex(utils.bytesToHex(tlv[0][0]));
        if (pubkey instanceof Error) {
            return pubkey;
        }
        return new NostrProfile(
            pubkey,
            tlv[1] ? tlv[1].map((d) => utf8Decode(d)) : [],
        );
    }
    public constructor(
        public readonly pubkey: PublicKey,
        public readonly relays?: string[],
    ) {}
}
