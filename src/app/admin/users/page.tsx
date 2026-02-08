
'use client';

import { useState } from 'react';
import { useFirestore, useCollection } from "@/firebase";
import { collection, doc, setDoc, updateDoc, query, orderBy } from "firebase/firestore";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  UserPlus, 
  Mail, 
  Shield, 
  Trash2, 
  Edit2, 
  Loader2,
  Building2,
  MapPin,
  UserX,
  Phone
} from "lucide-react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { User, UserRole } from "@/lib/auth-mock.tsx";
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

const ROLES: UserRole[] = [
  'Branch Officer', 
  'KYC Officer', 
  'Supervisor', 
  'Director', 
  'Admin', 
  'Branch Manager', 
  'District Director'
];

export default function UserManagementPage() {
  const db = useFirestore();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<Partial<User> | null>(null);
  const [formData, setFormData] = useState<Partial<User>>({
    name: '',
    email: '',
    phoneNumber: '',
    role: 'Branch Officer',
    status: 'Active',
    branch: '',
    district: ''
  });

  const { data: users, loading } = useCollection<User>(
    db ? query(collection(db, "users"), orderBy("name")) : null
  );

  const { data: branches } = useCollection<{id: string, name: string, district: string}>(
    db ? query(collection(db, "branches"), orderBy("name")) : null
  );

  const { data: districts } = useCollection<{id: string, name: string}>(
    db ? query(collection(db, "districts"), orderBy("name")) : null
  );

  const handleOpenDialog = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setFormData(user);
    } else {
      setEditingUser(null);
      setFormData({ 
        name: '', 
        email: '', 
        phoneNumber: '', 
        role: 'Branch Officer', 
        status: 'Active', 
        branch: '', 
        district: '' 
      });
    }
    setIsDialogOpen(true);
  };

  const handleSave = () => {
    if (!db) return;
    if (!formData.name || !formData.email || !formData.phoneNumber) {
      toast({ 
        variant: "destructive", 
        title: "Missing Information", 
        description: "Name, email, and phone number are required for institutional mapping." 
      });
      return;
    }

    const userId = editingUser?.id || `user-${Math.random().toString(36).substr(2, 9)}`;
    const userRef = doc(db, "users", userId);
    const data = { ...formData, id: userId };

    setDoc(userRef, data, { merge: true })
      .catch(async (error) => {
        const permissionError = new FirestorePermissionError({
          path: userRef.path,
          operation: editingUser ? 'update' : 'create',
          requestResourceData: data,
        });
        errorEmitter.emit('permission-error', permissionError);
      });

    toast({ title: editingUser ? "User Updated" : "User Created", description: `${formData.name} saved with login access.` });
    setIsDialogOpen(false);
  };

  const handleDeactivate = (id: string, name: string) => {
    if (!db || !confirm(`Are you sure you want to deactivate ${name}? Their access will be revoked immediately.`)) return;
    const userRef = doc(db, "users", id);
    const updateData = { status: 'Inactive' };
    
    updateDoc(userRef, updateData)
      .catch(async (error) => {
        const permissionError = new FirestorePermissionError({
          path: userRef.path,
          operation: 'update',
          requestResourceData: updateData,
        });
        errorEmitter.emit('permission-error', permissionError);
      });
      
    toast({ title: "User Deactivated", description: "Account access has been revoked." });
  };

  const handleBranchChange = (branchName: string) => {
    const selectedBranch = branches?.find(b => b.name === branchName);
    setFormData({
      ...formData,
      branch: branchName,
      district: selectedBranch?.district || formData.district
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">User Management</h1>
          <p className="text-muted-foreground text-lg font-medium">Control system access and assign regional roles.</p>
        </div>
        <Button onClick={() => handleOpenDialog()} className="gap-2 bg-primary shadow-lg font-bold">
          <UserPlus className="w-4 h-4" />
          Provision New User
        </Button>
      </div>

      <div className="border rounded-xl bg-card shadow-xl overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50/50">
            <TableRow>
              <TableHead className="font-bold">Identity</TableHead>
              <TableHead className="font-bold">Contact Info</TableHead>
              <TableHead className="font-bold">Role</TableHead>
              <TableHead className="font-bold">Organization</TableHead>
              <TableHead className="font-bold">Status</TableHead>
              <TableHead className="text-right font-bold pr-8">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-20 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></TableCell>
              </TableRow>
            ) : users?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-20 text-center italic text-muted-foreground">No users provisioned.</TableCell>
              </TableRow>
            ) : users?.map((user) => (
              <TableRow key={user.id} className="hover:bg-slate-50 transition-colors">
                <TableCell>
                  <span className="font-bold text-slate-900">{user.name}</span>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Mail className="w-3 h-3" /> {user.email}
                    </span>
                    <span className="text-xs font-bold text-slate-600 flex items-center gap-1 mt-0.5">
                      <Phone className="w-3 h-3" /> {user.phoneNumber || 'No Phone Registered'}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className="bg-primary/5 text-primary font-bold">
                    {user.role}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="text-sm font-medium">{user.branch || 'Central HQ'}</div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={user.status === 'Active' ? 'text-green-600 border-green-200 bg-green-50 font-bold' : 'text-slate-400 border-slate-200 bg-slate-50 font-bold'}>
                    {user.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right pr-8">
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(user)} className="text-primary rounded-full hover:bg-primary/5" title="Edit Profile">
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    {user.status === 'Active' && (
                      <Button variant="ghost" size="icon" onClick={() => handleDeactivate(user.id, user.name)} className="text-destructive rounded-full hover:bg-destructive/5" title="Deactivate User">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingUser ? 'Edit User Permissions' : 'Provision New User'}</DialogTitle>
            <DialogDescription>Modify organizational mapping and system authorization.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-widest text-slate-500">User Full Name</Label>
              <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="h-11 border-slate-200" placeholder="e.g. Michael Smith" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-widest text-slate-500">Corporate Email</Label>
              <Input value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="h-11 border-slate-200" placeholder="name@bank.com" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-widest text-slate-500">Phone Number (Login ID)</Label>
              <Input value={formData.phoneNumber} onChange={e => setFormData({...formData, phoneNumber: e.target.value})} className="h-11 border-slate-200" placeholder="+1 (555) 000-0000" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-slate-500">System Role</Label>
                <Select value={formData.role} onValueChange={val => setFormData({...formData, role: val as UserRole})}>
                  <SelectTrigger className="h-11 border-slate-200"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map(role => <SelectItem key={role} value={role}>{role}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-slate-500">Account Status</Label>
                <Select value={formData.status} onValueChange={val => setFormData({...formData, status: val})}>
                  <SelectTrigger className="h-11 border-slate-200"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-slate-500">Assigned Branch</Label>
                <Select value={formData.branch} onValueChange={handleBranchChange}>
                  <SelectTrigger className="h-11 border-slate-200">
                    <SelectValue placeholder="Select Branch" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Central HQ">Central HQ</SelectItem>
                    {branches?.map(b => <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter className="pt-6">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="px-6">Cancel</Button>
            <Button onClick={handleSave} className="px-8 font-bold bg-[#B89334] hover:bg-[#A6822D] text-white shadow-lg">Save Profile</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
