/**
 * @fileOverview Institutional HTTP Client using Native Fetch API.
 * Hardened with:
 * - Request size limits (10MB max)
 * - Timeout enforcement (30s)
 * - SSRF Prevention (Private IP blocking)
 * - Automatic Security Headers
 */

const MAX_CONTENT_LENGTH = 10 * 1024 * 1024; // 10MB
const REQUEST_TIMEOUT = 30000; // 30 seconds

export interface FetchOptions extends RequestInit {
  timeout?: number;
  validateStatus?: (status: number) => boolean;
}

export interface FetchResponse<T = any> {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Headers;
  data: T;
  error?: string;
}

export class InstitutionalHttpClient {
  /**
   * Internal timeout controller.
   */
  private static createTimeoutSignal(ms: number, signal?: AbortSignal): AbortSignal {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), ms);
    signal?.addEventListener('abort', () => clearTimeout(id));
    return controller.signal;
  }

  /**
   * Validates target URL to prevent SSRF (Server-Side Request Forgery).
   */
  private static validateTargetUrl(url: string): void {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();
      
      const blockedPatterns = [
        'localhost',
        '127.0.0.1',
        '0.0.0.0',
        '169.254', // Link-local
        '192.168', // Private Class C
        '10.0',    // Private Class A
        '172.16',  // Private Class B
      ];

      if (blockedPatterns.some(pattern => hostname.includes(pattern))) {
        throw new Error(`[Security Alert] SSRF attempt blocked: ${hostname}`);
      }
    } catch (error: any) {
      throw new Error(error.message || `Invalid or restricted destination: ${url}`);
    }
  }

  static async get<T = any>(url: string, options?: FetchOptions): Promise<FetchResponse<T>> {
    return this.request<T>(url, { ...options, method: 'GET' });
  }

  static async post<T = any>(url: string, data?: any, options?: FetchOptions): Promise<FetchResponse<T>> {
    const body = JSON.stringify(data || {});
    
    if (Buffer.byteLength(body, 'utf8') > MAX_CONTENT_LENGTH) {
      return {
        ok: false,
        status: 413,
        statusText: 'Payload Too Large',
        headers: new Headers(),
        data: null as T,
        error: 'Request payload exceeds institutional 10MB limit',
      };
    }

    return this.request<T>(url, { ...options, method: 'POST', body });
  }

  private static async request<T = any>(url: string, options: FetchOptions = {}): Promise<FetchResponse<T>> {
    const timeout = options.timeout || REQUEST_TIMEOUT;
    const validateStatus = options.validateStatus || ((status) => status >= 200 && status < 300);

    try {
      this.validateTargetUrl(url);
      const signal = this.createTimeoutSignal(timeout, options.signal);

      const headers = new Headers(options.headers || {});
      headers.set('Content-Type', 'application/json');
      headers.set('X-Content-Type-Options', 'nosniff');
      headers.set('X-Request-Origin', 'NIB-INTERNAL');

      const response = await fetch(url, { ...options, headers, signal });

      const contentType = response.headers.get('content-type');
      let data: T;

      if (contentType?.includes('application/json')) {
        data = await response.json();
      } else if (contentType?.includes('text')) {
        data = (await response.text()) as T;
      } else {
        data = (await response.blob()) as T;
      }

      const isValid = validateStatus(response.status);

      return {
        ok: isValid,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        data,
        error: isValid ? undefined : `Institutional Gateway Error: ${response.status}`,
      };
    } catch (error: any) {
      console.error('[Institutional HTTP Client] Request Fault:', { url, error: error.message });
      return {
        ok: false,
        status: 0,
        statusText: 'Network Error',
        headers: new Headers(),
        data: null as T,
        error: error.message.includes('abort') ? 'Request timeout' : error.message,
      };
    }
  }
}

export default InstitutionalHttpClient;
