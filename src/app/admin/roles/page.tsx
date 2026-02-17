'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { 
  Loader2, 
  ShieldCheck, 
  Search,
} from "lucide-react";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getAllUsers, updateUserRole } from '@/actions/users';
import { UserRole } from '@prisma/client';

const SYSTEM_ROLES = Object.values(UserRole);

export default function StaffRolesPage() {
  const { toast } = useToast();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await getAllUsers();
      setUsers(data);
    } catch (e) {
      toast({ variant: "destructive", title: "Sync Failed", description: "Could not retrieve SQL staff list." });
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: UserRole, currentName: string) => {
    try {
      await updateUserRole(userId, newRole);
      toast({ title: "Role Updated", description: `${currentName} is now ${newRole.replace(/_/g, ' ')}.` });
      loadUsers();
    } catch (e) {
      toast({ variant: "destructive", title: "Update Failed", description: "SQL registration could not be modified." });
    }
  };

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="font-bold text-muted-foreground uppercase tracking-widest text-[10px]">Retrieving SQL Matrix...</p>
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
          <p className="text-muted-foreground text-lg font-medium">Relational staff role mapping and access control.</p>
        </div>
      </div>

      <Tabs defaultValue="assignments" className="space-y-6">
        <TabsList className="bg-slate-100 p-1 border h-12">
          <TabsTrigger value="assignments" className="data-[state=active]:bg-white data-[state=active]:text-primary font-bold px-8">
            Staff Assignments
          </TabsTrigger>
        </TabsList>

        <TabsContent value="assignments">
          <Card className="shadow-xl border-slate-200 overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b flex flex-row justify-between items-center">
              <div><CardTitle className="text-xl">Staff Role Mapping</CardTitle></div>
              <div className="relative w-80"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" /><Input placeholder="Search personnel..." className="pl-9" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50/50">
                  <TableRow>
                    <TableHead className="font-bold py-4 pl-8">Staff Member</TableHead>
                    <TableHead className="font-bold">Current Designation</TableHead>
                    <TableHead className="text-right font-bold pr-8">Update Authorization</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((u) => (
                    <TableRow key={u.id} className="hover:bg-slate-50">
                      <TableCell className="pl-8 py-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-900">{u.name}</span>
                          <span className="text-[10px] text-muted-foreground font-medium">{u.email}</span>
                        </div>
                      </TableCell>
                      <TableCell><Badge variant="secondary" className="bg-primary/5 text-primary font-bold">{u.role.replace(/_/g, ' ')}</Badge></TableCell>
                      <TableCell className="text-right pr-8">
                        <Select value={u.role} onValueChange={(val) => handleRoleChange(u.id, val as UserRole, u.name)}>
                          <SelectTrigger className="w-[220px] h-10 border-primary/20 bg-white"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {SYSTEM_ROLES.map(role => <SelectItem key={role} value={role}>{role.replace(/_/g, ' ')}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
