
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
  UserCheck,
  X,
  ShieldCheck,
  Layers
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
    assignedBranches: [],
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

    // Role-based validation for existing users or when role is being assigned
    if (editingUser || formData.role) {
      if (!formData.role) {
        toast({ variant: "destructive", title: "Role Required", description: "Please assign an institutional role." });
        return;
      }

      if (['Branch Officer', 'Branch Manager'].includes(formData.role) && (!formData.branch || !formData.district)) {
        toast({ variant: "destructive", title: "Mapping Required", description: "Branch and District are mandatory for this role." });
        return;
      }

      if (formData.role === 'KYC Officer' && (!formData.assignedBranches || formData.assignedBranches.length === 0)) {
        toast({ variant: "destructive", title: "Portfolio Required", description: "KYC Officers must be mapped to at least one branch portfolio." });
        return;
      }

      if (formData.role === 'District Director' && !formData.district) {
        toast({ variant: "destructive", title: "District Required", description: "District Directors must be mapped to a region." });
        return;
      }
    }

    const userId = editingUser?.id || `user-${Math.random().toString(36).substr(2, 9)}`;
    const userRef = doc(db, "users", userId);
    
    // Sanitize data: Firestore does not accept undefined
    const data: any = {
      id: userId,
      name: formData.name,
      email: formData.email,
      phoneNumber: formData.phoneNumber,
      status: formData.status || 'Active',
      role: formData.role || null,
      branch: formData.branch || null,
      district: formData.district || null,
      assignedBranches: formData.assignedBranches || []
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
      description: "Personnel mapping updated in the institutional directory." 
    });
    setIsDialogOpen(false);
  };

  const handleDeactivate = (id: string, name: string) => {
    if (!db || !confirm(`Deactivate ${name}?`)) return;
    updateDoc(doc(db, "users", id), { status: 'Inactive' }).catch(() => {});
    toast({ title: "User Deactivated" });
  };

  const handleToggleAssignedBranch = (branchName: string) => {
    const current = formData.assignedBranches || [];
    const updated = current.includes(branchName) 
      ? current.filter(b => b !== branchName)
      : [...current, branchName];
    setFormData({ ...formData, assignedBranches: updated });
  };

  const showSingleBranchField = formData.role && ['Branch Officer', 'Branch Manager'].includes(formData.role);
  const showMultiBranchField = formData.role === 'KYC Officer';
  const showDistrictField = formData.role && ['Branch Officer', 'Branch Manager', 'District Director'].includes(formData.role);

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
                      <span className="font-bold text-slate-900">{user.name}</span>
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-bold uppercase tracking-tighter">
                        <Phone className="w-2.5 h-2.5" />
                        {user.phoneNumber}
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
                    {user.status === 'Active' && (
                      <Button variant="ghost" size="icon" onClick={() => handleDeactivate(user.id, user.name)} className="text-destructive rounded-full hover:bg-destructive/5 h-9 w-9">
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
        <DialogContent className="max-w-md max-h-[95vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-6 pb-2">
            <DialogTitle className="text-2xl font-bold flex items-center gap-2">
              {editingUser ? <ShieldCheck className="w-6 h-6 text-[#B89334]" /> : <UserPlus className="w-6 h-6 text-[#B89334]" />}
              {editingUser ? 'Configure Access' : 'Register New User'}
            </DialogTitle>
            <DialogDescription>
              {editingUser 
                ? 'Assign institutional roles and jurisdictional mapping for this staff member.' 
                : 'Initial identity registration. Role and branch mapping can be assigned after registration.'}
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="flex-1 px-6">
            <div className="space-y-6 pt-4 pb-6">
              {/* Identity Section */}
              <div className="space-y-4 p-4 rounded-xl bg-slate-50 border border-slate-200 shadow-inner">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Legal Name</Label>
                  <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="h-11 bg-white border-slate-200" placeholder="e.g. Michael Smith" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Phone (Login ID)</Label>
                    <Input value={formData.phoneNumber} onChange={e => setFormData({...formData, phoneNumber: e.target.value})} className="h-11 bg-white border-slate-200" placeholder="09..." />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Corporate Email</Label>
                    <Input value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="h-11 bg-white border-slate-200" placeholder="name@bank.com" />
                  </div>
                </div>
              </div>

              {/* Institutional Assignment Section (Visible for existing users) */}
              {editingUser && (
                <div className="space-y-6 animate-in slide-in-from-top-2 duration-300">
                  <Separator />
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-1">
                        <Layers className="w-3 h-3" /> System Role
                      </Label>
                      <Select value={formData.role || ""} onValueChange={val => setFormData({...formData, role: val as UserRole})}>
                        <SelectTrigger className="h-11 border-primary/30 bg-primary/5 focus:ring-primary">
                          <SelectValue placeholder="Assign Role" />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map(role => <SelectItem key={role} value={role} className="font-bold">{role}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Staff Status</Label>
                      <Select value={formData.status} onValueChange={val => setFormData({...formData, status: val})}>
                        <SelectTrigger className="h-11 border-slate-200">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Active" className="text-green-600 font-bold">Active</SelectItem>
                          <SelectItem value="Inactive" className="text-slate-400 font-bold">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {formData.role && (
                    <div className="space-y-4 pt-2 animate-in fade-in duration-500">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 border-b pb-1 flex items-center gap-2">
                        Jurisdictional Mapping Required
                      </Label>

                      {showDistrictField && (
                        <div className="space-y-2">
                          <Label className="text-xs font-bold text-slate-700">Assigned Regional District</Label>
                          <Select value={formData.district || ""} onValueChange={val => setFormData({...formData, district: val, branch: ''})}>
                            <SelectTrigger className="h-11 border-slate-200"><SelectValue placeholder="Select Region" /></SelectTrigger>
                            <SelectContent>
                              {districts?.map(d => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {showSingleBranchField && (
                        <div className="space-y-2">
                          <Label className="text-xs font-bold text-slate-700">Primary Branch Node</Label>
                          <Select value={formData.branch || ""} onValueChange={val => setFormData({...formData, branch: val})} disabled={!formData.district}>
                            <SelectTrigger className="h-11 border-slate-200"><SelectValue placeholder="Select Node" /></SelectTrigger>
                            <SelectContent>
                              {branches?.filter(b => b.district === formData.district).map(b => (
                                <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {showMultiBranchField && (
                        <div className="space-y-2">
                          <Label className="text-xs font-bold text-slate-700">Authorized Branch Portfolios</Label>
                          <div className="border rounded-xl p-3 bg-slate-50 border-slate-200">
                            <ScrollArea className="h-48">
                              <div className="grid grid-cols-1 gap-2.5">
                                {branches?.map(b => (
                                  <div key={b.id} className="flex items-center space-x-3 p-2 rounded-lg bg-white border border-slate-100 shadow-sm hover:border-primary/20 transition-all">
                                    <Checkbox 
                                      id={`branch-${b.id}`} 
                                      checked={formData.assignedBranches?.includes(b.name)}
                                      onCheckedChange={() => handleToggleAssignedBranch(b.name)}
                                    />
                                    <label htmlFor={`branch-${b.id}`} className="text-xs font-bold text-slate-700 cursor-pointer flex-1 flex justify-between items-center">
                                      {b.name}
                                      <Badge variant="outline" className="text-[8px] h-3.5 bg-slate-50 text-slate-400 border-slate-200 uppercase">{b.district}</Badge>
                                    </label>
                                  </div>
                                ))}
                              </div>
                            </ScrollArea>
                          </div>
                          <p className="text-[10px] text-muted-foreground italic mt-1 font-medium">Select all branches this KYC Officer is authorized to review and approve.</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>

          <DialogFooter className="p-6 pt-4 border-t bg-slate-50/50">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="px-6 font-bold">Cancel</Button>
            <Button 
              onClick={handleSave} 
              className="px-8 font-black bg-[#B89334] hover:bg-[#A6822D] text-white shadow-xl h-11"
            >
              {editingUser ? 'Update Assignment' : 'Complete Registration'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
