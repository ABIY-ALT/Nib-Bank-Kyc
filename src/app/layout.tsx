
import type {Metadata} from 'next';
import './globals.css';
import {SidebarProvider, SidebarTrigger} from '@/components/ui/sidebar';
import {Separator} from '@/components/ui/separator';
import {AppSidebar} from '@/components/layout/app-sidebar';
import {Toaster} from '@/components/ui/toaster';
import {FirebaseClientProvider} from '@/firebase/client-provider';
import {FirebaseErrorListener} from '@/components/firebase-error-listener';
import {AuthProvider} from '@/lib/auth-mock';
import {ThemeProvider} from '@/components/theme-provider';
import {ModeToggle} from '@/components/mode-toggle';
import { AuthGuard } from '@/components/auth-guard';

export const metadata: Metadata = {
  title: 'Nib Kyc - Secure Identity Verification',
  description: 'Identity verification and submission management system.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased bg-background">
        <FirebaseClientProvider>
          <AuthProvider>
            <ThemeProvider
              attribute="class"
              defaultTheme="system"
              enableSystem
              disableTransitionOnChange
            >
              <FirebaseErrorListener />
              <AuthGuard>
                <SidebarProvider>
                  <div className="flex min-h-screen w-full">
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
              </AuthGuard>
            </ThemeProvider>
          </AuthProvider>
        </FirebaseClientProvider>
      </body>
    </html>
  );
}
