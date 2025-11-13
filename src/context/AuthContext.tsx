import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiFetch, API_BASE_URL } from '@/lib/api';

type User = {
  id: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  photo_url?: string;
  language_code?: string;
  firstName?: string;
  lastName?: string;
};

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  login: (userData: User, session?: string) => Promise<void>;
  logout: () => void;
};

const STORAGE_KEY = 'tele_fluence_user';
const SESSION_KEY = 'tele_fluence_session';

const AuthContext = createContext<AuthContextValue>({ 
  user: null, 
  loading: true,
  login: async () => {},
  logout: () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Проверка сохраненной сессии при инициализации
  useEffect(() => {
    const checkAuth = async () => {
      try {
        // Проверяем сохраненного пользователя в localStorage
        const savedUser = localStorage.getItem(STORAGE_KEY);
        const savedSession = localStorage.getItem(SESSION_KEY);

        if (savedUser && savedSession) {
          try {
            const userData = JSON.parse(savedUser);
            
            // Проверяем статус авторизации на сервере
            try {
              const status = await apiFetch('/telegram/auth/status', { method: 'GET' }) as { authenticated: boolean; userId: string | number, photo_url?: string | null };

              // Сравниваем userId как строки
              if (status.authenticated && String(status.userId) === String(userData.id)) {
                // Подтягиваем photo_url с сервера, если он есть и отсутствует локально
                // Normalize photo_url: prefer proxied server avatar for t.me links
                const usernameFromSaved = userData.username || null;
                const usernameFromStatus = (status as any).username || null;
                const username = usernameFromSaved || usernameFromStatus;

                if (username && status.photo_url) {
                  // Resolve absolute backend URL in dev if needed
                  let base = API_BASE_URL;
                  try {
                    if (typeof window !== 'undefined' && API_BASE_URL && API_BASE_URL.startsWith('/')) {
                      const backendPort = '4000';
                      const hostPort = window.location.port || '';
                      if (hostPort && hostPort !== backendPort) {
                        base = `${window.location.protocol}//${window.location.hostname}:${backendPort}`;
                      } else {
                        base = `${window.location.protocol}//${window.location.hostname}${hostPort ? `:${hostPort}` : ''}`;
                      }
                    }
                  } catch (e) {}
                  userData.photo_url = `${base}/telegram/avatar/${encodeURIComponent(String(username))}`;
                  localStorage.setItem(STORAGE_KEY, JSON.stringify(userData));
                } else if (!userData.photo_url && status.photo_url) {
                  userData.photo_url = status.photo_url;
                  localStorage.setItem(STORAGE_KEY, JSON.stringify(userData));
                }

                // Сессия валидна, используем сохраненные данные
                setUser(userData);
                setLoading(false);
                return;
              }
            } catch (error) {
              console.debug('Session validation error:', error);
            }
          } catch (error) {
            console.debug('JSON parse error:', error);
          }

          // Если сессия невалидна или отсутствует, очищаем данные
          localStorage.removeItem(STORAGE_KEY);
          localStorage.removeItem(SESSION_KEY);
        }
      } catch (error) {
        console.error('Auth check error:', error);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  const login = async (userData: User, session?: string) => {
    // Преобразуем данные пользователя в нужный формат
    const userPayload: User = {
      id: String(userData.id),
      username: userData.username,
      first_name: userData.firstName || userData.first_name,
      last_name: userData.lastName || userData.last_name,
      firstName: userData.firstName || userData.first_name,
      lastName: userData.lastName || userData.last_name,
      // If photo_url points to t.me, use proxied API endpoint to avoid CORS/hotlink issues
      photo_url: (() => {
        const shouldProxy = userData.photo_url && String(userData.photo_url).includes('t.me') && userData.username;
        if (!shouldProxy) return userData.photo_url || null;
        // Resolve absolute backend URL in dev: if API_BASE_URL is relative, try to point to localhost:4000
        let base = API_BASE_URL;
        try {
          if (typeof window !== 'undefined' && API_BASE_URL && API_BASE_URL.startsWith('/')) {
            // If current origin port differs from backend, assume backend runs on 4000
            const backendPort = '4000';
            const hostPort = window.location.port || '';
            if (hostPort && hostPort !== backendPort) {
              base = `${window.location.protocol}//${window.location.hostname}:${backendPort}`;
            } else {
              base = `${window.location.protocol}//${window.location.hostname}${hostPort ? `:${hostPort}` : ''}`;
            }
          }
        } catch (e) {
          // ignore
        }
        return `${base}/telegram/avatar/${encodeURIComponent(String(userData.username))}`;
      })(),
      language_code: userData.language_code,
    };

    // Сохраняем пользователя в localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userPayload));
    
    if (session) {
      localStorage.setItem(SESSION_KEY, session);
    }

    // Сохраняем пользователя на сервере через /api/user/login
    try {
      await apiFetch('/user/login', {
        method: 'POST',
        body: { user: userPayload },
      });
    } catch (error) {
      console.error('Failed to save user on server:', error);
    }

    setUser(userPayload);
  };

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SESSION_KEY);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  return useContext(AuthContext);
}
