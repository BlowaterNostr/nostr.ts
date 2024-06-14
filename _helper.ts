import { difference, format, parse } from "https://deno.land/std@0.224.0/datetime/mod.ts";

export function parseJSON<T>(content: string): T | Error {
    try {
        return JSON.parse(content) as T;
    } catch (e) {
        return e as Error;
    }
}

export function nowRFC3339(): string {
    return format(new Date(), "yyyy-MM-ddTHH:mm:ss.SSSZ");
}

export function parseRFC3339(time: string): Date | Error {
    const regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/;
    if (!regex.test(time)) {
        return new Error(`${time} is not a supported rfc3339 time format`);
    }

    try {
        return parse(time, "yyyy-MM-ddTHH:mm:ss.SSSZ");
    } catch (e) {
        // Impossible
        return e as Error;
    }
}

export function compareRFC3339(a: string, b: string): number | Error {
    const parsed_a = parseRFC3339(a);
    const parsed_b = parseRFC3339(b);

    if (parsed_a instanceof Error) return parsed_a;
    if (parsed_b instanceof Error) return parsed_b;

    return difference(parsed_a, parsed_b).milliseconds || 0; // Must include milliseconds
}
