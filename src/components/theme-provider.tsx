
"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"

export function ThemeProvider({
  children,
  nonce,
  ...props
}: React.ComponentProps<typeof NextThemesProvider> & { nonce?: string }) {
  return (
    <NextThemesProvider {...props} storageKey="theme" nonce={nonce}>
      {children}
    </NextThemesProvider>
  )
}
