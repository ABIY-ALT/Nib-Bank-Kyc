"use client"

import * as React from "react"
import {
  LayoutDashboard,
  FileText,
  Users,
  Building2,
  LogOut,
  Settings,
  PlusCircle,
  Inbox,
  AlertCircle,
  BarChart3,
  ChevronDown,
  ShieldAlert,
  FileBarChart,
  Globe,
  Folders,
  BookOpen,
  Zap,
  Map,
  HardDrive,
  ClipboardList,
  UserCog,
  ArrowRightLeft,
  History,
  Activity,
  TrendingUp,
  Monitor,
  Search
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
  SidebarMenuBadge,
  useSidebar
} from "@/components/ui/sidebar"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSidebarCounts } from "@/hooks/use-sidebar-counts"
import { usePermissions } from "@/hooks/use-permissions"
import { UserProfileDialog } from "@/components/auth/user-profile-dialog"
import { LogoFixed, LogoSmall } from "@/components/logo"
import { SIDEBAR_LABELS, SYSTEM_SECTION_COPY } from "@/lib/access-ui"
import { getActiveRoleNames, getPrimaryRoleDisplayName } from "@/lib/access-control"

export function AppSidebar() {
  const pathname = usePathname()
  const { user, logout } = useAuth()
  const counts = useSidebarCounts(user)
  const { hasPermission, hasAnyInGroup, loading, isSuperAdmin } = usePermissions()
  const { state } = useSidebar()

  if (!user) return null;

  const activeRoleNames = getActiveRoleNames(user);
  const canSeeMyPerformance = activeRoleNames.some((roleName) =>
    ['KYC_OFFICER', 'SUPERVISOR', 'SUPER_ADMIN', 'KYC_SPECIALIST', 'KYC_SPECIALIST_OFFICER'].includes(roleName)
  ) || isSuperAdmin;

  return (
    <Sidebar collapsible="icon" className="border-r-0 shadow-2xl">
      <SidebarHeader className="border-b h-16 flex items-center px-4 bg-sidebar-background group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:justify-center">
        <div className="flex items-center gap-3 font-bold overflow-hidden">
          {state === "collapsed" ? <LogoSmall /> : <LogoFixed />}
          <span className="group-data-[collapsible=icon]:hidden truncate text-white font-headline tracking-tight text-lg">Nib Bank KYC</span>
        </div>
      </SidebarHeader>
      
      <SidebarContent>
        {!loading && hasPermission('DASHBOARD_VIEW') && (
          <SidebarGroup>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === '/'} tooltip="Dashboard">
                  <Link href="/">
                    <LayoutDashboard className="w-4 h-4" />
                    <span>Dashboard</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        )}

        {!loading && hasAnyInGroup('WORKFLOWS') && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-white/40 uppercase tracking-widest text-[10px] font-bold">KYC Operations</SidebarGroupLabel>
            <SidebarMenu>
              <Collapsible 
                className="group/collapsible" 
                defaultOpen={(pathname || "").includes('/submissions') && !['/submissions', '/submissions/branch-node', '/submissions/district-node', '/submissions/master-bundle', '/admin/storage'].includes(pathname || "")}
              >
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton tooltip="Case Management">
                      <FileText className="w-4 h-4" />
                      <span>Case Management</span>
                      <ChevronDown className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-180" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {canSeeMyPerformance && (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={pathname === '/submissions/my-performance'}>
                            <Link href="/submissions/my-performance">
                              <TrendingUp className="w-4 h-4 mr-2 text-primary" />
                              <span>My Cases & Performance</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      )}

                      {hasPermission('CASE_SUBMIT') && (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={pathname === '/submissions/new'}>
                            <Link href="/submissions/new">
                              <PlusCircle className="w-4 h-4 mr-2" />
                              <span>Create Submission</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      )}
                      
                      {hasPermission('CASE_VIEW_OWN') && (
                        <SidebarMenuSubItem className="relative">
                          <SidebarMenuSubButton asChild isActive={pathname === '/submissions/my'}>
                            <Link href="/submissions/my">
                              <Inbox className="w-4 h-4 mr-2" />
                              <span>My Submissions</span>
                            </Link>
                          </SidebarMenuSubButton>
                          {counts.mySubmissions > 0 && (
                            <SidebarMenuBadge className="bg-primary text-white font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center p-1 top-1/2 -translate-y-1/2 right-2 border border-sidebar-background shadow-lg">
                              {counts.mySubmissions}
                            </SidebarMenuBadge>
                          )}
                        </SidebarMenuSubItem>
                      )}

                      {hasPermission('KYC_VIEW_QUEUE') && (
                        <SidebarMenuSubItem className="relative">
                          <SidebarMenuSubButton asChild isActive={pathname === '/submissions/queue'}>
                            <Link href="/submissions/queue">
                              <Search className="w-4 h-4 mr-2" />
                              <span>Review & Action</span>
                            </Link>
                          </SidebarMenuSubButton>
                          {counts.reviewQueue > 0 && (
                            <SidebarMenuBadge className="bg-primary text-white font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center p-1 top-1/2 -translate-y-1/2 right-2 border border-sidebar-background shadow-lg">
                              {counts.reviewQueue}
                            </SidebarMenuBadge>
                          )}
                        </SidebarMenuSubItem>
                      )}

                      {hasPermission('VIEW_AMENDMENT_QUEUE') && (
                        <SidebarMenuSubItem className="relative">
                          <SidebarMenuSubButton asChild isActive={pathname === '/submissions/amendments'}>
                            <Link href="/submissions/amendments">
                              <History className="w-4 h-4 mr-2 text-indigo-400" />
                              <span>Amendment Review</span>
                            </Link>
                          </SidebarMenuSubButton>
                          {counts.resubmitted > 0 && (
                            <SidebarMenuBadge className="bg-indigo-600 text-white font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center p-1 top-1/2 -translate-y-1/2 right-2 border border-sidebar-background shadow-lg">
                              {counts.resubmitted}
                            </SidebarMenuBadge>
                          )}
                        </SidebarMenuSubItem>
                      )}

                      {hasPermission('CASE_VIEW_ACTION_REQUIRED') && (
                        <SidebarMenuSubItem className="relative">
                          <SidebarMenuSubButton asChild isActive={pathname === '/submissions/amendment-requests'}>
                            <Link href="/submissions/amendment-requests">
                              <AlertCircle className="w-4 h-4 mr-2 text-orange-400" />
                              <span>Returned Cases</span>
                            </Link>
                          </SidebarMenuSubButton>
                          {counts.actionRequired > 0 && (
                            <SidebarMenuBadge className="bg-orange-600 text-white font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center p-1 top-1/2 -translate-y-1/2 right-2 border border-sidebar-background shadow-lg animate-pulse">
                              {counts.actionRequired}
                            </SidebarMenuBadge>
                          )}
                        </SidebarMenuSubItem>
                      )}

                      {hasPermission('VIEW_ESCALATED_CASES') && (
                        <SidebarMenuSubItem className="relative">
                          <SidebarMenuSubButton asChild isActive={pathname === '/submissions/escalated'}>
                            <Link href="/submissions/escalated">
                              <ShieldAlert className="w-4 h-4 mr-2 text-destructive" />
                              <span>Escalated Cases</span>
                            </Link>
                          </SidebarMenuSubButton>
                          {counts.escalated > 0 && (
                            <SidebarMenuBadge className="bg-destructive text-white font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center p-1 top-1/2 -translate-y-1/2 right-2 border border-sidebar-background shadow-lg">
                              {counts.escalated}
                            </SidebarMenuBadge>
                          )}
                        </SidebarMenuSubItem>
                      )}

                      {(hasPermission('VIEW_GOVERNANCE_QUEUE') || (hasPermission('CASE_VIEW_OWN') && counts.exceptional > 0)) && (
                        <SidebarMenuSubItem className="relative">
                          <SidebarMenuSubButton asChild isActive={pathname === '/submissions/exceptional'}>
                            <Link href="/submissions/exceptional">
                              <Zap className="w-4 h-4 mr-2 text-yellow-400" />
                              <span>Exceptional Cases</span>
                            </Link>
                          </SidebarMenuSubButton>
                          {counts.exceptional > 0 && (
                            <SidebarMenuBadge className="bg-yellow-600 text-white font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center p-1 top-1/2 -translate-y-1/2 right-2 border border-sidebar-background shadow-lg">
                              {counts.exceptional}
                            </SidebarMenuBadge>
                          )}
                        </SidebarMenuSubItem>
                      )}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>

              {(hasPermission('CASE_VIEW_BRANCH') || hasPermission('DASHBOARD_VIEW_DISTRICT')) && (
                <Collapsible className="group/collapsible" defaultOpen={(pathname || "").includes('/submissions/branch-node') || (pathname || "").includes('/submissions/district-node')}>
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton tooltip="Monitoring">
                        <BarChart3 className="w-4 h-4" />
                        <span>Monitoring</span>
                        <ChevronDown className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-180" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {hasPermission('CASE_VIEW_BRANCH') && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={pathname === '/submissions/branch-node'}>
                              <Link href="/submissions/branch-node">
                                <Building2 className="w-4 h-4 mr-2 text-primary" />
                                <span>Branch Monitoring</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}

                        {hasPermission('DASHBOARD_VIEW_DISTRICT') && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={pathname === '/submissions/district-node'}>
                              <Link href="/submissions/district-node">
                                <Map className="w-4 h-4 mr-2 text-primary" />
                                <span>District Monitoring</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              )}

              {hasPermission('MANAGE_VAULT_STORAGE') && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === '/admin/storage'} tooltip={SIDEBAR_LABELS.documentVault}>
                    <Link href="/admin/storage">
                      <HardDrive className="w-4 h-4" />
                      <span>{SIDEBAR_LABELS.documentVault}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {hasPermission('VIEW_ARCHIVED_CASE') && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === '/submissions'} tooltip="Archive">
                    <Link href="/submissions">
                      <Folders className="w-4 h-4" />
                      <span>Case Archive</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroup>
        )}

        {!loading && hasPermission('VIEW_FQ_LIBRARY') && (
          <SidebarGroup>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === '/kyc-fq-reference'} tooltip="KYC F&Q Reference">
                  <Link href="/kyc-fq-reference">
                    <BookOpen className="w-4 h-4" />
                    <span>KYC F&Q Reference</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        )}

        {!loading && hasAnyInGroup('REPORTING') && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-white/40 uppercase tracking-widest text-[10px] font-bold">Audit & Reporting</SidebarGroupLabel>
            <SidebarMenu>
              <Collapsible className="group/collapsible" defaultOpen={(pathname || "").includes('/reports') || (pathname || "").includes('/performance')}>
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton tooltip="Reporting Suite">
                      <FileBarChart className="w-4 h-4" />
                      <span>Reporting Suite</span>
                      <ChevronDown className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-180" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {hasPermission('VIEW_SPECIALIST_PRODUCTIVITY') && (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={pathname === '/performance/officer'}>
                            <Link href="/performance/officer">
                              <Monitor className="w-4 h-4 mr-2 text-primary" />
                              <span>Ops Monitoring</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      )}

                      {hasPermission('REPORT_VIEW_SYSTEM') && (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={pathname === '/reports/management'}>
                            <Link href="/reports/management">
                              <BarChart3 className="w-4 h-4 mr-2 text-primary" />
                              <span>Management Report</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      )}

                      {hasPermission('REPORT_VIEW_SYSTEM') && (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={pathname === '/reports/system'}>
                            <Link href="/reports/system">
                              <Globe className="w-4 h-4 mr-2 text-primary" />
                              <span>System-wide</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      )}

                      {hasPermission('VIEW_AUDIT_POOL') && (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={pathname === '/head-office/follow-up'}>
                            <Link href="/head-office/follow-up">
                              <Zap className="w-4 h-4 mr-2 text-primary" />
                              <span>Follow up</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      )}

                      {hasPermission('VIEW_AUDIT_LOGS') && (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={pathname === '/reports/follow-up'}>
                            <Link href="/reports/follow-up">
                              <ClipboardList className="w-4 h-4 mr-2 text-primary" />
                              <span>Follow up Report</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      )}

                      {hasPermission('DOWNLOAD_MASTER_ARCHIVE') && (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={pathname === '/submissions/master-bundle'}>
                            <Link href="/submissions/master-bundle">
                              <Folders className="w-4 h-4 mr-2 text-emerald-400" />
                              <span>Master Archive</span>
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

        {!loading && hasAnyInGroup('SYSTEM') && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-white/40 uppercase tracking-widest text-[10px] font-bold">Administration</SidebarGroupLabel>
            <SidebarMenu>
              <Collapsible className="group/collapsible" defaultOpen={(pathname || "").includes('/admin/') && pathname !== '/admin/storage'}>
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton tooltip="System Management">
                      <Settings className="w-4 h-4" />
                      <span>System Management</span>
                      <ChevronDown className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-180" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {hasPermission('USER_CREATE') && (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={pathname === '/admin/users'}>
                            <Link href="/admin/users">
                              <Users className="w-4 h-4 mr-2" />
                              <span>{SYSTEM_SECTION_COPY.USER_CREATE.label}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      )}
                      
                      {hasPermission('ROLE_CREATE') && (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={pathname === '/admin/roles'}>
                            <Link href="/admin/roles">
                              <UserCog className="w-4 h-4 mr-2 text-primary" />
                              <span>{SYSTEM_SECTION_COPY.ROLE_CREATE.label}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      )}

                      {hasPermission('MAP_USERS_TO_BRANCH') && (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={pathname === '/admin/assignments'}>
                            <Link href="/admin/assignments">
                              <ArrowRightLeft className="w-4 h-4 mr-2 text-primary" />
                              <span>{SYSTEM_SECTION_COPY.MAP_USERS_TO_BRANCH.label}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      )}

                      {hasPermission('MANAGE_BRANCHES') && (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={pathname === '/admin/branches'}>
                            <Link href="/admin/branches">
                              <Building2 className="w-4 h-4 mr-2" />
                              <span>{SYSTEM_SECTION_COPY.MANAGE_BRANCHES.label}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      )}

                      {hasPermission('EDIT_SLA_POLICY') && (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={pathname === '/admin/settings'}>
                            <Link href="/admin/settings">
                              <Settings className="w-4 h-4" />
                              <span>{SYSTEM_SECTION_COPY.EDIT_SLA_POLICY.label}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      )}

                      {hasPermission('VIEW_SYSTEM_AUDIT') && (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={pathname === '/admin/audit'}>
                            <Link href="/admin/audit">
                              <History className="w-4 h-4 mr-2" />
                              <span>{SYSTEM_SECTION_COPY.VIEW_SYSTEM_AUDIT.label}</span>
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
      </SidebarContent>

      <SidebarFooter className="border-t p-4 bg-sidebar-background/50">
        <div className="flex items-center gap-3 overflow-hidden">
          <UserProfileDialog>
            <div className="flex items-center gap-3 flex-1 cursor-pointer group overflow-hidden">
              <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold shrink-0 shadow-lg group-hover:scale-110 transition-transform">
                {user.name?.[0] || "?"}
              </div>
              <div className="flex-1 overflow-hidden text-left">
                <p className="text-sm font-bold leading-tight truncate text-white group-hover:text-primary transition-colors">{user.name}</p>
                <p className="text-[10px] text-white/40 truncate uppercase tracking-tighter mt-0.5 font-bold">
                  {getPrimaryRoleDisplayName(user)}
                </p>
              </div>
            </div>
          </UserProfileDialog>
          <Button variant="ghost" size="icon" onClick={() => logout()} className="text-white/40 hover:text-destructive hover:bg-transparent">
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
