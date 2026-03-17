'use client';

import { createContext, useContext, useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { UserStatus } from "@prisma/client";
import { updateInstitutionalPassword } from "@/actions/password";

export interface UserProfile {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  phoneNumber?: string | null;
  status: UserStatus;
  branchId?: string | null;
  branchName?: string | null;
  districtName?: string | null;
  assignedBranches: string[];
  roles: any[]; 
  needsPasswordChange?: boolean;
}

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  logout: (reason?: string) => void;
  changePassword: (newPass: string, currentPass: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const hydrateSession = async () => {
      try {
        const res = await fetch("/api/auth/me");
        
        if (!res.ok) {
          setUser(null);
          setLoading(false);
          return;
        }

        const contentType = res.headers.get("content-type");
        const text = await res.text();
        
        if (text && text.trim() && contentType && contentType.includes("application/json")) {
          try {
            const data = JSON.parse(text);
            if (data && data.user) {
              setUser(data.user);
            } else {
              setUser(null);
            }
          } catch (e) {
            console.error("[Auth] Session JSON parse failure:", e);
            setUser(null);
          }
        } else {
          setUser(null);
        }
      } catch (e) {
        console.error("Session hydration failed:", e);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    hydrateSession();
  }, []);

  const login = async (email: string, pass: string) => {
    const normalizedEmail = email.toLowerCase().trim();
    if (!normalizedEmail.endsWith('@nibbank.com.et')) {
      throw new Error('Access restricted to @nibbank.com.et domain.');
    }

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: normalizedEmail, password: pass }),
    });

    const contentType = res.headers.get("content-type");
    const text = await res.text();
    let data: any = null;

    if (text && text.trim() && contentType && contentType.includes("application/json")) {
      try {
        data = JSON.parse(text);
      } catch (e) {
        console.error("[Auth] Login JSON parse failure:", e);
      }
    }

    if (!res.ok) {
      throw new Error(data?.message || "Incorrect email or password.");
    }

    if (!data || !data.user) {
      throw new Error("Invalid institutional response. Please try again.");
    }

    setUser(data.user);
    toast({ 
      title: "Login Successful", 
      description: `Welcome back, ${data.user.firstName}!` 
    });
  };

  const logout = async (reason: string = 'User Logout') => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch (e) {
      console.error("Logout error:", e);
    }
    setUser(null);
    window.location.href = '/login';
    toast({ title: 'Logged Out', description: `Session terminated: ${reason}` });
  };

  const changePassword = async (newPass: string, currentPass: string) => {
    if (!user) throw new Error("No active session discovered.");

    const res = await updateInstitutionalPassword(user.id, newPass, currentPass);
    if (res.success) {
      setUser({ ...user, needsPasswordChange: false });
    } else {
      throw new Error(res.error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, changePassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
