
"use client"

import * as React from "react"
import {
  LayoutDashboard,
  FileText,
  Users,
  Building2,
  ShieldCheck,
  LogOut,
  Settings,
  PlusCircle,
  Inbox,
  AlertCircle,
  BarChart3,
  History,
  Map,
  ChevronDown,
  ShieldAlert,
  Search,
  FileBarChart,
  Globe,
  UserCircle,
  Archive,
  ArrowRightLeft,
  UserCog,
  Zap,
  LayoutList,
  BookOpen,
  ClipboardList,
  Folders
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarMenuBadge
} from "@/components/ui/sidebar"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAuth } from "@/lib/auth-mock"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSidebarCounts } from "@/hooks/use-sidebar-counts"
import { usePermissions } from "@/hooks/use-permissions"

export function AppSidebar() {
  const pathname = usePathname()
  const { user, loginAs, logout, allUsers } = useAuth()
  const counts = useSidebarCounts(user)
  const { permissions, loading: permLoading } = usePermissions(user)

  if (!user) return null;

  // Resolved Permissions
  const {
    canSubmit,
    canReview,
    canEscalate,
    canViewReports,
    canManageUsers,
    canManageSystem
  } = permissions;

  // Specific visibility checks for specialized operational nodes
  const isBranchMgr = user.role === 'Branch Manager' || user.role === 'Admin'
  const isDistDir = user.role === 'District Director' || user.role === 'Admin'
  const isAdmin = user.role === 'Admin'
  const isFollowUp = user.role === 'Follow-up Team' || user.role === 'Admin'

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b h-16 flex items-center px-4">
        <div className="flex items-center gap-3 font-bold">
          <div className="bg-primary p-1.5 rounded-lg shadow-sm shrink-0 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <span className="group-data-[collapsible=icon]:hidden truncate text-slate-900 font-headline tracking-tight text-lg">Nib Bank KYC</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {/* DASHBOARD */}
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname === '/'} tooltip="Dashboard">
                <Link href="/">
                  <LayoutDashboard />
                  <span>Dashboard</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        {/* WORKFLOWS */}
        {(canSubmit || canReview || canEscalate) && (
          <SidebarGroup>
            <SidebarGroupLabel>Workflows</SidebarGroupLabel>
            <SidebarMenu>
              <Collapsible className="group/collapsible" defaultOpen={true}>
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton tooltip="Identity Verification">
                      <FileText />
                      <span>Identity Verification</span>
                      <ChevronDown className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-180" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {canSubmit && (
                        <>
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={pathname === '/submissions/new'}>
                              <Link href="/submissions/new">
                                <PlusCircle className="w-4 h-4 mr-2" />
                                <span>Create Submission</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                          <SidebarMenuSubItem className="relative">
                            <SidebarMenuSubButton asChild isActive={pathname === '/submissions/my'}>
                              <Link href="/submissions/my">
                                <Inbox className="w-4 h-4 mr-2" />
                                <span>My Submissions</span>
                              </Link>
                            </SidebarMenuSubButton>
                            {counts.mySubmissions > 0 && (
                              <SidebarMenuBadge className="bg-slate-100 text-slate-600 font-bold">
                                {counts.mySubmissions}
                              </SidebarMenuBadge>
                            )}
                          </SidebarMenuSubItem>
                          <SidebarMenuSubItem className="relative">
                            <SidebarMenuSubButton asChild isActive={pathname === '/submissions/amendment-requests'}>
                              <Link href="/submissions/amendment-requests">
                                <AlertCircle className="w-4 h-4 mr-2 text-orange-600" />
                                <span>Action Required</span>
                              </Link>
                            </SidebarMenuSubButton>
                            {counts.actionRequired > 0 && (
                              <SidebarMenuBadge className="bg-orange-50 text-white font-bold animate-pulse">
                                {counts.actionRequired}
                              </SidebarMenuBadge>
                            )}
                          </SidebarMenuSubItem>
                        </>
                      )}

                      {isBranchMgr && (
                        <SidebarMenuSubItem className="relative">
                          <SidebarMenuSubButton asChild isActive={pathname === '/submissions/branch-node'}>
                            <Link href="/submissions/branch-node">
                              <LayoutList className="w-4 h-4 mr-2 text-[#B89334]" />
                              <span>Local Node Oversight</span>
                            </Link>
                          </SidebarMenuSubButton>
                          {counts.branchNode > 0 && (
                            <SidebarMenuBadge className="bg-primary/10 text-primary font-bold">
                              {counts.branchNode}
                            </SidebarMenuBadge>
                          )}
                        </SidebarMenuSubItem>
                      )}

                      {canReview && (
                        <>
                          <SidebarMenuSubItem className="relative">
                            <SidebarMenuSubButton asChild isActive={pathname === '/submissions/queue'}>
                              <Link href="/submissions/queue">
                                <Search className="w-4 h-4 mr-2" />
                                <span>Review Queue</span>
                              </Link>
                            </SidebarMenuSubButton>
                            {counts.reviewQueue > 0 && (
                              <SidebarMenuBadge className="bg-primary text-white font-bold">
                                {counts.reviewQueue}
                              </SidebarMenuBadge>
                            )}
                          </SidebarMenuSubItem>
                          <SidebarMenuSubItem className="relative">
                            <SidebarMenuSubButton asChild isActive={pathname === '/submissions/amendments'}>
                              <Link href="/submissions/amendments">
                                <History className="w-4 h-4 mr-2" />
                                <span>Resubmitted Cases</span>
                              </Link>
                            </SidebarMenuSubButton>
                            {counts.resubmitted > 0 && (
                              <SidebarMenuBadge className="bg-blue-600 text-white font-bold">
                                {counts.resubmitted}
                              </SidebarMenuBadge>
                            )}
                          </SidebarMenuSubItem>
                        </>
                      )}

                      {(canEscalate) && (
                        <SidebarMenuSubItem className="relative">
                          <SidebarMenuSubButton asChild isActive={pathname === '/submissions/escalated'}>
                            <Link href="/submissions/escalated">
                              <ShieldAlert className="w-4 h-4 mr-2 text-destructive" />
                              <span>Escalated Cases</span>
                            </Link>
                          </SidebarMenuSubButton>
                          {counts.escalated > 0 && (
                            <SidebarMenuBadge className="bg-destructive text-white font-bold">
                              {counts.escalated}
                            </SidebarMenuBadge>
                          )}
                        </SidebarMenuSubItem>
                      )}

                      <SidebarMenuSubItem className="relative">
                        <SidebarMenuSubButton asChild isActive={pathname === '/submissions/exceptional'}>
                          <Link href="/submissions/exceptional">
                            <Zap className="w-4 h-4 mr-2 text-yellow-600" />
                            <span>Exceptional Cases</span>
                          </Link>
                        </SidebarMenuSubButton>
                        {counts.exceptional > 0 && (
                          <SidebarMenuBadge className="bg-yellow-600 text-white font-bold">
                            {counts.exceptional}
                          </SidebarMenuBadge>
                        )}
                      </SidebarMenuSubItem>

                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild isActive={pathname === '/submissions'}>
                          <Link href="/submissions">
                            <Archive className="w-4 h-4 mr-2" />
                            <span>Master Case Archive</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
            </SidebarMenu>
          </SidebarGroup>
        )}

        {/* KNOWLEDGE BASE */}
        <SidebarGroup>
          <SidebarGroupLabel>Reference</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname === '/kyc-fq-reference'} tooltip="KYC F&amp;Q Reference">
                <Link href="/kyc-fq-reference">
                  <BookOpen />
                  <span>KYC F&amp;Q Reference</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        {/* OVERSIGHT */}
        {canViewReports && (
          <SidebarGroup>
            <SidebarGroupLabel>Management</SidebarGroupLabel>
            <SidebarMenu>
              <Collapsible className="group/collapsible" defaultOpen={false}>
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton tooltip="Oversight">
                      <BarChart3 />
                      <span>Performance & Oversight</span>
                      <ChevronDown className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-180" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {isDistDir && (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={pathname === '/performance/district'}>
                            <Link href="/performance/district">
                              <Map className="w-4 h-4 mr-2" />
                              <span>District Metrics</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      )}
                      {isBranchMgr && (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={pathname === '/performance/branch'}>
                            <Link href="/performance/branch">
                              <Building2 className="w-4 h-4 mr-2" />
                              <span>Branch Metrics</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      )}
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild isActive={pathname === '/performance/officer'}>
                          <Link href="/performance/officer">
                            <Users className="w-4 h-4 mr-2" />
                            <span>Officer Productivity</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
            </SidebarMenu>
          </SidebarGroup>
        )}

        {/* COMPLIANCE REPORTS */}
        {canViewReports && (
          <SidebarGroup>
            <SidebarGroupLabel>Audit & Reporting</SidebarGroupLabel>
            <SidebarMenu>
              <Collapsible className="group/collapsible" defaultOpen={false}>
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton tooltip="Reports">
                      <FileBarChart />
                      <span>Compliance Reports</span>
                      <ChevronDown className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-180" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {isAdmin && (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={pathname === '/reports/system'}>
                            <Link href="/reports/system">
                              <Globe className="w-4 h-4 mr-2 text-primary" />
                              <span>System-wide</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      )}
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild isActive={pathname === '/reports/branch'}>
                          <Link href="/reports/branch">
                            <Building2 className="w-4 h-4 mr-2" />
                            <span>Branch & District</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild isActive={pathname === '/reports/officer'}>
                          <Link href="/reports/officer">
                            <Users className="w-4 h-4 mr-2" />
                            <span>Staff Productivity</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      {isFollowUp && (
                        <>
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={pathname === '/head-office/follow-up'}>
                              <Link href="/head-office/follow-up">
                                <Zap className="w-4 h-4 mr-2 text-primary" />
                                <span>Follow up</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={pathname === '/reports/follow-up'}>
                              <Link href="/reports/follow-up">
                                <ClipboardList className="w-4 h-4 mr-2 text-primary" />
                                <span>Follow up Report</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        </>
                      )}
                      {isAdmin && (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={pathname === '/submissions/master-bundle'}>
                            <Link href="/submissions/master-bundle">
                              <Folders className="w-4 h-4 mr-2 text-emerald-600" />
                              <span>Master Case Bundle</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      )}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
            </SidebarMenu>
          </SidebarGroup>
        )}

        {/* SYSTEM ADMIN */}
        {(canManageUsers || canManageSystem || isAdmin) && (
          <SidebarGroup>
            <SidebarGroupLabel>System</SidebarGroupLabel>
            <SidebarMenu>
              <Collapsible className="group/collapsible" defaultOpen={false}>
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton tooltip="Administration">
                      <Settings />
                      <span>Administration</span>
                      <ChevronDown className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-180" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {canManageUsers && (
                        <>
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={pathname === '/admin/users'}>
                              <Link href="/admin/users">
                                <Users className="w-4 h-4 mr-2" />
                                <span>User Access</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={pathname === '/admin/roles'}>
                              <Link href="/admin/roles">
                                <UserCog className="w-4 h-4 mr-2 text-primary" />
                                <span>Assign Roles</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={pathname === '/admin/assignments'}>
                              <Link href="/admin/assignments">
                                <ArrowRightLeft className="w-4 h-4 mr-2 text-primary" />
                                <span>Staff Assignments</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        </>
                      )}
                      {canManageSystem && (
                        <>
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={pathname === '/admin/branches'}>
                              <Link href="/admin/branches">
                                <Building2 className="w-4 h-4 mr-2" />
                                <span>Branches & Districts</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={pathname === '/admin/settings'}>
                              <Link href="/admin/settings">
                                <Settings className="w-4 h-4 mr-2" />
                                <span>System Settings</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={pathname === '/admin/audit'}>
                              <Link href="/admin/audit">
                                <History className="w-4 h-4 mr-2" />
                                <span>Audit Logs</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        </>
                      )}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
            </SidebarMenu>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter className="border-t p-4 bg-slate-50/50">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold shrink-0 shadow-lg">
                  {user.name.charAt(0)}
                </div>
                <div className="flex-1 overflow-hidden text-left">
                  <p className="text-sm font-bold leading-tight truncate">{user.name}</p>
                  <p className="text-[10px] text-muted-foreground truncate uppercase tracking-tighter mt-0.5">{user.role}</p>
                </div>
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </div>
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-64" align="end" side="top">
            <DropdownMenuLabel className="font-bold flex items-center gap-2">
              <UserCircle className="w-4 h-4" /> Switch Test Profile
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {allUsers.slice(0, 10).map(u => (
              <DropdownMenuItem key={u.id} onClick={() => loginAs(u.id)} className="flex flex-col items-start gap-0.5 py-2 cursor-pointer">
                <span className={`font-bold text-sm ${u.id === user.id ? 'text-primary' : ''}`}>{u.name}</span>
                <span className="text-[10px] uppercase text-muted-foreground">{u.role}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              className="text-destructive font-bold cursor-pointer"
              onClick={() => logout()}
            >
              <LogOut className="w-4 h-4 mr-2" /> Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
