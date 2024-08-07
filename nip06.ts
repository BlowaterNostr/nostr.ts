// copied from https://github.com/nbd-wtf/nostr-tools/blob/master/nip06.ts
import { encodeHex } from "@std/encoding";
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { HDKey } from "@scure/bip32";
import { PrivateKey } from "./key.ts";

export function privateKeyFromSeedWords(mnemonic: string | string[], passphrase?: string) {
    if (mnemonic instanceof Array) {
        mnemonic = mnemonic.join(" ");
    }
    let root = HDKey.fromMasterSeed(mnemonicToSeedSync(mnemonic, passphrase));
    let privateKey = root.derive(`m/44'/1237'/0'/0/0`).privateKey;
    if (!privateKey) return Error("could not derive private key");
    const hex = encodeHex(privateKey);
    return PrivateKey.FromHex(hex);
}

// 128: 12 words
// 192: 18 words
// 256: 24 words
export function generateSeedWords(strength: 128 | 192 | 256): string[] {
    return generateMnemonic(wordlist, strength).split(" ");
}

export function validateWords(words: string | string[]): boolean {
    if (words instanceof Array) {
        words = words.join(" ");
    }
    return validateMnemonic(words, wordlist);
}
