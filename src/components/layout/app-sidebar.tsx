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
  ChevronRight,
  Settings
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
  SidebarGroupContent
} from "@/components/ui/sidebar"
import { currentUser } from "@/lib/auth-mock"
import Link from "next/link"
import { usePathname } from "next/navigation"

export function AppSidebar() {
  const pathname = usePathname()
  const user = currentUser

  const navigation = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Submissions', href: '/submissions', icon: FileText },
    { name: 'Reports', href: '/reports', icon: PieChart },
  ]

  const adminNav = [
    { name: 'User Management', href: '/admin/users', icon: Users },
    { name: 'Branch Management', href: '/admin/branches', icon: Building2 },
    { name: 'Audit Logs', href: '/admin/audit', icon: ShieldCheck },
  ]

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b h-16 flex items-center px-6">
        <div className="flex items-center gap-2 font-bold text-primary">
          <ShieldCheck className="w-8 h-8" />
          <span className="group-data-[collapsible=icon]:hidden">KYC Flow</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigation.map((item) => (
                <SidebarMenuItem key={item.name}>
                  <SidebarMenuButton 
                    asChild 
                    isActive={pathname === item.href}
                    tooltip={item.name}
                  >
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.name}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {user.role === 'Admin' && (
          <SidebarGroup>
            <SidebarGroupLabel>Administration</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminNav.map((item) => (
                  <SidebarMenuItem key={item.name}>
                    <SidebarMenuButton 
                      asChild 
                      isActive={pathname === item.href}
                      tooltip={item.name}
                    >
                      <Link href={item.href}>
                        <item.icon />
                        <span>{item.name}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter className="border-t p-4">
        <div className="flex items-center gap-3 group-data-[collapsible=icon]:justify-center">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold">
            {user.name.charAt(0)}
          </div>
          <div className="flex-1 overflow-hidden group-data-[collapsible=icon]:hidden">
            <p className="text-sm font-medium leading-none truncate">{user.name}</p>
            <p className="text-xs text-muted-foreground truncate">{user.role}</p>
          </div>
          <SidebarMenuButton size="icon" className="group-data-[collapsible=icon]:hidden">
            <LogOut className="w-4 h-4" />
          </SidebarMenuButton>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}