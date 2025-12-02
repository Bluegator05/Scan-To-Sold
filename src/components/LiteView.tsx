import React, { useState, useRef } from 'react';
import Scanner from './Scanner';
import { analyzeItemImage, analyzeItemText } from '../services/geminiService';
import { compressImage } from '../services/imageService';
import { ArrowLeft, Search, ExternalLink, Loader2, Camera, ScanBarcode, ShoppingBag, Globe } from 'lucide-react';

interface LiteViewProps {
    onExit: () => void;
}

const LiteView: React.FC<LiteViewProps> = ({ onExit }) => {
    const [isScanning, setIsScanning] = useState(true);
    const [analyzing, setAnalyzing] = useState(false);
    const [result, setResult] = useState<{ title: string, price?: number, image: string } | null>(null);
    const [error, setError] = useState<string>("");

    const handleCapture = async (imageData: string, barcode?: string) => {
        setIsScanning(false);
        setAnalyzing(true);
        setError("");

        try {
            const compressed = await compressImage(imageData);
            let analysis;

            if (barcode) {
                analysis = await analyzeItemText(barcode);
            } else {
                analysis = await analyzeItemImage(compressed, undefined, false);
            }

            setResult({
                title: analysis.itemTitle,
                price: analysis.estimatedSoldPrice,
                image: compressed
            });
        } catch (e: any) {
            setError("Analysis failed. Please try again.");
            console.error(e);
        } finally {
            setAnalyzing(false);
        }
    };

    const openLink = (url: string) => {
        window.open(url, '_blank');
    };

    if (isScanning) {
        return (
            <div className="fixed inset-0 bg-black z-50">
                <Scanner onCapture={handleCapture} onClose={onExit} />
                <button
                    onClick={onExit}
                    className="absolute top-6 left-6 z-[60] p-2 bg-black/40 backdrop-blur-md rounded-full text-white hover:bg-slate-800 transition-colors border border-white/10"
                >
                    <ArrowLeft size={24} />
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-950 text-white flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-10 flex items-center justify-between pt-safe">
                <button onClick={() => setIsScanning(true)} className="p-2 -ml-2 text-slate-400 hover:text-white">
                    <ArrowLeft size={24} />
                </button>
                <h1 className="font-bold text-lg">Lite Mode</h1>
                <div className="w-8"></div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
                {analyzing ? (
                    <div className="flex flex-col items-center justify-center h-64 space-y-4">
                        <Loader2 className="w-12 h-12 text-neon-green animate-spin" />
                        <p className="text-slate-400 font-mono animate-pulse">ANALYZING ITEM...</p>
                    </div>
                ) : result ? (
                    <div className="space-y-8 animate-in slide-in-from-bottom-4 fade-in duration-500">
                        {/* Result Card */}
                        <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
                            <div className="aspect-square w-full relative bg-black">
                                <img src={result.image} alt="Scanned" className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent"></div>
                                <div className="absolute bottom-0 left-0 right-0 p-6">
                                    <h2 className="text-2xl font-black text-white leading-tight mb-2">{result.title}</h2>
                                    {result.price && result.price > 0 && (
                                        <div className="inline-flex items-center gap-2 px-3 py-1 bg-neon-green/20 border border-neon-green/30 rounded-full text-neon-green font-bold font-mono">
                                            ${result.price.toFixed(2)} Est.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Sourcing Tools */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-mono uppercase text-slate-500 font-bold ml-1">Sourcing Tools</h3>

                            <div className="grid grid-cols-1 gap-3">
                                <button
                                    onClick={() => openLink(`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(result.title)}&_sacat=0&LH_ItemCondition=3000`)}
                                    className="flex items-center justify-between p-4 bg-slate-900 border border-slate-800 rounded-xl hover:border-blue-500 hover:bg-slate-800 transition-all group"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 bg-blue-600/20 rounded-lg flex items-center justify-center text-blue-500 group-hover:scale-110 transition-transform">
                                            <ShoppingBag size={20} />
                                        </div>
                                        <div className="text-left">
                                            <div className="font-bold text-white">eBay Active</div>
                                            <div className="text-xs text-slate-400">Check current competition</div>
                                        </div>
                                    </div>
                                    <ExternalLink size={16} className="text-slate-600 group-hover:text-white" />
                                </button>

                                <button
                                    onClick={() => openLink(`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(result.title)}&_sacat=0&LH_Sold=1&LH_Complete=1&LH_ItemCondition=3000`)}
                                    className="flex items-center justify-between p-4 bg-slate-900 border border-slate-800 rounded-xl hover:border-neon-green hover:bg-slate-800 transition-all group"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 bg-neon-green/20 rounded-lg flex items-center justify-center text-neon-green group-hover:scale-110 transition-transform">
                                            <ShoppingBag size={20} />
                                        </div>
                                        <div className="text-left">
                                            <div className="font-bold text-white">eBay Sold</div>
                                            <div className="text-xs text-slate-400">Verify sell-through rate</div>
                                        </div>
                                    </div>
                                    <ExternalLink size={16} className="text-slate-600 group-hover:text-white" />
                                </button>

                                <button
                                    onClick={() => openLink(`https://www.google.com/search?q=${encodeURIComponent(result.title)}`)}
                                    // Better fallback for web: Google Image Search query
                                    // Actually, let's use Google Search for the title
                                    className="flex items-center justify-between p-4 bg-slate-900 border border-slate-800 rounded-xl hover:border-yellow-500 hover:bg-slate-800 transition-all group"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 bg-yellow-500/20 rounded-lg flex items-center justify-center text-yellow-500 group-hover:scale-110 transition-transform">
                                            <Search size={20} />
                                        </div>
                                        <div className="text-left">
                                            <div className="font-bold text-white">Google Search</div>
                                            <div className="text-xs text-slate-400">Research item details</div>
                                        </div>
                                    </div>
                                    <ExternalLink size={16} className="text-slate-600 group-hover:text-white" />
                                </button>

                                <button
                                    onClick={() => openLink(`https://www.facebook.com/marketplace/search/?query=${encodeURIComponent(result.title)}`)}
                                    className="flex items-center justify-between p-4 bg-slate-900 border border-slate-800 rounded-xl hover:border-blue-400 hover:bg-slate-800 transition-all group"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 bg-blue-400/20 rounded-lg flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform">
                                            <Globe size={20} />
                                        </div>
                                        <div className="text-left">
                                            <div className="font-bold text-white">FB Marketplace</div>
                                            <div className="text-xs text-slate-400">Check local listings</div>
                                        </div>
                                    </div>
                                    <ExternalLink size={16} className="text-slate-600 group-hover:text-white" />
                                </button>
                            </div>
                        </div>

                        <button
                            onClick={() => setIsScanning(true)}
                            className="w-full py-4 bg-neon-green text-slate-950 font-black rounded-xl shadow-lg shadow-neon-green/20 hover:scale-[1.02] transition-transform flex items-center justify-center gap-2"
                        >
                            <Camera size={20} /> SCAN NEXT ITEM
                        </button>
                    </div>
                ) : (
                    <div className="text-center text-slate-500 mt-20">
                        {error ? (
                            <div className="text-red-400 mb-4">{error}</div>
                        ) : (
                            <p>Ready to scan.</p>
                        )}
                        <button onClick={() => setIsScanning(true)} className="px-6 py-3 bg-slate-800 rounded-full text-white font-bold">
                            Open Camera
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default LiteView;
