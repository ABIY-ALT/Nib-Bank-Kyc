'use client';

import { useState, useCallback, useRef, memo } from 'react';
import { Copy, Check, Eye, EyeOff } from 'lucide-react';
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
  tempPassword: string;
  email: string;
}

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
  const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup timeout on unmount or when modal closes
  const cleanupCopyState = useCallback(() => {
    if (copyTimeoutRef.current) {
      clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = null;
    }
    setCopied(false);
  }, []);

  const handleCopyPassword = useCallback(() => {
    // Cleanup any existing timeout
    if (copyTimeoutRef.current) {
      clearTimeout(copyTimeoutRef.current);
    }

    try {
      // Try using modern Clipboard API first (more reliable)
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(tempPassword)
          .then(() => {
            setCopied(true);
            toast({
              title: 'Credential Copied',
              description: 'Temporary password copied to clipboard.',
            });
            // Schedule reset after 2 seconds
            copyTimeoutRef.current = setTimeout(() => {
              setCopied(false);
              copyTimeoutRef.current = null;
            }, 2000);
          })
          .catch((err) => {
            console.error('Clipboard API failed:', err);
            fallbackCopy();
          });
      } else {
        // Fallback to document.execCommand
        fallbackCopy();
      }
    } catch (error) {
      console.error('Copy error:', error);
      fallbackCopy();
    }
  }, [tempPassword, toast]);

  const fallbackCopy = useCallback(() => {
    try {
      const textArea = document.createElement('textarea');
      textArea.value = tempPassword;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      textArea.style.top = '-9999px';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      
      textArea.focus();
      textArea.select();
      
      const successful = document.execCommand('copy');
      
      // Small delay before removing to ensure copy completes
      requestAnimationFrame(() => {
        document.body.removeChild(textArea);
      });
      
      if (successful) {
        setCopied(true);
        toast({
          title: 'Credential Copied',
          description: 'Temporary password copied to clipboard.',
        });
        copyTimeoutRef.current = setTimeout(() => {
          setCopied(false);
          copyTimeoutRef.current = null;
        }, 2000);
      } else {
        toast({
          variant: 'destructive',
          title: 'Copy Failed',
          description: 'Could not copy password to clipboard.',
        });
      }
    } catch (error) {
      console.error('Fallback copy error:', error);
      toast({
        variant: 'destructive',
        title: 'Copy Failed',
        description: 'Could not copy password to clipboard.',
      });
    }
  }, [tempPassword, toast]);

  const handleShowPassword = useCallback(() => {
    setShowPassword(prev => !prev);
  }, []);

  const handleClose = useCallback(() => {
    cleanupCopyState();
    onOpenChange(false);
  }, [onOpenChange, cleanupCopyState]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent 
        className="max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-lg font-black">Temporary Credential Issued</span>
          </DialogTitle>
          <DialogDescription className="pt-2">
            A new temporary password has been generated for{' '}
            <span className="font-bold text-foreground">{userName}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-6">
          {/* User Info */}
          <div className="rounded-lg bg-muted p-4">
            <div className="text-xs font-bold uppercase text-muted-foreground mb-2 tracking-widest">
              Staff Identity
            </div>
            <div className="text-sm font-bold text-foreground">{userName}</div>
            <div className="text-xs text-muted-foreground mt-1">{email}</div>
          </div>

          {/* Password Display */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase text-muted-foreground tracking-widest">
                Temporary Password
              </label>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleShowPassword}
                className="h-8 px-2 text-xs font-bold"
                type="button"
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </Button>
            </div>

            <div className="relative flex items-center gap-2">
              <div className="flex-1 rounded-lg border-2 border-primary bg-primary/5 p-4 font-mono text-lg font-black tracking-widest text-primary select-all break-all">
                {showPassword ? tempPassword : '••••••••••••'}
              </div>
              <Button
                onClick={handleCopyPassword}
                type="button"
                className={`h-12 w-12 px-0 flex-shrink-0 transition-all ${
                  copied
                    ? 'bg-emerald-500 hover:bg-emerald-600'
                    : 'bg-primary hover:bg-primary/90'
                }`}
                title="Copy password"
              >
                {copied ? (
                  <Check className="w-5 h-5 text-white" />
                ) : (
                  <Copy className="w-5 h-5 text-white" />
                )}
              </Button>
            </div>
          </div>

          {/* Warnings */}
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-2">
            <div className="text-xs font-bold uppercase text-amber-900 tracking-widest">
              ⚠️ Important
            </div>
            <ul className="text-xs text-amber-900 font-medium space-y-1 list-disc list-inside">
              <li>Valid for the next login only.</li>
              <li>User must change password immediately upon first login.</li>
              <li>Share this credential securely with the staff member.</li>
            </ul>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
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
            className="font-bold gap-2"
            type="button"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4" /> Copied
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" /> Copy Password
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Memoize to prevent unnecessary re-renders
export const TempPasswordModal = memo(TempPasswordModalComponent);
