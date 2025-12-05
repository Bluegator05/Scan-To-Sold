
import React from 'react';
import { X, Eye, ExternalLink, ShieldCheck, Truck, Star } from 'lucide-react';
import { InventoryItem } from '../types';

interface PreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    item: InventoryItem;
    onImageClick?: (index: number) => void;
}

const PreviewModal: React.FC<PreviewModalProps> = ({ isOpen, onClose, item, onImageClick }) => {
    if (!isOpen) return null;

    const allImages = [item.imageUrl, ...(item.additionalImages || [])].filter(Boolean);
    const specifics = item.itemSpecifics || {};

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-900 w-full max-w-4xl rounded-xl shadow-2xl flex flex-col h-[90vh] overflow-hidden">

                {/* Mock Browser Header */}
                <div className="bg-gray-100 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 p-3 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-2">
                        <div className="flex gap-1.5">
                            <div className="w-3 h-3 rounded-full bg-red-400"></div>
                            <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                            <div className="w-3 h-3 rounded-full bg-green-400"></div>
                        </div>
                        <div className="bg-white dark:bg-slate-950 px-3 py-1 rounded text-xs text-slate-500 font-mono flex items-center gap-2 border border-gray-200 dark:border-slate-700 w-64">
                            <span className="text-green-600">🔒</span> ebay.com/itm/preview...
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-full transition-colors">
                        <X size={20} className="text-slate-500" />
                    </button>
                </div>

                {/* Listing Body */}
                <div className="flex-1 overflow-y-auto bg-white text-slate-900 p-6 md:p-8">
                    <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">

                        {/* Left: Gallery */}
                        <div className="space-y-4">
                            <div className="aspect-square bg-gray-100 border border-gray-300 rounded-lg overflow-hidden flex items-center justify-center cursor-pointer hover:opacity-90 transition-opacity" onClick={() => onImageClick?.(0)}>
                                {allImages.length > 0 ? (
                                    <img src={allImages[0]} alt="Main" className="max-w-full max-h-full object-contain" />
                                ) : (
                                    <div className="text-gray-400">No Image</div>
                                )}
                            </div>
                            <div className="flex gap-2 overflow-x-auto pb-2">
                                {allImages.map((img, idx) => (
                                    <div key={idx} onClick={() => onImageClick?.(idx)} className={`w-16 h-16 border rounded cursor-pointer overflow-hidden shrink-0 hover:opacity-80 transition-opacity ${idx === 0 ? 'border-blue-500 border-2' : 'border-gray-300'}`}>
                                        <img src={img} className="w-full h-full object-cover" />
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Right: Info */}
                        <div className="space-y-4">
                            <h1 className="text-xl md:text-2xl font-bold text-gray-900 leading-snug">
                                {item.title}
                            </h1>

                            <div className="flex items-center gap-4 border-b border-gray-200 pb-4">
                                <div className="text-sm">
                                    <span className="font-bold">Condition: </span>
                                    <span>{item.itemSpecifics?.Condition || (item.conditionNotes ? "Pre-owned" : "Used")}</span>
                                </div>
                            </div>

                            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-2">
                                <div className="flex items-baseline gap-2">
                                    <span className="text-sm font-bold">Price:</span>
                                    <span className="text-2xl font-bold text-gray-900">US ${item.calculation.soldPrice.toFixed(2)}</span>
                                </div>
                                <div className="flex items-baseline gap-2 text-sm text-gray-600">
                                    <span className="font-bold">Shipping:</span>
                                    <span>US ${item.calculation.shippingCost.toFixed(2)} Standard Shipping</span>
                                </div>

                                <div className="pt-4">
                                    <button className="w-full py-3 bg-blue-600 text-white font-bold rounded-full hover:bg-blue-700 transition-colors">
                                        Buy It Now
                                    </button>
                                    <div className="flex gap-2 mt-2">
                                        <button className="flex-1 py-3 bg-blue-100 text-blue-700 font-bold rounded-full hover:bg-blue-200 transition-colors">
                                            Add to cart
                                        </button>
                                        <button className="flex-1 py-3 bg-white border border-blue-600 text-blue-700 font-bold rounded-full hover:bg-blue-50 transition-colors flex items-center justify-center gap-1">
                                            <span className="text-lg">♡</span> Add to Watchlist
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 text-sm mt-4">
                                <div className="flex items-start gap-2">
                                    <Truck size={16} className="mt-0.5 text-gray-500" />
                                    <div>
                                        <div className="font-bold">Shipping</div>
                                        <div className="text-gray-500">Located in: Austin, Texas</div>
                                    </div>
                                </div>
                                <div className="flex items-start gap-2">
                                    <ShieldCheck size={16} className="mt-0.5 text-gray-500" />
                                    <div>
                                        <div className="font-bold">Returns</div>
                                        <div className="text-gray-500">30 days returns. Buyer pays for return shipping.</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Description / Specifics Section */}
                    <div className="mt-12 max-w-6xl mx-auto border-t border-gray-200 pt-8">
                        <h2 className="text-lg font-bold mb-4">Item specifics</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-y-2 gap-x-8 text-sm mb-8">
                            {Object.entries(specifics).map(([key, val]) => (
                                <div key={key} className="grid grid-cols-2 border-b border-gray-100 py-1">
                                    <span className="text-gray-500">{key}:</span>
                                    <span className="text-gray-900 font-medium">{val as string}</span>
                                </div>
                            ))}
                        </div>

                        <h2 className="text-lg font-bold mb-4">Item description</h2>
                        <div className="bg-white border border-gray-200 p-6 rounded-lg min-h-[200px] whitespace-pre-wrap font-sans text-gray-800">
                            {item.generatedListing?.content || "No description provided."}
                        </div>
                    </div>
                </div>

                {/* Footer Action */}
                <div className="p-4 bg-white dark:bg-slate-900 border-t border-gray-200 dark:border-slate-800 flex justify-end">
                    <button onClick={onClose} className="px-6 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold rounded-lg hover:opacity-90">
                        Close Preview
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PreviewModal;
