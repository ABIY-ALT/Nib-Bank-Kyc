export type UserRole = 'Branch Officer' | 'KYC Officer' | 'Supervisor' | 'Director' | 'Admin';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  branch?: string;
}

export const MOCK_USERS: User[] = [
  { id: '1', name: 'John Doe', email: 'john.branch@bank.com', role: 'Branch Officer', branch: 'Downtown' },
  { id: '2', name: 'Jane Smith', email: 'jane.kyc@bank.com', role: 'KYC Officer', branch: 'Downtown' },
  { id: '3', name: 'Robert Brown', email: 'robert.super@bank.com', role: 'Supervisor' },
  { id: '4', name: 'Alice Wilson', email: 'alice.dir@bank.com', role: 'Director' },
  { id: '5', name: 'Admin User', email: 'admin@bank.com', role: 'Admin' },
];

// Current logged in user (mocked)
export const currentUser: User = MOCK_USERS[0];

export const hasPermission = (user: User, requiredRoles: UserRole[]) => {
  return requiredRoles.includes(user.role);
};