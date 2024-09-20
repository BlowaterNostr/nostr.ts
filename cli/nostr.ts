import { PrivateKey } from "../key.ts";
import { NoteID } from "../nip19.ts";
import { relays } from "../tests/relay-list.test.ts";
import { ConnectionPool } from "../relay-pool.ts";

async function main() {
    let command: string;
    if (Deno.args.length == 0) {
        command = "h";
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
    } else if (command == "get") {
        const id = Deno.args[1];
        if (id == undefined) {
            console.log("need an id, for example:");
            console.log("nostr get key/event id/nip19");
            return;
        }
        const eventID = NoteID.FromString(id);
        const pool = new ConnectionPool();
        const err = await pool.addRelayURLs(relays);
        if (err instanceof Error) {
            return err;
        }
        const event = await pool.getEvent(eventID.hex);
        console.log(event);
        await pool.close();
    } else {
        console.log("nostr keygen - generate key pairs");
        console.log("nostr get [event id] - get event from relays");
    }
}

const err = await main();
if (err instanceof Error) {
    console.error(err);
}
