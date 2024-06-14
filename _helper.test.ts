import { compareRFC3339, nowRFC3339, parseRFC3339 } from "./_helper.ts";
import { assertEquals } from "https://deno.land/std@0.220.1/assert/assert_equals.ts";
import { fail } from "https://deno.land/std@0.224.0/assert/fail.ts";

Deno.test("rfc3339", async (t) => {
    const now = nowRFC3339();

    await t.step("now is rfc3339 format", () => {
        const regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/;
        assertEquals(regex.test(now), true);
    });

    await t.step("now can parse", () => {
        const parsed = parseRFC3339(now);
        if (parsed instanceof Error) fail(parsed.message);
    });

    await t.step("time compare", () => {
        const new_now = nowRFC3339();
        const compared = compareRFC3339(new_now, now);
        if (compared instanceof Error) fail(compared.message);
        assertEquals(compared > 0, true);
    });
});
