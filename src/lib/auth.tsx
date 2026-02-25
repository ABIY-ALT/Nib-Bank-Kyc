
'use client';

import { useState, useEffect, createContext, useContext } from 'react';
import { useToast } from '@/hooks/use-toast';
import { UserStatus } from '@prisma/client';

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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const hydrateSession = async () => {
      const token = localStorage.getItem("nib_token");
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const res = await fetch("/api/auth/me", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
        } else {
          localStorage.removeItem("nib_token");
          setUser(null);
        }
      } catch (e) {
        console.error("Session hydration failed:", e);
        localStorage.removeItem("nib_token");
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    hydrateSession();
  }, []);

  const login = async (email: string, pass: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: pass }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || "Institutional authentication failed.");
    }

    localStorage.setItem("nib_token", data.token);
    setUser(data.user);
    toast({ title: "Session Authorized", description: `Welcome back, ${data.user.firstName}.` });
  };

  const logout = (reason: string = 'User Logout') => {
    localStorage.removeItem("nib_token");
    setUser(null);
    window.location.href = '/login';
    toast({ title: 'Logged Out', description: `Session terminated: ${reason}` });
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
