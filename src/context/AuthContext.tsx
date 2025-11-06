import React, { createContext, useContext, useEffect, useState } from 'react';

type User = {
  id: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  photo_url?: string;
  language_code?: string;
};

type AuthContextValue = {
  user: User | null;
};

const AuthContext = createContext<AuthContextValue>({ user: null });

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    try {
      // @ts-ignore
      const tg = window?.Telegram?.WebApp;
      const u = tg?.initDataUnsafe?.user;
      if (u?.id) {
        const payload = {
          id: String(u.id),
          username: u.username,
          first_name: u.first_name,
          last_name: u.last_name,
          photo_url: u.photo_url,
          language_code: u.language_code,
        };
        const apiUrl = import.meta.env.VITE_API_URL || '/api';
        fetch(`${apiUrl}/user/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: payload }) })
          .then((r) => r.json())
          .then((data) => {
            if (data?.success && data.user) setUser(data.user);
          })
          .catch(() => {});
      }
    } catch {}
  }, []);

  return (
    <AuthContext.Provider value={{ user }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  return useContext(AuthContext);
}


