import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/auth';
import { ThemeProvider } from '@/components/theme-provider';
import { AuthGuard } from '@/components/auth-guard';
import { DashboardShell } from '@/components/layout/dashboard-shell';
import { NonceProvider } from '@/lib/nonce-context';
import { headers } from 'next/headers';
import { Inter } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'Nib Bank KYC - Secure Identity Verification',
  description: 'Mission-critical identity verification and submission management system.',
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
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="font-body antialiased bg-background" suppressHydrationWarning>
        <NonceProvider nonce={nonce}>
          <AuthProvider>
            <ThemeProvider
              attribute="class"
              defaultTheme="light"
              enableSystem
              disableTransitionOnChange
              nonce={nonce}
            >
              <AuthGuard>
                <DashboardShell>
                  {children}
                </DashboardShell>
              </AuthGuard>
            </ThemeProvider>
          </AuthProvider>
        </NonceProvider>
      </body>
    </html>
  );
}
