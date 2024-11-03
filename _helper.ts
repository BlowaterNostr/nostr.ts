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
    constructor(public readonly res: Response, public override readonly message: string) {
        super(`Failed to request rest api, ${res.status}:${res.statusText}`);
        this.name = RESTRequestFailed.name;
    }
}

export function newURL(url: string | URL): URL | TypeError {
    try {
        // https://developer.mozilla.org/en-US/docs/Web/API/URL/URL#exceptions
        return new URL(url);
    } catch (e) {
        return e as TypeError;
    }
}
