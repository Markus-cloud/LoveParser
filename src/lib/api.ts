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
  
  let body: unknown = null;
  if (options.body) {
    // Если body уже строка, парсим её, иначе используем как есть
    if (typeof options.body === 'string') {
      try {
        body = JSON.parse(options.body) as Record<string, unknown>;
      } catch {
        body = options.body;
      }
    } else {
      body = options.body;
    }
  }
  
  let url = path.startsWith('http') ? path : `${API_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
  if (options.method === 'GET' && userId) {
    const separator = url.includes('?') ? '&' : '?';
    url = `${url}${separator}userId=${encodeURIComponent(userId)}`;
  }
  
  const payload = userId && body && options.method !== 'GET' 
    ? { ...(body as Record<string, unknown>), userId } 
    : body;
  
  const res = await fetch(url, { 
    ...options, 
    headers, 
    body: options.method === 'GET' ? undefined : JSON.stringify(payload) 
  });
  
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  
  return res.json();
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
