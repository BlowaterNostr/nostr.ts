import { assert, assertEquals, fail } from "https://deno.land/std@0.176.0/testing/asserts.ts";
import { PrivateKey } from "./key.ts";
import { InMemoryAccountContext, NostrKind, prepareNormalNostrEvent } from "./nostr.ts";
import { damus, wirednet } from "./relay-list.test.ts";
import { ConnectionPool, RelayGroupNotExist } from "./relay.ts";
import { Channel, sleep } from "https://raw.githubusercontent.com/BlowaterNostr/csp/master/csp.ts";

Deno.test("Relay Group", async () => {
    const pri = PrivateKey.Generate();
    const ctx = InMemoryAccountContext.New(pri);
    const pool = new ConnectionPool();
    pool.addRelayURLs([damus, wirednet]);
    {
        const e1 = await prepareNormalNostrEvent(ctx, NostrKind.TEXT_NOTE, [], "CI1");
        const e2 = await prepareNormalNostrEvent(ctx, NostrKind.TEXT_NOTE, [], "CI2");
        let err = await pool.sendEvent(e1, "A");
        assertEquals(err instanceof RelayGroupNotExist, true);

        // create the group
        const err2 = pool.addGroup("A", damus);
        assertEquals(err2 instanceof Error, false);

        const err3 = await pool.sendEvent(e1, "A");
        assertEquals(err3 instanceof Error, false);

        // able to add the same relay to many groups
        err = pool.addGroup("B", damus);
        assertEquals(err instanceof Error, false);
        err = pool.addGroup("B", wirednet);
        assertEquals(err instanceof Error, false);

        err = await pool.sendEvent(e2, "B");
        assertEquals(err instanceof Error, false);

        await sleep(500);

        // now
        // damus should have e1 and e2
        //   nos should only have e2
        const sub = await pool.newSub("test", {
            authors: [ctx.publicKey.hex],
        });
        if (sub instanceof Error) {
            fail(sub.message);
        }
        let i = 0;
        const resMap = new Map<string, Set<string>>();
        for await (const { res, url } of sub) {
            if (res.type == "EOSE") {
                i++;
                if (i == 2) {
                    break;
                }
                continue;
            }

            let set = resMap.get(url);
            if (!set) {
                set = new Set();
                resMap.set(url, set);
            }
            console.log("add", res.event.id, "to", url);
            set.add(res.event.id);
        }
        assertEquals(resMap.get(damus), new Set([e1.id, e2.id]));
        assertEquals(resMap.get(wirednet), new Set([e2.id]));
    }
    await pool.close();
});
