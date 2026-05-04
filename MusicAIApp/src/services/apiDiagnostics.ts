import { Platform } from 'react-native';

const URL_PROTOCOL_PATTERN = /^https?:\/\//i;
const DEFAULT_TIMEOUT_MS = 5000;

export type ApiDiagnosticsFailureReason =
    | 'missing_base_url'
    | 'timeout'
    | 'network_error'
    | 'bad_status'
    | 'invalid_response';

export type ApiDiagnosticsResult =
    | {
          ok: true;
          baseUrl: string;
          statusCode: number;
          latencyMs: number;
          service?: string;
          backendStatus?: string;
          environment?: string;
          version?: string;
          timestamp?: string;
      }
    | {
          ok: false;
          baseUrl: string | null;
          reason: ApiDiagnosticsFailureReason;
          statusCode?: number;
          latencyMs?: number;
          message: string;
      };

function sanitizeConfiguredBaseUrl(rawValue?: string) {
    if (!rawValue || !rawValue.trim()) {
        return null;
    }

    const trimmed = rawValue.trim();
    const markdownLinkMatch = trimmed.match(/^\[[^\]]+\]\((https?:\/\/[^)]+)\)$/i);
    const directUrlMatch = trimmed.match(/https?:\/\/[^\s\])>]+/i);
    const candidate = (markdownLinkMatch?.[1] ?? directUrlMatch?.[0] ?? trimmed)
        .trim()
        .replace(/^['"<]+/, '')
        .replace(/[>'"]+$/, '');

    if (!URL_PROTOCOL_PATTERN.test(candidate)) {
        return null;
    }

    try {
        return new URL(candidate).toString().replace(/\/$/, '');
    } catch {
        return null;
    }
}

function isLocalhostBaseUrl(baseUrl: string | null) {
    return !!baseUrl && /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(baseUrl);
}

function localDevelopmentHint(baseUrl: string | null) {
    if (isLocalhostBaseUrl(baseUrl)) {
        return ' On a physical device, localhost points to the phone, not your computer. Use your computer LAN IP instead.';
    }

    return '';
}

function networkHint(baseUrl: string | null) {
    const webHint =
        Platform.OS === 'web'
            ? ' If this is Expo web, also check CORS_ALLOW_ORIGINS in backend/.env.'
            : '';

    return ` Make sure the backend is running, the port is correct, and both devices are on the same Wi-Fi.${localDevelopmentHint(baseUrl)}${webHint}`;
}

function isHealthPayload(
    payload: unknown,
): payload is Record<string, unknown> & { status: string } {
    return (
        typeof payload === 'object' &&
        payload !== null &&
        typeof (payload as Record<string, unknown>).status === 'string'
    );
}

export function getConfiguredApiBaseUrl() {
    return sanitizeConfiguredBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL);
}

export async function checkBackendHealth(
    timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<ApiDiagnosticsResult> {
    const baseUrl = getConfiguredApiBaseUrl();
    if (!baseUrl) {
        return {
            ok: false,
            baseUrl: null,
            reason: 'missing_base_url',
            message: 'Missing EXPO_PUBLIC_API_BASE_URL. Check MusicAIApp/.env.',
        };
    }

    const startedAt = Date.now();
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = setTimeout(() => {
        controller?.abort();
    }, timeoutMs);

    try {
        const response = await fetch(`${baseUrl}/health`, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            signal: controller?.signal,
        });
        const latencyMs = Date.now() - startedAt;

        if (!response.ok) {
            return {
                ok: false,
                baseUrl,
                reason: 'bad_status',
                statusCode: response.status,
                latencyMs,
                message: `Backend /health returned HTTP ${response.status}.${networkHint(baseUrl)}`,
            };
        }

        let payload: unknown;
        try {
            payload = await response.json();
        } catch {
            return {
                ok: false,
                baseUrl,
                reason: 'invalid_response',
                statusCode: response.status,
                latencyMs,
                message: 'Backend returned an unexpected response from /health.',
            };
        }

        if (!isHealthPayload(payload)) {
            return {
                ok: false,
                baseUrl,
                reason: 'invalid_response',
                statusCode: response.status,
                latencyMs,
                message: 'Backend returned an unexpected response from /health.',
            };
        }

        return {
            ok: true,
            baseUrl,
            statusCode: response.status,
            latencyMs,
            service: typeof payload.service === 'string' ? payload.service : undefined,
            backendStatus: payload.status,
            environment: typeof payload.environment === 'string' ? payload.environment : undefined,
            version: typeof payload.version === 'string' ? payload.version : undefined,
            timestamp: typeof payload.timestamp === 'string' ? payload.timestamp : undefined,
        };
    } catch (error) {
        const latencyMs = Date.now() - startedAt;
        const isAbort = error instanceof Error && error.name === 'AbortError';
        return {
            ok: false,
            baseUrl,
            reason: isAbort ? 'timeout' : 'network_error',
            latencyMs,
            message: isAbort
                ? `Backend request timed out. Check the IP address and port.${localDevelopmentHint(baseUrl)}`
                : `Could not reach backend.${networkHint(baseUrl)}`,
        };
    } finally {
        clearTimeout(timeoutId);
    }
}
