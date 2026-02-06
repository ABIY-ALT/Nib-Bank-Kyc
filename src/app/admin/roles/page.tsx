'use client';

import { useState } from 'react';
import { useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { doc, updateDoc, collection, query, orderBy } from "firebase/firestore";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { User, UserRole } from "@/lib/auth-mock.tsx";
import { 
  Loader2, 
  ShieldCheck, 
  Search,
  UserCog,
  ShieldAlert
} from "lucide-react";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const ROLES: UserRole[] = [
  'Branch Officer', 
  'KYC Officer', 
  'Supervisor', 
  'Director', 
  'Admin', 
  'Branch Manager', 
  'District Director'
];

export default function StaffRolesPage() {
  const db = useFirestore();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");

  const usersQuery = useMemoFirebase(() => {
    return db ? query(collection(db, "users"), orderBy("name")) : null;
  }, [db]);

  const { data: users, loading } = useCollection<User>(usersQuery);

  const handleRoleChange = (userId: string, newRole: UserRole, currentName: string) => {
    if (!db) return;
    const userRef = doc(db, "users", userId);
    const updateData = { role: newRole };

    updateDoc(userRef, updateData)
      .catch(async (error) => {
        const permissionError = new FirestorePermissionError({
          path: userRef.path,
          operation: 'update',
          requestResourceData: updateData,
        });
        errorEmitter.emit('permission-error', permissionError);
      });

    toast({
      title: "Role Updated",
      description: `${currentName} is now assigned as ${newRole}.`,
    });
  };

  const filteredUsers = users?.filter(u => 
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.role.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="font-bold text-muted-foreground">Retrieving institutional authorization matrix...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-primary text-white rounded-lg shadow-lg">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Authorization Management</h1>
          </div>
          <p className="text-muted-foreground text-lg font-medium">Configure system access levels and operational privileges.</p>
        </div>
      </div>

      <Card className="shadow-xl border-slate-200 overflow-hidden">
        <CardHeader className="bg-slate-50/50 border-b">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <CardTitle className="text-xl flex items-center gap-2">
                <UserCog className="w-5 h-5 text-primary" />
                Staff Role Assignments
              </CardTitle>
              <CardDescription>Update permissions for all institutional personnel.</CardDescription>
            </div>
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input 
                placeholder="Search by name or role..." 
                className="pl-9 h-11" 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/50">
                <TableHead className="font-bold py-4">Staff Member</TableHead>
                <TableHead className="font-bold">Current Designation</TableHead>
                <TableHead className="font-bold">Branch / Office</TableHead>
                <TableHead className="text-right font-bold pr-8">New Role Assignment</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((u) => (
                <TableRow key={u.id} className="hover:bg-slate-50 transition-colors group">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold border border-primary/20">
                        {u.name.charAt(0)}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-900">{u.name}</span>
                        <span className="text-[10px] text-muted-foreground font-bold tracking-tighter">{u.email}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="bg-primary/5 text-primary font-bold">
                      {u.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 text-sm font-medium text-slate-600">
                      {u.branch || 'Central HQ'}
                    </div>
                  </TableCell>
                  <TableCell className="text-right pr-8">
                    <div className="flex justify-end">
                      <Select 
                        value={u.role} 
                        onValueChange={(val) => handleRoleChange(u.id, val as UserRole, u.name)}
                      >
                        <SelectTrigger className="w-[180px] h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map(role => (
                            <SelectItem key={role} value={role}>{role}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filteredUsers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-20 text-center italic text-muted-foreground">
                    <ShieldAlert className="w-12 h-12 mx-auto mb-3 text-slate-200" />
                    No staff members found matching your search.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
