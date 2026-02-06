
'use client';

import { useState, useMemo } from 'react';
import { useFirestore, useCollection } from "@/firebase";
import { collection, doc, setDoc, deleteDoc, query, orderBy } from "firebase/firestore";
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
  MoreHorizontal, 
  Mail, 
  Shield, 
  Trash2, 
  Edit2, 
  Loader2,
  Building2,
  MapPin
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
import { User, UserRole } from "@/lib/auth-mock";

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
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingUser, setEditingUser] = useState<Partial<User> | null>(null);
  const [formData, setFormData] = useState<Partial<User>>({
    name: '',
    email: '',
    role: 'Branch Officer',
    status: 'Active',
    branch: '',
    district: ''
  });

  const { data: users, loading } = useCollection<User>(
    db ? query(collection(db, "users"), orderBy("name")) : null
  );

  const handleOpenDialog = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setFormData(user);
    } else {
      setEditingUser(null);
      setFormData({ name: '', email: '', role: 'Branch Officer', status: 'Active', branch: '', district: '' });
    }
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!db) return;
    if (!formData.name || !formData.email) {
      toast({ variant: "destructive", title: "Missing Information", description: "Name and email are required." });
      return;
    }

    const userId = editingUser?.id || `user-${Math.random().toString(36).substr(2, 9)}`;
    const userRef = doc(db, "users", userId);

    try {
      await setDoc(userRef, { ...formData, id: userId }, { merge: true });
      toast({ title: editingUser ? "User Updated" : "User Created", description: `${formData.name}'s profile has been saved.` });
      setIsDialogOpen(false);
    } catch (e) {
      toast({ variant: "destructive", title: "Error", description: "Failed to save user profile." });
    }
  };

  const handleDelete = async (id: string) => {
    if (!db || !confirm("Are you sure you want to delete this user?")) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, "users", id));
      toast({ title: "User Deleted", description: "The user has been removed from the system." });
    } catch (e) {
      toast({ variant: "destructive", title: "Error", description: "Failed to delete user." });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">User Access Management</h1>
          <p className="text-muted-foreground text-lg">Assign roles, manage branch permissions, and control system entry.</p>
        </div>
        <Button onClick={() => handleOpenDialog()} className="gap-2 bg-primary shadow-lg">
          <UserPlus className="w-4 h-4" />
          Provision New User
        </Button>
      </div>

      <div className="border rounded-xl bg-card shadow-xl overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50/50">
            <TableRow>
              <TableHead className="font-bold">Identity</TableHead>
              <TableHead className="font-bold">Institutional Role</TableHead>
              <TableHead className="font-bold">Organizational Mapping</TableHead>
              <TableHead className="font-bold">Account Status</TableHead>
              <TableHead className="text-right font-bold pr-8">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-20 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></TableCell>
              </TableRow>
            ) : users?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-20 text-center italic text-muted-foreground">No users provisioned in system.</TableCell>
              </TableRow>
            ) : users?.map((user) => (
              <TableRow key={user.id} className="hover:bg-slate-50 transition-colors">
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-bold text-slate-900">{user.name}</span>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Mail className="w-3 h-3" /> {user.email}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className="gap-1 bg-primary/5 text-primary border-primary/10 px-3 py-1 font-bold">
                    <Shield className="w-3 h-3" />
                    {user.role}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <div className="text-sm font-medium flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-slate-400" />
                      {user.branch || 'Central HQ'}
                    </div>
                    {user.district && (
                      <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 uppercase tracking-widest font-bold">
                        <MapPin className="w-2.5 h-2.5" />
                        {user.district} District
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={`px-3 py-1 font-bold ${user.status === 'Active' ? 'text-green-600 bg-green-50 border-green-200' : 'text-slate-400 bg-slate-50'}`}>
                    {user.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right pr-8">
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(user)} className="text-primary hover:bg-primary/5">
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(user.id)} className="text-destructive hover:bg-destructive/5">
                      <Trash2 className="w-4 h-4" />
                    </Button>
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
            <DialogTitle className="text-2xl font-bold">{editingUser ? 'Edit User Permissions' : 'Provision System User'}</DialogTitle>
            <DialogDescription>Configure institutional access, roles, and branch assignments.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-widest text-slate-500">Full Legal Name</Label>
              <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Jane Doe" className="h-11" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-widest text-slate-500">Corporate Email</Label>
              <Input value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} placeholder="jane.doe@bank.com" className="h-11" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-slate-500">System Role</Label>
                <Select value={formData.role} onValueChange={val => setFormData({...formData, role: val as UserRole})}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map(role => <SelectItem key={role} value={role}>{role}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-slate-500">Account Status</Label>
                <Select value={formData.status} onValueChange={val => setFormData({...formData, status: val})}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-slate-500">Assigned Branch</Label>
                <Input value={formData.branch} onChange={e => setFormData({...formData, branch: e.target.value})} placeholder="Downtown" className="h-11" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-slate-500">District Oversight</Label>
                <Input value={formData.district} onChange={e => setFormData({...formData, district: e.target.value})} placeholder="Central" className="h-11" />
              </div>
            </div>
          </div>
          <DialogFooter className="pt-6">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="h-11 font-bold">Cancel</Button>
            <Button onClick={handleSave} className="h-11 px-8 font-bold bg-primary shadow-lg">Save Access Profile</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
