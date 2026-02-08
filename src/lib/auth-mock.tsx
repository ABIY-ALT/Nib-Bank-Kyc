
'use client';

import { useState, useEffect, createContext, useContext } from 'react';

export type UserRole = 
  | 'Branch Officer' 
  | 'KYC Officer' 
  | 'Supervisor' 
  | 'Director' 
  | 'Admin' 
  | 'Branch Manager' 
  | 'District Director';

export interface User {
  id: string;
  name: string;
  email: string;
  phoneNumber?: string;
  role?: UserRole;
  branch?: string;
  assignedBranches?: string[];
  district?: string;
  status?: string;
}

export const MOCK_USERS: User[] = [
  { id: 'admin-1', name: 'System Admin', email: 'admin@bank.com', phoneNumber: '+1234567890', role: 'Admin', status: 'Active' },
  { id: 'branch-1', name: 'John Doe', email: 'john.branch@bank.com', phoneNumber: '+1234567891', role: 'Branch Officer', branch: 'Downtown', district: 'Central', status: 'Active' },
  { id: 'kyc-1', name: 'Jane Smith', email: 'jane.kyc@bank.com', phoneNumber: '+1234567892', role: 'KYC Officer', assignedBranches: ['Downtown', 'Uptown'], status: 'Active' },
  { id: 'kyc-assigned', name: 'Local KYC Officer', email: 'local.kyc@bank.com', phoneNumber: '+1234567893', role: 'KYC Officer', assignedBranches: ['Downtown'], status: 'Active' },
  { id: 'super-1', name: 'Robert Brown', email: 'robert.super@bank.com', phoneNumber: '+1234567894', role: 'Supervisor', district: 'Central', status: 'Active' },
  { id: 'dir-1', name: 'Alice Wilson', email: 'alice.dir@bank.com', phoneNumber: '+1234567895', role: 'Director', status: 'Active' },
];

interface AuthContextType {
  user: User;
  loginAs: (userId: string) => void;
  allUsers: User[];
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User>(MOCK_USERS[0]);
  const [allUsers, setAllUsers] = useState<User[]>(MOCK_USERS);

  useEffect(() => {
    const savedUserId = typeof window !== 'undefined' ? localStorage.getItem('current_user_id') : null;
    if (savedUserId) {
      const found = allUsers.find(u => u.id === savedUserId);
      if (found) setUser(found);
    }
  }, [allUsers]);

  const loginAs = (userId: string) => {
    const found = allUsers.find(u => u.id === userId);
    if (found) {
      setUser(found);
      if (typeof window !== 'undefined') {
        localStorage.setItem('current_user_id', userId);
        window.location.href = '/'; // Refresh to clear state
      }
    }
  };

  return (
    <AuthContext.Provider value={{ user, loginAs, allUsers }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

// Legacy support for files not yet converted to hook
export const currentUser = MOCK_USERS[0];
