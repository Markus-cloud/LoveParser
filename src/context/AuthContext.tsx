import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

export type AuthUser = {
  id: string;
  username: string | null;
  first_name: string;
  last_name: string;
  firstName: string;
  lastName: string;
  photo_url: string;
  language_code: string | null;
  photoId?: string | null;
  lastUpdated?: number | null;
  lastLogin?: number | null;
  createdAt?: number | null;
};

export type RawUser = Partial<Omit<AuthUser, 'id'>> & {
  id?: string | number | null;
  firstName?: string | null;
  lastName?: string | null;
  photo_id?: string | null;
  last_updated?: number | null;
  last_login?: number | null;
  created_at?: number | null;
};

type AuthStatusResponse = {
  authenticated: boolean;
  userId?: string | number;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  photo_url?: string | null;
};

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  login: (userData: RawUser, session?: string) => Promise<void>;
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

function normalizeUser(raw: RawUser | null | undefined): AuthUser | null {
  if (!raw || raw.id === undefined || raw.id === null) {
    return null;
  }

  const id = String(raw.id);
  const firstName = (raw.first_name ?? raw.firstName ?? '') || '';
  const lastName = (raw.last_name ?? raw.lastName ?? '') || '';

  const photoId = raw.photoId ?? raw.photo_id ?? null;
  const lastUpdated = raw.lastUpdated ?? raw.last_updated ?? null;
  const lastLogin = raw.lastLogin ?? raw.last_login ?? null;
  const createdAt = raw.createdAt ?? raw.created_at ?? null;

  return {
    id,
    username: raw.username ?? null,
    first_name: firstName,
    last_name: lastName,
    firstName,
    lastName,
    photo_url: raw.photo_url ?? '',
    language_code: raw.language_code ?? null,
    photoId,
    lastUpdated,
    lastLogin,
    createdAt,
  };
}

function persistUser(user: AuthUser | null) {
  if (!user) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
}

function parseStoredUser(): AuthUser | null {
  const savedUser = localStorage.getItem(STORAGE_KEY);
  if (!savedUser) {
    return null;
  }

  try {
    const raw = JSON.parse(savedUser) as RawUser;
    return normalizeUser(raw);
  } catch (error) {
    console.debug('Failed to parse stored user', error);
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const checkAuth = async () => {
      setLoading(true);

      const session = localStorage.getItem(SESSION_KEY);
      const storedUser = parseStoredUser();

      if (!session) {
        persistUser(null);
        if (isMounted) {
          setUser(null);
        }
        setLoading(false);
        return;
      }

      try {
        const status = await apiFetch('/telegram/auth/status', { method: 'GET' }) as AuthStatusResponse;

        if (!status.authenticated || status.userId === undefined || status.userId === null) {
          localStorage.removeItem(SESSION_KEY);
          persistUser(null);
          if (isMounted) {
            setUser(null);
          }
          return;
        }

        const fallbackRaw: RawUser = {
          id: status.userId,
          username: status.username ?? undefined,
          first_name: status.firstName ?? undefined,
          last_name: status.lastName ?? undefined,
          photo_url: status.photo_url ?? undefined,
        };

        let profileRaw: RawUser | null = null;
        try {
          profileRaw = await apiFetch(`/user/${status.userId}`, { method: 'GET' }) as RawUser;
        } catch (profileError) {
          console.error('Failed to fetch user profile', profileError);
        }

        const mergedRaw: RawUser = {
          ...fallbackRaw,
          ...(profileRaw || {}),
        };

        const normalized = normalizeUser(mergedRaw) ?? storedUser;

        if (normalized) {
          persistUser(normalized);
          if (isMounted) {
            setUser(normalized);
          }
        } else {
          localStorage.removeItem(SESSION_KEY);
          persistUser(null);
          if (isMounted) {
            setUser(null);
          }
        }
      } catch (error) {
        console.error('Auth check error:', error);
        if (storedUser && isMounted) {
          setUser(storedUser);
        } else {
          localStorage.removeItem(SESSION_KEY);
          persistUser(null);
          if (isMounted) {
            setUser(null);
          }
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    checkAuth();

    return () => {
      isMounted = false;
    };
  }, []);

  const login = async (userData: RawUser, session?: string) => {
    setLoading(true);
    try {
      const baseUser = normalizeUser(userData);
      if (!baseUser) {
        throw new Error('Invalid user data received during login');
      }

      if (session) {
        localStorage.setItem(SESSION_KEY, session);
      }

      // Persist immediately to ensure we have a fallback
      persistUser(baseUser);

      try {
        await apiFetch('/user/login', {
          method: 'POST',
          body: { user: baseUser },
        });
      } catch (error) {
        console.error('Failed to upsert user on server:', error);
      }

      let finalUser: AuthUser = baseUser;

      try {
        const profile = await apiFetch(`/user/${baseUser.id}`, { method: 'GET' }) as RawUser;
        const mergedProfile = normalizeUser({ ...userData, ...(profile || {}) });
        if (mergedProfile) {
          finalUser = mergedProfile;
        }
      } catch (error) {
        console.error('Failed to refresh user profile after login:', error);
      }

      persistUser(finalUser);
      setUser(finalUser);
    } finally {
      setLoading(false);
    }
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
