'use client';

import { createContext, useContext, useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { UserStatus } from "@prisma/client";
import { updateInstitutionalPassword } from "@/actions/password";
import { getInstitutionalLoginLocalPart, isValidInstitutionalLoginInput } from "@/lib/login-identifier";

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
          if (res.status === 401 && user) {
            // Session expired on server, sync client state
            setUser(null);
            window.location.href = '/login?reason=session_expired';
          }
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
            setUser(null);
          }
        } else {
          setUser(null);
        }
      } catch (e) {
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    hydrateSession();

    // Periodic session refresh every 5 minutes to keep token alive
    const refreshInterval = setInterval(hydrateSession, 5 * 60 * 1000);

    return () => clearInterval(refreshInterval);
  }, []);

  const login = async (email: string, pass: string) => {
    const loginId = getInstitutionalLoginLocalPart(email);
    if (!isValidInstitutionalLoginInput(loginId)) {
      throw new Error('Invalid username or password.');
    }

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: loginId, password: pass }),
    });

    const contentType = res.headers.get("content-type");
    const text = await res.text();
    let data: any = null;

    if (text && text.trim() && contentType && contentType.includes("application/json")) {
      try {
        data = JSON.parse(text);
      } catch (e) {
      }
    }

    if (!res.ok) {
      throw new Error(data?.error || data?.message || "Invalid username or password.");
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
