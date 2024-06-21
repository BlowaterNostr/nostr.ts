import { RESTRequestFailed } from "./space-member.ts";

export async function getRelayInformation(url: string) {
    try {
        const httpURL = new URL(url);
        httpURL.protocol = httpURL.protocol == "wss:" ? "https" : "http";
        const res = await fetch(httpURL, {
            headers: {
                "accept": "application/nostr+json",
            },
        });
        if (!res.ok) {
            return new RESTRequestFailed(res.status, await res.text());
        }
        const detail = await res.text();
        const info = JSON.parse(detail) as RelayInformation;
        if (!info.icon) {
            info.icon = robohash(url);
        }
        return info;
    } catch (e) {
        return e as Error;
    }
}

export type RelayInformation = {
    name?: string;
    description?: string;
    pubkey?: string;
    contact?: string;
    supported_nips?: number[];
    software?: string;
    version?: string;
    icon?: string;
};

export function robohash(url: string | URL) {
    return `https://robohash.org/${url}`;
}
