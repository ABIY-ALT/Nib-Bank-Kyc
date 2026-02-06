"use client"

import * as React from "react"
import {
  LayoutDashboard,
  FileText,
  Users,
  Building2,
  PieChart,
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
  Filter,
  FileBarChart,
  Globe
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
  SidebarMenuSubButton
} from "@/components/ui/sidebar"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { currentUser } from "@/lib/auth-mock"
import Link from "next/link"
import { usePathname } from "next/navigation"

export function AppSidebar() {
  const pathname = usePathname()
  const user = currentUser

  // Role Checks
  const isBranchOfficer = user.role === 'Branch Officer'
  const isKYCOfficer = user.role === 'KYC Officer'
  const isSupervisor = user.role === 'Supervisor'
  const isBranchMgr = user.role === 'Branch Manager'
  const isDirector = user.role === 'Director'
  const isDistDir = user.role === 'District Director'
  const isAdmin = user.role === 'Admin'

  const canSeePerformance = isBranchMgr || isSupervisor || isDirector || isDistDir || isAdmin
  const canSeeReports = isSupervisor || isDirector || isAdmin

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b h-16 flex items-center px-4">
        <div className="flex items-center gap-2 font-bold text-primary">
          <ShieldCheck className="w-8 h-8 shrink-0" />
          <span className="group-data-[collapsible=icon]:hidden truncate">KYC Flow</span>
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

        {/* SUBMISSIONS */}
        <SidebarGroup>
          <SidebarGroupLabel>Workflows</SidebarGroupLabel>
          <SidebarMenu>
            <Collapsible defaultOpen className="group/collapsible">
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
                    {(isBranchOfficer || isAdmin) && (
                      <>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={pathname === '/submissions/new'}>
                            <Link href="/submissions/new">
                              <PlusCircle className="w-4 h-4 mr-2" />
                              <span>Create Submission</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={pathname === '/submissions/my'}>
                            <Link href="/submissions/my">
                              <Inbox className="w-4 h-4 mr-2" />
                              <span>My Submissions</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={pathname === '/submissions/amendment-requests'}>
                            <Link href="/submissions/amendment-requests">
                              <AlertCircle className="w-4 h-4 mr-2 text-orange-600" />
                              <span>Action Required</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      </>
                    )}
                    {(isKYCOfficer || isAdmin) && (
                      <>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={pathname === '/submissions/queue'}>
                            <Link href="/submissions/queue">
                              <Search className="w-4 h-4 mr-2" />
                              <span>Review Queue</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={pathname === '/submissions/amendments'}>
                            <Link href="/submissions/amendments">
                              <History className="w-4 h-4 mr-2" />
                              <span>Resubmitted Cases</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      </>
                    )}
                    {(isKYCOfficer || isSupervisor || isAdmin) && (
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild isActive={pathname === '/submissions/escalated'}>
                          <Link href="/submissions/escalated">
                            <ShieldAlert className="w-4 h-4 mr-2 text-destructive" />
                            <span>Escalated Cases</span>
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

        {/* PERFORMANCE */}
        {canSeePerformance && (
          <SidebarGroup>
            <SidebarGroupLabel>Management</SidebarGroupLabel>
            <SidebarMenu>
              <Collapsible defaultOpen className="group/collapsible">
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
                      {(isDirector || isDistDir || isAdmin) && (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={pathname === '/performance/district'}>
                            <Link href="/performance/district">
                              <Map className="w-4 h-4 mr-2" />
                              <span>District Metrics</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      )}
                      {(isBranchMgr || isDirector || isAdmin) && (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={pathname === '/performance/branch'}>
                            <Link href="/performance/branch">
                              <Building2 className="w-4 h-4 mr-2" />
                              <span>Branch Metrics</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      )}
                      {(isSupervisor || isDirector || isAdmin) && (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={pathname === '/performance/officer'}>
                            <Link href="/performance/officer">
                              <Users className="w-4 h-4 mr-2" />
                              <span>Officer Productivity</span>
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

        {/* REPORTING */}
        {canSeeReports && (
          <SidebarGroup>
            <SidebarGroupLabel>Audit & Reporting</SidebarGroupLabel>
            <SidebarMenu>
              <Collapsible defaultOpen className="group/collapsible">
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
                      {(isDirector || isAdmin) && (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={pathname === '/reports/branch'}>
                            <Link href="/reports/branch">
                              <Building2 className="w-4 h-4 mr-2" />
                              <span>Branch & District</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      )}
                      {(isSupervisor || isDirector || isAdmin) && (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={pathname === '/reports/officer'}>
                            <Link href="/reports/officer">
                              <Users className="w-4 h-4 mr-2" />
                              <span>Staff Productivity</span>
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

        {/* ADMINISTRATION */}
        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>System</SidebarGroupLabel>
            <SidebarMenu>
              <Collapsible className="group/collapsible">
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
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild isActive={pathname === '/admin/users'}>
                          <Link href="/admin/users">
                            <Users className="w-4 h-4 mr-2" />
                            <span>User Access</span>
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
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
            </SidebarMenu>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter className="border-t p-4 bg-slate-50/50">
        <div className="flex items-center gap-3 group-data-[collapsible=icon]:justify-center overflow-hidden">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold shrink-0">
            {user.name.charAt(0)}
          </div>
          <div className="flex-1 overflow-hidden group-data-[collapsible=icon]:hidden">
            <p className="text-sm font-medium leading-none truncate">{user.name}</p>
            <p className="text-[10px] text-muted-foreground truncate uppercase tracking-tighter mt-1">{user.role}</p>
          </div>
          <SidebarMenuButton size="icon" className="group-data-[collapsible=icon]:hidden">
            <LogOut className="w-4 h-4" />
          </SidebarMenuButton>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
