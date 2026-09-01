"use client";

import type { AuthUserResponse } from "@execloom/contracts";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";

import {
  getCurrentUser,
  login as loginRequest,
  register as registerRequest
} from "@/lib/api";

const accessTokenStorageKey = "execloom.accessToken";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

type AuthContextValue = {
  accessToken: string | null;
  status: AuthStatus;
  user: AuthUserResponse | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUserResponse | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  const clearSession = useCallback(() => {
    window.localStorage.removeItem(accessTokenStorageKey);
    setAccessToken(null);
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  const applySession = useCallback((token: string, nextUser: AuthUserResponse) => {
    window.localStorage.setItem(accessTokenStorageKey, token);
    setAccessToken(token);
    setUser(nextUser);
    setStatus("authenticated");
  }, []);

  useEffect(() => {
    const savedToken = window.localStorage.getItem(accessTokenStorageKey);

    if (!savedToken) {
      setStatus("unauthenticated");
      return;
    }

    let cancelled = false;

    void getCurrentUser(savedToken)
      .then((response) => {
        if (!cancelled) {
          applySession(savedToken, response.user);
        }
      })
      .catch(() => {
        if (!cancelled) {
          clearSession();
        }
      });

    return () => {
      cancelled = true;
    };
  }, [applySession, clearSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      accessToken,
      status,
      user,
      login: async (email, password) => {
        const session = await loginRequest(email, password);
        applySession(session.accessToken, session.user);
      },
      register: async (email, password) => {
        const session = await registerRequest(email, password);
        applySession(session.accessToken, session.user);
      },
      logout: clearSession
    }),
    [accessToken, applySession, clearSession, status, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
