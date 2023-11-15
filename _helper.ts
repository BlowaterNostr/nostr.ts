export function parseJSON<T>(content: string): T | Error {
    try {
        return JSON.parse(content) as T;
    } catch (e) {
        return e as Error;
    }
}

export function groupBy<group, T>(
    sequence: Iterable<T>,
    grouper: (element: T) => group,
): Map<group, T[]> {
    const map = new Map<group, T[]>();
    for (const event of sequence) {
        const groupID = grouper(event);
        const group = map.get(groupID);
        if (group) {
            group.push(event);
        } else {
            map.set(groupID, [event]);
        }
    }
    return map;
}
