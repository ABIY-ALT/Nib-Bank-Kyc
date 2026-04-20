'use client';

import { useState, useCallback, useEffect, useRef, memo } from 'react';
import { Copy, Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

interface TempPasswordModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userName: string;
  tempPassword: string; // Temporary password displayed for admin to copy
  email: string;
}

/**
 * Temporary Password Distribution Modal
 * 
 * Features:
 * ✅ Shows password in UI for admin to copy
 * ✅ Show/Hide toggle for password visibility
 * ✅ Copy to clipboard functionality
 * ✅ Admin shares via preferred channel (email, call, telegram, etc.)
 */
const TempPasswordModalComponent = ({
  open,
  onOpenChange,
  userName,
  tempPassword,
  email,
}: TempPasswordModalProps) => {
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const copyTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const maskEmail = (emailAddr: string): string => {
    const [local, domain] = emailAddr.split('@');
    if (!local || !domain) return '***@***';
    
    const maskedLocal = local.charAt(0) + '*'.repeat(Math.max(1, local.length - 2)) + local.charAt(local.length - 1);
    return `${maskedLocal}@${domain}`;
  };

  const handleCopyPassword = useCallback(async () => {
    console.log('[TempPasswordModal] Copy operation started');
    
    if (isCopying) {
      console.log('[TempPasswordModal] Copy already in progress, ignoring click');
      return;
    }
    
    try {
      setIsCopying(true);
      setCopied(false);
      console.log('[TempPasswordModal] Loading state set to true');
      
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard API not available in this browser');
      }
      
      console.log('[TempPasswordModal] Writing to clipboard...');
      await navigator.clipboard.writeText(tempPassword);
      console.log('[TempPasswordModal] Successfully copied to clipboard');
      
      setCopied(true);
      toast({
        title: 'Copied!',
        description: 'Temporary password copied to clipboard',
      });

      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = window.setTimeout(() => {
        setCopied(false);
        console.log('[TempPasswordModal] Copied state reset');
        copyTimeoutRef.current = null;
      }, 2000);
      
    } catch (error) {
      console.error('[TempPasswordModal] Copy failed:', error);
      toast({
        title: 'Copy Failed',
        description: error instanceof Error ? error.message : 'Failed to copy password to clipboard',
        variant: 'destructive',
      });
    } finally {
      setIsCopying(false);
      console.log('[TempPasswordModal] Loading state reset, operation complete');
    }
  }, [tempPassword, toast, isCopying]);

  const handleClose = useCallback(() => {
    if (copyTimeoutRef.current) {
      window.clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = null;
    }
    setShowPassword(false);
    setCopied(false);
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent 
        className="max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Temporary Password Created</DialogTitle>
          <DialogDescription className="pt-2">
            Share this temporary password with{' '}
            <span className="font-bold text-foreground">{userName}</span>{' '}
            via your preferred channel.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-6">
          {/* Temporary Password Display */}
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
            <div className="text-xs font-bold uppercase text-amber-900 tracking-widest">
              Temporary Password
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 px-3 py-2 rounded border border-amber-300 bg-white font-mono font-bold text-sm tracking-wide">
                {showPassword ? tempPassword : '•'.repeat(tempPassword.length)}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowPassword(!showPassword)}
                className="h-9 w-9 p-0"
                title={showPassword ? 'Hide' : 'Show'}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </Button>
              <Button
                size="sm"
                variant={copied ? 'default' : 'outline'}
                onClick={handleCopyPassword}
                disabled={isCopying}
                className="h-9 w-9 p-0"
                title={copied ? 'Copied' : 'Copy to clipboard'}
              >
                {isCopying ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-amber-800">
              Valid for <strong>24 hours</strong>. User must change password on first login.
            </p>
          </div>

          {/* User Info */}
          <div className="rounded-lg bg-muted p-3">
            <div className="text-xs font-bold uppercase text-muted-foreground mb-2 tracking-widest">
              User Details
            </div>
            <div className="text-sm font-bold text-foreground">{userName}</div>
            <div className="text-xs text-muted-foreground mt-1">{email}</div>
          </div>

          {/* Important Instructions */}
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-2">
            <div className="flex gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-bold text-red-900 mb-1">
                  ⚠️ Handle Password Securely
                </div>
                <ul className="text-xs text-red-900 space-y-1 list-disc list-inside">
                  <li>Share via <strong>your preferred secure channel</strong></li>
                  <li>Email, phone call, Telegram, or in-person</li>
                  <li>Do NOT share via unsecured channels</li>
                  <li>User must change password on first login</li>
                  <li>Password valid for <strong>24 hours</strong></li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            className="font-bold"
            type="button"
          >
            Close
          </Button>
          <Button
            onClick={handleCopyPassword}
            className="font-bold"
            type="button"
          >
            <Copy className="w-4 h-4 mr-2" /> Copy Password
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};


// Memoize to prevent unnecessary re-renders
export const TempPasswordModal = memo(TempPasswordModalComponent);
