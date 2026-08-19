export class DreamCmsError extends Error {
    status;
    details;
    body;
    constructor(status, body) {
        const parsedBody = isApiErrorBody(body) ? body : undefined;
        const details = normalizeMessages(parsedBody?.message);
        super(details[0] ?? `Request failed with status ${status}`);
        this.name = 'DreamCmsError';
        this.status = status;
        this.details = details;
        this.body = body;
    }
}
function isApiErrorBody(value) {
    return typeof value === 'object' && value !== null;
}
function normalizeMessages(message) {
    if (typeof message === 'string') {
        return [message];
    }
    if (Array.isArray(message)) {
        return message.filter((item) => typeof item === 'string');
    }
    return [];
}
//# sourceMappingURL=error.js.map