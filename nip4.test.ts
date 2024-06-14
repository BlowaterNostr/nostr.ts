import * as ende from "./nip4.ts";
import { assertEquals, assertNotInstanceOf, fail } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { utf8Decode, utf8Encode } from "./nip4.ts";
import { PrivateKey } from "./key.ts";
import { InMemoryAccountContext, NostrKind } from "./nostr.ts";
import { prepareEncryptedNostrEvent } from "./event.ts";

Deno.test("utf8 encrypt & decrypt", async (t) => {
    let pri1 = PrivateKey.Generate();
    let pub1 = pri1.toPublicKey();

    let pri2 = PrivateKey.Generate();
    let pub2 = pri2.toPublicKey();

    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Spread_syntax
    // the max number of arguments for spread operator is 126991
    let originalBin = new Uint8Array(126991);
    for (let i = 0; i < originalBin.length; i++) {
        // https://en.wikipedia.org/wiki/UTF-8
        originalBin.fill(Math.floor(Math.random() * Math.pow(2, 7)), i);
    }

    let originalStr = utf8Decode(originalBin);

    let start = Date.now();
    let encrypted = await ende.encrypt(pub2.hex, originalStr, pri1.hex);
    let t2 = Date.now();
    console.log("encrypt cost", t2 - start, "ms");
    let decrypted1 = await ende.decrypt(pri2.hex, pub1.hex, encrypted); // decrypt with receiver pri & sender  pub
    if (decrypted1 instanceof Error) {
        fail(decrypted1.message);
    }
    let t3 = Date.now();
    console.log("decrypt cost", t3 - t2, "ms");
    let decrypted2 = await ende.decrypt(pri1.hex, pub2.hex, encrypted); // decrypt with sender   pri & reciver pub

    assertEquals(decrypted1, originalStr);
    assertEquals(decrypted2, originalStr);

    let decryptedBin1 = utf8Encode(decrypted1);
    assertEquals(decryptedBin1.length, originalBin.length);
    assertEquals(decryptedBin1.byteLength, originalBin.byteLength);

    await t.step("decrpt invalid content", async () => {
        const err = await ende.decrypt(pri2.hex, pub1.hex, "a random string");
        assertEquals(err instanceof Error, true);
        assertEquals(
            err.toString(),
            "Error: failed to decode, InvalidCharacterError: Failed to decode base64",
        );
        const invalidIv64 = await ende.decrypt(pri2.hex, pub1.hex, "5l2hCloJ8iFAHpfr2UkuYg==");
        assertEquals(invalidIv64 instanceof Error, true);
        assertEquals(
            invalidIv64.toString(),
            "Error: failed to decode, InvalidCharacterError: Failed to decode base64",
        );
    });
});

Deno.test("decryption performance", async (t) => {
    const ctx = InMemoryAccountContext.New(PrivateKey.Generate());
    const event = await prepareEncryptedNostrEvent(
        ctx,
        {
            encryptKey: ctx.publicKey,
            kind: NostrKind.DIRECT_MESSAGE,
            tags: [],
            content: "whatever",
            algorithm: "nip4",
        },
    );
    assertNotInstanceOf(event, Error);

    await t.step("decrypt", async () => {
        for (let i = 0; i < 100; i++) {
            const err = await ctx.decrypt(ctx.publicKey.hex, event.content, "nip4");
            if (err instanceof Error) {
                fail(err.message);
            }
        }
    });
});

Deno.test("decryption performance: large data", async (t) => {
    const ctx = InMemoryAccountContext.New(PrivateKey.Generate());
    const data = "1".repeat(10 * 1024 * 1024); // 10 MB
    const event = await prepareEncryptedNostrEvent(ctx, {
        encryptKey: ctx.publicKey,
        kind: NostrKind.DIRECT_MESSAGE,
        content: data,
        algorithm: "nip4",
    });
    assertNotInstanceOf(event, Error);

    let result;
    await t.step("decrypt", async () => {
        result = await ctx.decrypt(ctx.publicKey.hex, event.content, "nip4");
        if (result instanceof Error) fail(result.message);
    });
    assertEquals(result, data);
});
