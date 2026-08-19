export interface ApiErrorBody {
    statusCode?: number;
    message?: string | string[];
    error?: string;
}
export declare class DreamCmsError extends Error {
    readonly status: number;
    readonly details: string[];
    readonly body: unknown;
    constructor(status: number, body: unknown);
}
//# sourceMappingURL=error.d.ts.map