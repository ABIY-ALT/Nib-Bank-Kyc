'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { Separator } from '@/components/ui/separator';
import { ModeToggle } from '@/components/mode-toggle';
import { Toaster } from '@/components/ui/toaster';
import { ForcePasswordChangeModal } from '@/components/auth/force-password-change-modal';

/**
 * Institutional Shell Component.
 * Optimized for high-density banking workflows with full-height fluid layout.
 */
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();

  const isLoginPage = pathname === '/login';
  const isUnauthorizedPage = pathname === '/unauthorized';
  const isAdminPage = pathname.startsWith('/admin');

  // Render clean layout for the gateway entry point
  if (isLoginPage || isUnauthorizedPage) {
    return (
      <div className="min-h-screen w-full bg-[#FCFAF7] overflow-x-hidden">
        {children}
        <Toaster />
      </div>
    );
  }

  // Don't show force password change modal on admin pages
  const showForceChange = !!user?.needsPasswordChange && !isAdminPage;

  return (
    <SidebarProvider defaultOpen={true}>
      <div 
        className="flex h-screen w-full overflow-hidden bg-background"
        inert={showForceChange ? true : undefined}
      >
        <AppSidebar />
        
        <SidebarInset 
          className="flex flex-col flex-1 min-w-0 overflow-hidden bg-background"
          inert={showForceChange ? true : undefined}
        >
          {/* STICKY INSTITUTIONAL HEADER */}
          <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b px-6 bg-background/80 backdrop-blur-md sticky top-0 z-30">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="-ml-2 h-9 w-9" />
              <Separator orientation="vertical" className="h-4" />
              <div className="hidden md:flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Nib Bank KYC</span>
              </div>
            </div>
            <ModeToggle />
          </header>

          {/* FLUID WORKSPACE AREA */}
          <main className="flex-1 overflow-y-auto overflow-x-hidden relative">
            <div className="p-6 w-full animate-in fade-in duration-500">
              {children}
            </div>
          </main>
        </SidebarInset>

        {/* SECURITY GATE OVERLAY */}
        {showForceChange && <ForcePasswordChangeModal />}
      </div>
      <Toaster />
    </SidebarProvider>
  );
}
