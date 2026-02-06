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
  role: UserRole;
  branch?: string;
  district?: string;
}

export const MOCK_USERS: User[] = [
  { id: '1', name: 'John Doe', email: 'john.branch@bank.com', role: 'Branch Officer', branch: 'Downtown', district: 'Central' },
  { id: '2', name: 'Jane Smith', email: 'jane.kyc@bank.com', role: 'KYC Officer', branch: 'Downtown', district: 'Central' },
  { id: '3', name: 'Robert Brown', email: 'robert.super@bank.com', role: 'Supervisor', district: 'Central' },
  { id: '4', name: 'Alice Wilson', email: 'alice.dir@bank.com', role: 'Director' },
  { id: '5', name: 'Admin User', email: 'admin@bank.com', role: 'Admin' },
  { id: '6', name: 'Mike Manager', email: 'mike.mgr@bank.com', role: 'Branch Manager', branch: 'Downtown', district: 'Central' },
  { id: '7', name: 'Diana District', email: 'diana.dist@bank.com', role: 'District Director', district: 'Central' },
];

// Current logged in user (mocked as Admin for verification of full sidebar)
export const currentUser: User = MOCK_USERS[4];

export const hasPermission = (user: User, requiredRoles: UserRole[]) => {
  return requiredRoles.includes(user.role);
};
