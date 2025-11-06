import { useAuth } from "@/context/AuthContext";

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export async function apiFetch(path: string, options: RequestInit = {}, userId?: string) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) } as any;
  
  let body: any = null;
  if (options.body) {
    // Если body уже строка, парсим её, иначе используем как есть
    if (typeof options.body === 'string') {
      try {
        body = JSON.parse(options.body);
      } catch {
        body = options.body;
      }
    } else {
      body = options.body;
    }
  }
  
  const payload = userId && body ? { ...body, userId } : body;
  const url = path.startsWith('http') ? path : `${API_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
  
  const res = await fetch(url, { 
    ...options, 
    headers, 
    body: options.method === 'GET' ? undefined : JSON.stringify(payload) 
  });
  
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  
  return res.json();
}

export function useApi() {
  const { user } = useAuth();
  const uid = user?.id;
  return {
    post: (path: string, body: any) => apiFetch(path, { method: 'POST', body: JSON.stringify(body) }, uid),
    get: (path: string) => apiFetch(path, { method: 'GET' }, uid),
  };
}


