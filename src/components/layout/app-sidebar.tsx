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
  ChevronDown,
  ShieldAlert,
  Search,
  FileBarChart,
  Globe,
  Archive,
  ArrowRightLeft,
  UserCog,
  Zap,
  LayoutList,
  BookOpen,
  ClipboardList,
  Folders,
  TrendingUp,
  Shield,
  FileArchive,
  ClipboardCheck
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
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth-mock"
import Link from "next/navigation"
import { usePathname } from "next/navigation"
import { useSidebarCounts } from "@/hooks/use-sidebar-counts"
import { usePermissions } from "@/hooks/use-permissions"

export function AppSidebar() {
  const pathname = usePathname()
  const { user, logout } = useAuth()
  const counts = useSidebarCounts(user)
  const { hasPermission, hasAnyInGroup, loading } = usePermissions()

  if (!user || loading) return null;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b h-16 flex items-center px-4 bg-sidebar-background">
        <div className="flex items-center gap-3 font-bold">
          <div className="bg-primary p-1.5 rounded-lg shadow-sm shrink-0 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <span className="group-data-[collapsible=icon]:hidden truncate text-white font-headline tracking-tight text-lg">Nib Bank KYC</span>
        </div>
      </SidebarHeader>
      
      <SidebarContent>
        {/* DASHBOARD GROUP */}
        {hasPermission('DASHBOARD_VIEW') && (
          <SidebarGroup>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === '/'} tooltip="Dashboard">
                  <a href="/">
                    <LayoutDashboard className="w-4 h-4" />
                    <span>Dashboard</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        )}

        {/* WORKFLOWS GROUP */}
        {hasAnyInGroup('WORKFLOWS') && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-white/40 uppercase tracking-widest text-[10px] font-bold">Workflows</SidebarGroupLabel>
            <SidebarMenu>
              <Collapsible className="group/collapsible" defaultOpen={false}>
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton tooltip="Identity Verification">
                      <FileText className="w-4 h-4" />
                      <span>Identity Verification</span>
                      <ChevronDown className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-180" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {hasPermission('CASE_SUBMIT') && (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={pathname === '/submissions/new'}>
                            <a href="/submissions/new">
                              <PlusCircle className="w-4 h-4 mr-2" />
                              <span>Create Submission</span>
                            </a>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      )}
                      
                      {hasPermission('CASE_VIEW_OWN') && (
                        <SidebarMenuSubItem className="relative">
                          <SidebarMenuSubButton asChild isActive={pathname === '/submissions/my'}>
                            <a href="/submissions/my">
                              <Inbox className="w-4 h-4 mr-2" />
                              <span>My Submissions</span>
                            </a>
                          </SidebarMenuSubButton>
                          {counts.mySubmissions > 0 && (
                            <SidebarMenuBadge className="bg-white/10 text-white font-bold rounded-full w-5 h-5 flex items-center justify-center p-0 top-1/2 -translate-y-1/2 right-2">
                              {counts.mySubmissions}
                            </SidebarMenuBadge>
                          )}
                        </SidebarMenuSubItem>
                      )}

                      {hasPermission('CASE_VIEW_ACTION_REQUIRED') && (
                        <SidebarMenuSubItem className="relative">
                          <SidebarMenuSubButton asChild isActive={pathname === '/submissions/amendment-requests'}>
                            <a href="/submissions/amendment-requests">
                              <AlertCircle className="w-4 h-4 mr-2 text-orange-400" />
                              <span>Action Required</span>
                            </a>
                          </SidebarMenuSubButton>
                          {counts.actionRequired > 0 && (
                            <SidebarMenuBadge className="bg-orange-600 text-white font-bold rounded-full w-5 h-5 flex items-center justify-center p-0 top-1/2 -translate-y-1/2 right-2 animate-pulse">
                              {counts.actionRequired}
                            </SidebarMenuBadge>
                          )}
                        </SidebarMenuSubItem>
                      )}

                      {hasPermission('CASE_VIEW_BRANCH') && (
                        <SidebarMenuSubItem className="relative">
                          <SidebarMenuSubButton asChild isActive={pathname === '/submissions/branch-node'}>
                            <a href="/submissions/branch-node">
                              <LayoutList className="w-4 h-4 mr-2 text-primary" />
                              <span>Branch Overview</span>
                            </a>
                          </SidebarMenuSubButton>
                          {counts.branchNode > 0 && (
                            <SidebarMenuBadge className="bg-primary text-white font-bold rounded-full w-5 h-5 flex items-center justify-center p-0 top-1/2 -translate-y-1/2 right-2">
                              {counts.branchNode}
                            </SidebarMenuBadge>
                          )}
                        </SidebarMenuSubItem>
                      )}

                      {hasPermission('KYC_VIEW_QUEUE') && (
                        <SidebarMenuSubItem className="relative">
                          <SidebarMenuSubButton asChild isActive={pathname === '/submissions/queue'}>
                            <a href="/submissions/queue">
                              <Search className="w-4 h-4 mr-2" />
                              <span>Review Queue</span>
                            </a>
                          </SidebarMenuSubButton>
                          {counts.reviewQueue > 0 && (
                            <SidebarMenuBadge className="bg-primary text-white font-bold rounded-full w-5 h-5 flex items-center justify-center p-0 top-1/2 -translate-y-1/2 right-2">
                              {counts.reviewQueue}
                            </SidebarMenuBadge>
                          )}
                        </SidebarMenuSubItem>
                      )}

                      {hasPermission('KYC_VIEW_RESUBMITTED') && (
                        <SidebarMenuSubItem className="relative">
                          <SidebarMenuSubButton asChild isActive={pathname === '/submissions/amendments'}>
                            <a href="/submissions/amendments">
                              <History className="w-4 h-4 mr-2" />
                              <span>Resubmitted Cases</span>
                            </a>
                          </SidebarMenuSubButton>
                          {counts.resubmitted > 0 && (
                            <SidebarMenuBadge className="bg-primary text-white font-bold rounded-full w-5 h-5 flex items-center justify-center p-0 top-1/2 -translate-y-1/2 right-2">
                              {counts.resubmitted}
                            </SidebarMenuBadge>
                          )}
                        </SidebarMenuSubItem>
                      )}

                      {hasPermission('VIEW_ESCALATED_CASES') && (
                        <SidebarMenuSubItem className="relative">
                          <SidebarMenuSubButton asChild isActive={pathname === '/submissions/escalated'}>
                            <a href="/submissions/escalated">
                              <ShieldAlert className="w-4 h-4 mr-2 text-destructive" />
                              <span>Escalated Cases</span>
                            </a>
                          </SidebarMenuSubButton>
                          {counts.escalated > 0 && (
                            <SidebarMenuBadge className="bg-destructive text-white font-bold rounded-full w-5 h-5 flex items-center justify-center p-0 top-1/2 -translate-y-1/2 right-2">
                              {counts.escalated}
                            </SidebarMenuBadge>
                          )}
                        </SidebarMenuSubItem>
                      )}

                      {hasPermission('VIEW_GOVERNANCE_QUEUE') && (
                        <SidebarMenuSubItem className="relative">
                          <SidebarMenuSubButton asChild isActive={pathname === '/submissions/exceptional'}>
                            <a href="/submissions/exceptional">
                              <Zap className="w-4 h-4 mr-2 text-yellow-400" />
                              <span>Exceptional Cases</span>
                            </a>
                          </SidebarMenuSubButton>
                          {counts.exceptional > 0 && (
                            <SidebarMenuBadge className="bg-yellow-600 text-white font-bold rounded-full w-5 h-5 flex items-center justify-center p-0 top-1/2 -translate-y-1/2 right-2">
                              {counts.exceptional}
                            </SidebarMenuBadge>
                          )}
                        </SidebarMenuSubItem>
                      )}

                      {hasPermission('VIEW_ARCHIVED_CASE') && (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={pathname === '/submissions'}>
                            <a href="/submissions">
                              <Archive className="w-4 h-4 mr-2" />
                              <span>Master Case Archive</span>
                            </a>
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

        {/* REFERENCE GROUP */}
        {hasPermission('VIEW_FQ_LIBRARY') && (
          <SidebarGroup>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === '/kyc-fq-reference'} tooltip="KYC F&Q Reference">
                  <a href="/kyc-fq-reference">
                    <BookOpen className="w-4 h-4" />
                    <span>KYC F&Q Reference</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        )}

        {/* AUDIT & REPORTING GROUP */}
        {hasAnyInGroup('REPORTING') && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-white/40 uppercase tracking-widest text-[10px] font-bold">Audit & Reporting</SidebarGroupLabel>
            <SidebarMenu>
              <Collapsible className="group/collapsible" defaultOpen={false}>
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
                      {hasPermission('REPORT_VIEW_SYSTEM') && (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={pathname === '/reports/system'}>
                            <a href="/reports/system">
                              <Globe className="w-4 h-4 mr-2 text-primary" />
                              <span>System-wide</span>
                            </a>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      )}
                      
                      {hasPermission('REPORT_VIEW_DISTRICT') && (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={pathname === '/performance/district'}>
                            <a href="/performance/district">
                              <Building2 className="w-4 h-4 mr-2" />
                              <span>District Command</span>
                            </a>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      )}

                      {hasPermission('VIEW_SPECIALIST_PRODUCTIVITY') && (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={pathname === '/performance/officer'}>
                            <a href="/performance/officer">
                              <Users className="w-4 h-4 mr-2" />
                              <span>KYC Officer Performance</span>
                            </a>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      )}

                      {hasPermission('VIEW_AUDIT_POOL') && (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={pathname === '/head-office/follow-up'}>
                            <a href="/head-office/follow-up">
                              <Zap className="w-4 h-4 mr-2 text-primary" />
                              <span>Follow-up Audit</span>
                            </a>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      )}

                      {hasPermission('VIEW_AUDIT_LOGS') && (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={pathname === '/reports/follow-up'}>
                            <a href="/reports/follow-up">
                              <ClipboardList className="w-4 h-4 mr-2 text-primary" />
                              <span>Audit Reports</span>
                            </a>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      )}

                      {hasPermission('DOWNLOAD_MASTER_ARCHIVE') && (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={pathname === '/submissions/master-bundle'}>
                            <a href="/submissions/master-bundle">
                              <Folders className="w-4 h-4 mr-2 text-emerald-400" />
                              <span>Master Archive</span>
                            </a>
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

        {/* SYSTEM ADMINISTRATION GROUP */}
        {hasAnyInGroup('SYSTEM') && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-white/40 uppercase tracking-widest text-[10px] font-bold">Administration</SidebarGroupLabel>
            <SidebarMenu>
              <Collapsible className="group/collapsible" defaultOpen={false}>
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
                            <a href="/admin/users">
                              <Users className="w-4 h-4 mr-2" />
                              <span>User Access</span>
                            </a>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      )}
                      
                      {hasPermission('ROLE_CREATE') && (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={pathname === '/admin/roles'}>
                            <a href="/admin/roles">
                              <UserCog className="w-4 h-4 mr-2 text-primary" />
                              <span>Assign Roles</span>
                            </a>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      )}

                      {hasPermission('MAP_USERS_TO_BRANCH') && (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={pathname === '/admin/assignments'}>
                            <a href="/admin/assignments">
                              <ArrowRightLeft className="w-4 h-4 mr-2 text-primary" />
                              <span>Portfolio Mapping</span>
                            </a>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      )}

                      {hasPermission('MANAGE_BRANCHES') && (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={pathname === '/admin/branches'}>
                            <a href="/admin/branches">
                              <Building2 className="w-4 h-4 mr-2" />
                              <span>Hierarchy</span>
                            </a>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      )}

                      {hasPermission('EDIT_SLA_POLICY') && (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={pathname === '/admin/settings'}>
                            <a href="/admin/settings">
                              <Settings className="w-4 h-4" />
                              <span>Configuration</span>
                            </a>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      )}

                      {hasPermission('VIEW_SYSTEM_AUDIT') && (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={pathname === '/admin/audit'}>
                            <a href="/admin/audit">
                              <History className="w-4 h-4 mr-2" />
                              <span>Audit Logs</span>
                            </a>
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
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold shrink-0 shadow-lg">
            {user.name.charAt(0)}
          </div>
          <div className="flex-1 overflow-hidden text-left">
            <p className="text-sm font-bold leading-tight truncate text-white">{user.name}</p>
            <p className="text-[10px] text-white/40 truncate uppercase tracking-tighter mt-0.5 font-bold">
              {user.roles?.[0]?.role.name.replace(/_/g, ' ') || 'OFFICER'}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => logout()} className="text-white/40 hover:text-destructive hover:bg-transparent">
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
