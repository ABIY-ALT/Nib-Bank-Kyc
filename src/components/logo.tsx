/**
 * Logo Image Component
 * ====================
 * Production-ready logo component following Next.js Image best practices.
 * Handles both fixed-size and responsive use cases.
 *
 * Features:
 * ✅ Proper Next.js Image configuration
 * ✅ Error boundary and fallback
 * ✅ Responsive sizing options
 * ✅ Optimized for performance
 * ✅ TypeScript support
 */

'use client';

import Image from 'next/image';
import { useState } from 'react';
import { AlertCircle } from 'lucide-react';

interface LogoProps {
  /**
   * Display mode: 'fixed' for sidebar/header, 'responsive' for page hero
   * @default 'responsive'
   */
  variant?: 'fixed' | 'responsive' | 'small';
  
  /**
   * Show error fallback if image fails to load
   * @default true
   */
  showFallback?: boolean;
  
  /**
   * Custom error handler
   */
  onError?: () => void;
  
  /**
   * Custom load handler
   */
  onLoad?: () => void;

  className?: string;
  priority?: boolean;
  quality?: number;
  sizes?: string;
}

/**
 * Fixed-size logo (Sidebar)
 * Perfect for header/sidebar logos with defined dimensions
 */
export function LogoFixed() {
  const [error, setError] = useState(false);

  return (
    <div className="w-10 h-10 rounded-lg shadow-sm shrink-0 flex items-center justify-center bg-white/95 ring-1 ring-black/5 dark:bg-white/95 p-1 relative">
      {error ? (
        <span className="text-[10px] font-black text-[#0F172A]">NB</span>
      ) : (
        <Image
          src="/logo.png"
          alt="Nib Bank Logo"
          width={40}
          height={40}
          priority
          className="object-contain"
          quality={85}
          onError={() => setError(true)}
        />
      )}
    </div>
  );
}

/**
 * Responsive logo (Hero/Login page)
 * Uses fill layout for responsive sizing
 */
export function LogoResponsive() {
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted/50 rounded-lg">
        <div className="text-center">
          <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-xs text-muted-foreground font-medium">Logo unavailable</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-32 h-32 shadow-2xl rounded-[2.5rem] border-0 bg-white overflow-hidden">
      <div className="absolute inset-6">
        <Image
          src="/logo.png"
          alt="Nib Bank Logo"
          fill
          priority
          className="object-contain"
          quality={100}
          sizes="128px"
          onError={() => setError(true)}
        />
      </div>
    </div>
  );
}

/**
 * Small logo (Navigation, tabs, etc.)
 * Compact size for navigation elements
 */
export function LogoSmall() {
  const [error, setError] = useState(false);

  return (
    <div className="w-6 h-6 relative flex-shrink-0 rounded-md bg-white/95 ring-1 ring-black/5 dark:bg-white/95">
      {error ? (
        <span className="text-[9px] font-black text-[#0F172A]">NB</span>
      ) : (
        <Image
          src="/logo.png"
          alt="Nib Bank"
          width={24}
          height={24}
          priority
          className="object-contain"
          quality={75}
          onError={() => setError(true)}
        />
      )}
    </div>
  );
}

/**
 * Generic Logo component with variant support
 */
export function Logo({
  variant = 'responsive',
  showFallback = true,
  onError,
  onLoad,
  className,
  priority = true,
  quality,
  sizes,
}: LogoProps) {
  const [error, setError] = useState(false);

  const handleError = () => {
    setError(true);
    onError?.();
  };

  const handleLoad = () => {
    onLoad?.();
  };

  // Fallback for error state
  if (error && showFallback) {
    return (
      <div
        className={`flex items-center justify-center bg-gradient-to-br from-muted to-muted/50 rounded-lg ${className || ''}`}
      >
        <div className="text-center">
          <AlertCircle className="w-6 h-6 text-muted-foreground mx-auto mb-1" />
          <p className="text-xs text-muted-foreground font-medium">Logo</p>
        </div>
      </div>
    );
  }

  if (variant === 'fixed') {
    return (
      <div className={`w-10 h-10 rounded-lg shadow-sm flex items-center justify-center bg-white/95 ring-1 ring-black/5 dark:bg-white/95 relative ${className || ''}`}>
        <Image
          src="/logo.png"
          alt="Nib Bank Logo"
          width={40}
          height={40}
          priority={priority}
          className="object-contain"
          quality={quality ?? 85}
          onError={handleError}
          onLoad={handleLoad}
        />
      </div>
    );
  }

  if (variant === 'small') {
    return (
      <div className={`w-6 h-6 relative flex-shrink-0 rounded-md bg-white/95 ring-1 ring-black/5 dark:bg-white/95 ${className || ''}`}>
        <Image
          src="/logo.png"
          alt="Nib Bank"
          width={24}
          height={24}
          priority={priority}
          className="object-contain"
          quality={quality ?? 75}
          onError={handleError}
          onLoad={handleLoad}
        />
      </div>
    );
  }

  // Default: responsive variant
  return (
  <div className={`relative w-32 h-32 flex items-center justify-center ${className || ''}`}
  
  ><Image
    src="/logo.png"
    alt="Nib Bank Logo"
    width={100}
    height={100}
    priority={priority}
    className="object-contain"
    quality={quality ?? 100}
    sizes={sizes ?? "128px"}
    onError={handleError}
    onLoad={handleLoad}
  />
</div>
  )
}

export default Logo;
