import React, { useState } from 'react';
import { RefreshCw, Zap, Search } from 'lucide-react';
import CameraCapture from './components/CameraCapture';
import ResultsDashboard from './components/ResultsDashboard';
import { identifyItem, fetchMarketComps } from './services/geminiService';
import { ItemAnalysis, MarketAnalysis } from './types';

function App() {
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'capture' | 'analyzing' | 'results'>('capture');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ItemAnalysis | null>(null);
  const [marketAnalysis, setMarketAnalysis] = useState<MarketAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCapture = async (base64Image: string) => {
    setCapturedImage(base64Image);
    setStep('analyzing');
    setLoading(true);
    setError(null);

    try {
      // Parallel execution: Identify Item then search for comps
      // Note: We need the item keywords to search comps, so it's serial-ish
      
      // 1. Identify
      const itemAnalysis = await identifyItem(base64Image);
      setAnalysis(itemAnalysis);

      // 2. Market Search (Non-blocking for UI update, but good to have)
      const marketResult = await fetchMarketComps(itemAnalysis.keywords);
      setMarketAnalysis(marketResult);

      setStep('results');
    } catch (err: any) {
      console.error(err);
      setError("Failed to analyze image. Please try again with a clearer photo.");
      setStep('capture');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setStep('capture');
    setCapturedImage(null);
    setAnalysis(null);
    setMarketAnalysis(null);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-black text-[#e7e9ea] pb-10">
      
      {/* App Header */}
      <header className="sticky top-0 z-10 bg-black/80 backdrop-blur-md border-b border-[#2f3336] px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="text-[#e7e9ea]">
              <Zap size={24} fill="currentColor" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-[#e7e9ea]">
              Resell<span className="text-[#1d9bf0]">AI</span>
            </h1>
          </div>
          {step === 'results' && (
            <button 
                onClick={handleReset}
                className="p-2 text-[#71767b] hover:text-[#1d9bf0] hover:bg-[#1d9bf0]/10 rounded-full transition-all"
            >
                <RefreshCw size={20} />
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-2xl mx-auto px-4 pt-6">
        
        {step === 'capture' && (
          <div className="flex flex-col h-[calc(100vh-100px)] justify-center animate-fade-in">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold mb-3 text-[#e7e9ea]">What are we selling?</h2>
              <p className="text-[#71767b]">
                Snap a photo. We'll find the comps, draft the listing, and get you paid.
              </p>
            </div>
            
            <div className="bg-black">
                <CameraCapture onCapture={handleCapture} />
            </div>

            <div className="mt-12 grid grid-cols-3 gap-4 text-center">
                <div className="flex flex-col items-center gap-2">
                    <div className="w-10 h-10 border border-[#2f3336] text-[#1d9bf0] rounded-full flex items-center justify-center">
                        <Search size={20} />
                    </div>
                    <span className="text-xs font-medium text-[#71767b]">Visual Search</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                    <div className="w-10 h-10 border border-[#2f3336] text-[#00ba7c] rounded-full flex items-center justify-center">
                        <RefreshCw size={20} />
                    </div>
                    <span className="text-xs font-medium text-[#71767b]">Live Comps</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                    <div className="w-10 h-10 border border-[#2f3336] text-[#f91880] rounded-full flex items-center justify-center">
                        <Zap size={20} />
                    </div>
                    <span className="text-xs font-medium text-[#71767b]">Auto Draft</span>
                </div>
            </div>

            {error && (
               <div className="mt-6 p-4 bg-[#f4212e]/10 border border-[#f4212e]/20 text-[#f4212e] rounded-xl text-sm text-center">
                 {error}
               </div>
            )}
          </div>
        )}

        {step === 'analyzing' && (
          <div className="flex flex-col items-center justify-center h-[60vh] text-center px-6">
            <div className="relative w-24 h-24 mb-8">
                {/* Pulse Effect */}
                <div className="absolute inset-0 bg-[#1d9bf0] rounded-full opacity-20 animate-ping"></div>
                <div className="relative z-10 w-24 h-24 bg-black rounded-full p-1 border-2 border-[#1d9bf0]">
                    <img 
                        src={`data:image/jpeg;base64,${capturedImage}`} 
                        alt="Analyzing" 
                        className="w-full h-full object-cover rounded-full"
                    />
                </div>
            </div>
            
            <h3 className="text-2xl font-bold text-[#e7e9ea] mb-2">Analyzing Item...</h3>
            <p className="text-[#71767b] max-w-xs mx-auto mb-8">
                Identifying brand, model, and scanning 
                eBay for recent sold listings.
            </p>

            <div className="flex gap-2 justify-center">
                <div className="w-2 h-2 bg-[#1d9bf0] rounded-full animate-bounce" style={{ animationDelay: '0s'}}></div>
                <div className="w-2 h-2 bg-[#1d9bf0] rounded-full animate-bounce" style={{ animationDelay: '0.1s'}}></div>
                <div className="w-2 h-2 bg-[#1d9bf0] rounded-full animate-bounce" style={{ animationDelay: '0.2s'}}></div>
            </div>
          </div>
        )}

        {step === 'results' && analysis && marketAnalysis && (
          <ResultsDashboard 
            analysis={analysis} 
            marketAnalysis={marketAnalysis}
            onReset={handleReset} 
          />
        )}
      </main>
    </div>
  );
}

export default App;