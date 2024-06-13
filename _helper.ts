import { format, parse } from "https://deno.land/std@0.224.0/datetime/mod.ts";

export function parseJSON<T>(content: string): T | Error {
    try {
        return JSON.parse(content) as T;
    } catch (e) {
        return e as Error;
    }
}

export function nowTime() {
    return format(new Date(), "yyyy-MM-ddTHH:mm:ss.SSSZ");
}

export function parseTime(time: string) {
    return parse(time, "yyyy-MM-ddTHH:mm:ss.SSSZ");
}

export function compareTime(a: string, b: string): number {
    return parseFloat(a) - parseFloat(b);
}
