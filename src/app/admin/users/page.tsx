
'use client';

import { useState, useMemo } from 'react';
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
  Trash2, 
  Edit2, 
  Loader2,
  Building2,
  MapPin,
  Phone,
  Settings2,
  UserCheck
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
    role: undefined,
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
        role: undefined, 
        status: 'Active', 
        branch: '', 
        district: '' 
      });
    }
    setIsDialogOpen(true);
  };

  const handleSave = () => {
    if (!db) return;
    
    // Initial Registration Validation
    if (!formData.name || !formData.email || !formData.phoneNumber) {
      toast({ 
        variant: "destructive", 
        title: "Missing Information", 
        description: "Name, email, and phone number are required for registration." 
      });
      return;
    }

    // Role-specific Assignment Validation
    if (editingUser || formData.role) {
      if (!formData.role) {
        toast({ variant: "destructive", title: "Role Required", description: "Please select an institutional role." });
        return;
      }

      if (['Branch Officer', 'Branch Manager'].includes(formData.role) && (!formData.branch || !formData.district)) {
        toast({ variant: "destructive", title: "Mapping Required", description: "Branch and District are mandatory for this role." });
        return;
      }

      if (formData.role === 'District Director' && !formData.district) {
        toast({ variant: "destructive", title: "District Required", description: "District selection is mandatory for Directors." });
        return;
      }
    }

    const userId = editingUser?.id || `user-${Math.random().toString(36).substr(2, 9)}`;
    const userRef = doc(db, "users", userId);
    
    // Sanitize data object to avoid sending 'undefined' to Firestore
    const data: any = {
      id: userId,
      name: formData.name,
      email: formData.email,
      phoneNumber: formData.phoneNumber,
      status: formData.status || 'Active'
    };

    if (formData.role) data.role = formData.role;
    if (formData.branch) data.branch = formData.branch;
    if (formData.district) data.district = formData.district;

    setDoc(userRef, data, { merge: true })
      .catch(async (error) => {
        const permissionError = new FirestorePermissionError({
          path: userRef.path,
          operation: editingUser ? 'update' : 'create',
          requestResourceData: data,
        });
        errorEmitter.emit('permission-error', permissionError);
      });

    toast({ 
      title: editingUser ? "Profile Updated" : "User Registered", 
      description: editingUser ? "Institutional mapping saved." : `${formData.name} added to registration list.` 
    });
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

  const showBranchField = useMemo(() => {
    return formData.role && ['Branch Officer', 'Branch Manager'].includes(formData.role);
  }, [formData.role]);

  const showDistrictField = useMemo(() => {
    return formData.role && ['Branch Officer', 'Branch Manager', 'District Director'].includes(formData.role);
  }, [formData.role]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Personnel Directory</h1>
          <p className="text-muted-foreground text-lg font-medium">Register users and manage institutional role assignments.</p>
        </div>
        <Button onClick={() => handleOpenDialog()} className="gap-2 bg-primary shadow-lg font-bold">
          <UserPlus className="w-4 h-4" />
          Provision New User
        </Button>
      </div>

      <div className="border rounded-xl bg-card shadow-xl overflow-hidden border-slate-200">
        <Table>
          <TableHeader className="bg-slate-50/50">
            <TableRow>
              <TableHead className="font-bold py-4">Identity</TableHead>
              <TableHead className="font-bold">Contact Info</TableHead>
              <TableHead className="font-bold">Institutional Role</TableHead>
              <TableHead className="font-bold">Mapping</TableHead>
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
                  <div className="flex flex-col">
                    <span className="font-bold text-slate-900">{user.name}</span>
                    <span className="text-[10px] text-muted-foreground font-bold tracking-tighter uppercase">{user.id}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Mail className="w-3 h-3" /> {user.email}
                    </span>
                    <span className="text-xs font-bold text-slate-600 flex items-center gap-1 mt-0.5">
                      <Phone className="w-3 h-3" /> {user.phoneNumber || 'N/A'}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  {user.role ? (
                    <Badge variant="secondary" className="bg-primary/5 text-primary font-bold flex items-center gap-1 w-fit">
                      <UserCheck className="w-3 h-3" />
                      {user.role}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-orange-600 border-orange-200 bg-orange-50 font-bold">
                      Awaiting Assignment
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-0.5">
                    {user.branch && (
                      <div className="text-xs font-bold text-slate-700 flex items-center gap-1">
                        <Building2 className="w-3 h-3 text-slate-400" /> {user.branch}
                      </div>
                    )}
                    {user.district && (
                      <div className="text-[10px] font-bold text-slate-500 flex items-center gap-1 uppercase tracking-tight">
                        <MapPin className="w-2.5 h-2.5" /> {user.district} District
                      </div>
                    )}
                    {!user.branch && !user.district && <span className="text-[10px] font-bold text-slate-300">Unmapped</span>}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={user.status === 'Active' ? 'text-green-600 border-green-200 bg-green-50 font-bold' : 'text-slate-400 border-slate-200 bg-slate-50 font-bold'}>
                    {user.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right pr-8">
                  <div className="flex justify-end gap-2">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => handleOpenDialog(user)} 
                      className="text-primary rounded-full hover:bg-primary/5 h-9 w-9" 
                      title="Assign Role & Mapping"
                    >
                      <Settings2 className="w-4 h-4" />
                    </Button>
                    {user.status === 'Active' && (
                      <Button variant="ghost" size="icon" onClick={() => handleDeactivate(user.id, user.name)} className="text-destructive rounded-full hover:bg-destructive/5 h-9 w-9" title="Deactivate User">
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
            <DialogTitle>{editingUser ? 'Configure Personnel Access' : 'Register New User'}</DialogTitle>
            <DialogDescription>
              {editingUser 
                ? 'Assign institutional roles and organizational mapping.' 
                : 'Initial registration: Identity and contact verification.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            {/* Stage 1: Identity (Always Visible) */}
            <div className="space-y-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Legal Name</Label>
                <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="h-11 bg-white" placeholder="e.g. Michael Smith" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Corporate Email</Label>
                <Input value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="h-11 bg-white" placeholder="name@bank.com" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Phone Number (Login ID)</Label>
                <Input value={formData.phoneNumber} onChange={e => setFormData({...formData, phoneNumber: e.target.value})} className="h-11 bg-white" placeholder="0912345678" />
              </div>
            </div>

            {/* Stage 2: Assignment (Visible during Edit/Assignment) */}
            {editingUser && (
              <div className="space-y-4 animate-in slide-in-from-top-2 duration-300">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-primary">System Role</Label>
                    <Select value={formData.role} onValueChange={val => setFormData({...formData, role: val as UserRole})}>
                      <SelectTrigger className="h-11 border-primary/20"><SelectValue placeholder="Select Role" /></SelectTrigger>
                      <SelectContent>
                        {ROLES.map(role => <SelectItem key={role} value={role}>{role}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Account Status</Label>
                    <Select value={formData.status} onValueChange={val => setFormData({...formData, status: val})}>
                      <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Active">Active</SelectItem>
                        <SelectItem value="Inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {showDistrictField && (
                  <div className="space-y-2 animate-in fade-in duration-300">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Assigned District</Label>
                    <Select 
                      value={formData.district} 
                      onValueChange={val => setFormData({...formData, district: val, branch: ''})}
                    >
                      <SelectTrigger className="h-11"><SelectValue placeholder="Select District" /></SelectTrigger>
                      <SelectContent>
                        {districts?.map(d => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {showBranchField && (
                  <div className="space-y-2 animate-in fade-in duration-300">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Assigned Branch</Label>
                    <Select 
                      value={formData.branch} 
                      onValueChange={handleBranchChange}
                      disabled={!formData.district}
                    >
                      <SelectTrigger className="h-11"><SelectValue placeholder={formData.district ? "Select Branch" : "Select District First"} /></SelectTrigger>
                      <SelectContent>
                        {branches?.filter(b => b.district === formData.district).map(b => (
                          <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter className="pt-6">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="px-6">Cancel</Button>
            <Button onClick={handleSave} className="px-8 font-bold bg-[#B89334] hover:bg-[#A6822D] text-white shadow-lg">
              {editingUser ? 'Save Assignment' : 'Register User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
