import { useAuth } from "@/context/AuthContext";

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

// Логирование для отладки URL API
console.log('[API] Using API base URL:', API_BASE_URL);
console.log('[API] Environment:', import.meta.env.MODE);
console.log('[API] VITE_API_URL:', import.meta.env.VITE_API_URL);

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
  
  // Для GET запросов userId добавляем в query параметры
  let url = path.startsWith('http') ? path : `${API_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
  if (options.method === 'GET' && userId) {
    const separator = url.includes('?') ? '&' : '?';
    url = `${url}${separator}userId=${encodeURIComponent(userId)}`;
  }
  
  // Логирование запросов для отладки
  console.log('[API] Request:', { method: options.method || 'GET', url, userId });
  
  // Для POST/PUT запросов userId добавляем в body
  const payload = userId && body && options.method !== 'GET' 
    ? { ...(body as Record<string, unknown>), userId } 
    : body;
  
  const res = await fetch(url, { 
    ...options, 
    headers, 
    body: options.method === 'GET' ? undefined : JSON.stringify(payload) 
  });
  
  // Логирование ответов для отладки
  console.log('[API] Response:', { 
    status: res.status, 
    statusText: res.statusText, 
    url: res.url,
    ok: res.ok 
  });
  
  if (!res.ok) {
    const errorText = await res.text();
    console.error('[API] Error response:', errorText);
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  
  return res.json();
}

export function useApi() {
  const { user } = useAuth();
  const uid = user?.id;
  return {
    post: (path: string, body: Record<string, unknown>): Promise<unknown> => 
      apiFetch(path, { method: 'POST', body: JSON.stringify(body) }, uid),
    get: (path: string): Promise<unknown> => 
      apiFetch(path, { method: 'GET' }, uid),
  };
}


