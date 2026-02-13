'use client';

import { useState, useEffect, createContext, useContext } from 'react';
import { useFirebase, useFirestore } from '@/firebase';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  signOut, 
  User as FirebaseUser 
} from 'firebase/auth';
import { doc, getDoc, setDoc, collection } from 'firebase/firestore';
import { useRouter, usePathname } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';

export type UserRole = 
  | 'Branch Officer' 
  | 'KYC Officer' 
  | 'Supervisor' 
  | 'Branch Banking Director' 
  | 'Admin' 
  | 'Branch Manager' 
  | 'District Director' 
  | 'Division Manager' 
  | 'Chief Retail & SME Banking Officer' 
  | 'Follow-up Team' 
  | 'Chief';

export interface User {
  id: string;
  name: string;
  email: string;
  phoneNumber?: string;
  role?: UserRole;
  branch?: string;
  assignedBranches?: string[];
  district?: string;
  status?: 'Active' | 'Inactive' | 'Suspended';
}

const SESSION_TIMEOUT_MINUTES = 30;

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
  allUsers: User[]; // For testing purposes in this prototype
  loginAs: (userId: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { auth } = useFirebase();
  const db = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastActivity, setLastActivity] = useState(Date.now());

  // MOCK DATA for switching during prototyping
  const MOCK_PROFILES: User[] = [
    { id: 'admin-1', name: 'System Admin', email: 'admin@bank.com', role: 'Admin', status: 'Active' },
    { id: 'chief-1', name: 'Executive Chief', email: 'chief@bank.com', role: 'Chief Retail & SME Banking Officer', status: 'Active' },
    { id: 'branch-1', name: 'John Doe', email: 'john.branch@bank.com', role: 'Branch Officer', branch: 'Downtown', district: 'Central', status: 'Active' },
    { id: 'kyc-1', name: 'Jane Smith', email: 'jane.kyc@bank.com', role: 'KYC Officer', assignedBranches: ['Downtown', 'Uptown'], status: 'Active' },
  ];

  useEffect(() => {
    if (!auth || !db) return;

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        const userDoc = await getDoc(doc(db, "users", fbUser.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data() as User;
          
          if (userData.status !== 'Active') {
            toast({ variant: 'destructive', title: 'Access Denied', description: `Your account is currently ${userData.status}.` });
            await signOut(auth);
            setUser(null);
          } else {
            setUser({ ...userData, id: fbUser.uid });
          }
        } else {
          const newUser: User = {
            id: fbUser.uid,
            name: fbUser.displayName || fbUser.email?.split('@')[0] || 'Bank User',
            email: fbUser.email || '',
            role: 'Branch Officer',
            status: 'Active'
          };
          await setDoc(doc(db, "users", fbUser.uid), newUser);
          setUser(newUser);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [auth, db, toast]);

  // Session Timeout Watchdog
  useEffect(() => {
    const handleActivity = () => setLastActivity(Date.now());
    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keydown', handleActivity);

    const interval = setInterval(() => {
      const now = Date.now();
      if (user && now - lastActivity > SESSION_TIMEOUT_MINUTES * 60 * 1000) {
        toast({ title: 'Session Expired', description: 'Institutional session timed out due to inactivity.' });
        logout('Session Timeout');
      }
    }, 60000);

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      clearInterval(interval);
    };
  }, [user, lastActivity]);

  const logAuthEvent = async (action: string, currentUser: User | null, details?: string) => {
    if (!db || !currentUser) return;
    const logRef = doc(collection(db, "audit_logs"));
    await setDoc(logRef, {
      id: logRef.id,
      userId: currentUser.id,
      userEmail: currentUser.email,
      userRole: currentUser.role || 'Unassigned',
      userBranch: currentUser.branch || 'N/A',
      action,
      timestamp: new Date().toISOString(),
      ipAddress: "10.128." + Math.floor(Math.random() * 255) + "." + Math.floor(Math.random() * 255),
      details: details || ""
    });
  };

  const login = async (email: string, pass: string) => {
    if (!auth) return;
    if (!email.endsWith('@bank.com')) {
      throw new Error('Institutional access restricted to @bank.com domains.');
    }
    
    const credential = await signInWithEmailAndPassword(auth, email, pass);
    // Real-time log will happen in onAuthStateChanged after profile fetch
  };

  const logout = async (reason: string = 'User Logout') => {
    if (!auth) return;
    
    // Capture user details for the final audit log before clearing state
    const userToLog = user;
    
    try {
      if (userToLog) {
        await logAuthEvent('Logout', userToLog, reason);
      }
      await signOut(auth);
      setUser(null);
      router.push('/login');
      toast({ title: 'Logged Out', description: 'Institutional session terminated safely.' });
    } catch (error) {
      console.error("Logout error:", error);
      setUser(null);
      router.push('/login');
    }
  };

  const loginAs = async (userId: string) => {
    const profile = MOCK_PROFILES.find(p => p.id === userId);
    if (profile) {
      setUser(profile);
      toast({ title: 'Profile Switched', description: `Viewing as ${profile.name} (${profile.role})` });
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, allUsers: MOCK_PROFILES, loginAs }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
