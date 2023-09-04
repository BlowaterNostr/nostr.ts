import { fail } from "https://deno.land/std@0.176.0/testing/asserts.ts";
import { SingleRelayConnection } from "./relay.ts";
import { AsyncWebSocket } from "./websocket.ts";
import { Negentropy } from "./negentropy.js";
import { NostrEvent, NostrFilters, RelayResponse_REQ_Message } from "./nostr.ts";
import { hexToBytes } from "https://esm.sh/v131/@noble/hashes@1.3.2/utils.js";
import { Channel } from "https://raw.githubusercontent.com/BlowaterNostr/csp/master/csp.ts";


async function Neg(
    relay: SingleRelayConnection,
    subID: string,
    filter: NostrFilters,
    events: Iterable<NostrEvent>,
) {
    const idSize = 32;
    let ne = new Negentropy(idSize, 50000);

    for (let event of events) {
        ne.addItem(event.created_at, hexToBytes(event.id));
    }

    ne.seal();

    const err = await relay.ws.send(JSON.stringify([
        "NEG-OPEN",
        subID,
        filter,
        idSize,
        ne.initiate(),
    ]));
    if (err) {
        return err;
    }

    const chan = new Channel<RelayResponse_REQ_Message>();
    // @ts-ignore debug id
    relay.subscriptionMap.set(subID, { filter, chan });
    return { filter, chan, ne };
}

Deno.test("Negentropy", async () => {
    const relay = SingleRelayConnection.New("wss://soloco.nl", AsyncWebSocket.New);
    if (relay instanceof Error) {
        fail(relay.message);
    }
    await relay.untilOpen();
    {
        const s = new Set();
        const stream = await Neg(relay, "test", {
            limit: 3
        }, []);
        if (stream instanceof Error) fail(stream.message);
        for await (const msg of stream.chan) {
            s.add(msg);
            console.log("::", msg);

            if(msg.type == "NEG-MSG") {
                let [newMsg, have, need] = stream.ne.reconcile(msg.msg);
                console.log("?", newMsg, "|", have, "|", need)
            }
        }
    }
    await relay.close();
});
