/* esm.sh - esbuild bundle(@scure/base@1.1.1) es2022 production */
function g(r) {
    if (!Number.isSafeInteger(r)) throw new Error(`Wrong integer: ${r}`);
}
function a(...r) {
    let e = (o, t) => (i) => o(t(i)),
        n = Array.from(r).reverse().reduce((o, t) => o ? e(o, t.encode) : t.encode, void 0),
        c = r.reduce((o, t) => o ? e(o, t.decode) : t.decode, void 0);
    return { encode: n, decode: c };
}
function w(r) {
    return {
        encode: (e) => {
            if (!Array.isArray(e) || e.length && typeof e[0] != "number") {
                throw new Error(
                    "alphabet.encode input should be an array of numbers",
                );
            }
            return e.map((n) => {
                if (g(n), n < 0 || n >= r.length) {
                    throw new Error(`Digit index outside alphabet: ${n} (alphabet: ${r.length})`);
                }
                return r[n];
            });
        },
        decode: (e) => {
            if (!Array.isArray(e) || e.length && typeof e[0] != "string") {
                throw new Error(
                    "alphabet.decode input should be array of strings",
                );
            }
            return e.map((n) => {
                if (typeof n != "string") throw new Error(`alphabet.decode: not string element=${n}`);
                let c = r.indexOf(n);
                if (c === -1) throw new Error(`Unknown letter: "${n}". Allowed: ${r}`);
                return c;
            });
        },
    };
}
function u(r = "") {
    if (typeof r != "string") throw new Error("join separator should be string");
    return {
        encode: (e) => {
            if (!Array.isArray(e) || e.length && typeof e[0] != "string") {
                throw new Error(
                    "join.encode input should be array of strings",
                );
            }
            for (let n of e) if (typeof n != "string") throw new Error(`join.encode: non-string input=${n}`);
            return e.join(r);
        },
        decode: (e) => {
            if (typeof e != "string") throw new Error("join.decode input should be string");
            return e.split(r);
        },
    };
}
function x(r, e = "=") {
    if (g(r), typeof e != "string") throw new Error("padding chr should be string");
    return {
        encode(n) {
            if (!Array.isArray(n) || n.length && typeof n[0] != "string") {
                throw new Error(
                    "padding.encode input should be array of strings",
                );
            }
            for (let c of n) {
                if (typeof c != "string") throw new Error(`padding.encode: non-string input=${c}`);
            }
            for (; n.length * r % 8;) n.push(e);
            return n;
        },
        decode(n) {
            if (!Array.isArray(n) || n.length && typeof n[0] != "string") {
                throw new Error(
                    "padding.encode input should be array of strings",
                );
            }
            for (let o of n) {
                if (typeof o != "string") throw new Error(`padding.decode: non-string input=${o}`);
            }
            let c = n.length;
            if (c * r % 8) throw new Error("Invalid padding: string should have whole number of bytes");
            for (; c > 0 && n[c - 1] === e; c--) {
                if (!((c - 1) * r % 8)) {
                    throw new Error("Invalid padding: string has too much padding");
                }
            }
            return n.slice(0, c);
        },
    };
}
function W(r) {
    if (typeof r != "function") throw new Error("normalize fn should be function");
    return { encode: (e) => e, decode: (e) => r(e) };
}
function L(r, e, n) {
    if (e < 2) throw new Error(`convertRadix: wrong from=${e}, base cannot be less than 2`);
    if (n < 2) throw new Error(`convertRadix: wrong to=${n}, base cannot be less than 2`);
    if (!Array.isArray(r)) throw new Error("convertRadix: data should be array");
    if (!r.length) return [];
    let c = 0, o = [], t = Array.from(r);
    for (
        t.forEach((i) => {
            if (g(i), i < 0 || i >= e) throw new Error(`Wrong integer: ${i}`);
        });;
    ) {
        let i = 0, h = !0;
        for (let d = c; d < t.length; d++) {
            let A = t[d], s = e * i + A;
            if (!Number.isSafeInteger(s) || e * i / e !== i || s - A !== e * i) {
                throw new Error("convertRadix: carry overflow");
            }
            if (i = s % n, t[d] = Math.floor(s / n), !Number.isSafeInteger(t[d]) || t[d] * n + i !== s) {
                throw new Error("convertRadix: carry overflow");
            }
            if (h) t[d] ? h = !1 : c = d;
            else continue;
        }
        if (o.push(i), h) break;
    }
    for (let i = 0; i < r.length - 1 && r[i] === 0; i++) o.push(0);
    return o.reverse();
}
var j = (r, e) => e ? j(e, r % e) : r, $ = (r, e) => r + (e - j(r, e));
function k(r, e, n, c) {
    if (!Array.isArray(r)) throw new Error("convertRadix2: data should be array");
    if (e <= 0 || e > 32) throw new Error(`convertRadix2: wrong from=${e}`);
    if (n <= 0 || n > 32) throw new Error(`convertRadix2: wrong to=${n}`);
    if ($(e, n) > 32) throw new Error(`convertRadix2: carry overflow from=${e} to=${n} carryBits=${$(e, n)}`);
    let o = 0, t = 0, i = 2 ** n - 1, h = [];
    for (let d of r) {
        if (g(d), d >= 2 ** e) throw new Error(`convertRadix2: invalid data word=${d} from=${e}`);
        if (o = o << e | d, t + e > 32) throw new Error(`convertRadix2: carry overflow pos=${t} from=${e}`);
        for (t += e; t >= n; t -= n) h.push((o >> t - n & i) >>> 0);
        o &= 2 ** t - 1;
    }
    if (o = o << n - t & i, !c && t >= e) throw new Error("Excess padding");
    if (!c && o) throw new Error(`Non-zero padding: ${o}`);
    return c && t > 0 && h.push(o >>> 0), h;
}
function D(r) {
    return g(r), {
        encode: (e) => {
            if (!(e instanceof Uint8Array)) throw new Error("radix.encode input should be Uint8Array");
            return L(Array.from(e), 2 ** 8, r);
        },
        decode: (e) => {
            if (!Array.isArray(e) || e.length && typeof e[0] != "number") {
                throw new Error("radix.decode input should be array of strings");
            }
            return Uint8Array.from(L(e, r, 2 ** 8));
        },
    };
}
function p(r, e = !1) {
    if (g(r), r <= 0 || r > 32) throw new Error("radix2: bits should be in (0..32]");
    if ($(8, r) > 32 || $(r, 8) > 32) throw new Error("radix2: carry overflow");
    return {
        encode: (n) => {
            if (!(n instanceof Uint8Array)) throw new Error("radix2.encode input should be Uint8Array");
            return k(Array.from(n), 8, r, !e);
        },
        decode: (n) => {
            if (!Array.isArray(n) || n.length && typeof n[0] != "number") {
                throw new Error(
                    "radix2.decode input should be array of strings",
                );
            }
            return Uint8Array.from(k(n, r, 8, e));
        },
    };
}
function N(r) {
    if (typeof r != "function") throw new Error("unsafeWrapper fn should be function");
    return function (...e) {
        try {
            return r.apply(null, e);
        } catch {}
    };
}
function P(r, e) {
    if (g(r), typeof e != "function") throw new Error("checksum fn should be function");
    return {
        encode(n) {
            if (!(n instanceof Uint8Array)) throw new Error("checksum.encode: input should be Uint8Array");
            let c = e(n).slice(0, r), o = new Uint8Array(n.length + r);
            return o.set(n), o.set(c, n.length), o;
        },
        decode(n) {
            if (!(n instanceof Uint8Array)) throw new Error("checksum.decode: input should be Uint8Array");
            let c = n.slice(0, -r), o = e(c).slice(0, r), t = n.slice(-r);
            for (let i = 0; i < r; i++) if (o[i] !== t[i]) throw new Error("Invalid checksum");
            return c;
        },
    };
}
var _ = { alphabet: w, chain: a, checksum: P, radix: D, radix2: p, join: u, padding: x },
    H = a(p(4), w("0123456789ABCDEF"), u("")),
    z = a(p(5), w("ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"), x(5), u("")),
    Z = a(p(5), w("0123456789ABCDEFGHIJKLMNOPQRSTUV"), x(5), u("")),
    q = a(
        p(5),
        w("0123456789ABCDEFGHJKMNPQRSTVWXYZ"),
        u(""),
        W((r) => r.toUpperCase().replace(/O/g, "0").replace(/[IL]/g, "1")),
    ),
    F = a(p(6), w("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"), x(6), u("")),
    K = a(p(6), w("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"), x(6), u("")),
    U = (r) => a(D(58), w(r), u("")),
    v = U("123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"),
    rr = U("123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ"),
    er = U("rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz"),
    O = [0, 2, 3, 5, 6, 7, 9, 10, 11],
    J = {
        encode(r) {
            let e = "";
            for (let n = 0; n < r.length; n += 8) {
                let c = r.subarray(n, n + 8);
                e += v.encode(c).padStart(O[c.length], "1");
            }
            return e;
        },
        decode(r) {
            let e = [];
            for (let n = 0; n < r.length; n += 11) {
                let c = r.slice(n, n + 11), o = O.indexOf(c.length), t = v.decode(c);
                for (let i = 0; i < t.length - o; i++) {
                    if (t[i] !== 0) {
                        throw new Error("base58xmr: wrong padding");
                    }
                }
                e = e.concat(Array.from(t.slice(t.length - o)));
            }
            return Uint8Array.from(e);
        },
    },
    nr = (r) => a(P(4, (e) => r(r(e))), v),
    T = a(w("qpzry9x8gf2tvdw0s3jn54khce6mua7l"), u("")),
    S = [996825010, 642813549, 513874426, 1027748829, 705979059];
function E(r) {
    let e = r >> 25, n = (r & 33554431) << 5;
    for (let c = 0; c < S.length; c++) (e >> c & 1) === 1 && (n ^= S[c]);
    return n;
}
function I(r, e, n = 1) {
    let c = r.length, o = 1;
    for (let t = 0; t < c; t++) {
        let i = r.charCodeAt(t);
        if (i < 33 || i > 126) throw new Error(`Invalid prefix (${r})`);
        o = E(o) ^ i >> 5;
    }
    o = E(o);
    for (let t = 0; t < c; t++) o = E(o) ^ r.charCodeAt(t) & 31;
    for (let t of e) o = E(o) ^ t;
    for (let t = 0; t < 6; t++) o = E(o);
    return o ^= n, T.encode(k([o % 2 ** 30], 30, 5, !1));
}
function M(r) {
    let e = r === "bech32" ? 1 : 734539939, n = p(5), c = n.decode, o = n.encode, t = N(c);
    function i(s, f, l = 90) {
        if (typeof s != "string") throw new Error(`bech32.encode prefix should be string, not ${typeof s}`);
        if (!Array.isArray(f) || f.length && typeof f[0] != "number") {
            throw new Error(`bech32.encode words should be array of numbers, not ${typeof f}`);
        }
        let y = s.length + 7 + f.length;
        if (l !== !1 && y > l) throw new TypeError(`Length ${y} exceeds limit ${l}`);
        return s = s.toLowerCase(), `${s}1${T.encode(f)}${I(s, f, e)}`;
    }
    function h(s, f = 90) {
        if (typeof s != "string") throw new Error(`bech32.decode input should be string, not ${typeof s}`);
        if (s.length < 8 || f !== !1 && s.length > f) {
            throw new TypeError(`Wrong string length: ${s.length} (${s}). Expected (8..${f})`);
        }
        let l = s.toLowerCase();
        if (s !== l && s !== s.toUpperCase()) throw new Error("String must be lowercase or uppercase");
        s = l;
        let y = s.lastIndexOf("1");
        if (y === 0 || y === -1) throw new Error('Letter "1" must be present between prefix and data only');
        let R = s.slice(0, y), m = s.slice(y + 1);
        if (m.length < 6) throw new Error("Data must be at least 6 characters long");
        let C = T.decode(m).slice(0, -6), B = I(R, C, e);
        if (!m.endsWith(B)) throw new Error(`Invalid checksum in ${s}: expected "${B}"`);
        return { prefix: R, words: C };
    }
    let d = N(h);
    function A(s) {
        let { prefix: f, words: l } = h(s, !1);
        return { prefix: f, words: l, bytes: c(l) };
    }
    return {
        encode: i,
        decode: h,
        decodeToBytes: A,
        decodeUnsafe: d,
        fromWords: c,
        fromWordsUnsafe: t,
        toWords: o,
    };
}
var or = M("bech32"),
    tr = M("bech32m"),
    Q = { encode: (r) => new TextDecoder().decode(r), decode: (r) => new TextEncoder().encode(r) },
    V = a(
        p(4),
        w("0123456789abcdef"),
        u(""),
        W((r) => {
            if (typeof r != "string" || r.length % 2) {
                throw new TypeError(`hex.decode: expected string, got ${typeof r} with length ${r.length}`);
            }
            return r.toLowerCase();
        }),
    ),
    b = { utf8: Q, hex: V, base16: H, base32: z, base64: F, base64url: K, base58: v, base58xmr: J },
    G = `Invalid encoding type. Available types: ${Object.keys(b).join(", ")}`,
    X = (r, e) => {
        if (typeof r != "string" || !b.hasOwnProperty(r)) throw new TypeError(G);
        if (!(e instanceof Uint8Array)) throw new TypeError("bytesToString() expects Uint8Array");
        return b[r].encode(e);
    },
    cr = X,
    Y = (r, e) => {
        if (!b.hasOwnProperty(r)) throw new TypeError(G);
        if (typeof e != "string") throw new TypeError("stringToBytes() expects string");
        return b[r].decode(e);
    },
    ir = Y;
export {
    _ as utils,
    cr as str,
    er as base58xrp,
    F as base64,
    g as assertNumber,
    H as base16,
    ir as bytes,
    J as base58xmr,
    K as base64url,
    nr as base58check,
    or as bech32,
    Q as utf8,
    q as base32crockford,
    rr as base58flickr,
    tr as bech32m,
    V as hex,
    v as base58,
    X as bytesToString,
    Y as stringToBytes,
    Z as base32hex,
    z as base32,
};
/*! Bundled license information:

@scure/base/lib/esm/index.js:
  (*! scure-base - MIT License (c) 2022 Paul Miller (paulmillr.com) *)
*/
//# sourceMappingURL=base.mjs.map
