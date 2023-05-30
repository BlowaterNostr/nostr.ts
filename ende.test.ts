import { generatePrivateKey, toPublicKey } from "./key.ts";
import * as ende from "./ende.ts";
import { assertEquals } from "https://deno.land/std@0.176.0/testing/asserts.ts";
import { utf8Decode, utf8Encode } from "./ende.ts";

Deno.test("utf8 encrypt & decrypt", async () => {
    let pri1 = generatePrivateKey();
    let pub1 = toPublicKey(pri1);

    let pri2 = generatePrivateKey();
    let pub2 = toPublicKey(pri2);

    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Spread_syntax
    // the max number of arguments for spread operator is 126991
    let originalBin = new Uint8Array(126991);
    for (let i = 0; i < originalBin.length; i++) {
        // https://en.wikipedia.org/wiki/UTF-8
        originalBin.fill(Math.floor(Math.random() * Math.pow(2, 7)), i);
    }

    let originalStr = utf8Decode(originalBin);

    let start = Date.now();
    let encrypted = await ende.encrypt(pub2, originalStr, pri1);
    let t2 = Date.now();
    console.log("encrypt cost", t2 - start, "ms");
    let decrypted1 = await ende.decrypt(pri2, pub1, encrypted); // decrypt with receiver pri & sender  pub
    let t3 = Date.now();
    console.log("decrypt cost", t3 - t2, "ms");
    let decrypted2 = await ende.decrypt(pri1, pub2, encrypted); // decrypt with sender   pri & reciver pub

    assertEquals(decrypted1, originalStr);
    assertEquals(decrypted2, originalStr);

    let decryptedBin1 = utf8Encode(decrypted1);
    assertEquals(decryptedBin1.length, originalBin.length);
    assertEquals(decryptedBin1.byteLength, originalBin.byteLength);
});
