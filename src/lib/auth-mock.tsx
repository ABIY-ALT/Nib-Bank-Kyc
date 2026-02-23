'use client';

import { useState, useEffect, createContext, useContext } from 'react';
import { useFirebase } from '@/firebase';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  signOut, 
} from 'firebase/auth';
import { useToast } from '@/hooks/use-toast';
import { syncUserToSql, getUserProfile, getUserByEmail } from '@/actions/auth';
import { firebaseConfig } from '@/firebase/config';
import { UserStatus } from '@prisma/client';

export interface UserProfile {
  id: string;
  firebaseUid: string;
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
  isMock: boolean;
  login: (email: string, pass: string) => Promise<void>;
  logout: (reason?: string) => Promise<void>;
  changePassword: (newPass: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { auth } = useFirebase();
  const { toast } = useToast();
  
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  
  const isMockMode = !firebaseConfig.apiKey || firebaseConfig.apiKey === 'undefined' || firebaseConfig.apiKey === 'INITIALIZING';

  useEffect(() => {
    if (isMockMode) {
      const savedUser = localStorage.getItem('nib_mock_user');
      if (savedUser) {
        // Refresh mock user from DB to ensure roles/data are current
        const refreshMock = async () => {
          const parsed = JSON.parse(savedUser);
          const dbUser = await getUserByEmail(parsed.email);
          if (dbUser) {
            const mapped = {
              ...dbUser,
              name: `${dbUser.firstName} ${dbUser.lastName}`,
              branchName: (dbUser as any).branch?.name || null,
              districtName: (dbUser as any).branch?.district?.name || null,
              assignedBranches: (dbUser as any).assignedBranches || []
            } as any;
            setUser(mapped);
            localStorage.setItem('nib_mock_user', JSON.stringify(mapped));
          } else {
            setUser(parsed);
          }
          setLoading(false);
        };
        refreshMock();
      } else {
        setLoading(false);
      }
      return;
    }

    if (!auth) return;

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        try {
          const sqlUser = await getUserProfile(fbUser.uid);
          if (sqlUser) {
            if (sqlUser.status !== 'ACTIVE') {
              toast({ variant: 'destructive', title: 'Access Denied', description: `Account ${sqlUser.status}.` });
              await signOut(auth);
              setUser(null);
            } else {
              setUser({
                ...sqlUser,
                name: `${sqlUser.firstName} ${sqlUser.lastName}`,
                branchName: (sqlUser as any).branch?.name || null,
                districtName: (sqlUser as any).branch?.district?.name || null,
                assignedBranches: (sqlUser as any).assignedBranches || []
              } as any);
            }
          } else {
            const result = await syncUserToSql({
              id: fbUser.uid,
              email: fbUser.email!,
              name: fbUser.displayName || fbUser.email!.split('@')[0],
            });
            if (result.success) {
              const u = result.user!;
              setUser({ 
                ...u, 
                name: `${u.firstName} ${u.lastName}`,
                assignedBranches: [] 
              } as any);
            }
          }
        } catch (e) {
          console.error("Auth profile sync failed:", e);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [auth, toast, isMockMode]);

  const login = async (email: string, pass: string) => {
    const normalizedEmail = email.toLowerCase();
    if (!normalizedEmail.endsWith('@nibbank.com.et')) {
      throw new Error('Institutional access restricted to @nibbank.com.et domain.');
    }

    if (isMockMode) {
      if (pass !== 'nibbank123') throw new Error('Invalid developer credential.');
      
      const existingUser = await getUserByEmail(normalizedEmail);
      
      // Use seeded ID if found, otherwise generate
      const userId = existingUser?.id || `mock-${normalizedEmail.split('@')[0]}`;
      
      const mockUser: any = {
        id: userId,
        firebaseUid: userId,
        firstName: existingUser?.firstName || normalizedEmail.split('.')[0] || 'User',
        lastName: existingUser?.lastName || normalizedEmail.split('.')[1]?.split('@')[0] || 'Nib',
        email: normalizedEmail,
        status: existingUser?.status || 'ACTIVE',
        branchId: existingUser?.branchId || null,
        branchName: (existingUser as any)?.branch?.name || null,
        districtName: (existingUser as any)?.branch?.district?.name || null,
        assignedBranches: (existingUser as any)?.assignedBranches || [],
        roles: existingUser?.roles || [{ role: { name: normalizedEmail.includes('admin') ? 'SUPER_ADMIN' : 'BRANCH_OFFICER' } }]
      };
      
      mockUser.name = `${mockUser.firstName} ${mockUser.lastName}`;
      
      setUser(mockUser);
      localStorage.setItem('nib_mock_user', JSON.stringify(mockUser));
      await syncUserToSql(mockUser);
      return;
    }

    if (!auth) return;
    await signInWithEmailAndPassword(auth, normalizedEmail, pass);
  };

  const logout = async (reason: string = 'User Logout') => {
    setUser(null);
    if (isMockMode) {
      localStorage.removeItem('nib_mock_user');
    } else if (auth) {
      await signOut(auth);
    }
    window.location.href = '/login';
    toast({ title: 'Logged Out', description: `Session terminated: ${reason}` });
  };

  const changePassword = async (newPass: string) => {
    if (user) {
      const updated = { ...user, needsPasswordChange: false };
      setUser(updated);
      if (isMockMode) localStorage.setItem('nib_mock_user', JSON.stringify(updated));
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, isMock: isMockMode, login, logout, changePassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
