'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/use-permissions';
import {
  Loader2, ArrowRightLeft, Plus, Search, Building2, Users, Check,
  ChevronsUpDown, Edit3, Trash2, UserPlus, UserMinus,
  Star, StarOff, Power, PowerOff, Eye, ChevronDown, ChevronRight,
  CalendarDays, Sun, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SYSTEM_SECTION_COPY } from '@/lib/access-ui';
import {
  getBranchMappings, createMapping, updateMapping, setMappingActive, setMappingsActive,
  deleteMapping, setPrimaryOfficer, addOfficers, removeOfficer, setSaturdayVisibility,
  reassignAllOfficerBranches,
} from '@/actions/branch-mappings';
import { getAllUsers } from '@/actions/users';
import { getBranches } from '@/actions/hierarchy';

// ─── helpers ────────────────────────────────────────────────────────────────

const isKycEligible = (user: any) =>
  user.roles?.some((ur: any) => {
    const n = (ur.role?.name || '').toUpperCase();
    return n.includes('KYC') || n.includes('SPECIALIST');
  });

const formatName = (u: any) => `${u.firstName} ${u.lastName}`.trim();

const TYPE_COLORS: Record<string, string> = {
  PERMANENT: 'bg-blue-50 text-blue-700 border-blue-200',
  TEMPORARY: 'bg-amber-50 text-amber-700 border-amber-200',
};
const STATUS_COLORS: Record<string, string> = {
  true: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  false: 'bg-slate-100 text-slate-500 border-slate-200',
};

// ─── InlineSelect ─────────────────────────────────────────────────────────────
// Renders an absolute-positioned dropdown inside the dialog DOM — avoids the
// Radix Portal/Dialog focus-trap conflict that blocks clicks in Popovers.

interface InlineSelectOption {
  id: string;
  label: string;
  sublabel?: string;
  initial?: string;
}

function InlineSelect({
  options,
  selected,
  onToggle,
  placeholder,
  multi = true,
  showPrimary = false,
}: {
  options: InlineSelectOption[];
  selected: string[];
  onToggle: (id: string) => void;
  placeholder: string;
  multi?: boolean;
  showPrimary?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase()) ||
    (o.sublabel || '').toLowerCase().includes(search.toLowerCase()),
  );

  const selectedItems = options.filter((o) => selected.includes(o.id));

  const handleToggle = (id: string) => {
    onToggle(id);
    if (!multi) {
      setOpen(false);
      setSearch('');
    }
  };

  return (
    <div ref={containerRef} className="relative">
      {/* trigger */}
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className={cn(
          'w-full flex items-center justify-between min-h-[44px] px-4 py-2 rounded-xl border bg-white font-bold text-sm text-left transition-colors',
          open ? 'border-primary ring-2 ring-primary/20' : 'border-slate-200 hover:border-slate-300',
        )}
      >
        <span className="flex-1 min-w-0">
          {selected.length === 0 ? (
            <span className="text-slate-400 font-medium">{placeholder}</span>
          ) : multi ? (
            <span className="flex flex-wrap gap-1">
              {selectedItems.map((item, idx) => (
                <span
                  key={item.id}
                  className={cn(
                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-black',
                    showPrimary && idx === 0
                      ? 'bg-primary/10 text-primary border border-primary/20'
                      : 'bg-slate-100 text-slate-600 border border-slate-200',
                  )}
                >
                  {showPrimary && idx === 0 && <Star className="w-2.5 h-2.5" />}
                  {item.label}
                  <span
                    role="button"
                    onMouseDown={(e) => { e.stopPropagation(); onToggle(item.id); }}
                    className="ml-0.5 hover:text-destructive cursor-pointer"
                  >
                    <X className="w-2.5 h-2.5" />
                  </span>
                </span>
              ))}
            </span>
          ) : (
            <span className="truncate">{selectedItems[0]?.label}</span>
          )}
        </span>
        <ChevronsUpDown className="ml-2 h-4 w-4 opacity-40 flex-shrink-0" />
      </button>

      {/* dropdown — absolute, stays inside dialog DOM */}
      {open && (
        <div className="absolute z-50 top-[calc(100%+4px)] left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2.5">
            <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <input
              autoFocus
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 text-sm font-bold outline-none bg-transparent placeholder:text-slate-400 placeholder:font-normal"
            />
            {search && (
              <button onMouseDown={(e) => { e.preventDefault(); setSearch(''); }}>
                <X className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600" />
              </button>
            )}
          </div>
          <div className="overflow-y-auto max-h-52">
            {filtered.length === 0 ? (
              <p className="py-6 text-center text-xs font-bold text-muted-foreground">No results found</p>
            ) : (
              filtered.map((o) => {
                const isSelected = selected.includes(o.id);
                const selIdx = selected.indexOf(o.id);
                return (
                  <div
                    key={o.id}
                    onMouseDown={(e) => { e.preventDefault(); handleToggle(o.id); }}
                    className={cn(
                      'flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors',
                      isSelected ? 'bg-primary/5' : 'hover:bg-slate-50',
                    )}
                  >
                    {o.initial ? (
                      <div className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center font-black text-xs flex-shrink-0',
                        isSelected ? 'bg-primary text-white' : 'bg-primary/10 text-primary',
                      )}>
                        {o.initial}
                      </div>
                    ) : (
                      <Building2 className={cn('w-4 h-4 flex-shrink-0', isSelected ? 'text-primary' : 'text-slate-400')} />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-sm font-bold truncate', isSelected ? 'text-primary' : 'text-slate-900')}>
                        {o.label}
                      </p>
                      {o.sublabel && (
                        <p className="text-[10px] text-slate-400 font-medium truncate">{o.sublabel}</p>
                      )}
                    </div>
                    {multi && isSelected && selIdx === 0 && (
                      <Badge className="bg-primary/10 text-primary border border-primary/20 text-[9px] font-black uppercase gap-1 flex-shrink-0">
                        <Star className="w-2.5 h-2.5" /> Primary
                      </Badge>
                    )}
                    {isSelected && (
                      <Check className="w-4 h-4 text-primary flex-shrink-0" />
                    )}
                  </div>
                );
              })
            )}
          </div>
          {multi && selected.length > 0 && (
            <div className="px-4 py-2 bg-slate-50 border-t border-slate-100">
              <p className="text-[10px] font-bold text-slate-400">
                {selected.length} selected — first selection marked as primary
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── portal-based pickers (used OUTSIDE dialogs — Saturday config, accordion) ─

function OfficerPicker({
  officers, selected, onChange, placeholder = 'Select officer…', exclude = [],
}: {
  officers: any[]; selected: string[]; onChange: (ids: string[]) => void;
  placeholder?: string; exclude?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const eligible = officers.filter(
    (o) => !exclude.includes(o.id) && formatName(o).toLowerCase().includes(q.toLowerCase()),
  );
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center justify-between h-11 px-3 rounded-xl border border-slate-200 bg-white font-bold text-sm hover:bg-slate-50 transition-colors"
      >
        <span className="truncate text-left">
          {selected.length === 0 ? <span className="text-muted-foreground">{placeholder}</span>
            : selected.length === 1 ? formatName(officers.find((o) => o.id === selected[0]) || {})
            : `${selected.length} officers selected`}
        </span>
        <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50 flex-shrink-0" />
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
          <div className="flex items-center border-b px-3 py-2">
            <Input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)}
              className="h-8 border-none focus-visible:ring-0 p-0 text-sm font-bold bg-transparent" autoFocus />
          </div>
          <div className="max-h-52 overflow-y-auto p-1">
            {eligible.length === 0 && (
              <p className="py-6 text-center text-xs font-bold text-muted-foreground">No officers found</p>
            )}
            {eligible.map((o) => (
              <div
                key={o.id}
                onMouseDown={(e) => { e.preventDefault(); toggle(o.id); }}
                className={cn(
                  'flex cursor-pointer select-none items-center rounded-lg px-3 py-2.5 text-sm font-bold hover:bg-slate-100 transition-colors',
                  selected.includes(o.id) && 'bg-primary/10 text-primary',
                )}
              >
                <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center font-black text-xs mr-3">
                  {o.firstName.charAt(0)}
                </div>
                <span className="flex-1 truncate">{formatName(o)}</span>
                {selected.includes(o.id) && <Check className="ml-auto h-4 w-4" />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SingleOfficerPicker({
  officers, value, onChange, placeholder = 'Select officer…', exclude = [],
}: {
  officers: any[]; value: string; onChange: (id: string) => void;
  placeholder?: string; exclude?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const eligible = officers.filter(
    (o) => !exclude.includes(o.id) && formatName(o).toLowerCase().includes(q.toLowerCase()),
  );
  const selected = officers.find((o) => o.id === value);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center justify-between h-11 px-3 rounded-xl border border-slate-200 bg-white font-bold text-sm hover:bg-slate-50 transition-colors"
      >
        <span className="truncate text-left">
          {selected ? formatName(selected) : <span className="text-muted-foreground">{placeholder}</span>}
        </span>
        <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50 flex-shrink-0" />
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
          <div className="flex items-center border-b px-3 py-2">
            <Input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)}
              className="h-8 border-none focus-visible:ring-0 p-0 text-sm font-bold bg-transparent" autoFocus />
          </div>
          <div className="max-h-52 overflow-y-auto p-1">
            {eligible.length === 0 && (
              <p className="py-6 text-center text-xs font-bold text-muted-foreground">No officers found</p>
            )}
            {eligible.map((o) => (
              <div
                key={o.id}
                onMouseDown={(e) => { e.preventDefault(); onChange(o.id); setOpen(false); setQ(''); }}
                className={cn(
                  'flex cursor-pointer select-none items-center rounded-lg px-3 py-2.5 text-sm font-bold hover:bg-slate-100 transition-colors',
                  value === o.id && 'bg-primary/10 text-primary',
                )}
              >
                <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center font-black text-xs mr-3">
                  {o.firstName.charAt(0)}
                </div>
                <span className="flex-1 truncate">{formatName(o)}</span>
                {value === o.id && <Check className="ml-auto h-4 w-4" />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── officer accordion row ────────────────────────────────────────────────────

function OfficerAccordionRow({
  officerEntry, canManage,
  onAddBranch, onToggleMappings, onToggleSaturday,
  onEdit, onToggleActive, onManageOfficers, onDelete, onMassReassign,
}: {
  officerEntry: { officer: any; mappings: any[] };
  canManage: boolean;
  onAddBranch: (officerId: string) => void;
  onToggleMappings: (officer: any, mappings: any[], activate: boolean) => void;
  onToggleSaturday: (userId: string, enabled: boolean) => void;
  onEdit: (m: any) => void;
  onToggleActive: (m: any) => void;
  onManageOfficers: (m: any) => void;
  onDelete: (m: any) => void;
  onMassReassign: (officer: any) => void;
}) {
  const [open, setOpen] = useState(false);
  const { officer, mappings } = officerEntry;
  const activeMappings = mappings.filter((m) => m.active);
  const allActive = activeMappings.length === mappings.length;
  const noneActive = activeMappings.length === 0;
  const satOn = officer.saturdayAllBranches;

  return (
    <div className="border-b border-slate-100 last:border-0">
      <div
        className="flex items-center gap-3 px-6 py-4 hover:bg-slate-50/70 cursor-pointer transition-colors select-none"
        onClick={() => setOpen((p) => !p)}
      >
        <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-black text-sm flex-shrink-0">
          {officer.firstName.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-black text-sm text-slate-900">{formatName(officer)}</p>
          <p className="text-[10px] font-bold text-slate-400 uppercase truncate">{officer.email}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Badge variant="secondary" className="bg-slate-100 text-slate-600 font-black text-[9px] uppercase">
            {mappings.length} branch{mappings.length !== 1 ? 'es' : ''}
          </Badge>
          {satOn && (
            <Badge className="bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-black uppercase gap-1">
              <Sun className="w-2.5 h-2.5" /> Sat
            </Badge>
          )}
          {noneActive ? (
            <Badge className="bg-slate-100 text-slate-500 border border-slate-200 text-[9px] font-black uppercase">Inactive</Badge>
          ) : allActive ? (
            <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-black uppercase">All Active</Badge>
          ) : (
            <Badge className="bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-black uppercase">{activeMappings.length}/{mappings.length} Active</Badge>
          )}
          {open ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
        </div>
      </div>

      {open && (
        <div className="bg-slate-50/50 border-t border-slate-100 px-6 py-4 space-y-4">
          {canManage && (
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-4 py-2.5">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">All Mappings</span>
                <Switch
                  checked={allActive}
                  onCheckedChange={(checked) => onToggleMappings(officer, mappings, checked)}
                  className="data-[state=checked]:bg-emerald-500"
                />
                <span className={cn('text-xs font-bold', allActive ? 'text-emerald-600' : 'text-slate-400')}>
                  {allActive ? 'Active' : noneActive ? 'Inactive' : 'Partial'}
                </span>
              </div>
              <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-4 py-2.5">
                <Sun className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Saturday All-Branch</span>
                <Switch
                  checked={satOn}
                  onCheckedChange={(checked) => onToggleSaturday(officer.id, checked)}
                  className="data-[state=checked]:bg-amber-500"
                />
                <span className={cn('text-xs font-bold', satOn ? 'text-amber-600' : 'text-slate-400')}>
                  {satOn ? 'On' : 'Off'}
                </span>
              </div>
              <Button
                variant="outline" size="sm"
                onClick={() => onAddBranch(officer.id)}
                className="h-9 px-4 rounded-xl font-black border-primary/30 text-primary hover:bg-primary/5 gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" /> Add Branch
              </Button>
              <Button
                variant="outline" size="sm"
                onClick={() => onMassReassign(officer)}
                className="h-9 px-4 rounded-xl font-black border-amber-500/30 text-amber-600 hover:bg-amber-50 gap-1.5"
              >
                <ArrowRightLeft className="w-3.5 h-3.5" /> Change Officer
              </Button>
            </div>
          )}

          <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
            {mappings.length === 0 ? (
              <p className="py-6 text-center text-xs font-bold text-muted-foreground">No branch mappings</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-400">Branch</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-400">District</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-400">Type</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-400">Role</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-400">Status</th>
                    {canManage && <th className="px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {mappings.map((m) => {
                    const role = m.officers.find((o: any) => o.id === officer.id);
                    return (
                      <tr key={m.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                        <td className="px-4 py-3 font-bold text-slate-900">{m.branchName}</td>
                        <td className="px-4 py-3 text-slate-500 font-medium text-xs">{m.districtName || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full border text-[9px] font-black uppercase', TYPE_COLORS[m.type])}>
                            {m.type}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {role?.isPrimary ? (
                            <Badge className="bg-blue-50 text-blue-700 border border-blue-200 text-[9px] font-black uppercase">Primary</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[9px] font-black uppercase">Additional</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full border text-[9px] font-black uppercase', STATUS_COLORS[String(m.active)])}>
                            {m.active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        {canManage && (
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={(e) => { e.stopPropagation(); onEdit(m); }}
                                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                                title="Edit mapping"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); onManageOfficers(m); }}
                                className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors"
                                title="Manage officers"
                              >
                                <Users className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); onToggleActive(m); }}
                                className={cn('p-1.5 rounded-lg transition-colors', m.active ? 'hover:bg-amber-50 text-slate-400 hover:text-amber-600' : 'hover:bg-emerald-50 text-slate-400 hover:text-emerald-600')}
                                title={m.active ? 'Deactivate' : 'Activate'}
                              >
                                {m.active ? <PowerOff className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); onDelete(m); }}
                                className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
                                title="Delete mapping"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── main page ───────────────────────────────────────────────────────────────

export default function BranchMappingPage() {
  const { toast } = useToast();
  const { hasPermission, loading: permLoading } = usePermissions();
  const canManage = hasPermission('MAP_USERS_TO_BRANCH');

  const [mappings, setMappings] = useState<any[]>([]);
  const [officers, setOfficers] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [officerSearchQ, setOfficerSearchQ] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [officersTarget, setOfficersTarget] = useState<any | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [massReassignTarget, setMassReassignTarget] = useState<any | null>(null);
  const [massReassignNewId, setMassReassignNewId] = useState('');
  const [massReassigning, setMassReassigning] = useState(false);

  // create form — officerIds[0] = primary, rest = additional
  const [createForm, setCreateForm] = useState({
    branchIds: [] as string[],
    type: 'PERMANENT' as 'PERMANENT' | 'TEMPORARY',
    officerIds: [] as string[],
    note: '',
  });
  const [creating, setCreating] = useState(false);

  const [editForm, setEditForm] = useState({ type: 'PERMANENT' as 'PERMANENT' | 'TEMPORARY', note: '' });
  const [saving, setSaving] = useState(false);

  // manage-officers dialog
  const [addOfficerIds, setAddOfficerIds] = useState<string[]>([]);
  const [newPrimaryId, setNewPrimaryId] = useState('');
  const [officersBusy, setOfficersBusy] = useState(false);

  // saturday
  const [saturdayPickerId, setSaturdayPickerId] = useState('');
  const [saturdayBusy, setSaturdayBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, u, b] = await Promise.all([getBranchMappings(), getAllUsers(), getBranches()]);
      setMappings(m || []);
      const kyc = (u || []).filter(isKycEligible);
      setOfficers(kyc);
      setAllUsers(u || []);
      setBranches(b || []);
    } catch {
      toast({ variant: 'destructive', title: 'Sync failed' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  // ── derived ──
  const stats = useMemo(() => ({
    total: mappings.length,
    active: mappings.filter((m) => m.active).length,
    inactive: mappings.filter((m) => !m.active).length,
    permanent: mappings.filter((m) => m.type === 'PERMANENT').length,
    temporary: mappings.filter((m) => m.type === 'TEMPORARY').length,
  }), [mappings]);

  const officerEntries = useMemo(() => {
    const map = new Map<string, { officer: any; mappings: any[] }>();
    for (const m of mappings) {
      for (const o of m.officers) {
        if (!map.has(o.id)) {
          const full = allUsers.find((u: any) => u.id === o.id) || {
            id: o.id, firstName: o.name.split(' ')[0], lastName: o.name.split(' ').slice(1).join(' '),
            email: o.email, saturdayAllBranches: false,
          };
          map.set(o.id, { officer: full, mappings: [] });
        }
        map.get(o.id)!.mappings.push(m);
      }
    }
    const q = officerSearchQ.toLowerCase();
    return Array.from(map.values())
      .filter((e) => !q || formatName(e.officer).toLowerCase().includes(q) || e.officer.email?.toLowerCase().includes(q))
      .sort((a, b) => formatName(a.officer).localeCompare(formatName(b.officer)));
  }, [mappings, allUsers, officerSearchQ]);

  const saturdayEnabledOfficers = useMemo(() =>
    officers.filter((o: any) => (allUsers.find((u: any) => u.id === o.id) as any)?.saturdayAllBranches),
  [officers, allUsers]);

  // ── InlineSelect option lists ──
  const branchOptions: InlineSelectOption[] = useMemo(() =>
    branches.map((b) => ({ id: b.id, label: b.name, sublabel: b.district?.name })),
  [branches]);

  const officerOptions: InlineSelectOption[] = useMemo(() =>
    officers.map((o) => ({
      id: o.id,
      label: formatName(o),
      sublabel: o.email,
      initial: o.firstName.charAt(0).toUpperCase(),
    })),
  [officers]);

  // ── handlers ──
  const resetCreate = () => setCreateForm({ branchIds: [], type: 'PERMANENT', officerIds: [], note: '' });

  const handleCreate = async () => {
    if (createForm.officerIds.length === 0 || createForm.branchIds.length === 0) {
      toast({ variant: 'destructive', title: 'Branch and at least one officer are required.' });
      return;
    }
    setCreating(true);
    try {
      const [primaryOfficerId, ...additionalOfficerIds] = createForm.officerIds;
      const res = await createMapping({
        branchIds: createForm.branchIds,
        type: createForm.type,
        primaryOfficerId,
        additionalOfficerIds,
        note: createForm.note || undefined,
      });
      toast({ title: `Created ${res.created.length} mapping(s)${res.skipped.length ? `, skipped ${res.skipped.length}` : ''}.` });
      setCreateOpen(false);
      resetCreate();
      await load();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Create failed', description: e.message });
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (m: any) => { setEditTarget(m); setEditForm({ type: m.type, note: m.note || '' }); };

  const handleEdit = async () => {
    if (!editTarget) return;
    setSaving(true);
    try {
      await updateMapping(editTarget.id, { type: editForm.type, note: editForm.note || null });
      toast({ title: 'Mapping updated.' });
      setEditTarget(null);
      await load();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Update failed', description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (m: any) => {
    try {
      await setMappingActive(m.id, !m.active);
      toast({ title: `Mapping ${m.active ? 'deactivated' : 'activated'}.` });
      await load();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Action failed', description: e.message });
    }
  };

  const handleToggleMappings = async (officer: any, officerMappings: any[], activate: boolean) => {
    try {
      await setMappingsActive(officerMappings.map((m) => m.id), activate);
      toast({ title: `All mappings for ${formatName(officer)} ${activate ? 'activated' : 'deactivated'}.` });
      await load();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Action failed', description: e.message });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMapping(deleteTarget.id);
      toast({ title: 'Mapping deleted.' });
      setDeleteTarget(null);
      await load();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Delete failed', description: e.message });
    }
  };

  const openOfficers = (m: any) => { setOfficersTarget(m); setAddOfficerIds([]); setNewPrimaryId(''); };

  const handleSetPrimary = async (officerId: string) => {
    if (!officersTarget) return;
    setOfficersBusy(true);
    try {
      await setPrimaryOfficer(officersTarget.id, officerId);
      toast({ title: 'Primary officer changed.' });
      const fresh = await getBranchMappings();
      setMappings(fresh);
      setOfficersTarget(fresh.find((m: any) => m.id === officersTarget.id) || null);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Action failed', description: e.message });
    } finally {
      setOfficersBusy(false);
    }
  };

  const handleAddOfficers = async () => {
    if (!officersTarget || addOfficerIds.length === 0) return;
    setOfficersBusy(true);
    try {
      await addOfficers(officersTarget.id, addOfficerIds);
      toast({ title: `${addOfficerIds.length} officer(s) added.` });
      setAddOfficerIds([]);
      const fresh = await getBranchMappings();
      setMappings(fresh);
      setOfficersTarget(fresh.find((m: any) => m.id === officersTarget.id) || null);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Action failed', description: e.message });
    } finally {
      setOfficersBusy(false);
    }
  };

  const handleRemoveOfficer = async (officerId: string) => {
    if (!officersTarget) return;
    setOfficersBusy(true);
    try {
      await removeOfficer(officersTarget.id, officerId);
      toast({ title: 'Officer removed.' });
      const fresh = await getBranchMappings();
      setMappings(fresh);
      setOfficersTarget(fresh.find((m: any) => m.id === officersTarget.id) || null);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Action failed', description: e.message });
    } finally {
      setOfficersBusy(false);
    }
  };

  const handleSaturdayToggle = async (userId: string, enabled: boolean) => {
    setSaturdayBusy(userId);
    try {
      await setSaturdayVisibility(userId, enabled);
      const officerName = formatName(allUsers.find((u: any) => u.id === userId) || {});
      toast({ title: `Saturday all-branch visibility ${enabled ? 'enabled' : 'disabled'} for ${officerName}.` });
      await load();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Action failed', description: e.message });
    } finally {
      setSaturdayBusy(null);
    }
  };

  const handleAddBranchForOfficer = (officerId: string) => {
    setCreateForm({ branchIds: [], type: 'PERMANENT', officerIds: [officerId], note: '' });
    setCreateOpen(true);
  };

  const handleMassReassign = async () => {
    if (!massReassignTarget || !massReassignNewId) return;
    setMassReassigning(true);
    try {
      const res = await reassignAllOfficerBranches(massReassignTarget.id, massReassignNewId);
      toast({ title: `Successfully reassigned ${res.count} branch mapping(s).` });
      setMassReassignTarget(null);
      setMassReassignNewId('');
      await load();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Reassignment failed', description: e.message });
    } finally {
      setMassReassigning(false);
    }
  };

  if (loading || permLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="font-bold text-muted-foreground uppercase tracking-widest text-[10px]">Loading mapping registry…</p>
      </div>
    );
  }

  const currentOfficerIds = officersTarget?.officers.map((o: any) => o.id) || [];
  const availableToAdd = officers.filter((o) => !currentOfficerIds.includes(o.id));

  return (
    <div className="space-y-8 animate-in fade-in duration-300 pb-20">
      {/* ── header ── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-primary text-white rounded-lg shadow-lg">
              <ArrowRightLeft className="w-6 h-6" />
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-headline">
              {SYSTEM_SECTION_COPY.MAP_USERS_TO_BRANCH.label}
            </h1>
          </div>
          <p className="text-muted-foreground text-lg font-medium">
            {SYSTEM_SECTION_COPY.MAP_USERS_TO_BRANCH.description}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {canManage && (
            <Button
              onClick={() => { resetCreate(); setCreateOpen(true); }}
              className="bg-primary text-white font-black h-12 px-8 rounded-xl shadow-xl gap-2"
            >
              <Plus className="w-4 h-4" /> Create Mapping
            </Button>
          )}
          {!canManage && (
            <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-xs font-bold">
              <Eye className="w-4 h-4" /> Read-only view
            </div>
          )}
        </div>
      </div>

      {/* ── stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        {[
          { label: 'Total', value: stats.total, color: 'text-slate-700' },
          { label: 'Active', value: stats.active, color: 'text-emerald-600' },
          { label: 'Inactive', value: stats.inactive, color: 'text-slate-400' },
          { label: 'Permanent', value: stats.permanent, color: 'text-blue-600' },
          { label: 'Temporary', value: stats.temporary, color: 'text-amber-600' },
        ].map((s) => (
          <Card key={s.label} className="border-slate-200 shadow-sm">
            <CardContent className="py-4 px-5">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{s.label}</p>
              <p className={cn('text-3xl font-extrabold mt-1', s.color)}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          OFFICER OVERVIEW (accordion)
      ══════════════════════════════════════════════════════════════════ */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" /> Officer Overview
            </h2>
            <p className="text-sm text-muted-foreground font-medium mt-0.5">
              All mapped KYC officers with their branch assignments
            </p>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search officer…"
              className="pl-10 h-10 rounded-xl font-medium bg-white text-sm"
              value={officerSearchQ}
              onChange={(e) => setOfficerSearchQ(e.target.value)}
            />
          </div>
        </div>
        <div className="border rounded-2xl bg-white shadow-xl overflow-hidden border-slate-200">
          {officerEntries.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-4">
              <div className="p-5 bg-slate-50 rounded-full border border-slate-100">
                <Users className="w-10 h-10 text-slate-200" />
              </div>
              <p className="font-bold text-slate-900">No officers found</p>
              <p className="text-sm text-muted-foreground">
                {officerSearchQ ? 'Try a different search term.' : 'Create mappings to see officers here.'}
              </p>
            </div>
          ) : (
            officerEntries.map((entry) => (
              <OfficerAccordionRow
                key={entry.officer.id}
                officerEntry={entry}
                canManage={canManage}
                onAddBranch={handleAddBranchForOfficer}
                onToggleMappings={handleToggleMappings}
                onToggleSaturday={handleSaturdayToggle}
                onEdit={openEdit}
                onToggleActive={handleToggleActive}
                onManageOfficers={openOfficers}
                onDelete={setDeleteTarget}
                onMassReassign={setMassReassignTarget}
              />
            ))
          )}
          <div className="px-6 py-3 bg-slate-50/50 border-t">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              {officerEntries.length} officer{officerEntries.length !== 1 ? 's' : ''} with mappings
            </p>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          SATURDAY CONFIGURATION
      ══════════════════════════════════════════════════════════════════ */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <CalendarDays className="w-5 h-5 text-amber-500" />
          <h2 className="text-xl font-black text-slate-900 tracking-tight">Saturday Configuration</h2>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {canManage && (
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-black text-slate-700 flex items-center gap-2">
                  <Sun className="w-4 h-4 text-amber-500" />
                  Grant All-Branch Access on Saturdays
                </CardTitle>
                <p className="text-xs text-muted-foreground font-medium">
                  Selected officer will see cases from all branches every Saturday, independent of their normal mappings.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <SingleOfficerPicker
                  officers={officers}
                  value={saturdayPickerId}
                  onChange={setSaturdayPickerId}
                  placeholder="Select KYC officer…"
                />
                {saturdayPickerId && (
                  <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                    <div>
                      <p className="text-sm font-black text-amber-900">
                        {formatName(officers.find((o) => o.id === saturdayPickerId) || {})}
                      </p>
                      <p className="text-[10px] font-bold text-amber-600 uppercase mt-0.5">
                        Saturday visibility: {(allUsers.find((u: any) => u.id === saturdayPickerId) as any)?.saturdayAllBranches ? 'Enabled' : 'Disabled'}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={saturdayBusy === saturdayPickerId}
                        onClick={() => handleSaturdayToggle(saturdayPickerId, true)}
                        className={cn('h-8 px-4 rounded-lg font-black text-xs',
                          (allUsers.find((u: any) => u.id === saturdayPickerId) as any)?.saturdayAllBranches
                            ? 'bg-amber-500 text-white'
                            : 'bg-white border border-amber-300 text-amber-700 hover:bg-amber-50',
                        )}
                      >
                        {saturdayBusy === saturdayPickerId ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Enable'}
                      </Button>
                      <Button
                        size="sm" variant="outline"
                        disabled={saturdayBusy === saturdayPickerId}
                        onClick={() => handleSaturdayToggle(saturdayPickerId, false)}
                        className="h-8 px-4 rounded-lg font-black text-xs border-slate-200 text-slate-600 hover:bg-slate-50"
                      >
                        Disable
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-black text-slate-700 flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-amber-500" />
                Officers with Saturday Access
                {saturdayEnabledOfficers.length > 0 && (
                  <Badge className="bg-amber-100 text-amber-700 border border-amber-200 font-black text-[9px] ml-1">
                    {saturdayEnabledOfficers.length}
                  </Badge>
                )}
              </CardTitle>
              <p className="text-xs text-muted-foreground font-medium">
                These officers can see all branch cases every Saturday.
              </p>
            </CardHeader>
            <CardContent>
              {saturdayEnabledOfficers.length === 0 ? (
                <div className="py-6 text-center">
                  <Sun className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                  <p className="text-xs font-bold text-muted-foreground">No Saturday configuration active</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {saturdayEnabledOfficers.map((o: any) => (
                    <div key={o.id} className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-100 rounded-xl">
                      <div className="w-8 h-8 rounded-full bg-amber-200 text-amber-800 flex items-center justify-center font-black text-sm flex-shrink-0">
                        {o.firstName.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-black text-sm text-amber-900 truncate">{formatName(o)}</p>
                        <p className="text-[10px] font-bold text-amber-600 truncate">{o.email}</p>
                      </div>
                      {canManage && (
                        <Button
                          variant="ghost" size="sm"
                          disabled={saturdayBusy === o.id}
                          onClick={() => handleSaturdayToggle(o.id, false)}
                          className="h-7 w-7 rounded-full p-0 text-amber-500 hover:bg-amber-100 flex-shrink-0"
                          title="Disable Saturday access"
                        >
                          {saturdayBusy === o.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <PowerOff className="w-3 h-3" />}
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          CREATE MAPPING DIALOG
      ══════════════════════════════════════════════════════════════════ */}
      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) resetCreate(); }}>
        <DialogContent className="max-w-lg rounded-3xl p-0 border-none shadow-2xl overflow-visible">
          <DialogHeader className="p-8 pb-6 bg-primary text-white rounded-t-3xl">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/20 rounded-2xl"><Plus className="w-6 h-6 text-white" /></div>
              <div>
                <DialogTitle className="text-2xl font-black tracking-tight">Create Mapping</DialogTitle>
                <DialogDescription className="text-white/70 text-[10px] font-bold uppercase tracking-widest mt-1">
                  {createForm.officerIds.length > 0
                    ? `Officer: ${formatName(officers.find((o) => o.id === createForm.officerIds[0]) || {})}`
                    : 'Assign KYC officers to one or more branches'}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="p-8 space-y-6 overflow-y-auto max-h-[60vh]">
            {/* Branch multi-select */}
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                Target Branch(es) <span className="text-destructive">*</span>
              </Label>
              <InlineSelect
                options={branchOptions}
                selected={createForm.branchIds}
                onToggle={(id) => setCreateForm((p) => ({
                  ...p,
                  branchIds: p.branchIds.includes(id) ? p.branchIds.filter((x) => x !== id) : [...p.branchIds, id],
                }))}
                placeholder="Search and select branch(es)…"
                multi
              />
              {createForm.branchIds.length > 0 && (
                <p className="text-[10px] text-slate-400 font-medium">
                  {createForm.branchIds.length} branch{createForm.branchIds.length !== 1 ? 'es' : ''} selected
                </p>
              )}
            </div>

            {/* Mapping type */}
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Mapping Type</Label>
              <Select value={createForm.type} onValueChange={(v: any) => setCreateForm((p) => ({ ...p, type: v }))}>
                <SelectTrigger className="h-11 rounded-xl font-bold"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PERMANENT">Permanent — long-term branch assignment</SelectItem>
                  <SelectItem value="TEMPORARY">Temporary — leave cover / workload balancing</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Officer multi-select */}
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                KYC Officers <span className="text-destructive">*</span>
              </Label>
              <InlineSelect
                options={officerOptions}
                selected={createForm.officerIds}
                onToggle={(id) => setCreateForm((p) => ({
                  ...p,
                  officerIds: p.officerIds.includes(id) ? p.officerIds.filter((x) => x !== id) : [...p.officerIds, id],
                }))}
                placeholder="Search and select officer(s)…"
                multi
              />
              <p className="text-[10px] text-slate-400 font-medium">
                First selected officer becomes the primary (assigned) officer
              </p>
            </div>

            {/* Note */}
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Coverage Note (optional)</Label>
              <Textarea
                placeholder={createForm.type === 'TEMPORARY' ? 'e.g. Leave coverage for Officer A' : 'Optional note…'}
                value={createForm.note}
                onChange={(e) => setCreateForm((p) => ({ ...p, note: e.target.value }))}
                className="rounded-xl font-medium min-h-[72px]"
              />
            </div>
          </div>

          <DialogFooter className="p-8 pt-6 bg-slate-50 border-t rounded-b-3xl flex gap-4 items-center justify-end">
            <button onClick={() => setCreateOpen(false)} className="text-sm font-bold text-slate-400 hover:text-slate-700 transition-colors">Cancel</button>
            <Button onClick={handleCreate} disabled={creating} className="bg-primary text-white font-black rounded-xl px-10 h-12 shadow-xl">
              {creating && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════════════
          EDIT MAPPING DIALOG
      ══════════════════════════════════════════════════════════════════ */}
      <Dialog open={!!editTarget} onOpenChange={(o) => { if (!o) setEditTarget(null); }}>
        <DialogContent className="max-w-md rounded-3xl p-0 overflow-hidden border-none shadow-2xl">
          <DialogHeader className="p-8 bg-primary text-white">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/20 rounded-2xl"><Edit3 className="w-6 h-6 text-white" /></div>
              <div>
                <DialogTitle className="text-2xl font-black tracking-tight">Edit Mapping</DialogTitle>
                <DialogDescription className="text-white/70 text-[10px] font-bold uppercase tracking-widest mt-1">
                  {editTarget?.branchName}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="p-8 space-y-5">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Mapping Type</Label>
              <Select value={editForm.type} onValueChange={(v: any) => setEditForm((p) => ({ ...p, type: v }))}>
                <SelectTrigger className="h-11 rounded-xl font-bold"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PERMANENT">Permanent</SelectItem>
                  <SelectItem value="TEMPORARY">Temporary</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Coverage Note</Label>
              <Textarea
                placeholder="Optional note…"
                value={editForm.note}
                onChange={(e) => setEditForm((p) => ({ ...p, note: e.target.value }))}
                className="rounded-xl font-medium min-h-[80px]"
              />
            </div>
          </div>
          <DialogFooter className="p-8 bg-slate-50 border-t flex gap-4 items-center justify-end">
            <button onClick={() => setEditTarget(null)} className="text-sm font-bold text-slate-400 hover:text-slate-700 transition-colors">Cancel</button>
            <Button onClick={handleEdit} disabled={saving} className="bg-primary text-white font-black rounded-xl px-10 h-12 shadow-xl">
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════════════
          MANAGE OFFICERS DIALOG
      ══════════════════════════════════════════════════════════════════ */}
      <Dialog open={!!officersTarget} onOpenChange={(o) => { if (!o) setOfficersTarget(null); }}>
        <DialogContent className="max-w-lg rounded-3xl p-0 overflow-hidden border-none shadow-2xl">
          <DialogHeader className="p-8 bg-primary text-white">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/20 rounded-2xl"><Users className="w-6 h-6 text-white" /></div>
              <div>
                <DialogTitle className="text-2xl font-black tracking-tight">Manage Officers</DialogTitle>
                <DialogDescription className="text-white/70 text-[10px] font-bold uppercase tracking-widest mt-1">
                  {officersTarget?.branchName}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="p-8 space-y-6">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Current Officers</Label>
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden">
                {(officersTarget?.officers || []).length === 0 && (
                  <p className="py-6 text-center text-xs font-bold text-muted-foreground">No officers in this mapping</p>
                )}
                {(officersTarget?.officers || []).map((o: any) => (
                  <div key={o.id} className="flex items-center gap-3 p-4 bg-white hover:bg-slate-50 transition-colors">
                    <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-black text-sm">
                      {o.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-sm text-slate-900 truncate">{o.name}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase truncate">{o.email}</p>
                    </div>
                    {o.isPrimary && (
                      <Badge className="bg-blue-50 text-blue-700 border border-blue-200 text-[9px] font-black uppercase">Primary</Badge>
                    )}
                    <div className="flex items-center gap-1">
                      {!o.isPrimary && (
                        <Button variant="ghost" size="sm" title="Make primary officer"
                          disabled={officersBusy} onClick={() => handleSetPrimary(o.id)}
                          className="h-8 w-8 rounded-full text-amber-500 hover:bg-amber-50 p-0">
                          <Star className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {!o.isPrimary && (
                        <Button variant="ghost" size="sm" title="Remove officer"
                          disabled={officersBusy} onClick={() => handleRemoveOfficer(o.id)}
                          className="h-8 w-8 rounded-full text-destructive hover:bg-red-50 p-0">
                          <UserMinus className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Change Assigned (Primary) Officer</Label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <SingleOfficerPicker officers={officers} value={newPrimaryId} onChange={setNewPrimaryId}
                    placeholder="Select new primary officer…" />
                </div>
                <Button variant="outline" disabled={!newPrimaryId || officersBusy}
                  onClick={() => { handleSetPrimary(newPrimaryId); setNewPrimaryId(''); }}
                  className="h-11 font-black rounded-xl border-primary/30 text-primary">
                  {officersBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <StarOff className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Add Additional Officers</Label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <OfficerPicker officers={availableToAdd} selected={addOfficerIds} onChange={setAddOfficerIds}
                    placeholder="Select officers to add…" exclude={currentOfficerIds} />
                </div>
                <Button variant="outline" disabled={addOfficerIds.length === 0 || officersBusy}
                  onClick={handleAddOfficers}
                  className="h-11 font-black rounded-xl border-primary/30 text-primary">
                  {officersBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter className="p-6 bg-slate-50 border-t">
            <Button onClick={() => setOfficersTarget(null)} variant="outline" className="font-bold rounded-xl">Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════════════
          DELETE CONFIRMATION
      ══════════════════════════════════════════════════════════════════ */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent className="max-w-[440px] rounded-xl p-0 overflow-hidden border-none shadow-2xl bg-[#FCFAF7]">
          <div className="p-8 space-y-6">
            <AlertDialogHeader className="space-y-3">
              <AlertDialogTitle className="text-[26px] font-black text-slate-900 leading-tight">Delete mapping?</AlertDialogTitle>
              <AlertDialogDescription className="text-base text-slate-600 leading-relaxed font-medium">
                This will permanently remove the mapping for{' '}
                <span className="font-bold text-slate-900">{deleteTarget?.branchName}</span> and unlink all assigned officers. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex flex-row items-center justify-end gap-3 pt-2">
              <AlertDialogCancel asChild>
                <Button variant="ghost" className="h-12 px-8 font-bold text-slate-500 hover:bg-black/5 rounded-lg">Cancel</Button>
              </AlertDialogCancel>
              <AlertDialogAction asChild>
                <Button onClick={(e) => { e.preventDefault(); handleDelete(); }}
                  className="h-12 px-8 bg-destructive hover:bg-destructive/90 text-white font-black rounded-lg shadow-xl">
                  Delete
                </Button>
              </AlertDialogAction>
            </AlertDialogFooter>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* ══════════════════════════════════════════════════════════════════
          MASS REASSIGN DIALOG
      ══════════════════════════════════════════════════════════════════ */}
      <Dialog open={!!massReassignTarget} onOpenChange={(o) => { if (!o) { setMassReassignTarget(null); setMassReassignNewId(''); } }}>
        <DialogContent className="max-w-md rounded-3xl p-0 overflow-hidden border-none shadow-2xl">
          <DialogHeader className="p-8 bg-amber-500 text-white">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/20 rounded-2xl"><ArrowRightLeft className="w-6 h-6 text-white" /></div>
              <div>
                <DialogTitle className="text-2xl font-black tracking-tight">Change Officer</DialogTitle>
                <DialogDescription className="text-white/80 text-[10px] font-bold uppercase tracking-widest mt-1">
                  Reassign all branches from {massReassignTarget ? formatName(massReassignTarget) : ''}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="p-8 space-y-6">
            <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl space-y-2">
              <p className="text-sm font-medium text-amber-900 leading-relaxed">
                This will transfer <span className="font-black text-amber-600">ALL</span> branch mappings currently assigned to this officer to a new officer of your choice.
              </p>
            </div>
            
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Target Officer</Label>
              <SingleOfficerPicker
                officers={officers.filter(o => o.id !== massReassignTarget?.id)}
                value={massReassignNewId}
                onChange={setMassReassignNewId}
                placeholder="Select replacement officer…"
              />
            </div>
          </div>
          <DialogFooter className="p-8 bg-slate-50 border-t flex gap-4 items-center justify-end">
            <button onClick={() => { setMassReassignTarget(null); setMassReassignNewId(''); }} className="text-sm font-bold text-slate-400 hover:text-slate-700 transition-colors">Cancel</button>
            <Button 
              onClick={handleMassReassign} 
              disabled={massReassigning || !massReassignNewId} 
              className="bg-amber-500 hover:bg-amber-600 text-white font-black rounded-xl px-10 h-12 shadow-xl"
            >
              {massReassigning && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Confirm Transfer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
