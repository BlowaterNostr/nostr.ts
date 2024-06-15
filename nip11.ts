export async function getRelayInformation(url: string) {
    const httpURL = new URL(url);
    httpURL.protocol = httpURL.protocol == "wss:" ? "https" : "http";

    let res: Response;
    try {
        res = await fetch(httpURL, {
            headers: {
                "accept": "application/nostr+json",
            },
        });
    } catch (e) {
        return e as TypeError;
    }

    if (!res.ok) {
        return new Error(`Faild to get detail, ${res.status}: ${await res.text()}`);
    }

    try {
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
