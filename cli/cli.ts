import { PrivateKey } from "../key.ts";

if(Deno.args.length == 0) {
    console.log("")
}

const command = Deno.args[0]
if(command == "keygen") {
    const pri = PrivateKey.Generate();
    console.log("Private Key:")
    console.log(pri.hex)
    console.log(pri.bech32)
    const pub = pri.toPublicKey()
    console.log("\nPublic Key:")
    console.log(pub.hex)
    console.log(pub.bech32())
}
