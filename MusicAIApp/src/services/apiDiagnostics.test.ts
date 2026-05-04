import { checkBackendHealth, getConfiguredApiBaseUrl } from './apiDiagnostics';

const originalApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
const originalFetch = global.fetch;

function mockJsonResponse(status: number, payload: unknown) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: jest.fn(() => Promise.resolve(payload)),
    } as unknown as Response;
}

describe('apiDiagnostics', () => {
    beforeEach(() => {
        process.env.EXPO_PUBLIC_API_BASE_URL = 'http://192.0.2.10:8000';
        global.fetch = jest.fn();
    });

    afterEach(() => {
        process.env.EXPO_PUBLIC_API_BASE_URL = originalApiBaseUrl;
        global.fetch = originalFetch;
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    it('returns missing_base_url when EXPO_PUBLIC_API_BASE_URL is missing', async () => {
        delete process.env.EXPO_PUBLIC_API_BASE_URL;

        await expect(checkBackendHealth()).resolves.toMatchObject({
            ok: false,
            baseUrl: null,
            reason: 'missing_base_url',
        });
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('sanitizes configured API base URL values', () => {
        process.env.EXPO_PUBLIC_API_BASE_URL = ' "http://192.0.2.10:8000/" ';

        expect(getConfiguredApiBaseUrl()).toBe('http://192.0.2.10:8000');
    });

    it('returns ok for a valid backend health response', async () => {
        jest.mocked(global.fetch).mockResolvedValue(
            mockJsonResponse(200, {
                status: 'ok',
                service: 'tuneup-backend',
                version: 'unknown',
                environment: 'development',
                timestamp: '2026-04-27T12:00:00Z',
            }),
        );

        const result = await checkBackendHealth();

        expect(result).toMatchObject({
            ok: true,
            baseUrl: 'http://192.0.2.10:8000',
            statusCode: 200,
            service: 'tuneup-backend',
            backendStatus: 'ok',
            environment: 'development',
            version: 'unknown',
        });
        expect(global.fetch).toHaveBeenCalledWith(
            'http://192.0.2.10:8000/health',
            expect.any(Object),
        );
    });

    it('returns bad_status for non-200 health responses', async () => {
        jest.mocked(global.fetch).mockResolvedValue(mockJsonResponse(503, { status: 'degraded' }));

        await expect(checkBackendHealth()).resolves.toMatchObject({
            ok: false,
            reason: 'bad_status',
            statusCode: 503,
        });
    });

    it('returns invalid_response for malformed health payloads', async () => {
        jest.mocked(global.fetch).mockResolvedValue(
            mockJsonResponse(200, { service: 'tuneup-backend' }),
        );

        await expect(checkBackendHealth()).resolves.toMatchObject({
            ok: false,
            reason: 'invalid_response',
            statusCode: 200,
        });
    });

    it('returns invalid_response when /health does not return JSON', async () => {
        jest.mocked(global.fetch).mockResolvedValue({
            ok: true,
            status: 200,
            json: jest.fn(() => Promise.reject(new Error('invalid json'))),
        } as unknown as Response);

        await expect(checkBackendHealth()).resolves.toMatchObject({
            ok: false,
            reason: 'invalid_response',
            statusCode: 200,
        });
    });

    it('returns network_error when fetch rejects', async () => {
        jest.mocked(global.fetch).mockRejectedValue(new TypeError('Network request failed'));

        await expect(checkBackendHealth()).resolves.toMatchObject({
            ok: false,
            reason: 'network_error',
        });
    });

    it('returns timeout when the health request is aborted', async () => {
        jest.useFakeTimers();
        jest.mocked(global.fetch).mockImplementation(
            (_url, init) =>
                new Promise((_resolve, reject) => {
                    const signal = init?.signal as AbortSignal | undefined;
                    signal?.addEventListener('abort', () => {
                        const error = new Error('aborted');
                        error.name = 'AbortError';
                        reject(error);
                    });
                }),
        );

        const checkPromise = checkBackendHealth(100);
        jest.advanceTimersByTime(100);

        await expect(checkPromise).resolves.toMatchObject({
            ok: false,
            reason: 'timeout',
        });
    });
});
