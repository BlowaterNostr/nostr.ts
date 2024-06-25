export function parseJSON<T>(content: string): T | Error {
    try {
        return JSON.parse(content) as T;
    } catch (e) {
        return e as Error;
    }
}

// Datetime format string for Event V2
export const RFC3339 = "yyyy-MM-ddTHH:mm:ss.SSSZ";

export class RESTRequestFailed extends Error {
    constructor(public readonly status: number, public readonly message: string) {
        super(`Failed to request rest api, ${status}: ${message}`);
        this.name = RESTRequestFailed.name;
    }
}
