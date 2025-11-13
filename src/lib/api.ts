import { useAuth } from "@/context/AuthContext";

const API_BASE_URL = import.meta.env.PROD 
  ? '/api' 
  : (import.meta.env.VITE_API_URL || '/api');

export async function apiFetch(path: string, options: RequestInit = {}, userId?: string): Promise<unknown> {
  const headers: HeadersInit = { 
    'Content-Type': 'application/json', 
    ...(options.headers || {}) 
  };
  
  const url = path.startsWith('http') 
    ? path 
    : `${API_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
  
  let payload = options.body;
  if (userId && payload && options.method !== 'GET') {
    payload = { ...(payload as Record<string, unknown>), userId };
  }
  
  if (options.method === 'GET' && userId) {
    const separator = url.includes('?') ? '&' : '?';
    const finalUrl = `${url}${separator}userId=${encodeURIComponent(userId)}`;
    
    const res = await fetch(finalUrl, { ...options, headers });
    
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`API error: ${res.status} ${res.statusText}`);
    }
    
    return res.json();
  }
  
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
      apiFetch(path, { method: 'POST', body }, uid),
    get: (path: string): Promise<unknown> =>
      apiFetch(path, { method: 'GET' }, uid),
    download: (path: string): Promise<void> =>
      apiDownload(path, uid),
  };
}
