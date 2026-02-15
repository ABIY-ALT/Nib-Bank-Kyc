import type {Metadata} from 'next';
import './globals.css';
import {FirebaseClientProvider} from '@/firebase/client-provider';
import {FirebaseErrorListener} from '@/components/firebase-error-listener';
import {AuthProvider} from '@/lib/auth-mock';
import {ThemeProvider} from '@/components/theme-provider';
import { AuthGuard } from '@/components/auth-guard';
import { DashboardShell } from '@/components/layout/dashboard-shell';

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
                <DashboardShell>
                  {children}
                </DashboardShell>
              </AuthGuard>
            </ThemeProvider>
          </AuthProvider>
        </FirebaseClientProvider>
      </body>
    </html>
  );
}
