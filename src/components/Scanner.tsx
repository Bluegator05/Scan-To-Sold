import React, { useRef, useEffect, useState, useCallback } from 'react';
import { X, RefreshCw, ScanBarcode, Loader2, Camera, Volume2, VolumeX, Check, Trash2 } from 'lucide-react';
import { BrowserMultiFormatReader, BarcodeFormat, DecodeHintType } from '@zxing/library';

interface ScannerProps {
  onCapture: (imageData: string | string[], barcode?: string) => void;
  onClose: () => void;
  bulkSessionCount?: number;
  feedbackMessage?: string;
  singleCapture?: boolean;
}

const Scanner: React.FC<ScannerProps> = ({ onCapture, onClose, bulkSessionCount = 0, feedbackMessage, singleCapture = false }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);

  const [error, setError] = useState<string>('');
  const [detectedBarcode, setDetectedBarcode] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [isCapturing, setIsCapturing] = useState(false);
  const [autoScanEnabled, setAutoScanEnabled] = useState(false); // Default to Photo Mode (Manual)
  const [isMuted, setIsMuted] = useState(false);
  const [capturedImages, setCapturedImages] = useState<string[]>([]); // Batch buffer

  // Use Ref to lock capture logic and prevent effect cleanup cancellations
  const captureLock = useRef(false);

  // Sound effect ref
  const beepRef = useRef<HTMLAudioElement | null>(null);
  const shutterRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    beepRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
    shutterRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3'); // Camera shutter
  }, []);

  const playBeep = () => {
    if (!isMuted && beepRef.current) {
      beepRef.current.currentTime = 0;
      beepRef.current.volume = 0.5;
      beepRef.current.play().catch(e => console.log("Audio play failed", e));
    }
  };

  const playShutter = () => {
    if (!isMuted && shutterRef.current) {
      shutterRef.current.currentTime = 0;
      shutterRef.current.volume = 0.6;
      shutterRef.current.play().catch(() => { });
    }
  };

  const captureFrame = useCallback(() => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      // OPTIMIZATION: Aggressive resize for speed. 
      // 720px is optimal for Gemini Flash 2.5 vision tasks.
      const MAX_WIDTH = 720;
      let width = video.videoWidth;
      let height = video.videoHeight;

      if (width > MAX_WIDTH) {
        height = (height * MAX_WIDTH) / width;
        width = MAX_WIDTH;
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, width, height);
        // Reduce quality to 0.5 for fastest transmission speed. 
        // Visual fidelity remains high enough for AI identification.
        return canvas.toDataURL('image/jpeg', 0.5);
      }
    }
    return null;
  }, []);

  const handleBarcodeDetected = useCallback((code: string) => {
    if (captureLock.current) return;
    if (!autoScanEnabled) return; // IGNORE barcodes if toggle is off

    setDetectedBarcode(prev => {
      if (prev === code) return prev;

      if (navigator.vibrate) navigator.vibrate(50);
      playBeep();
      return code;
    });
  }, [autoScanEnabled, isMuted]);

  // Auto-capture effect (Legacy / Single Shot)
  useEffect(() => {
    if (detectedBarcode && !captureLock.current && autoScanEnabled) {
      captureLock.current = true;
      setIsCapturing(true);

      // Short delay to ensure focus/frame is good, but faster than before
      const timer = setTimeout(() => {
        const imageData = captureFrame();
        if (imageData) {
          if (videoRef.current) videoRef.current.pause();
          onCapture(imageData, detectedBarcode);
        } else {
          captureLock.current = false;
          setIsCapturing(false);
        }
      }, 50);

      return () => clearTimeout(timer);
    }
  }, [detectedBarcode, captureFrame, onCapture, autoScanEnabled]);

  const startScanner = useCallback(async () => {
    try {
      setInitializing(true);
      setError('');

      const hints = new Map();
      const formats = [
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.ITF
      ];
      hints.set(DecodeHintType.POSSIBLE_FORMATS, formats);
      hints.set(DecodeHintType.TRY_HARDER, false);

      const reader = new BrowserMultiFormatReader(hints);
      codeReaderRef.current = reader;

      const videoConstraints = {
        facingMode: 'environment',
        width: { min: 640, ideal: 1280, max: 1920 },
        height: { min: 480, ideal: 720, max: 1080 },
        focusMode: 'continuous'
      };

      await reader.decodeFromConstraints(
        { video: videoConstraints },
        videoRef.current!,
        (result, err) => {
          if (result) {
            handleBarcodeDetected(result.getText());
          }
        }
      );

      setInitializing(false);

    } catch (err: any) {
      console.error("Scanner Error:", err);
      // Detailed error for debugging
      const errorMessage = err.name === 'NotAllowedError'
        ? "Camera permission denied. Please allow access in settings."
        : `Camera access failed: ${err.message || 'Unknown error'}`;
      setError(errorMessage);
      setInitializing(false);
    }
  }, [handleBarcodeDetected]);

  useEffect(() => {
    startScanner();
    return () => {
      if (codeReaderRef.current) {
        codeReaderRef.current.reset();
        codeReaderRef.current = null;
      }
    };
  }, [startScanner]);

  // Restart scanner if toggled back to auto to ensure listeners are active
  useEffect(() => {
    if (autoScanEnabled) {
      setDetectedBarcode(null);
      captureLock.current = false;
    }
  }, [autoScanEnabled]);

  const handleManualCapture = () => {
    const imageData = captureFrame();
    if (imageData) {
      playShutter();
      if (navigator.vibrate) navigator.vibrate(20);

      // If Single Capture Mode (Scout Mode), return immediately
      if (singleCapture) {
        setIsCapturing(true);
        onCapture(imageData, undefined);
        return;
      }

      // Add to batch buffer
      setCapturedImages(prev => [...prev, imageData]);

      // Visual feedback (flash)
      setIsCapturing(true);
      setTimeout(() => setIsCapturing(false), 200);
    }
  };

  const handleDone = () => {
    if (capturedImages.length > 0) {
      onCapture(capturedImages, undefined);
    } else {
      onClose();
    }
  };

  const removeImage = (index: number) => {
    setCapturedImages(prev => prev.filter((_, i) => i !== index));
  };


  return (
    <div className="fixed inset-0 bg-black z-[10000] overflow-hidden flex flex-col">

      {/* Video Layer */}
      <div className="absolute inset-0 z-0 bg-black">
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          muted
          playsInline
        />
      </div>

      {/* Flash Overlay */}
      <div className={`absolute inset-0 z-10 bg-white pointer-events-none transition-opacity duration-200 ${isCapturing ? 'opacity-50' : 'opacity-0'}`} />

      {/* Header Layer */}
      <div className="absolute top-0 left-0 right-0 p-6 pt-[calc(env(safe-area-inset-top)+1.5rem)] flex justify-between items-start z-20 bg-gradient-to-b from-black/80 via-black/40 to-transparent pb-20">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 mb-1">
            <div className={`w-2 h-2 rounded-full ${detectedBarcode ? 'bg-neon-green animate-ping' : (autoScanEnabled ? 'bg-neon-green' : 'bg-yellow-500')}`}></div>
            <h2 className="text-white font-mono font-bold text-lg drop-shadow-md">
              {detectedBarcode ? 'TARGET LOCKED' : (autoScanEnabled ? 'SCANNING UPC...' : 'PHOTO MODE')}
            </h2>
          </div>
          {bulkSessionCount > 0 && (
            <div className="mt-2 bg-purple-500/20 border border-purple-500/50 backdrop-blur-md px-3 py-1 rounded-full flex items-center gap-2">
              <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse"></div>
              <span className="text-purple-200 font-mono text-xs font-bold">{bulkSessionCount} ITEMS SCANNED</span>
            </div>
          )}

          {/* Toggle Switch */}
          <button
            onClick={() => setAutoScanEnabled(!autoScanEnabled)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full border backdrop-blur-md transition-all text-xs font-bold uppercase tracking-wider w-fit ${autoScanEnabled ? 'bg-neon-green/20 border-neon-green text-neon-green' : 'bg-slate-800/50 border-slate-500 text-slate-300'}`}
          >
            {autoScanEnabled ? <ScanBarcode size={14} /> : <Camera size={14} />}
            {autoScanEnabled ? 'Auto Scan ON' : 'Auto Scan OFF'}
          </button>
        </div>

        <div className="flex gap-3">
          {/* Mute Toggle */}
          {autoScanEnabled && (
            <button onClick={() => setIsMuted(!isMuted)} className="p-3 bg-black/40 backdrop-blur-md rounded-full text-white hover:bg-slate-700 border border-white/10">
              {isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}
            </button>
          )}
          {!singleCapture && (
            <button
              onClick={handleDone}
              className={`flex items-center gap-2 px-4 py-3 backdrop-blur-md rounded-full text-white hover:bg-slate-700 border border-white/10 transition-all ${capturedImages.length > 0 ? 'bg-neon-green text-slate-950 font-black' : 'bg-black/40'}`}
            >
              {capturedImages.length > 0 ? (
                <>
                  <Check size={20} className="stroke-[3]" />
                  <span>DONE ({capturedImages.length})</span>
                </>
              ) : <X size={24} />}
            </button>
          )}
          {singleCapture && (
            <button
              onClick={onClose}
              className="p-3 bg-black/40 backdrop-blur-md rounded-full text-white hover:bg-slate-700 border border-white/10"
            >
              <X size={24} />
            </button>
          )}
        </div>
      </div>

      {/* Error Layer */}
      {error && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="text-red-500 p-6 text-center">
            <p className="mb-4 font-bold">{error}</p>
            <button
              onClick={startScanner}
              className="px-6 py-3 bg-slate-800 rounded-xl text-white flex items-center gap-2 mx-auto border border-slate-700"
            >
              <RefreshCw size={16} /> Retry Camera
            </button>
          </div>
        </div>
      )}

      {/* Loading Layer */}
      {initializing && !error && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black">
          <Loader2 className="text-neon-green animate-spin mb-4" size={48} />
          <span className="text-slate-400 font-mono text-sm tracking-wider animate-pulse">INITIALIZING OPTICS...</span>
        </div>
      )}

      {/* Viewfinder Overlay - Only show in Auto Scan mode */}
      {autoScanEnabled && (
        <div className={`absolute inset-0 z-10 pointer-events-none flex flex-col items-center justify-center transition-opacity duration-300`}>
          <div className={`relative w-72 h-48 rounded-2xl border-[3px] transition-all duration-200 ${detectedBarcode ? 'border-neon-green scale-105 shadow-[0_0_50px_rgba(57,255,20,0.6)] bg-neon-green/10' : 'border-white/50'}`}>
            {/* Corners... */}
            <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-white -mt-1 -ml-1 rounded-tl-sm"></div>
            <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-white -mt-1 -mr-1 rounded-tr-sm"></div>
            <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-white -mb-1 -ml-1 rounded-bl-sm"></div>
            <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-white -mb-1 -mr-1 rounded-br-sm"></div>

            {!detectedBarcode && !initializing && (
              <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-red-500 shadow-[0_0_10px_#ef4444] animate-[scan_1.5s_ease-in-out_infinite] opacity-80"></div>
            )}

            {detectedBarcode && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-neon-green animate-in zoom-in duration-200">
                <ScanBarcode size={48} className="drop-shadow-lg mb-2" />
                <span className="bg-black/80 text-neon-green border border-neon-green/50 font-mono font-bold px-3 py-1 rounded text-sm backdrop-blur-md shadow-xl">
                  {detectedBarcode}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Thumbnail Strip (Bottom) */}
      {!autoScanEnabled && !singleCapture && capturedImages.length > 0 && (
        <div className="absolute bottom-32 left-0 right-0 z-20 px-6">
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide snap-x">
            {capturedImages.map((img, idx) => (
              <div key={idx} className="relative flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-white/30 snap-start animate-in zoom-in duration-200">
                <img src={img} className="w-full h-full object-cover" alt={`Capture ${idx}`} />
                <button
                  onClick={(e) => { e.stopPropagation(); removeImage(idx); }}
                  className="absolute top-0 right-0 bg-black/50 p-1 text-white hover:bg-red-500/80 transition-colors"
                >
                  <X size={12} />
                </button>
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-[10px] text-white text-center font-mono">
                  #{idx + 1}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Manual Capture Button or Gallery Link */}
      <div className="absolute bottom-0 left-0 right-0 p-8 pb-12 flex justify-center items-center z-20 bg-gradient-to-t from-black/90 via-black/50 to-transparent pt-24">
        <div className="relative">
          {/* Shutter Button */}
          <button
            onClick={handleManualCapture}
            className={`w-20 h-20 rounded-full border-4 flex items-center justify-center active:scale-95 transition-all shadow-2xl relative
                ${detectedBarcode
                ? 'border-neon-green bg-white/10 shadow-[0_0_30px_rgba(57,255,20,0.5)]'
                : (autoScanEnabled ? 'border-white bg-white/10 hover:bg-white/20' : 'border-yellow-400 bg-yellow-400/10 hover:bg-yellow-400/20')
              }
            `}
          >
            <div className={`w-16 h-16 rounded-full transition-colors ${detectedBarcode ? 'bg-neon-green' : (autoScanEnabled ? 'bg-white' : 'bg-yellow-400')}`}></div>
          </button>

          {/* Counter Badge */}
          {!autoScanEnabled && !singleCapture && capturedImages.length > 0 && (
            <div className="absolute -top-2 -right-2 bg-neon-green text-black font-black w-8 h-8 flex items-center justify-center rounded-full border-2 border-black z-30 animate-in zoom-in">
              {capturedImages.length}
            </div>
          )}
        </div>
      </div>

      {/* Feedback Toast */}
      {feedbackMessage && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[60] animate-in zoom-in fade-in duration-300">
          <div className="bg-black/80 backdrop-blur-md text-white px-6 py-3 rounded-full border border-white/20 shadow-2xl flex items-center gap-3">
            <div className="w-2 h-2 bg-neon-green rounded-full animate-pulse"></div>
            <span className="font-bold font-mono tracking-wider">{feedbackMessage}</span>
          </div>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />

      <style>{`
        @keyframes scan {
          0%, 100% { transform: translateY(-300%); opacity: 0; }
          50% { opacity: 1; }
          100% { transform: translateY(300%); opacity: 0; }
        }
        .scrollbar-hide::-webkit-scrollbar {
            display: none;
        }
      `}</style>
    </div>
  );
};

export default Scanner;
