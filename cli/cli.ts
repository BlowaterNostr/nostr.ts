import { PrivateKey } from "../key.ts";

let command: string;
if (Deno.args.length == 0) {
    command = "h"
} else {
    command = Deno.args[0].toLowerCase();
}

if (command == "keygen") {
    const pri = PrivateKey.Generate();
    console.log("Private Key:");
    console.log(pri.hex);
    console.log(pri.bech32);
    const pub = pri.toPublicKey();
    console.log("\nPublic Key:");
    console.log(pub.hex);
    console.log(pub.bech32());
} else if(["h", "help", "-h", "-help", "--help"]) {
    console.log("nostr keygen - generate key pairs")
}
