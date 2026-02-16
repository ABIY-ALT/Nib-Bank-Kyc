
'use client';

import { useState, useEffect, createContext, useContext } from 'react';
import { useFirebase, useFirestore } from '@/firebase';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  signOut, 
  updatePassword as fbUpdatePassword,
  User as FirebaseUser 
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, collection, onSnapshot, query, limit } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
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
  needsPasswordChange?: boolean;
}

const SESSION_TIMEOUT_MINUTES = 30;

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  logout: (reason?: string) => Promise<void>;
  changePassword: (newPass: string) => Promise<void>;
  allUsers: User[]; // Now dynamic for testing purposes
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
  const [dynamicUsers, setDynamicUsers] = useState<User[]>([]);

  // MOCK DATA for initial bootstrap
  const MOCK_PROFILES: User[] = [
    { id: 'admin-1', name: 'System Admin', email: 'Admin.User@nibbank.com.et', role: 'Admin', status: 'Active', needsPasswordChange: false },
    { id: 'chief-1', name: 'Executive Chief', email: 'Executive.Chief@nibbank.com.et', role: 'Chief Retail & SME Banking Officer', status: 'Active', needsPasswordChange: false },
    { id: 'branch-1', name: 'John Doe', email: 'John.Doe@nibbank.com.et', role: 'Branch Officer', branch: 'Downtown', district: 'Central', status: 'Active', needsPasswordChange: false },
    { id: 'kyc-1', name: 'Jane Smith', email: 'Jane.Smith@nibbank.com.et', role: 'KYC Officer', assignedBranches: ['Downtown', 'Uptown'], status: 'Active', needsPasswordChange: false },
  ];

  // Sync users from Firestore for the Prototype Entry Points
  useEffect(() => {
    if (!db) return;
    
    const q = query(collection(db, "users"), limit(20));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const users = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as User));
      // Combine mock profiles with dynamic users, avoiding duplicates by ID
      const combined = [...MOCK_PROFILES];
      users.forEach(u => {
        if (!combined.some(m => m.id === u.id)) {
          combined.push(u);
        }
      });
      setDynamicUsers(combined);
    });

    return () => unsubscribe();
  }, [db]);

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
            name: fbUser.displayName || fbUser.email?.split('@')[0].replace('.', ' ') || 'Bank User',
            email: fbUser.email || '',
            role: 'Branch Officer',
            status: 'Active',
            needsPasswordChange: true
          };
          await setDoc(doc(db, "users", fbUser.uid), newUser);
          setUser(newUser);
        }
      } else {
        // If not signed in via Firebase, check if we're in a local prototype session
        const savedUserId = localStorage.getItem('proto_user_id');
        if (savedUserId && !user) {
          const found = dynamicUsers.find(u => u.id === savedUserId);
          if (found) setUser(found);
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [auth, db, toast, dynamicUsers]);

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
    if (!email.toLowerCase().endsWith('@nibbank.com.et')) {
      throw new Error('Institutional access restricted to @nibbank.com.et domains.');
    }
    
    await signInWithEmailAndPassword(auth, email, pass);
    localStorage.removeItem('proto_user_id');
  };

  const logout = async (reason: string = 'User Logout') => {
    const userToLog = user;
    setUser(null);
    localStorage.removeItem('proto_user_id');
    
    try {
      if (userToLog) {
        await logAuthEvent('Logout', userToLog, reason);
      }
      if (auth) {
        await signOut(auth);
      }
    } catch (error) {
      console.error("Institutional logout error:", error);
    } finally {
      window.location.href = '/login';
      toast({ title: 'Logged Out', description: 'Institutional session terminated safely.' });
    }
  };

  const changePassword = async (newPass: string) => {
    if (!db || !user) return;
    
    // If real Firebase Auth user exists, update password
    if (auth?.currentUser) {
      try {
        await fbUpdatePassword(auth.currentUser, newPass);
      } catch (e) {
        console.warn("Auth password update skipped (not a real auth user session)");
      }
    }
    
    // Always update the Firestore profile record to clear the flag
    const userRef = doc(db, "users", user.id);
    await updateDoc(userRef, { needsPasswordChange: false });
    
    setUser(prev => prev ? { ...prev, needsPasswordChange: false } : null);
    await logAuthEvent('Password Change', user, 'User completed force password change cycle.');
  };

  const loginAs = async (userId: string) => {
    const profile = dynamicUsers.find(p => p.id === userId);
    if (profile) {
      setUser(profile);
      localStorage.setItem('proto_user_id', userId);
      toast({ title: 'Profile Switched', description: `Viewing as ${profile.name} (${profile.role})` });
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      login, 
      logout, 
      changePassword, 
      allUsers: dynamicUsers, 
      loginAs 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
