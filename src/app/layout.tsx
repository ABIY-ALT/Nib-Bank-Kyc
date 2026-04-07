import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/auth';
import { ThemeProvider } from '@/components/theme-provider';
import { AuthGuard } from '@/components/auth-guard';
import { DashboardShell } from '@/components/layout/dashboard-shell';
import { NonceProvider } from '@/lib/nonce-context';
import { IdleTimeoutProvider } from '@/components/idle-timeout-provider';
import { headers } from 'next/headers';
import { TooltipProvider } from '@/components/ui/tooltip';

export const metadata: Metadata = {
  title: 'Nib Bank KYC',
  description: 'KYC submission management system.',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Extract nonce from headers provided by proxy middleware for CSP compliance
  const headerList = await headers();
  const nonce = headerList.get('x-nonce') || undefined;

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-body antialiased bg-background" suppressHydrationWarning>
        <NonceProvider nonce={nonce}>
          <AuthProvider>
            <IdleTimeoutProvider idleTimeoutMinutes={30}>
              <ThemeProvider
                attribute="class"
                defaultTheme="light"
                enableSystem
                disableTransitionOnChange
                nonce={nonce}
              >
                <TooltipProvider delayDuration={200}>
                  <AuthGuard>
                    <DashboardShell>
                      {children}
                    </DashboardShell>
                  </AuthGuard>
                </TooltipProvider>
              </ThemeProvider>
            </IdleTimeoutProvider>
          </AuthProvider>
        </NonceProvider>
      </body>
    </html>
  );
}
