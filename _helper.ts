export function parseJSON<T>(content: string): T | Error {
    try {
        return JSON.parse(content) as T;
    } catch (e) {
        return e as Error;
    }
}

// Datetime format string for Event V2
export const RFC3339 = "yyyy-MM-ddTHH:mm:ss.SSSZ";
