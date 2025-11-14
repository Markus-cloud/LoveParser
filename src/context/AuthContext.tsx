import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { apiFetch, fetchUserPhoto } from '@/lib/api';
import { sanitizeAvatarUrl } from '@/lib/sanitize';

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
  photoUpdatedAt?: number | null;
};

export type RawUser = Partial<Omit<AuthUser, 'id'>> & {
  id?: string | number | null;
  firstName?: string | null;
  lastName?: string | null;
  photo_id?: string | null;
  last_updated?: number | null;
  last_login?: number | null;
  created_at?: number | null;
  photoUrl?: string | null;
  photoUpdatedAt?: number | null;
  photo_updated_at?: number | null;
};

type AuthStatusResponse = {
  authenticated: boolean;
  userId?: string | number;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  photo_url?: string | null;
  photoUrl?: string | null;
};

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  login: (userData: RawUser, session?: string) => Promise<void>;
  logout: () => void;
};

const STORAGE_KEY = 'tele_fluence_user';
const SESSION_KEY = 'tele_fluence_session';
const PHOTO_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

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
  const lastUpdated = raw.lastUpdated ?? raw.last_updated ?? raw.photoUpdatedAt ?? raw.photo_updated_at ?? null;
  const lastLogin = raw.lastLogin ?? raw.last_login ?? null;
  const createdAt = raw.createdAt ?? raw.created_at ?? null;
  const photoUrl = sanitizeAvatarUrl(raw.photo_url ?? raw.photoUrl ?? null);
  const photoUpdatedAt = raw.photoUpdatedAt ?? raw.photo_updated_at ?? lastUpdated ?? null;

  return {
    id,
    username: raw.username ?? null,
    first_name: firstName,
    last_name: lastName,
    firstName,
    lastName,
    photo_url: photoUrl,
    language_code: raw.language_code ?? null,
    photoId,
    lastUpdated,
    lastLogin,
    createdAt,
    photoUpdatedAt,
  };
}

function persistUser(user: AuthUser | null) {
  if (typeof window === 'undefined') {
    return;
  }

  if (!user) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }

  const sanitizedUser: AuthUser = {
    ...user,
    photo_url: sanitizeAvatarUrl(user.photo_url),
  };

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizedUser));
}

function parseStoredUser(): AuthUser | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const savedUser = window.localStorage.getItem(STORAGE_KEY);
  if (!savedUser) {
    return null;
  }

  try {
    const raw = JSON.parse(savedUser) as RawUser;
    return normalizeUser(raw);
  } catch (error) {
    console.debug('Failed to parse stored user', error);
    window.localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const refreshUserPhoto = useCallback(async (userId: string) => {
    try {
      const photoResponse = await fetchUserPhoto(userId);
      const nextPhotoUrl = sanitizeAvatarUrl(photoResponse.photoUrl ?? null);
      const nextPhotoId = photoResponse.photoId;
      const nextUpdatedAt = photoResponse.updatedAt;

      if (!isMountedRef.current) {
        return nextPhotoUrl || null;
      }

      setUser((prev) => {
        if (!prev || prev.id !== userId) {
          return prev;
        }

        const currentPhotoUrl = sanitizeAvatarUrl(prev.photo_url);
        const currentPhotoId = prev.photoId ?? null;
        const currentUpdatedAt = prev.photoUpdatedAt ?? prev.lastUpdated ?? null;

        const resolvedPhotoId = nextPhotoId === undefined ? currentPhotoId : nextPhotoId;
        const resolvedUpdatedAt = nextUpdatedAt === undefined ? currentUpdatedAt : nextUpdatedAt;
        const resolvedPhotoUrl = nextPhotoUrl;

        const shouldUpdate =
          currentPhotoUrl !== resolvedPhotoUrl ||
          currentPhotoId !== resolvedPhotoId ||
          currentUpdatedAt !== resolvedUpdatedAt;

        if (!shouldUpdate) {
          return prev;
        }

        const updatedUser: AuthUser = {
          ...prev,
          photo_url: resolvedPhotoUrl,
          photoId: resolvedPhotoId,
          lastUpdated: resolvedUpdatedAt,
          photoUpdatedAt: resolvedUpdatedAt,
        };

        persistUser(updatedUser);
        return updatedUser;
      });

      return nextPhotoUrl || null;
    } catch (error) {
      console.debug('Failed to refresh user photo', error);
      return null;
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      if (isMountedRef.current) {
        setLoading(false);
      }
      return;
    }

    const initialize = async () => {
      if (!isMountedRef.current) {
        return;
      }

      setLoading(true);

      const session = window.localStorage.getItem(SESSION_KEY);
      const storedUser = parseStoredUser();

      if (!session) {
        persistUser(null);
        if (isMountedRef.current) {
          setUser(null);
          setLoading(false);
        }
        return;
      }

      if (storedUser && isMountedRef.current) {
        setUser(storedUser);
      }

      try {
        const status = await apiFetch('/telegram/auth/status', { method: 'GET' }) as AuthStatusResponse;

        if (!status?.authenticated || status.userId === undefined || status.userId === null) {
          window.localStorage.removeItem(SESSION_KEY);
          persistUser(null);
          if (isMountedRef.current) {
            setUser(null);
            setLoading(false);
          }
          return;
        }

        const fallbackRaw: RawUser = {
          id: status.userId,
          username: status.username ?? undefined,
          first_name: status.firstName ?? undefined,
          last_name: status.lastName ?? undefined,
          photo_url: status.photo_url ?? undefined,
          photoUrl: status.photoUrl ?? undefined,
        };

        let profileRaw: RawUser | null = null;
        try {
          profileRaw = await apiFetch(`/user/${status.userId}`, { method: 'GET' }) as RawUser;
        } catch (profileError) {
          console.debug('Failed to fetch user profile', profileError);
        }

        const mergedRaw: RawUser = {
          ...fallbackRaw,
          ...(profileRaw || {}),
        };

        const normalized = normalizeUser(mergedRaw) ?? storedUser;

        if (!normalized) {
          window.localStorage.removeItem(SESSION_KEY);
          persistUser(null);
          if (isMountedRef.current) {
            setUser(null);
            setLoading(false);
          }
          return;
        }

        persistUser(normalized);
        if (isMountedRef.current) {
          setUser(normalized);
        }

        await refreshUserPhoto(normalized.id);
      } catch (error) {
        console.error('Auth check error:', error);
        if (!storedUser) {
          window.localStorage.removeItem(SESSION_KEY);
          persistUser(null);
          if (isMountedRef.current) {
            setUser(null);
          }
        }
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
        }
      }
    };

    void initialize();
  }, [refreshUserPhoto]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (!user?.id) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void refreshUserPhoto(user.id);
    }, PHOTO_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [user?.id, refreshUserPhoto]);

  const login = useCallback(async (userData: RawUser, session?: string) => {
    if (!isMountedRef.current) {
      return;
    }

    setLoading(true);
    try {
      const baseUser = normalizeUser(userData);
      if (!baseUser) {
        throw new Error('Invalid user data received during login');
      }

      if (session && typeof window !== 'undefined') {
        window.localStorage.setItem(SESSION_KEY, session);
      }

      persistUser(baseUser);
      if (isMountedRef.current) {
        setUser(baseUser);
      }

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
          persistUser(finalUser);
          if (isMountedRef.current) {
            setUser(finalUser);
          }
        }
      } catch (error) {
        console.error('Failed to refresh user profile after login:', error);
      }

      await refreshUserPhoto(baseUser.id);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [refreshUserPhoto]);

  const logout = useCallback(() => {
    persistUser(null);
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(SESSION_KEY);
    }
    if (isMountedRef.current) {
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  return useContext(AuthContext);
}
