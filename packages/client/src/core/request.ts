import { DreamCmsError } from './error.js';
import {
    appendQuery,
    type QueryParams,
    } from './query.js';

export interface TokenProvider {
    getAccessToken(): 
    | string
    | null
    | Promise<string | null>;
}

export interface RequestClientOptions {
    baseUrl: string;
    tokenProvider?: TokenProvider;
    fetchImpl?: typeof globalThis.fetch;
}

export interface ApiRequestOptions {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    query?: QueryParams;
    body?: unknown;
    accessToken?: string | null;
    signal?: AbortSignal;
}

export class RequestClient {
    private readonly baseUrl: string;
    private readonly tokenProvider?: TokenProvider;
    private readonly fetchImpl: typeof globalThis.fetch;

    constructor(options: RequestClientOptions) {
        this.baseUrl = options.baseUrl.replace(/\/+$/, ''); // 移除尾部的斜杠
        this.tokenProvider = options.tokenProvider;
        this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    }

    async request<T>(
        pathname: string,
        options: ApiRequestOptions = {},
    ): Promise<T> {
        const accessToken = 
          options.accessToken !== undefined
          ? options.accessToken
          : await this.tokenProvider?.getAccessToken();

        const headers = new Headers({
            Accept: 'application/json',
        })
    
        if (options.body !== undefined) {
            headers.set('Content-Type', 'application/json');
        }

        if (accessToken) {
            headers.set('Authorization', `Bearer ${accessToken}`);
        }

        const url = this.baseUrl + appendQuery(pathname, options.query);

        const response = await this.fetchImpl(url, {
            method: options.method ?? 'GET',
            headers,
            body: 
                options.body === undefined 
                ? undefined
                : JSON.stringify(options.body),
            signal: options.signal,
        });

        const responseBody = await readResponseBody(response);

        if (!response.ok) {
            throw new DreamCmsError(
                response.status,
                responseBody,
            );
        }

        return responseBody as T;
    }   
}

async function readResponseBody(
    response: Response
    ): Promise<unknown> {
        const text = await response.text();

        if (!text) {
            return undefined;
        }

        try {
            return JSON.parse(text) as unknown;
        } catch {
            return text;
        }
}