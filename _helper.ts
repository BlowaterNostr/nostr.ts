export function parseJSON<T extends {}>(content: string): T | SyntaxError {
    try {
        return JSON.parse(content) as T;
    } catch (e) {
        return e as SyntaxError;
    }
}

// Datetime format string for Event V2
export const RFC3339 = "yyyy-MM-ddTHH:mm:ss.SSSZ";

export class RESTRequestFailed extends Error {
    constructor(public readonly res: Response, public readonly message: string) {
        super(`Failed to request rest api, ${res.status}:${res.statusText}`);
        this.name = RESTRequestFailed.name;
    }
}
