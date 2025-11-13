import { useAuth } from "@/context/AuthContext";

import { useAuth } from "@/context/AuthContext";

// Determine API base URL based on environment
// In production/builder.io, always use relative '/api' to avoid port issues
// In development, use VITE_API_URL if set, otherwise default to '/api'
const API_BASE_URL = import.meta.env.PROD
  ? '/api'
  : (import.meta.env.VITE_API_URL || '/api');

export async function apiFetch(path: string, options: RequestInit = {}, userId?: string): Promise<unknown> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  // Normalize body: accept object or string, avoid touching streams
  let body: unknown = null;
  if (options.body) {
    if (typeof options.body === 'string') {
      try {
        body = JSON.parse(options.body) as Record<string, unknown>;
      } catch {
        body = options.body;
      }
    } else {
      // If it's a plain object (JSON), use it. If it's a FormData/Blob/Stream, keep as-is.
      body = options.body;
    }
  }

  let url = path.startsWith('http') ? path : `${API_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
  if ((options.method || 'GET') === 'GET' && userId) {
    const separator = url.includes('?') ? '&' : '?';
    url = `${url}${separator}userId=${encodeURIComponent(userId)}`;
  }

  const payload = userId && body && (options.method || 'POST') !== 'GET'
    ? { ...(typeof body === 'object' && !(body instanceof FormData) ? (body as Record<string, unknown>) : {}), userId }
    : body;

  // Build a clean RequestInit to avoid accidentally reusing an already-read body stream from caller
  const init: RequestInit = {
    method: options.method || 'GET',
    headers,
    // Only attach JSON string body for typical JSON payloads. If original body is FormData/Blob, pass it through.
    body: (initBodyForPayload(payload, options)) as BodyInit | undefined,
    signal: options.signal,
    credentials: options.credentials,
    mode: options.mode,
    cache: options.cache,
  };

  const res = await fetch(url, init);

  if (!res.ok) {
    // Try to read response body for diagnostic, but guard against double reads
    let errorText: string | null = null;
    try {
      errorText = await res.text();
    } catch (err) {
      // ignore
    }
    throw new Error(`API error: ${res.status} ${res.statusText}${errorText ? ` - ${errorText}` : ''}`);
  }

  // Try to parse JSON, fallback to text if parsing fails
  try {
    return await res.json();
  } catch {
    return await res.text();
  }
}

function initBodyForPayload(payload: unknown, options: RequestInit): BodyInit | undefined {
  // If original options.body is FormData/Blob/URLSearchParams, prefer passing it directly
  const originalBody = options.body as BodyInit | undefined;
  if (originalBody instanceof FormData || originalBody instanceof Blob || originalBody instanceof URLSearchParams) {
    return originalBody as BodyInit;
  }

  // For JSON-compatible payloads, stringify
  if (payload === undefined || payload === null) return undefined;
  try {
    return typeof payload === 'string' ? payload : JSON.stringify(payload);
  } catch {
    return undefined;
  }
}

export async function apiDownload(path: string, userId?: string): Promise<void> {
  // Use the same environment-aware URL resolution as apiFetch
  const API_BASE_URL = import.meta.env.PROD 
    ? '/api' 
    : (import.meta.env.VITE_API_URL || '/api');
  let url = path.startsWith('http') ? path : `${API_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
  
  if (userId) {
    const separator = url.includes('?') ? '&' : '?';
    url = `${url}${separator}userId=${encodeURIComponent(userId)}`;
  }
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download error: ${response.status} ${response.statusText}`);
  }
  
  const blob = await response.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  
  // Extract filename from URL headers or use a default
  const contentDisposition = response.headers.get('content-disposition');
  let filename = 'download';
  if (contentDisposition) {
    const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
    if (filenameMatch) {
      filename = filenameMatch[1];
    }
  }
  
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(downloadUrl);
}

export function useApi() {
  const { user } = useAuth();
  const uid = user?.id;
  return {
    post: (path: string, body: Record<string, unknown>): Promise<unknown> =>
      apiFetch(path, { method: 'POST', body: JSON.stringify(body) }, uid),
    get: (path: string): Promise<unknown> =>
      apiFetch(path, { method: 'GET' }, uid),
    download: (path: string, filename?: string): Promise<void> =>
      apiDownload(path, uid),
  };
}
