import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { authApi, tokenStore } from "./authService";

/**
 * Who is logged in, shared with the whole app.
 * Use it anywhere with:  const { user, logout } = useAuth();
 */
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [checking, setChecking] = useState(true); // restoring a saved session

  // On first load: if a token was saved, ask the backend who it belongs to.
  useEffect(() => {
    let active = true;
    const saved = tokenStore.get();

    if (!saved) {
      setChecking(false);
      return undefined;
    }

    authApi
      .me(saved)
      .then((data) => {
        if (!active) return;
        setUser(data.user);
        setToken(saved);
      })
      .catch(() => {
        tokenStore.clear(); // expired or invalid
      })
      .finally(() => {
        if (active) setChecking(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (email, password, remember) => {
    const data = await authApi.login(email.trim().toLowerCase(), password);
    tokenStore.set(data.token, remember);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      if (token) await authApi.logout(token);
    } catch {
      /* still log out locally even if the server call fails */
    }
    tokenStore.clear();
    setToken(null);
    setUser(null);
  }, [token]);

  return (
    <AuthContext.Provider value={{ user, token, checking, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>");
  return context;
}