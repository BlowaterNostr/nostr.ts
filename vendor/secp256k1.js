/* esm.sh - esbuild bundle(@noble/secp256k1@1.7.1) es2022 production */
var Nt = Object.create;
var lt = Object.defineProperty;
var Zt = Object.getOwnPropertyDescriptor;
var $t = Object.getOwnPropertyNames;
var Ct = Object.getPrototypeOf, Ot = Object.prototype.hasOwnProperty;
var Vt = (n, t) => () => (t || n((t = { exports: {} }).exports, t), t.exports);
var Dt = (n, t, e, r) => {
    if (t && typeof t == "object" || typeof t == "function") {
        for (let s of $t(t)) {
            !Ot.call(n, s) && s !== e &&
                lt(n, s, { get: () => t[s], enumerable: !(r = Zt(t, s)) || r.enumerable });
        }
    }
    return n;
};
var Pt = (
    n,
    t,
    e,
) => (e = n != null ? Nt(Ct(n)) : {},
    Dt(t || !n || !n.__esModule ? lt(e, "default", { value: n, enumerable: !0 }) : e, n));
var dt = Vt(() => {});
var Xt = Pt(dt(), 1);
var w = BigInt(0),
    m = BigInt(1),
    T = BigInt(2),
    L = BigInt(3),
    wt = BigInt(8),
    p = Object.freeze({
        a: w,
        b: BigInt(7),
        P: BigInt("0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f"),
        n: BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141"),
        h: m,
        Gx: BigInt("55066263022277343669578718895168534326250603453777594175500187360389116729240"),
        Gy: BigInt("32670510020758816978083085130507043184471273380659243275938904335757337482424"),
        beta: BigInt("0x7ae96a2b657c07106e64479eac3434e99cf0497512f58995c1396c28719501ee"),
    }),
    yt = (n, t) => (n + t / T) / t,
    _ = {
        beta: BigInt("0x7ae96a2b657c07106e64479eac3434e99cf0497512f58995c1396c28719501ee"),
        splitScalar(n) {
            let { n: t } = p,
                e = BigInt("0x3086d221a7d46bcde86c90e49284eb15"),
                r = -m * BigInt("0xe4437ed6010e88286f547fa90abfe4c3"),
                s = BigInt("0x114ca50f7a8e2f3f657c1108d9d44cfd8"),
                o = e,
                i = BigInt("0x100000000000000000000000000000000"),
                c = yt(o * n, t),
                h = yt(-r * n, t),
                a = f(n - c * e - h * s, t),
                u = f(-c * r - h * o, t),
                l = a > i,
                d = u > i;
            if (l && (a = t - a), d && (u = t - u), a > i || u > i) {
                throw new Error("splitScalarEndo: Endomorphism failed, k=" + n);
            }
            return { k1neg: l, k1: a, k2neg: d, k2: u };
        },
    },
    I = 32,
    $ = 32,
    bt = 32,
    nt = I + 1,
    rt = 2 * I + 1;
function gt(n) {
    let { a: t, b: e } = p, r = f(n * n), s = f(r * n);
    return f(s + t * n + e);
}
var Q = p.a === w,
    M = class extends Error {
        constructor(t) {
            super(t);
        }
    };
function pt(n) {
    if (!(n instanceof y)) throw new TypeError("JacobianPoint expected");
}
var y = class {
    constructor(t, e, r) {
        this.x = t, this.y = e, this.z = r;
    }
    static fromAffine(t) {
        if (!(t instanceof g)) throw new TypeError("JacobianPoint#fromAffine: expected Point");
        return t.equals(g.ZERO) ? y.ZERO : new y(t.x, t.y, m);
    }
    static toAffineBatch(t) {
        let e = Yt(t.map((r) => r.z));
        return t.map((r, s) => r.toAffine(e[s]));
    }
    static normalizeZ(t) {
        return y.toAffineBatch(t).map(y.fromAffine);
    }
    equals(t) {
        pt(t);
        let { x: e, y: r, z: s } = this,
            { x: o, y: i, z: c } = t,
            h = f(s * s),
            a = f(c * c),
            u = f(e * a),
            l = f(o * h),
            d = f(f(r * c) * a),
            E = f(f(i * s) * h);
        return u === l && d === E;
    }
    negate() {
        return new y(this.x, f(-this.y), this.z);
    }
    double() {
        let { x: t, y: e, z: r } = this,
            s = f(t * t),
            o = f(e * e),
            i = f(o * o),
            c = t + o,
            h = f(T * (f(c * c) - s - i)),
            a = f(L * s),
            u = f(a * a),
            l = f(u - T * h),
            d = f(a * (h - l) - wt * i),
            E = f(T * e * r);
        return new y(l, d, E);
    }
    add(t) {
        pt(t);
        let { x: e, y: r, z: s } = this, { x: o, y: i, z: c } = t;
        if (o === w || i === w) return this;
        if (e === w || r === w) return t;
        let h = f(s * s),
            a = f(c * c),
            u = f(e * a),
            l = f(o * h),
            d = f(f(r * c) * a),
            E = f(f(i * s) * h),
            x = f(l - u),
            B = f(E - d);
        if (x === w) return B === w ? this.double() : y.ZERO;
        let O = f(x * x),
            V = f(x * O),
            D = f(u * O),
            j = f(B * B - V - T * D),
            ft = f(B * (D - j) - d * V),
            W = f(s * c * x);
        return new y(j, ft, W);
    }
    subtract(t) {
        return this.add(t.negate());
    }
    multiplyUnsafe(t) {
        let e = y.ZERO;
        if (typeof t == "bigint" && t === w) return e;
        let r = Et(t);
        if (r === m) return this;
        if (!Q) {
            let l = e, d = this;
            for (; r > w;) r & m && (l = l.add(d)), d = d.double(), r >>= m;
            return l;
        }
        let { k1neg: s, k1: o, k2neg: i, k2: c } = _.splitScalar(r), h = e, a = e, u = this;
        for (; o > w || c > w;) {
            o & m && (h = h.add(u)), c & m && (a = a.add(u)), u = u.double(), o >>= m, c >>= m;
        }
        return s && (h = h.negate()), i && (a = a.negate()), a = new y(f(a.x * _.beta), a.y, a.z), h.add(a);
    }
    precomputeWindow(t) {
        let e = Q ? 128 / t + 1 : 256 / t + 1, r = [], s = this, o = s;
        for (let i = 0; i < e; i++) {
            o = s, r.push(o);
            for (let c = 1; c < 2 ** (t - 1); c++) o = o.add(s), r.push(o);
            s = o.double();
        }
        return r;
    }
    wNAF(t, e) {
        !e && this.equals(y.BASE) && (e = g.BASE);
        let r = e && e._WINDOW_SIZE || 1;
        if (256 % r) throw new Error("Point#wNAF: Invalid precomputation window, must be power of 2");
        let s = e && at.get(e);
        s || (s = this.precomputeWindow(r), e && r !== 1 && (s = y.normalizeZ(s), at.set(e, s)));
        let o = y.ZERO,
            i = y.BASE,
            c = 1 + (Q ? 128 / r : 256 / r),
            h = 2 ** (r - 1),
            a = BigInt(2 ** r - 1),
            u = 2 ** r,
            l = BigInt(r);
        for (let d = 0; d < c; d++) {
            let E = d * h, x = Number(t & a);
            t >>= l, x > h && (x -= u, t += m);
            let B = E, O = E + Math.abs(x) - 1, V = d % 2 !== 0, D = x < 0;
            x === 0 ? i = i.add(J(V, s[B])) : o = o.add(J(D, s[O]));
        }
        return { p: o, f: i };
    }
    multiply(t, e) {
        let r = Et(t), s, o;
        if (Q) {
            let { k1neg: i, k1: c, k2neg: h, k2: a } = _.splitScalar(r),
                { p: u, f: l } = this.wNAF(c, e),
                { p: d, f: E } = this.wNAF(a, e);
            u = J(i, u), d = J(h, d), d = new y(f(d.x * _.beta), d.y, d.z), s = u.add(d), o = l.add(E);
        } else {
            let { p: i, f: c } = this.wNAF(r, e);
            s = i, o = c;
        }
        return y.normalizeZ([s, o])[0];
    }
    toAffine(t) {
        let { x: e, y: r, z: s } = this, o = this.equals(y.ZERO);
        t == null && (t = o ? wt : K(s));
        let i = t, c = f(i * i), h = f(c * i), a = f(e * c), u = f(r * h), l = f(s * i);
        if (o) return g.ZERO;
        if (l !== m) throw new Error("invZ was invalid");
        return new g(a, u);
    }
};
y.BASE = new y(p.Gx, p.Gy, m);
y.ZERO = new y(w, m, w);
function J(n, t) {
    let e = t.negate();
    return n ? e : t;
}
var at = new WeakMap(),
    g = class {
        constructor(t, e) {
            this.x = t, this.y = e;
        }
        _setWindowSize(t) {
            this._WINDOW_SIZE = t, at.delete(this);
        }
        hasEvenY() {
            return this.y % T === w;
        }
        static fromCompressedHex(t) {
            let e = t.length === 32, r = b(e ? t : t.subarray(1));
            if (!et(r)) throw new Error("Point is not on curve");
            let s = gt(r), o = Wt(s), i = (o & m) === m;
            e ? i && (o = f(-o)) : (t[0] & 1) === 1 !== i && (o = f(-o));
            let c = new g(r, o);
            return c.assertValidity(), c;
        }
        static fromUncompressedHex(t) {
            let e = b(t.subarray(1, I + 1)), r = b(t.subarray(I + 1, I * 2 + 1)), s = new g(e, r);
            return s.assertValidity(), s;
        }
        static fromHex(t) {
            let e = R(t), r = e.length, s = e[0];
            if (r === I) return this.fromCompressedHex(e);
            if (r === nt && (s === 2 || s === 3)) return this.fromCompressedHex(e);
            if (r === rt && s === 4) return this.fromUncompressedHex(e);
            throw new Error(
                `Point.fromHex: received invalid point. Expected 32-${nt} compressed bytes or ${rt} uncompressed bytes, not ${r}`,
            );
        }
        static fromPrivateKey(t) {
            return g.BASE.multiply(C(t));
        }
        static fromSignature(t, e, r) {
            let { r: s, s: o } = At(e);
            if (![0, 1, 2, 3].includes(r)) throw new Error("Cannot recover: invalid recovery bit");
            let i = ht(R(t)),
                { n: c } = p,
                h = r === 2 || r === 3 ? s + c : s,
                a = K(h, c),
                u = f(-i * a, c),
                l = f(o * a, c),
                d = r & 1 ? "03" : "02",
                E = g.fromHex(d + k(h)),
                x = g.BASE.multiplyAndAddUnsafe(E, u, l);
            if (!x) throw new Error("Cannot recover signature: point at infinify");
            return x.assertValidity(), x;
        }
        toRawBytes(t = !1) {
            return N(this.toHex(t));
        }
        toHex(t = !1) {
            let e = k(this.x);
            return t ? `${this.hasEvenY() ? "02" : "03"}${e}` : `04${e}${k(this.y)}`;
        }
        toHexX() {
            return this.toHex(!0).slice(2);
        }
        toRawX() {
            return this.toRawBytes(!0).slice(1);
        }
        assertValidity() {
            let t = "Point is not on elliptic curve", { x: e, y: r } = this;
            if (!et(e) || !et(r)) throw new Error(t);
            let s = f(r * r), o = gt(e);
            if (f(s - o) !== w) throw new Error(t);
        }
        equals(t) {
            return this.x === t.x && this.y === t.y;
        }
        negate() {
            return new g(this.x, f(-this.y));
        }
        double() {
            return y.fromAffine(this).double().toAffine();
        }
        add(t) {
            return y.fromAffine(this).add(y.fromAffine(t)).toAffine();
        }
        subtract(t) {
            return this.add(t.negate());
        }
        multiply(t) {
            return y.fromAffine(this).multiply(t, this).toAffine();
        }
        multiplyAndAddUnsafe(t, e, r) {
            let s = y.fromAffine(this),
                o = e === w || e === m || this !== g.BASE ? s.multiplyUnsafe(e) : s.multiply(e),
                i = y.fromAffine(t).multiplyUnsafe(r),
                c = o.add(i);
            return c.equals(y.ZERO) ? void 0 : c.toAffine();
        }
    };
g.BASE = new g(p.Gx, p.Gy);
g.ZERO = new g(w, w);
function mt(n) {
    return Number.parseInt(n[0], 16) >= 8 ? "00" + n : n;
}
function xt(n) {
    if (n.length < 2 || n[0] !== 2) throw new Error(`Invalid signature integer tag: ${X(n)}`);
    let t = n[1], e = n.subarray(2, t + 2);
    if (!t || e.length !== t) throw new Error("Invalid signature integer: wrong length");
    if (e[0] === 0 && e[1] <= 127) throw new Error("Invalid signature integer: trailing length");
    return { data: b(e), left: n.subarray(t + 2) };
}
function qt(n) {
    if (n.length < 2 || n[0] != 48) throw new Error(`Invalid signature tag: ${X(n)}`);
    if (n[1] !== n.length - 2) throw new Error("Invalid signature: incorrect length");
    let { data: t, left: e } = xt(n.subarray(2)), { data: r, left: s } = xt(e);
    if (s.length) throw new Error(`Invalid signature: left bytes after parsing: ${X(s)}`);
    return { r: t, s: r };
}
var H = class {
    constructor(t, e) {
        this.r = t, this.s = e, this.assertValidity();
    }
    static fromCompact(t) {
        let e = t instanceof Uint8Array, r = "Signature.fromCompact";
        if (typeof t != "string" && !e) throw new TypeError(`${r}: Expected string or Uint8Array`);
        let s = e ? X(t) : t;
        if (s.length !== 128) throw new Error(`${r}: Expected 64-byte hex`);
        return new H(st(s.slice(0, 64)), st(s.slice(64, 128)));
    }
    static fromDER(t) {
        let e = t instanceof Uint8Array;
        if (typeof t != "string" && !e) {
            throw new TypeError("Signature.fromDER: Expected string or Uint8Array");
        }
        let { r, s } = qt(e ? t : N(t));
        return new H(r, s);
    }
    static fromHex(t) {
        return this.fromDER(t);
    }
    assertValidity() {
        let { r: t, s: e } = this;
        if (!F(t)) throw new Error("Invalid Signature: r must be 0 < r < n");
        if (!F(e)) throw new Error("Invalid Signature: s must be 0 < s < n");
    }
    hasHighS() {
        let t = p.n >> m;
        return this.s > t;
    }
    normalizeS() {
        return this.hasHighS() ? new H(this.r, f(-this.s, p.n)) : this;
    }
    toDERRawBytes() {
        return N(this.toDERHex());
    }
    toDERHex() {
        let t = mt(Y(this.s)), e = mt(Y(this.r)), r = t.length / 2, s = e.length / 2, o = Y(r), i = Y(s);
        return `30${Y(s + r + 4)}02${i}${e}02${o}${t}`;
    }
    toRawBytes() {
        return this.toDERRawBytes();
    }
    toHex() {
        return this.toDERHex();
    }
    toCompactRawBytes() {
        return N(this.toCompactHex());
    }
    toCompactHex() {
        return k(this.r) + k(this.s);
    }
};
function z(...n) {
    if (!n.every((r) => r instanceof Uint8Array)) throw new Error("Uint8Array list expected");
    if (n.length === 1) return n[0];
    let t = n.reduce((r, s) => r + s.length, 0), e = new Uint8Array(t);
    for (let r = 0, s = 0; r < n.length; r++) {
        let o = n[r];
        e.set(o, s), s += o.length;
    }
    return e;
}
var Ft = Array.from({ length: 256 }, (n, t) => t.toString(16).padStart(2, "0"));
function X(n) {
    if (!(n instanceof Uint8Array)) throw new Error("Expected Uint8Array");
    let t = "";
    for (let e = 0; e < n.length; e++) t += Ft[n[e]];
    return t;
}
var Kt = BigInt("0x10000000000000000000000000000000000000000000000000000000000000000");
function k(n) {
    if (typeof n != "bigint") throw new Error("Expected bigint");
    if (!(w <= n && n < Kt)) throw new Error("Expected number 0 <= n < 2^256");
    return n.toString(16).padStart(64, "0");
}
function q(n) {
    let t = N(k(n));
    if (t.length !== 32) throw new Error("Error: expected 32 bytes");
    return t;
}
function Y(n) {
    let t = n.toString(16);
    return t.length & 1 ? `0${t}` : t;
}
function st(n) {
    if (typeof n != "string") throw new TypeError("hexToNumber: expected string, got " + typeof n);
    return BigInt(`0x${n}`);
}
function N(n) {
    if (typeof n != "string") throw new TypeError("hexToBytes: expected string, got " + typeof n);
    if (n.length % 2) throw new Error("hexToBytes: received invalid unpadded hex" + n.length);
    let t = new Uint8Array(n.length / 2);
    for (let e = 0; e < t.length; e++) {
        let r = e * 2, s = n.slice(r, r + 2), o = Number.parseInt(s, 16);
        if (Number.isNaN(o) || o < 0) throw new Error("Invalid byte sequence");
        t[e] = o;
    }
    return t;
}
function b(n) {
    return st(X(n));
}
function R(n) {
    return n instanceof Uint8Array ? Uint8Array.from(n) : N(n);
}
function Et(n) {
    if (typeof n == "number" && Number.isSafeInteger(n) && n > 0) return BigInt(n);
    if (typeof n == "bigint" && F(n)) return n;
    throw new TypeError("Expected valid private scalar: 0 < scalar < curve.n");
}
function f(n, t = p.P) {
    let e = n % t;
    return e >= w ? e : t + e;
}
function v(n, t) {
    let { P: e } = p, r = n;
    for (; t-- > w;) r *= r, r %= e;
    return r;
}
function Wt(n) {
    let { P: t } = p,
        e = BigInt(6),
        r = BigInt(11),
        s = BigInt(22),
        o = BigInt(23),
        i = BigInt(44),
        c = BigInt(88),
        h = n * n * n % t,
        a = h * h * n % t,
        u = v(a, L) * a % t,
        l = v(u, L) * a % t,
        d = v(l, T) * h % t,
        E = v(d, r) * d % t,
        x = v(E, s) * E % t,
        B = v(x, i) * x % t,
        O = v(B, c) * B % t,
        V = v(O, i) * x % t,
        D = v(V, L) * a % t,
        j = v(D, o) * E % t,
        ft = v(j, e) * h % t,
        W = v(ft, T);
    if (W * W % t !== n) throw new Error("Cannot find square root");
    return W;
}
function K(n, t = p.P) {
    if (n === w || t <= w) throw new Error(`invert: expected positive integers, got n=${n} mod=${t}`);
    let e = f(n, t), r = t, s = w, o = m, i = m, c = w;
    for (; e !== w;) {
        let a = r / e, u = r % e, l = s - i * a, d = o - c * a;
        r = e, e = u, s = i, o = c, i = l, c = d;
    }
    if (r !== m) throw new Error("invert: does not exist");
    return f(s, t);
}
function Yt(n, t = p.P) {
    let e = new Array(n.length),
        r = n.reduce((o, i, c) => i === w ? o : (e[c] = o, f(o * i, t)), m),
        s = K(r, t);
    return n.reduceRight((o, i, c) => i === w ? o : (e[c] = f(o * e[c], t), f(o * i, t)), s), e;
}
function Lt(n) {
    let t = n.length * 8 - $ * 8, e = b(n);
    return t > 0 ? e >> BigInt(t) : e;
}
function ht(n, t = !1) {
    let e = Lt(n);
    if (t) return e;
    let { n: r } = p;
    return e >= r ? e - r : e;
}
var P,
    G,
    ot = class {
        constructor(t, e) {
            if (this.hashLen = t, this.qByteLen = e, typeof t != "number" || t < 2) {
                throw new Error("hashLen must be a number");
            }
            if (typeof e != "number" || e < 2) throw new Error("qByteLen must be a number");
            this.v = new Uint8Array(t).fill(1), this.k = new Uint8Array(t).fill(0), this.counter = 0;
        }
        hmac(...t) {
            return A.hmacSha256(this.k, ...t);
        }
        hmacSync(...t) {
            return G(this.k, ...t);
        }
        checkSync() {
            if (typeof G != "function") throw new M("hmacSha256Sync needs to be set");
        }
        incr() {
            if (this.counter >= 1e3) throw new Error("Tried 1,000 k values for sign(), all were invalid");
            this.counter += 1;
        }
        async reseed(t = new Uint8Array()) {
            this.k = await this.hmac(this.v, Uint8Array.from([0]), t),
                this.v = await this.hmac(this.v),
                t.length !== 0 &&
                (this.k = await this.hmac(this.v, Uint8Array.from([1]), t), this.v = await this.hmac(this.v));
        }
        reseedSync(t = new Uint8Array()) {
            this.checkSync(),
                this.k = this.hmacSync(this.v, Uint8Array.from([0]), t),
                this.v = this.hmacSync(this.v),
                t.length !== 0 &&
                (this.k = this.hmacSync(this.v, Uint8Array.from([1]), t), this.v = this.hmacSync(this.v));
        }
        async generate() {
            this.incr();
            let t = 0, e = [];
            for (; t < this.qByteLen;) {
                this.v = await this.hmac(this.v);
                let r = this.v.slice();
                e.push(r), t += this.v.length;
            }
            return z(...e);
        }
        generateSync() {
            this.checkSync(), this.incr();
            let t = 0, e = [];
            for (; t < this.qByteLen;) {
                this.v = this.hmacSync(this.v);
                let r = this.v.slice();
                e.push(r), t += this.v.length;
            }
            return z(...e);
        }
    };
function F(n) {
    return w < n && n < p.n;
}
function et(n) {
    return w < n && n < p.P;
}
function vt(n, t, e, r = !0) {
    let { n: s } = p, o = ht(n, !0);
    if (!F(o)) return;
    let i = K(o, s), c = g.BASE.multiply(o), h = f(c.x, s);
    if (h === w) return;
    let a = f(i * f(t + e * h, s), s);
    if (a === w) return;
    let u = new H(h, a), l = (c.x === u.r ? 0 : 2) | Number(c.y & m);
    return r && u.hasHighS() && (u = u.normalizeS(), l ^= 1), { sig: u, recovery: l };
}
function C(n) {
    let t;
    if (typeof n == "bigint") t = n;
    else if (typeof n == "number" && Number.isSafeInteger(n) && n > 0) t = BigInt(n);
    else if (typeof n == "string") {
        if (n.length !== 2 * $) throw new Error("Expected 32 bytes of private key");
        t = st(n);
    } else if (n instanceof Uint8Array) {
        if (n.length !== $) throw new Error("Expected 32 bytes of private key");
        t = b(n);
    } else throw new TypeError("Expected valid private key");
    if (!F(t)) throw new Error("Expected private key: 0 < key < n");
    return t;
}
function ut(n) {
    return n instanceof g ? (n.assertValidity(), n) : g.fromHex(n);
}
function At(n) {
    if (n instanceof H) return n.assertValidity(), n;
    try {
        return H.fromDER(n);
    } catch {
        return H.fromCompact(n);
    }
}
function re(n, t = !1) {
    return g.fromPrivateKey(n).toRawBytes(t);
}
function se(n, t, e, r = !1) {
    return g.fromSignature(n, t, e).toRawBytes(r);
}
function St(n) {
    let t = n instanceof Uint8Array, e = typeof n == "string", r = (t || e) && n.length;
    return t ? r === nt || r === rt : e ? r === nt * 2 || r === rt * 2 : n instanceof g;
}
function oe(n, t, e = !1) {
    if (St(n)) throw new TypeError("getSharedSecret: first arg must be private key");
    if (!St(t)) throw new TypeError("getSharedSecret: second arg must be public key");
    let r = ut(t);
    return r.assertValidity(), r.multiply(C(n)).toRawBytes(e);
}
function Bt(n) {
    let t = n.length > I ? n.slice(0, I) : n;
    return b(t);
}
function Gt(n) {
    let t = Bt(n), e = f(t, p.n);
    return It(e < w ? t : e);
}
function It(n) {
    return q(n);
}
function Ht(n, t, e) {
    if (n == null) throw new Error(`sign: expected valid message hash, not "${n}"`);
    let r = R(n), s = C(t), o = [It(s), Gt(r)];
    if (e != null) {
        e === !0 && (e = A.randomBytes(I));
        let h = R(e);
        if (h.length !== I) throw new Error(`sign: Expected ${I} bytes of extra data`);
        o.push(h);
    }
    let i = z(...o), c = Bt(r);
    return { seed: i, m: c, d: s };
}
function Rt(n, t) {
    let { sig: e, recovery: r } = n,
        { der: s, recovered: o } = Object.assign({ canonical: !0, der: !0 }, t),
        i = s ? e.toDERRawBytes() : e.toCompactRawBytes();
    return o ? [i, r] : i;
}
async function ie(n, t, e = {}) {
    let { seed: r, m: s, d: o } = Ht(n, t, e.extraEntropy), i = new ot(bt, $);
    await i.reseed(r);
    let c;
    for (; !(c = vt(await i.generate(), s, o, e.canonical));) await i.reseed();
    return Rt(c, e);
}
function ce(n, t, e = {}) {
    let { seed: r, m: s, d: o } = Ht(n, t, e.extraEntropy), i = new ot(bt, $);
    i.reseedSync(r);
    let c;
    for (; !(c = vt(i.generateSync(), s, o, e.canonical));) i.reseedSync();
    return Rt(c, e);
}
var Mt = { strict: !0 };
function fe(n, t, e, r = Mt) {
    let s;
    try {
        s = At(n), t = R(t);
    } catch {
        return !1;
    }
    let { r: o, s: i } = s;
    if (r.strict && s.hasHighS()) return !1;
    let c = ht(t), h;
    try {
        h = ut(e);
    } catch {
        return !1;
    }
    let { n: a } = p, u = K(i, a), l = f(c * u, a), d = f(o * u, a), E = g.BASE.multiplyAndAddUnsafe(h, l, d);
    return E ? f(E.x, a) === o : !1;
}
function it(n) {
    return f(b(n), p.n);
}
var Z = class {
    constructor(t, e) {
        this.r = t, this.s = e, this.assertValidity();
    }
    static fromHex(t) {
        let e = R(t);
        if (e.length !== 64) {
            throw new TypeError(`SchnorrSignature.fromHex: expected 64 bytes, not ${e.length}`);
        }
        let r = b(e.subarray(0, 32)), s = b(e.subarray(32, 64));
        return new Z(r, s);
    }
    assertValidity() {
        let { r: t, s: e } = this;
        if (!et(t) || !F(e)) throw new Error("Invalid signature");
    }
    toHex() {
        return k(this.r) + k(this.s);
    }
    toRawBytes() {
        return N(this.toHex());
    }
};
function jt(n) {
    return g.fromPrivateKey(n).toRawX();
}
var ct = class {
    constructor(t, e, r = A.randomBytes()) {
        if (t == null) throw new TypeError(`sign: Expected valid message, not "${t}"`);
        this.m = R(t);
        let { x: s, scalar: o } = this.getScalar(C(e));
        if (this.px = s, this.d = o, this.rand = R(r), this.rand.length !== 32) {
            throw new TypeError("sign: Expected 32 bytes of aux randomness");
        }
    }
    getScalar(t) {
        let e = g.fromPrivateKey(t), r = e.hasEvenY() ? t : p.n - t;
        return { point: e, scalar: r, x: e.toRawX() };
    }
    initNonce(t, e) {
        return q(t ^ b(e));
    }
    finalizeNonce(t) {
        let e = f(b(t), p.n);
        if (e === w) throw new Error("sign: Creation of signature failed. k is zero");
        let { point: r, x: s, scalar: o } = this.getScalar(e);
        return { R: r, rx: s, k: o };
    }
    finalizeSig(t, e, r, s) {
        return new Z(t.x, f(e + r * s, p.n)).toRawBytes();
    }
    error() {
        throw new Error("sign: Invalid signature produced");
    }
    async calc() {
        let { m: t, d: e, px: r, rand: s } = this,
            o = A.taggedHash,
            i = this.initNonce(e, await o(U.aux, s)),
            { R: c, rx: h, k: a } = this.finalizeNonce(await o(U.nonce, i, r, t)),
            u = it(await o(U.challenge, h, r, t)),
            l = this.finalizeSig(c, a, u, e);
        return await Tt(l, t, r) || this.error(), l;
    }
    calcSync() {
        let { m: t, d: e, px: r, rand: s } = this,
            o = A.taggedHashSync,
            i = this.initNonce(e, o(U.aux, s)),
            { R: c, rx: h, k: a } = this.finalizeNonce(o(U.nonce, i, r, t)),
            u = it(o(U.challenge, h, r, t)),
            l = this.finalizeSig(c, a, u, e);
        return kt(l, t, r) || this.error(), l;
    }
};
async function _t(n, t, e) {
    return new ct(n, t, e).calc();
}
function Qt(n, t, e) {
    return new ct(n, t, e).calcSync();
}
function Ut(n, t, e) {
    let r = n instanceof Z, s = r ? n : Z.fromHex(n);
    return r && s.assertValidity(), { ...s, m: R(t), P: ut(e) };
}
function zt(n, t, e, r) {
    let s = g.BASE.multiplyAndAddUnsafe(t, C(e), f(-r, p.n));
    return !(!s || !s.hasEvenY() || s.x !== n);
}
async function Tt(n, t, e) {
    try {
        let { r, s, m: o, P: i } = Ut(n, t, e), c = it(await A.taggedHash(U.challenge, q(r), i.toRawX(), o));
        return zt(r, i, s, c);
    } catch {
        return !1;
    }
}
function kt(n, t, e) {
    try {
        let { r, s, m: o, P: i } = Ut(n, t, e), c = it(A.taggedHashSync(U.challenge, q(r), i.toRawX(), o));
        return zt(r, i, s, c);
    } catch (r) {
        if (r instanceof M) throw r;
        return !1;
    }
}
var ae = { Signature: Z, getPublicKey: jt, sign: _t, verify: Tt, signSync: Qt, verifySync: kt };
g.BASE._setWindowSize(8);
var S = { node: Xt, web: typeof self == "object" && "crypto" in self ? self.crypto : void 0 },
    U = { challenge: "BIP0340/challenge", aux: "BIP0340/aux", nonce: "BIP0340/nonce" },
    tt = {},
    A = {
        bytesToHex: X,
        hexToBytes: N,
        concatBytes: z,
        mod: f,
        invert: K,
        isValidPrivateKey(n) {
            try {
                return C(n), !0;
            } catch {
                return !1;
            }
        },
        _bigintTo32Bytes: q,
        _normalizePrivateKey: C,
        hashToPrivateKey: (n) => {
            n = R(n);
            let t = $ + 8;
            if (n.length < t || n.length > 1024) {
                throw new Error("Expected valid bytes of private key as per FIPS 186");
            }
            let e = f(b(n), p.n - m) + m;
            return q(e);
        },
        randomBytes: (n = 32) => {
            if (S.web) return S.web.getRandomValues(new Uint8Array(n));
            if (S.node) {
                let { randomBytes: t } = S.node;
                return Uint8Array.from(t(n));
            } else throw new Error("The environment doesn't have randomBytes function");
        },
        randomPrivateKey: () => A.hashToPrivateKey(A.randomBytes($ + 8)),
        precompute(n = 8, t = g.BASE) {
            let e = t === g.BASE ? t : new g(t.x, t.y);
            return e._setWindowSize(n), e.multiply(L), e;
        },
        sha256: async (...n) => {
            if (S.web) {
                let t = await S.web.subtle.digest("SHA-256", z(...n));
                return new Uint8Array(t);
            } else if (S.node) {
                let { createHash: t } = S.node, e = t("sha256");
                return n.forEach((r) => e.update(r)), Uint8Array.from(e.digest());
            } else throw new Error("The environment doesn't have sha256 function");
        },
        hmacSha256: async (n, ...t) => {
            if (S.web) {
                let e = await S.web.subtle.importKey(
                        "raw",
                        n,
                        { name: "HMAC", hash: { name: "SHA-256" } },
                        !1,
                        ["sign"],
                    ),
                    r = z(...t),
                    s = await S.web.subtle.sign("HMAC", e, r);
                return new Uint8Array(s);
            } else if (S.node) {
                let { createHmac: e } = S.node, r = e("sha256", n);
                return t.forEach((s) => r.update(s)), Uint8Array.from(r.digest());
            } else throw new Error("The environment doesn't have hmac-sha256 function");
        },
        sha256Sync: void 0,
        hmacSha256Sync: void 0,
        taggedHash: async (n, ...t) => {
            let e = tt[n];
            if (e === void 0) {
                let r = await A.sha256(Uint8Array.from(n, (s) => s.charCodeAt(0)));
                e = z(r, r), tt[n] = e;
            }
            return A.sha256(e, ...t);
        },
        taggedHashSync: (n, ...t) => {
            if (typeof P != "function") throw new M("sha256Sync is undefined, you need to set it");
            let e = tt[n];
            if (e === void 0) {
                let r = P(Uint8Array.from(n, (s) => s.charCodeAt(0)));
                e = z(r, r), tt[n] = e;
            }
            return P(e, ...t);
        },
        _JacobianPoint: y,
    };
Object.defineProperties(A, {
    sha256Sync: {
        configurable: !1,
        get() {
            return P;
        },
        set(n) {
            P || (P = n);
        },
    },
    hmacSha256Sync: {
        configurable: !1,
        get() {
            return G;
        },
        set(n) {
            G || (G = n);
        },
    },
});
export {
    A as utils,
    ae as schnorr,
    ce as signSync,
    fe as verify,
    g as Point,
    H as Signature,
    ie as sign,
    oe as getSharedSecret,
    p as CURVE,
    re as getPublicKey,
    se as recoverPublicKey,
};
/*! Bundled license information:

@noble/secp256k1/lib/esm/index.js:
  (*! noble-secp256k1 - MIT License (c) 2019 Paul Miller (paulmillr.com) *)
*/
