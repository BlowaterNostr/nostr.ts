import { Command } from "https://deno.land/x/cliffy@v1.0.0-rc.3/command/mod.ts";

await new Command()
    .name("nostr")
    .version("3.0.0")
    .description("nostr command line")
    .parse(Deno.args);
