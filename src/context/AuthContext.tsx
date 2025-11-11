import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

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
              const status = await apiFetch('/telegram/auth/status', { method: 'GET' }) as { authenticated: boolean; userId: string | number };
              
              // Сравниваем userId как строки
              if (status.authenticated && String(status.userId) === String(userData.id)) {
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
      photo_url: userData.photo_url,
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


