
'use client';

import { useState, useMemo } from 'react';
import { useFirestore, useCollection, useMemoFirebase } from "@/firebase";
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
  UserCheck,
  UserX,
  X,
  ShieldCheck,
  Layers,
  ArrowRight,
  CheckCircle
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
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import Link from 'next/link';

const ROLES: UserRole[] = [
  'Branch Officer', 
  'KYC Officer', 
  'Supervisor', 
  'Branch Banking Director', 
  'Admin', 
  'Branch Manager', 
  'District Director',
  'Division Manager',
  'Chief Retail & SME Banking Officer',
  'Follow-up Team',
  'Chief'
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
    assignedBranches: [],
    district: ''
  });

  const usersQuery = useMemoFirebase(() => {
    return db ? query(collection(db, "users"), orderBy("name")) : null;
  }, [db]);

  const { data: users, loading } = useCollection<User>(usersQuery);

  const branchesQuery = useMemoFirebase(() => {
    return db ? query(collection(db, "branches"), orderBy("name")) : null;
  }, [db]);

  const { data: branches } = useCollection<{id: string, name: string, district: string}>(branchesQuery);

  const districtsQuery = useMemoFirebase(() => {
    return db ? query(collection(db, "districts"), orderBy("name")) : null;
  }, [db]);

  const { data: districts } = useCollection<{id: string, name: string}>(districtsQuery);

  const handleOpenDialog = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setFormData({
        ...user,
        assignedBranches: user.assignedBranches || []
      });
    } else {
      setEditingUser(null);
      setFormData({ 
        name: '', 
        email: '', 
        phoneNumber: '', 
        role: undefined, 
        status: 'Active', 
        branch: '', 
        assignedBranches: [],
        district: '' 
      });
    }
    setIsDialogOpen(true);
  };

  const handleSave = () => {
    if (!db) return;
    
    if (!formData.name || !formData.email || !formData.phoneNumber) {
      toast({ variant: "destructive", title: "Missing Information", description: "Identity details required." });
      return;
    }

    if (!formData.email.toLowerCase().endsWith('@nibbank.com.et')) {
      toast({ variant: "destructive", title: "Invalid Domain", description: "Personnel email must use @nibbank.com.et domain." });
      return;
    }

    if (editingUser || formData.role) {
      if (!formData.role) {
        toast({ variant: "destructive", title: "Role Required", description: "Please assign an institutional role." });
        return;
      }

      if (['Branch Officer', 'Branch Manager'].includes(formData.role) && (!formData.branch || !formData.district)) {
        toast({ variant: "destructive", title: "Mapping Required", description: "Branch and District are mandatory for this role." });
        return;
      }

      if (formData.role === 'District Director' && !formData.district) {
        toast({ variant: "destructive", title: "District Required", description: "District Directors must be mapped to a region." });
        return;
      }
    }

    const userId = editingUser?.id || `user-${Math.random().toString(36).substr(2, 9)}`;
    const userRef = doc(db, "users", userId);
    
    const data: any = {
      id: userId,
      name: formData.name || "",
      email: formData.email || "",
      phoneNumber: formData.phoneNumber || "",
      status: formData.status || 'Active',
      role: formData.role || null,
      branch: formData.branch || null,
      district: formData.district || null,
      assignedBranches: formData.assignedBranches || [],
      // If it's a new user, force them to change password on first login
      needsPasswordChange: editingUser ? (formData.needsPasswordChange ?? false) : true
    };

    setDoc(userRef, data, { merge: true })
      .catch(async (error) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ 
          path: userRef.path, 
          operation: editingUser ? 'update' : 'create', 
          requestResourceData: data 
        }));
      });

    toast({ 
      title: editingUser ? "Assignment Saved" : "User Registered", 
      description: editingUser 
        ? "Personnel mapping updated in the institutional directory."
        : `User created. Temporary access granted with force-password policy.` 
    });
    setIsDialogOpen(false);
  };

  const handleToggleStatus = (id: string, currentStatus: string, name: string) => {
    if (!db) return;
    const newStatus = currentStatus === 'Active' ? 'Inactive' : 'Active';
    if (!confirm(`Are you sure you want to change ${name}'s status to ${newStatus}?`)) return;
    
    updateDoc(doc(db, "users", id), { status: newStatus })
      .catch(async (error) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: `users/${id}`,
          operation: 'update',
          requestResourceData: { status: newStatus }
        }));
      });

    toast({ 
      title: newStatus === 'Active' ? "User Restored" : "User Deactivated",
      description: `${name} status updated to ${newStatus}.`
    });
  };

  const showSingleBranchField = formData.role && ['Branch Officer', 'Branch Manager'].includes(formData.role);
  const showDistrictField = formData.role && ['Branch Officer', 'Branch Manager', 'District Director'].includes(formData.role);
  const isKYCOfficer = formData.role === 'KYC Officer';

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">Personnel Directory</h1>
          <p className="text-muted-foreground text-lg font-medium">Register users and manage institutional role assignments.</p>
        </div>
        <Button onClick={() => handleOpenDialog()} className="gap-2 bg-[#B89334] hover:bg-[#A6822D] shadow-lg font-bold h-11 px-6">
          <UserPlus className="w-4 h-4" />
          Provision New User
        </Button>
      </div>

      <div className="border rounded-xl bg-card shadow-xl overflow-hidden border-slate-200">
        <Table>
          <TableHeader className="bg-slate-50/50">
            <TableRow>
              <TableHead className="font-bold py-4">Identity</TableHead>
              <TableHead className="font-bold">Institutional Role</TableHead>
              <TableHead className="font-bold">Jurisdictional Mapping</TableHead>
              <TableHead className="font-bold">Status</TableHead>
              <TableHead className="text-right font-bold pr-8">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="py-20 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></TableCell></TableRow>
            ) : users?.map((user) => (
              <TableRow key={user.id} className="hover:bg-slate-50 transition-colors">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-500">
                      {user.name.charAt(0)}
                    </div>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">{user.name}</span>
                        {user.needsPasswordChange && (
                          <Badge className="bg-orange-50 text-orange-600 border-orange-100 text-[8px] h-4 font-black uppercase">Force Update</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-bold tracking-tighter">
                        <Mail className="w-2.5 h-2.5" />
                        {user.email}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  {user.role ? (
                    <Badge variant="secondary" className="bg-primary/5 text-primary font-bold flex items-center gap-1.5 w-fit">
                      <UserCheck className="w-3 h-3" /> {user.role}
                    </Badge>
                  ) : <Badge variant="outline" className="text-orange-600 border-orange-200 bg-orange-50 font-bold">Awaiting Role</Badge>}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    {user.role === 'KYC Officer' ? (
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-black uppercase text-primary tracking-widest mb-0.5">Assigned Portfolio</span>
                        <div className="flex flex-wrap gap-1 max-w-[240px]">
                          {user.assignedBranches?.map(b => (
                            <Badge key={b} variant="secondary" className="text-[9px] h-4.5 px-2 bg-white border-primary/20 text-slate-700 font-bold">
                              {b}
                            </Badge>
                          ))}
                          {(!user.assignedBranches || user.assignedBranches.length === 0) && (
                            <span className="text-[10px] font-bold text-slate-300 italic">No nodes mapped</span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {user.branch && (
                          <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-slate-400" /> 
                            {user.branch} Node
                          </div>
                        )}
                        {user.district && (
                          <div className="text-[10px] font-bold text-slate-500 flex items-center gap-1.5 uppercase tracking-tight">
                            <MapPin className="w-3 h-3 text-slate-400" /> 
                            {user.district} District
                          </div>
                        )}
                        {!user.branch && !user.district && (
                          <span className="text-[10px] font-bold text-slate-300 italic">Unmapped</span>
                        )}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={user.status === 'Active' ? 'text-green-600 border-green-200 bg-green-50 font-bold' : 'text-slate-400 border-slate-200 bg-slate-50 font-bold'}>
                    {user.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right pr-8">
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(user)} className="text-primary rounded-full hover:bg-primary/5 h-9 w-9">
                      <Settings2 className="w-4 h-4" />
                    </Button>
                    
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => handleToggleStatus(user.id, user.status || 'Active', user.name)} 
                      className={user.status === 'Active' ? "text-destructive rounded-full hover:bg-destructive/5 h-9 w-9" : "text-emerald-600 rounded-full hover:bg-emerald-50 h-9 w-9"}
                      title={user.status === 'Active' ? "Deactivate User" : "Activate User"}
                    >
                      {user.status === 'Active' ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] flex flex-col p-0 overflow-hidden shadow-2xl">
          <DialogHeader className="p-6 border-b shrink-0">
            <DialogTitle className="text-2xl font-bold flex items-center gap-2">
              {editingUser ? <ShieldCheck className="w-6 h-6 text-[#B89334]" /> : <UserPlus className="w-6 h-6 text-[#B89334]" />}
              {editingUser ? 'Configure Access' : 'Register New User'}
            </DialogTitle>
            <DialogDescription>
              {editingUser 
                ? 'Assign institutional roles and jurisdictional mapping for this staff member.' 
                : 'Initial identity registration.'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30">
            <div className="space-y-8">
              <div className="space-y-4 p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Legal Name</Label>
                  <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="h-11 bg-white" placeholder="e.g. Michael Smith" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Phone</Label>
                    <Input value={formData.phoneNumber} onChange={e => setFormData({...formData, phoneNumber: e.target.value})} className="h-11 bg-white" placeholder="09..." />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Official Email</Label>
                    <Input value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="h-11 bg-white" placeholder="Test.Test@nibbank.com.et" />
                  </div>
                </div>
              </div>

              {editingUser && (
                <div className="space-y-8">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-primary">System Role</Label>
                      <Select value={formData.role || ""} onValueChange={val => setFormData({...formData, role: val as UserRole})}>
                        <SelectTrigger className="h-11 border-primary/30 bg-primary/5">
                          <SelectValue placeholder="Assign Role" />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map(role => <SelectItem key={role} value={role} className="font-bold">{role}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Status</Label>
                      <Select value={formData.status} onValueChange={val => setFormData({...formData, status: val as any})}>
                        <SelectTrigger className="h-11 border-slate-200"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Active">Active</SelectItem>
                          <SelectItem value="Inactive">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {formData.role && (
                    <div className="space-y-6 pt-2 animate-in fade-in duration-500">
                      {showDistrictField && (
                        <div className="space-y-2">
                          <Label className="text-sm font-bold text-slate-700">Assigned District</Label>
                          <Select value={formData.district || ""} onValueChange={val => setFormData({...formData, district: val, branch: ''})}>
                            <SelectTrigger className="h-11"><SelectValue placeholder="Select Region" /></SelectTrigger>
                            <SelectContent>
                              {districts?.map(d => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {showSingleBranchField && (
                        <div className="space-y-2">
                          <Label className="text-sm font-bold text-slate-700">Primary Branch Node</Label>
                          <Select value={formData.branch || ""} onValueChange={val => setFormData({...formData, branch: val})} disabled={!formData.district}>
                            <SelectTrigger className="h-11"><SelectValue placeholder="Select Node" /></SelectTrigger>
                            <SelectContent>
                              {branches?.filter(b => b.district === formData.district).map(b => (
                                <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {isKYCOfficer && (
                        <div className="p-5 rounded-2xl bg-primary/5 border border-primary/10 space-y-4 shadow-sm">
                          <div className="flex items-center gap-2 text-primary">
                            <Settings2 className="w-5 h-5" />
                            <span className="text-xs font-bold uppercase tracking-wider">Multi-Branch Portfolio</span>
                          </div>
                          <p className="text-[12px] text-slate-600 font-medium leading-relaxed">
                            Jurisdictional mapping for KYC Officers is managed in Staff Assignments.
                          </p>
                          <Button asChild variant="outline" size="sm" className="w-full h-10 font-bold text-primary border-primary/20 hover:bg-primary/5 gap-2">
                            <Link href="/admin/assignments">
                              Go to Staff Assignments
                              <ArrowRight className="w-4 h-4" />
                            </Link>
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="p-6 border-t bg-slate-50 shrink-0">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="px-6 font-bold h-11">Cancel</Button>
            <Button 
              onClick={handleSave} 
              className="px-8 font-black bg-[#B89334] hover:bg-[#A6822D] text-white shadow-xl h-11 min-w-[180px]"
            >
              {editingUser ? 'Update Assignment' : 'Complete Registration'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
