// src/context/AuthContext.jsx
import { createContext, useContext, useState, useEffect } from "react";
import { authAPI } from "../services/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [admin,   setAdmin]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const userToken  = localStorage.getItem("cs_user_token");
    const adminToken = localStorage.getItem("cs_admin_token");
    const saved      = localStorage.getItem("cs_user");
    const savedAdmin = localStorage.getItem("cs_admin");
    if (userToken && saved)      setUser(JSON.parse(saved));
    if (adminToken && savedAdmin) setAdmin(JSON.parse(savedAdmin));
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    const { data } = await authAPI.login({ email, password });
    // Clear any stale admin token/state
    localStorage.removeItem("cs_admin_token");
    localStorage.removeItem("cs_admin");
    setAdmin(null);
    // Set user token and data
    localStorage.setItem("cs_user_token", data.token);
    localStorage.setItem("cs_user",  JSON.stringify(data.user));
    setUser(data.user);
    return data;
  };

  const adminLogin = async (email, password) => {
    const { data } = await authAPI.adminLogin({ email, password });
    // Clear any stale user token/state
    localStorage.removeItem("cs_user_token");
    localStorage.removeItem("cs_user");
    setUser(null);
    // Set admin token and data
    localStorage.setItem("cs_admin_token", data.token);
    localStorage.setItem("cs_admin", JSON.stringify(data.admin));
    setAdmin(data.admin);
    return data;
  };

  const register = async (name, email, password) => {
    const { data } = await authAPI.register({ name, email, password });
    // Clear any stale admin token/state
    localStorage.removeItem("cs_admin_token");
    localStorage.removeItem("cs_admin");
    setAdmin(null);
    // Set user token and data
    localStorage.setItem("cs_user_token", data.token);
    localStorage.setItem("cs_user",  JSON.stringify(data.user));
    setUser(data.user);
    return data;
  };

  const logout = () => {
    localStorage.removeItem("cs_user_token");
    localStorage.removeItem("cs_admin_token");
    localStorage.removeItem("cs_user");
    localStorage.removeItem("cs_admin");
    setUser(null);
    setAdmin(null);
  };

  return (
    <AuthContext.Provider value={{
      user, admin, loading,
      login, adminLogin, register, logout,
      isUser:  !!user,
      isAdmin: !!admin,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
