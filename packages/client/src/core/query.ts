export type QueryValue = 
    | string
    | number
    | boolean
    | null
    | undefined;

export type QueryParams = Record<string, QueryValue>;

export function appendQuery(
    pathname: string,
    query?: QueryParams,
): string {
    if (!query){
        return pathname;
    }

    const search = new URLSearchParams();

    for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) {
            search.set(key, String(value));
        }
    }

    const queryString = search.toString();

    return queryString ? `${pathname}?${queryString}` : pathname;
}