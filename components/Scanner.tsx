
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { X, RefreshCw, Zap, ScanBarcode } from 'lucide-react';
import { BrowserMultiFormatReader, BarcodeFormat, DecodeHintType } from '@zxing/library';

interface ScannerProps {
  onCapture: (imageData: string, barcode?: string) => void;
  onClose: () => void;
}

const Scanner: React.FC<ScannerProps> = ({ onCapture, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  
  const [error, setError] = useState<string>('');
  const [detectedBarcode, setDetectedBarcode] = useState<string | null>(null);
  const [isStreamReady, setIsStreamReady] = useState(false);

  // Cleanup function
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (codeReaderRef.current) {
      codeReaderRef.current.reset();
      codeReaderRef.current = null;
    }
    setIsStreamReady(false);
  }, []);

  const initializeScanner = useCallback(async () => {
    if (!videoRef.current || !streamRef.current) return;

    try {
      // Optimize for Retail Barcodes (UPC/EAN) to fix "failing to scan"
      // This reduces the processing load and false negatives significantly.
      const hints = new Map();
      const formats = [
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39
      ];
      hints.set(DecodeHintType.POSSIBLE_FORMATS, formats);
      hints.set(DecodeHintType.TRY_HARDER, true);

      const reader = new BrowserMultiFormatReader(hints);
      codeReaderRef.current = reader;

      // Start decoding from the stream directly
      // We use the video element that is already playing the stream
      reader.decodeFromStream(streamRef.current, videoRef.current, (result, err) => {
        if (result) {
          const text = result.getText();
          setDetectedBarcode(prev => {
            if (prev !== text) {
              if (navigator.vibrate) navigator.vibrate(200);
              return text;
            }
            return prev;
          });
        }
      });
    } catch (err) {
      console.error("Scanner Init Error:", err);
    }
  }, []);

  const startCamera = useCallback(async () => {
    try {
      stopCamera(); // Ensure cleanup first

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      });
      
      streamRef.current = mediaStream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        // We wait for onCanPlay to init scanner to avoid race conditions
      }

    } catch (err) {
      console.error("Camera Error:", err);
      setError("Unable to access camera. Please check permissions.");
    }
  }, [stopCamera]);

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  // Trigger scanner init once video is actually playing
  const handleVideoCanPlay = () => {
    if (!isStreamReady) {
      setIsStreamReady(true);
      initializeScanner();
    }
  };

  const handleCapture = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = canvas.toDataURL('image/jpeg', 0.9);
        
        stopCamera(); 
        onCapture(imageData, detectedBarcode || undefined);
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Header Overlay */}
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-10 bg-gradient-to-b from-black/80 to-transparent">
        <h2 className="text-neon-green font-mono font-bold text-lg flex items-center gap-2">
          <Zap size={20} /> SCOUT MODE
        </h2>
        <button onClick={onClose} className="p-2 bg-slate-800/50 rounded-full text-white hover:bg-slate-700">
          <X size={24} />
        </button>
      </div>

      {/* Camera View */}
      <div className="flex-1 relative bg-slate-900 flex items-center justify-center overflow-hidden">
        {error ? (
          <div className="text-red-500 p-6 text-center">
            <p>{error}</p>
            <button 
              onClick={startCamera}
              className="mt-4 px-4 py-2 bg-slate-800 rounded text-white flex items-center gap-2 mx-auto"
            >
              <RefreshCw size={16} /> Retry
            </button>
          </div>
        ) : (
          <>
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted
              onCanPlay={handleVideoCanPlay}
              className="w-full h-full object-cover"
            />
            
            {/* Viewfinder Overlay */}
            <div className={`absolute inset-0 pointer-events-none flex items-center justify-center transition-colors duration-300 ${detectedBarcode ? 'bg-neon-green/10' : ''}`}>
              <div className={`w-72 h-48 border-2 rounded-lg relative transition-all duration-300 ${detectedBarcode ? 'border-neon-green shadow-[0_0_30px_rgba(57,255,20,0.5)]' : 'border-white/50'}`}>
                {/* Corners */}
                <div className={`absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 -mt-1 -ml-1 ${detectedBarcode ? 'border-neon-green' : 'border-white'}`}></div>
                <div className={`absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 -mt-1 -mr-1 ${detectedBarcode ? 'border-neon-green' : 'border-white'}`}></div>
                <div className={`absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 -mb-1 -ml-1 ${detectedBarcode ? 'border-neon-green' : 'border-white'}`}></div>
                <div className={`absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 -mb-1 -mr-1 ${detectedBarcode ? 'border-neon-green' : 'border-white'}`}></div>
                
                {/* Scan Line Animation */}
                {!detectedBarcode && (
                  <div className="absolute top-0 left-0 w-full h-1 bg-neon-green/50 shadow-[0_0_10px_#39ff14] animate-[scan_2s_ease-in-out_infinite]"></div>
                )}

                {/* Success Indicator */}
                {detectedBarcode && (
                   <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm">
                      <ScanBarcode size={48} className="text-neon-green mb-2" />
                      <span className="text-neon-green font-mono font-bold text-xl tracking-widest drop-shadow-md">{detectedBarcode}</span>
                      <span className="text-white text-xs uppercase tracking-wider mt-1">Barcode Locked</span>
                   </div>
                )}
              </div>
            </div>
            
            {/* Status Text */}
            {!detectedBarcode && isStreamReady && (
              <div className="absolute bottom-32 text-center w-full px-4 pointer-events-none">
                <p className="text-white/80 text-sm font-mono bg-black/50 inline-block px-3 py-1 rounded">
                  Point at UPC/EAN Barcode
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Controls */}
      <div className="bg-slate-900 p-8 pb-12 flex justify-center items-center relative">
        {/* Barcode Status Badge */}
        {detectedBarcode && (
          <div className="absolute top-[-20px] bg-neon-green text-slate-950 px-4 py-1 rounded-full text-xs font-bold font-mono shadow-lg animate-bounce">
             READY TO CAPTURE
          </div>
        )}

        <button 
          onClick={handleCapture}
          className={`w-20 h-20 rounded-full border-4 flex items-center justify-center active:scale-95 transition-all
            ${detectedBarcode ? 'border-neon-green bg-slate-800 shadow-[0_0_20px_rgba(57,255,20,0.4)]' : 'border-white bg-slate-800 hover:bg-slate-700'}
          `}
        >
          <div className={`w-16 h-16 rounded-full transition-colors ${detectedBarcode ? 'bg-neon-green' : 'bg-white'}`}></div>
        </button>
      </div>
      
      {/* Hidden Canvas for Capture */}
      <canvas ref={canvasRef} className="hidden" />
      
      <style>{`
        @keyframes scan {
          0% { top: 0%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
      `}</style>
    </div>
  );
};

export default Scanner;
