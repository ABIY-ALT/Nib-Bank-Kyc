'use client';

import React, { useCallback, useEffect, useState, useRef } from 'react';
import { TransformWrapper, TransformComponent, useTransformEffect } from 'react-zoom-pan-pinch';
import { 
  X, 
  ZoomIn, 
  ZoomOut, 
  Maximize, 
  RotateCcw, 
  Download,
  Info,
  MousePointer2,
  Hand,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog';

interface ImageViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  src: string;
  title: string;
  description?: string;
  onPrevious?: () => void;
  onNext?: () => void;
  currentIndex?: number;
  total?: number;
}

const ShortcutHandler = ({ isOpen, zoomIn, onClose, onPrevious, onNext }: any) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === '/') {
        e.preventDefault();
        zoomIn(0.5);
      }
      if (e.key === 'ArrowRight' && onNext) {
        onNext();
      }
      if (e.key === 'ArrowLeft' && onPrevious) {
        onPrevious();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, zoomIn, onPrevious, onNext]);
  return null;
};

const ZoomControls = ({ zoomIn, zoomOut, resetTransform, zoomLevel }: any) => {
  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-slate-900/80 backdrop-blur-md border border-white/10 p-2 rounded-2xl shadow-2xl z-50 transition-all hover:bg-slate-900">
      <Button 
        variant="ghost" 
        size="icon" 
        className="text-white hover:bg-white/10 rounded-xl"
        onClick={() => zoomOut()}
        title="Zoom Out (-)"
      >
        <ZoomOut className="w-5 h-5" />
      </Button>
      
      <div className="px-3 min-w-[60px] text-center">
        <span className="text-white font-black text-xs tabular-nums tracking-tight">
          {Math.round(zoomLevel * 100)}%
        </span>
      </div>

      <Button 
        variant="ghost" 
        size="icon" 
        className="text-white hover:bg-white/10 rounded-xl"
        onClick={() => zoomIn()}
        title="Zoom In (+)"
      >
        <ZoomIn className="w-5 h-5" />
      </Button>

      <div className="w-px h-6 bg-white/10 mx-1" />

      <Button 
        variant="ghost" 
        size="icon" 
        className="text-white hover:bg-white/10 rounded-xl"
        onClick={() => resetTransform()}
        title="Reset Zoom (0)"
      >
        <RotateCcw className="w-5 h-5" />
      </Button>
    </div>
  );
};

export function ImageViewerModal({ 
  isOpen, 
  onClose, 
  src, 
  title, 
  description,
  onPrevious,
  onNext,
  currentIndex,
  total
}: ImageViewerModalProps) {
  const [isDragging, setIsActionDragging] = useState(false);
  const [zoomScale, setZoomScale] = useState(1);

  // Reset zoom when src changes (navigation)
  const transformRef = useRef<any>(null);
  useEffect(() => {
    if (transformRef.current) {
      transformRef.current.resetTransform();
    }
  }, [src]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleDownload = async () => {
    try {
      const response = await fetch(src);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title.replace(/\s+/g, '_')}_KYC_DOC.jpg`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[100vw] w-[100vw] h-[100vh] p-0 border-none bg-slate-950/95 backdrop-blur-xl gap-0 overflow-hidden shadow-none">
        <DialogHeader className="absolute top-0 left-0 right-0 p-6 flex flex-row items-center justify-between bg-gradient-to-b from-black/60 to-transparent z-50 pointer-events-none">
          <div className="pointer-events-auto">
            <DialogTitle className="text-white text-xl font-black flex items-center gap-3">
              <Maximize className="w-5 h-5 text-primary" />
              {title}
            </DialogTitle>
            {description && (
              <DialogDescription className="text-white/60 text-xs font-bold uppercase tracking-widest mt-1">
                {description}
              </DialogDescription>
            )}
          </div>
          
          <div className="flex items-center gap-2 pointer-events-auto">
            <Button 
              variant="ghost" 
              size="icon" 
              className="text-white hover:bg-white/10 rounded-full"
              onClick={handleDownload}
            >
              <Download className="w-5 h-5" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="text-white hover:bg-white/10 rounded-full h-10 w-10"
              onClick={onClose}
              title="Close (ESC)"
            >
              <X className="w-6 h-6" />
            </Button>
          </div>
        </DialogHeader>

        <div className="w-full h-full flex items-center justify-center relative group">
          <TransformWrapper
            initialScale={1}
            minScale={0.5}
            maxScale={8}
            centerOnInit
            wheel={{ step: 0.1 }}
            doubleClick={{ mode: 'toggle' }}
            onTransform={(ref: any) => setZoomScale(ref.state.scale)}
            onPanningStart={() => setIsActionDragging(true)}
            onPanningStop={() => setIsActionDragging(false)}
          >
            {({ zoomIn, zoomOut, resetTransform, ...rest }) => (
              <>
                <ZoomControls 
                  zoomIn={zoomIn} 
                  zoomOut={zoomOut} 
                  resetTransform={resetTransform} 
                  zoomLevel={zoomScale} 
                />

                {/* Keyboard event listener attachment via effect in render prop since we need zoomIn from the library context */}
                <ShortcutHandler 
                  isOpen={isOpen} 
                  zoomIn={zoomIn} 
                  onClose={onClose} 
                  onPrevious={onPrevious}
                  onNext={onNext}
                />
                
                <TransformComponent
                  wrapperClass="!w-screen !h-screen"
                  contentClass="!w-screen !h-screen flex items-center justify-center"
                >
                  <div 
                    className={cn(
                      "relative transition-all duration-200 cursor-grab active:cursor-grabbing",
                      isDragging && "cursor-grabbing"
                    )}
                  >
                    {/* High Resolution Image Loading */}
                    <img
                      src={src}
                      alt={title}
                      className="max-w-[90vw] max-h-[90vh] object-contain shadow-2xl ring-1 ring-white/10 rounded-sm select-none pointer-events-none"
                    />
                  </div>
                </TransformComponent>
              </>
            )}
          </TransformWrapper>

          {/* Navigation Overlay */}
          {total && total > 1 && (
            <>
              <div className="absolute left-8 top-1/2 -translate-y-1/2 z-50">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-16 w-16 rounded-full bg-black/20 backdrop-blur-md border border-white/10 text-white hover:bg-black/40 hover:scale-110 transition-all disabled:opacity-0"
                  onClick={onPrevious}
                  disabled={currentIndex === 0}
                  title="Previous (Arrow Left)"
                >
                  <ChevronLeft className="w-8 h-8" />
                </Button>
              </div>
              <div className="absolute right-8 top-1/2 -translate-y-1/2 z-50">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-16 w-16 rounded-full bg-black/20 backdrop-blur-md border border-white/10 text-white hover:bg-black/40 hover:scale-110 transition-all disabled:opacity-0"
                  onClick={onNext}
                  disabled={currentIndex === (total - 1)}
                  title="Next (Arrow Right)"
                >
                  <ChevronRight className="w-8 h-8" />
                </Button>
              </div>
              
              {/* Index Indicator */}
              <div className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-black/40 backdrop-blur-md px-4 py-1.5 rounded-full border border-white/10">
                <span className="text-white font-black text-[10px] uppercase tracking-widest">
                  {currentIndex !== undefined ? currentIndex + 1 : 0} / {total}
                </span>
              </div>
            </>
          )}

          {/* Interaction Hint */}
          <div className="absolute top-1/2 left-8 -translate-y-1/2 flex flex-col gap-4 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none hidden lg:flex">
             <div className="bg-black/40 backdrop-blur-md p-3 rounded-2xl border border-white/5 flex items-center gap-3">
                <div className="p-2 bg-primary/20 rounded-lg text-primary"><MousePointer2 className="w-4 h-4" /></div>
                <div className="text-[10px] font-black text-white uppercase tracking-widest">Scroll to Zoom</div>
             </div>
             <div className="bg-black/40 backdrop-blur-md p-3 rounded-2xl border border-white/5 flex items-center gap-3">
                <div className="p-2 bg-emerald-500/20 rounded-lg text-emerald-500"><Hand className="w-4 h-4" /></div>
                <div className="text-[10px] font-black text-white uppercase tracking-widest">Drag to Pan</div>
             </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
