
'use client';

import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-mock';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { Separator } from '@/components/ui/separator';
import { ModeToggle } from '@/components/mode-toggle';
import { Toaster } from '@/components/ui/toaster';

/**
 * A shell component that conditionally renders the sidebar and header
 * based on the current route and authentication status.
 */
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();

  const isLoginPage = pathname === '/login';
  const isForceChangePage = pathname === '/force-password-change';

  // Force Change Password Logic
  // If the user is authenticated but needs a password change, redirect them to the secure gate
  React.useEffect(() => {
    if (user && user.needsPasswordChange && !isForceChangePage && !isLoginPage) {
      router.push('/force-password-change');
    }
  }, [user, isForceChangePage, isLoginPage, router]);

  // If we're on the login page or force change page, render a clean layout without the sidebar/header
  if (isLoginPage || isForceChangePage) {
    return (
      <div className="min-h-screen w-full bg-[#FCFAF7]">
        {children}
        <Toaster />
      </div>
    );
  }

  // For all other pages, render the full institutional shell
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <main className="flex-1 flex flex-col min-w-0">
          <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b px-4 bg-background/50 backdrop-blur-sm sticky top-0 z-10">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="mr-2 h-4" />
            </div>
            <ModeToggle />
          </header>
          <div className="flex-1 overflow-y-auto">
            <div className="p-4 md:p-8 max-w-7xl mx-auto">
              {children}
            </div>
          </div>
        </main>
      </div>
      <Toaster />
    </SidebarProvider>
  );
}
