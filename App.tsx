
import React, { useState, useEffect, useRef } from 'react';
import Scanner from './components/Scanner';
import ProfitCalculator from './components/ProfitCalculator';
import { ScoutStatus, ScoutResult, InventoryItem, ProfitCalculation, StorageUnit } from './types';
import { analyzeItemImage, analyzeItemText, generateListingDescription } from './services/geminiService';
import { Camera, LayoutDashboard, Package, Settings, AlertTriangle, Download, Edit2, Save, Trash2, Warehouse, MapPin, Plus, X, Image as ImageIcon, DollarSign, ExternalLink, Search, Link as LinkIcon, Upload, Layers, Mic, MicOff, Copy, Facebook, Check, Globe, ShoppingCart, Search as SearchIcon, Tag, Filter, RefreshCw } from 'lucide-react';

// Helper for Speech Recognition
const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

function App() {
  // State
  const [view, setView] = useState<'scout' | 'inventory'>('scout');
  const [status, setStatus] = useState<ScoutStatus>(ScoutStatus.IDLE);
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [scoutResult, setScoutResult] = useState<ScoutResult | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [inventoryFilter, setInventoryFilter] = useState<string | null>(null); // Filter by Unit ID
  
  // Manual Search State
  const [manualQuery, setManualQuery] = useState("");
  
  // Feature States
  const [isBulkMode, setIsBulkMode] = useState(false); // Feature 4
  const [activeUnit, setActiveUnit] = useState<string>(() => localStorage.getItem('sts_active_unit') || "55");
  const [isEditingUnit, setIsEditingUnit] = useState(false);
  
  // Editing States (Scout Result)
  const [editedTitle, setEditedTitle] = useState<string>("");
  const [binLocation, setBinLocation] = useState<string>(""); // Feature 3
  const [conditionNotes, setConditionNotes] = useState<string>(""); // Feature 5
  const [isRecording, setIsRecording] = useState<'title' | 'condition' | null>(null); // Feature 5
  
  // Listing Generator State (Feature 1)
  const [listingPlatform, setListingPlatform] = useState<'EBAY' | 'FACEBOOK' | null>(null);
  const [generatedListing, setGeneratedListing] = useState<string>("");
  const [isGeneratingListing, setIsGeneratingListing] = useState(false);

  // Storage Units State
  const [storageUnits, setStorageUnits] = useState<StorageUnit[]>([]);

  // State for Delete Modal
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);

  // State for Unit Editor Modal
  const [isUnitModalOpen, setIsUnitModalOpen] = useState(false);
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null); // Null = Adding new
  const [unitForm, setUnitForm] = useState({
    storeNumber: '',
    address: '',
    cost: '',
    imageUrl: ''
  });

  // State for Inventory Item Edit Modal
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  // Load inventory from local storage on mount
  useEffect(() => {
    const saved = localStorage.getItem('scanToSold_inventory');
    if (saved) {
      try {
        setInventory(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse inventory", e);
      }
    }

    // Load Storage Units
    const savedUnits = localStorage.getItem('sts_storage_units');
    if (savedUnits) {
      try {
        setStorageUnits(JSON.parse(savedUnits));
      } catch (e) { console.error(e); }
    } else {
      // Default Units
      setStorageUnits([
        {
          id: 'u1',
          storeNumber: '55',
          address: '123 Storage Ln, Austin',
          cost: 145.00,
          imageUrl: 'https://images.unsplash.com/photo-1565610241653-c3dd8e0f62d6?w=150&h=150&fit=crop'
        },
        {
          id: 'u2',
          storeNumber: 'B-12',
          address: '4500 S Congress, Austin',
          cost: 220.00,
          imageUrl: 'https://images.unsplash.com/photo-1590247813693-5541d1c609fd?w=150&h=150&fit=crop'
        }
      ]);
    }
  }, []);

  // Save inventory to local storage whenever it changes
  useEffect(() => {
    localStorage.setItem('scanToSold_inventory', JSON.stringify(inventory));
  }, [inventory]);

  // Save storage units
  useEffect(() => {
    localStorage.setItem('sts_storage_units', JSON.stringify(storageUnits));
  }, [storageUnits]);

  // Save active unit
  useEffect(() => {
    localStorage.setItem('sts_active_unit', activeUnit);
  }, [activeUnit]);

  // --- Handlers ---

  const handleStartScan = () => {
    setStatus(ScoutStatus.SCANNING);
    setCurrentImage(null);
    setScoutResult(null);
    setEditedTitle("");
    setBinLocation("");
    setConditionNotes("");
    setGeneratedListing("");
    setListingPlatform(null);
  };

  const handleManualSearch = async () => {
    if (!manualQuery.trim()) return;
    
    // Reset states
    setCurrentImage(null);
    setScoutResult(null);
    setEditedTitle("");
    setBinLocation("");
    setConditionNotes("");
    setGeneratedListing("");
    setListingPlatform(null);

    // Start Analysis
    setStatus(ScoutStatus.ANALYZING);
    
    const result = await analyzeItemText(manualQuery);
    
    setScoutResult(result);
    setEditedTitle(result.itemTitle);
    setStatus(ScoutStatus.COMPLETE);
  };

  const handleImageCaptured = async (imageData: string, barcode?: string) => {
    setStatus(ScoutStatus.ANALYZING);
    setCurrentImage(imageData);
    
    // Call Gemini Service with Bulk Mode flag
    const result = await analyzeItemImage(imageData, barcode, isBulkMode);
    
    setScoutResult(result);
    setEditedTitle(result.itemTitle); 
    setStatus(ScoutStatus.COMPLETE);
  };

  // Feature 5: Voice Recording
  const toggleRecording = (field: 'title' | 'condition') => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(null);
      return;
    }

    if (!SpeechRecognition) {
      alert("Voice recognition not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setIsRecording(field);
    recognition.onend = () => setIsRecording(null);
    
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      if (field === 'title') {
        if (editingItem) {
           setEditingItem({...editingItem, title: editingItem.title + ' ' + transcript});
        } else {
           setEditedTitle(prev => prev ? `${prev} ${transcript}` : transcript);
        }
      } else {
        if (editingItem) {
          setEditingItem({...editingItem, conditionNotes: (editingItem.conditionNotes || '') + ' ' + transcript});
        } else {
          setConditionNotes(prev => prev ? `${prev} ${transcript}` : transcript);
        }
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  // Feature 1: Generate Listing
  const handleGenerateListing = async (platform: 'EBAY' | 'FACEBOOK') => {
    setListingPlatform(platform);
    setIsGeneratingListing(true);
    const text = await generateListingDescription(editedTitle, conditionNotes, platform);
    setGeneratedListing(text);
    setIsGeneratingListing(false);
  };

  const handleSaveItem = (calc: ProfitCalculation, costCode: string) => {
    if (!scoutResult) return; 

    const dateObj = new Date();
    const dateStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase().replace(' ', '');
    const sku = `UNIT${activeUnit}-${dateStr}-${costCode}`;

    // Generate ID safely
    const newItemId = (typeof crypto !== 'undefined' && crypto.randomUUID) 
      ? crypto.randomUUID() 
      : `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const newItem: InventoryItem = {
      id: newItemId,
      sku,
      title: editedTitle || scoutResult.itemTitle,
      dateScanned: new Date().toISOString(),
      storageUnitId: activeUnit,
      costCode,
      calculation: calc,
      imageUrl: currentImage || "https://source.unsplash.com/random/150x150?box,package&sig=" + Date.now(),
      status: 'DRAFT',
      binLocation, // Feature 3
      conditionNotes, // Feature 5
      generatedListing: generatedListing ? {
        platform: listingPlatform!,
        content: generatedListing
      } : undefined
    };

    setInventory(prev => [newItem, ...prev]);
    
    // Reset cycle
    setStatus(ScoutStatus.IDLE);
    setCurrentImage(null);
    setScoutResult(null);
    setEditedTitle("");
    setBinLocation("");
    setConditionNotes("");
    setGeneratedListing("");
    setListingPlatform(null);
    setManualQuery("");
    setView('inventory'); 
  };

  const handleDeleteItem = (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); // Prevent bubbling
    setItemToDelete(id);
  };

  const confirmDelete = () => {
    if (itemToDelete) {
      setInventory(prev => prev.filter(item => item.id !== itemToDelete));
      setItemToDelete(null);
    }
  };

  const handleUnitClick = (unitId: string) => {
    setActiveUnit(unitId);
    setInventoryFilter(unitId);
    setView('inventory');
  };

  // --- Inventory Edit Handler ---
  
  const handleUpdateInventoryItem = () => {
    if (!editingItem) return;

    // Recalculate Profit
    const soldPrice = editingItem.calculation.soldPrice;
    const itemCost = editingItem.calculation.itemCost;
    const shippingCost = editingItem.calculation.shippingCost;
    
    const feeRate = 0.1325; // 13.25%
    const fixedFee = 0.30;
    const fees = (soldPrice * feeRate) + fixedFee;
    const net = soldPrice - fees - shippingCost - itemCost;

    const updatedItem: InventoryItem = {
      ...editingItem,
      costCode: `C${Math.floor(itemCost)}`, // Update cost code just in case
      calculation: {
        ...editingItem.calculation,
        platformFees: fees,
        netProfit: net,
        isProfitable: net >= 20
      }
    };

    setInventory(prev => prev.map(item => item.id === editingItem.id ? updatedItem : item));
    setEditingItem(null);
  };

  // --- Unit Management Handlers ---

  const openAddUnitModal = () => {
    setEditingUnitId(null);
    setUnitForm({ storeNumber: '', address: '', cost: '', imageUrl: '' });
    setIsUnitModalOpen(true);
  };

  const openEditUnitModal = (e: React.MouseEvent, unit: StorageUnit) => {
    e.stopPropagation();
    setEditingUnitId(unit.id);
    setUnitForm({
      storeNumber: unit.storeNumber,
      address: unit.address,
      cost: unit.cost.toString(),
      imageUrl: unit.imageUrl || ''
    });
    setIsUnitModalOpen(true);
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setUnitForm(prev => ({ ...prev, imageUrl: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveUnit = () => {
    const costNum = parseFloat(unitForm.cost);
    if (!unitForm.storeNumber) {
      alert("Store Number is required");
      return;
    }

    const newUnit: StorageUnit = {
      id: editingUnitId || Date.now().toString(),
      storeNumber: unitForm.storeNumber,
      address: unitForm.address || 'No Address',
      cost: isNaN(costNum) ? 0 : costNum,
      imageUrl: unitForm.imageUrl || `https://source.unsplash.com/random/150x150?storage&sig=${Date.now()}` 
    };

    if (editingUnitId) {
      setStorageUnits(prev => prev.map(u => u.id === editingUnitId ? newUnit : u));
    } else {
      setStorageUnits(prev => [...prev, newUnit]);
    }
    setIsUnitModalOpen(false);
  };

  const downloadLedger = () => {
    const headers = ['Date', 'SKU', 'Item Name', 'Bin', 'Sold Price', 'Cost', 'Fees', 'Shipping', 'Net Profit', 'Storage Unit'];
    const rows = inventory.map(item => [
      new Date(item.dateScanned).toLocaleDateString(),
      item.sku,
      `"${item.title.replace(/"/g, '""')}"`, // Escape quotes
      `"${(item.binLocation || '').replace(/"/g, '""')}"`,
      item.calculation.soldPrice.toFixed(2),
      item.calculation.itemCost.toFixed(2),
      item.calculation.platformFees.toFixed(2),
      item.calculation.shippingCost.toFixed(2),
      item.calculation.netProfit.toFixed(2),
      item.storageUnitId
    ]);
    
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
      
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "ledger.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Feature 2: Unit ROI Helper
  const getUnitStats = (storeNumber: string, unitCost: number) => {
    const unitItems = inventory.filter(i => i.storageUnitId === storeNumber);
    const totalSoldValue = unitItems.reduce((sum, i) => sum + i.calculation.soldPrice, 0); // Revenue towards break even
    const totalProfit = unitItems.reduce((sum, i) => sum + i.calculation.netProfit, 0);
    const progressPercent = Math.min(100, (totalSoldValue / (unitCost || 1)) * 100);
    const isBreakEven = totalSoldValue >= unitCost;

    return { totalSoldValue, totalProfit, progressPercent, isBreakEven };
  };

  // --- Render Helpers ---

  const renderIdleState = () => (
    <div className="flex flex-col h-full overflow-y-auto bg-slate-950">
      <div className="flex flex-col items-center justify-center p-6 pt-12 space-y-8 shrink-0">
        
        {/* App Branding */}
        <div className="text-center space-y-1">
           <h1 className="text-4xl font-black text-white tracking-tight">
             Scan<span className="text-neon-green">To</span>Sold
           </h1>
           <p className="text-[10px] font-mono text-slate-500 uppercase tracking-[0.3em] opacity-60">Reseller OS</p>
        </div>

        <div className="w-32 h-32 rounded-full bg-slate-800 flex items-center justify-center shadow-2xl shadow-neon-green/10 animate-pulse ring-1 ring-slate-700">
          <Camera size={48} className="text-neon-green" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-300 mb-4 text-center">Ready to Scout</h2>
          
          {/* Unit Selector */}
          <div className="flex items-center justify-center gap-2">
            <span className="text-slate-400 text-sm">ACTIVE STORAGE UNIT:</span>
            {isEditingUnit ? (
              <div className="flex items-center gap-2">
                <input 
                  autoFocus
                  type="text" 
                  value={activeUnit}
                  onChange={(e) => setActiveUnit(e.target.value.toUpperCase())}
                  onBlur={() => setIsEditingUnit(false)}
                  className="w-20 bg-slate-800 text-white border border-neon-green rounded px-2 py-1 font-mono text-center uppercase focus:outline-none"
                />
                <button onClick={() => setIsEditingUnit(false)} className="text-neon-green"><Save size={16} /></button>
              </div>
            ) : (
              <button 
                onClick={() => setIsEditingUnit(true)}
                className="flex items-center gap-2 bg-slate-800 px-3 py-1 rounded hover:bg-slate-700 border border-slate-700 group transition-all"
              >
                <span className="font-mono font-bold text-white group-hover:text-neon-green">{activeUnit}</span>
                <Edit2 size={12} className="text-slate-500 group-hover:text-neon-green" />
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-col w-full max-w-xs gap-4">
          <button 
            onClick={handleStartScan}
            className="w-full py-4 bg-neon-green text-slate-950 font-bold text-xl rounded-xl shadow-lg shadow-neon-green/20 hover:scale-105 transition-transform flex items-center justify-center gap-2"
          >
            <Camera size={24} /> {isBulkMode ? 'SCAN BULK LOT' : 'START SCAN'}
          </button>

          {/* Manual Search Field */}
          <div className="flex gap-2">
             <input 
               type="text"
               value={manualQuery}
               onChange={(e) => setManualQuery(e.target.value)}
               onKeyDown={(e) => e.key === 'Enter' && handleManualSearch()}
               placeholder="Manual Lookup (Name or UPC)"
               className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 text-sm text-white focus:outline-none focus:border-neon-green"
             />
             <button 
               onClick={handleManualSearch}
               className="bg-slate-800 border border-slate-700 hover:border-neon-green text-white p-3 rounded-lg"
             >
               <SearchIcon size={20} />
             </button>
          </div>

          {/* Feature 4: Bulk Mode Toggle */}
          <button 
             onClick={() => setIsBulkMode(!isBulkMode)}
             className={`flex items-center justify-center gap-2 py-2 px-4 rounded-lg border border-slate-700 transition-colors ${isBulkMode ? 'bg-slate-800 text-neon-green border-neon-green' : 'bg-transparent text-slate-500'}`}
          >
             <Layers size={16} />
             <span className="text-xs font-bold tracking-wider">{isBulkMode ? 'MODE: DEATH PILE (BULK)' : 'MODE: SINGLE ITEM'}</span>
          </button>
        </div>
      </div>

      {/* Feature 2: ROI Dashboard in Unit List */}
      <div className="px-4 pb-24 w-full max-w-2xl mx-auto mt-8">
        <div className="flex items-center justify-between mb-4 px-2">
          <h3 className="text-slate-400 text-sm font-mono uppercase tracking-widest flex items-center gap-2">
            <Warehouse size={16} /> ROI Tracker
          </h3>
          <button onClick={openAddUnitModal} className="text-neon-green text-xs font-bold flex items-center gap-1 hover:text-white transition-colors px-3 py-2 bg-slate-900 rounded-lg border border-slate-800 hover:border-neon-green">
            <Plus size={14} /> ADD UNIT
          </button>
        </div>
        
        <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-xl">
           <div className="flex flex-col divide-y divide-slate-800">
               {storageUnits.map(unit => {
                 const stats = getUnitStats(unit.storeNumber, unit.cost);
                 
                 return (
                   <div 
                     key={unit.id} 
                     onClick={() => handleUnitClick(unit.storeNumber)}
                     className={`p-4 cursor-pointer transition-all hover:bg-slate-800/80 ${activeUnit === unit.storeNumber ? 'bg-slate-800/50' : ''}`}
                   >
                     <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-3">
                           <div className={`w-10 h-10 rounded-lg bg-slate-800 overflow-hidden shrink-0 border-2 ${activeUnit === unit.storeNumber ? 'border-neon-green' : 'border-slate-700'}`}>
                             {unit.imageUrl ? (
                               <img src={unit.imageUrl} alt={unit.storeNumber} className="w-full h-full object-cover" />
                             ) : <div className="flex items-center justify-center h-full"><Package size={16}/></div>}
                           </div>
                           <div>
                             <div className="flex items-center gap-2">
                               <span className={`font-bold font-mono text-lg ${activeUnit === unit.storeNumber ? 'text-neon-green' : 'text-white'}`}>
                                 #{unit.storeNumber}
                               </span>
                               {activeUnit === unit.storeNumber && <span className="text-[10px] text-neon-green bg-neon-green/10 px-1 rounded">ACTIVE</span>}
                             </div>
                             <span className="text-xs text-slate-500">{unit.address}</span>
                           </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-slate-500 uppercase">Cost</div>
                          <div className="text-white font-mono">${unit.cost.toFixed(0)}</div>
                          <button 
                             onClick={(e) => openEditUnitModal(e, unit)}
                             className="text-[10px] text-slate-500 underline mt-1 hover:text-white"
                          >Edit</button>
                        </div>
                     </div>

                     {/* ROI Progress Bar */}
                     <div className="space-y-1">
                       <div className="flex justify-between text-[10px] font-mono uppercase tracking-wider">
                          <span className={stats.isBreakEven ? 'text-neon-green' : 'text-slate-400'}>
                            {stats.isBreakEven ? 'PROFIT MODE' : 'RECOUPING COST'}
                          </span>
                          <span className="text-white">
                            ${stats.totalSoldValue.toFixed(0)} / ${unit.cost.toFixed(0)}
                          </span>
                       </div>
                       <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                         <div 
                            className={`h-full transition-all duration-1000 ${stats.isBreakEven ? 'bg-neon-green shadow-[0_0_10px_#39ff14]' : 'bg-yellow-500'}`}
                            style={{ width: `${stats.progressPercent}%` }}
                         ></div>
                       </div>
                       {stats.totalProfit > 0 && (
                         <div className="text-right text-[10px] text-neon-green font-bold mt-1">
                           +${stats.totalProfit.toFixed(0)} NET PROFIT
                         </div>
                       )}
                     </div>
                   </div>
                 );
               })}
               {storageUnits.length === 0 && (
                  <div className="p-8 text-center text-slate-600 text-sm">No units added.</div>
               )}
           </div>
        </div>
      </div>
    </div>
  );

  const renderAnalysis = () => (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Image Preview Header */}
      <div className="relative w-full h-64 bg-black shrink-0">
        {currentImage ? (
          <img src={currentImage} alt="Captured" className="w-full h-full object-contain" />
        ) : (
          // Placeholder for Manual Search
          <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900">
             <SearchIcon size={48} className="text-slate-700 mb-2" />
             <span className="text-slate-500 font-mono text-xs uppercase">Manual Lookup: {manualQuery}</span>
          </div>
        )}
        
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-slate-900 to-transparent">
          {status === ScoutStatus.ANALYZING ? (
            <div className="flex items-center gap-2 text-neon-green animate-pulse">
              <div className="w-2 h-2 bg-neon-green rounded-full"></div>
              <span className="font-mono text-sm">
                {isBulkMode ? 'ANALYZING BULK LOT...' : 'AI MARKET RESEARCH...'}
              </span>
            </div>
          ) : (
             <div className="flex justify-end items-end">
               <span className="text-xs font-mono bg-slate-800/80 backdrop-blur px-2 py-1 rounded text-slate-300 border border-slate-700">
                 {scoutResult?.confidence}% CONF
               </span>
             </div>
          )}
        </div>
      </div>

      {/* Results & Calculator Body */}
      <div className="flex-1 p-4 space-y-6 pb-12">
        {status === ScoutStatus.ANALYZING ? (
           <div className="space-y-4 mt-8">
             <div className="h-4 bg-slate-800 rounded w-3/4 animate-pulse"></div>
             <div className="h-4 bg-slate-800 rounded w-1/2 animate-pulse"></div>
             <div className="h-32 bg-slate-800 rounded w-full animate-pulse mt-8"></div>
           </div>
        ) : scoutResult ? (
          <>
             {/* Manual Research Links */}
             <div className="flex gap-2 overflow-x-auto pb-2">
                <a 
                   href={`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(editedTitle || scoutResult.itemTitle)}&LH_Sold=1&LH_Complete=1`}
                   target="_blank" rel="noreferrer"
                   className="flex items-center gap-2 px-3 py-2 bg-slate-800 rounded-lg border border-slate-700 hover:border-neon-green text-xs font-bold text-white shrink-0"
                >
                  <ShoppingCart size={14} /> eBay Sold
                </a>
                <a 
                   href={`https://www.google.com/search?q=${encodeURIComponent(editedTitle || scoutResult.itemTitle)}`}
                   target="_blank" rel="noreferrer"
                   className="flex items-center gap-2 px-3 py-2 bg-slate-800 rounded-lg border border-slate-700 hover:border-blue-400 text-xs font-bold text-white shrink-0"
                >
                  <Globe size={14} /> Google
                </a>
                <a 
                   href={`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(editedTitle || scoutResult.itemTitle)}`}
                   target="_blank" rel="noreferrer"
                   className="flex items-center gap-2 px-3 py-2 bg-slate-800 rounded-lg border border-slate-700 hover:border-blue-500 text-xs font-bold text-white shrink-0"
                >
                  <Tag size={14} /> eBay Listed
                </a>
             </div>

             {/* Bulk Mode Badge */}
             {scoutResult.isBulkLot && (
               <div className="bg-purple-500/10 border border-purple-500 text-purple-400 px-3 py-2 rounded-lg text-xs font-bold uppercase flex items-center gap-2">
                 <Layers size={14} /> Death Pile / Bulk Mode Detected
               </div>
             )}

             {/* Item Name + Voice Input */}
             <div className="space-y-2">
               <div className="flex justify-between items-center">
                  <label className="text-xs text-slate-400 font-mono uppercase tracking-wider flex items-center gap-2">
                    <Edit2 size={12} /> Item Name
                  </label>
                  <button 
                    onClick={() => toggleRecording('title')}
                    className={`p-1.5 rounded-full transition-all ${isRecording === 'title' ? 'bg-neon-red text-white animate-pulse' : 'text-slate-400 hover:text-white'}`}
                  >
                    {isRecording === 'title' ? <MicOff size={14} /> : <Mic size={14} />}
                  </button>
               </div>
               <textarea 
                 value={editedTitle}
                 onChange={(e) => setEditedTitle(e.target.value)}
                 className="w-full bg-slate-800 p-3 rounded-lg border border-slate-700 text-white font-medium text-lg focus:outline-none focus:border-neon-green transition-colors resize-none min-h-[80px]"
                 placeholder="Item description..."
               />
             </div>

             {/* Feature 5: Condition Notes + Voice */}
             <div className="space-y-2">
               <div className="flex justify-between items-center">
                  <label className="text-xs text-slate-400 font-mono uppercase tracking-wider flex items-center gap-2">
                    <AlertTriangle size={12} /> Condition Notes
                  </label>
                  <button 
                    onClick={() => toggleRecording('condition')}
                    className={`p-1.5 rounded-full transition-all ${isRecording === 'condition' ? 'bg-neon-red text-white animate-pulse' : 'text-slate-400 hover:text-white'}`}
                  >
                    {isRecording === 'condition' ? <MicOff size={14} /> : <Mic size={14} />}
                  </button>
               </div>
               <textarea 
                 value={conditionNotes}
                 onChange={(e) => setConditionNotes(e.target.value)}
                 className="w-full bg-slate-800 p-3 rounded-lg border border-slate-700 text-slate-300 text-sm focus:outline-none focus:border-neon-green transition-colors resize-none h-20"
                 placeholder="e.g., Small crack on base, missing power cord..."
               />
             </div>

             {/* Feature 3: Bin / Location */}
             <div className="bg-slate-800 p-3 rounded-lg border border-slate-700 flex items-center gap-3">
                <BoxIcon />
                <input 
                  type="text"
                  value={binLocation}
                  onChange={(e) => setBinLocation(e.target.value)}
                  placeholder="Bin / Box Location (e.g. A1)"
                  className="bg-transparent w-full text-white focus:outline-none placeholder-slate-600 font-mono"
                />
             </div>

             {/* Feature 1: Listing Generator */}
             <div className="border border-slate-700 rounded-xl overflow-hidden">
                <div className="bg-slate-900 p-3 border-b border-slate-700 flex justify-between items-center">
                   <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400">AI Listing Generator</h3>
                </div>
                <div className="p-3 bg-slate-800/50">
                  {!generatedListing ? (
                    <div className="flex gap-2">
                       <button 
                         onClick={() => handleGenerateListing('EBAY')}
                         disabled={isGeneratingListing}
                         className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded text-xs font-bold text-white flex justify-center items-center gap-2"
                       >
                         {isGeneratingListing && listingPlatform === 'EBAY' ? 'WRITING...' : 'EBAY LISTING'}
                       </button>
                       <button 
                         onClick={() => handleGenerateListing('FACEBOOK')}
                         disabled={isGeneratingListing}
                         className="flex-1 py-2 bg-blue-900/40 hover:bg-blue-900/60 border border-blue-800 rounded text-xs font-bold text-blue-200 flex justify-center items-center gap-2"
                       >
                         <Facebook size={12} />
                         {isGeneratingListing && listingPlatform === 'FACEBOOK' ? 'WRITING...' : 'FB MARKET'}
                       </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] bg-slate-700 px-2 py-1 rounded text-white">{listingPlatform}</span>
                        <button onClick={() => setGeneratedListing("")} className="text-[10px] text-slate-400 underline">Reset</button>
                      </div>
                      <div className="relative">
                        <textarea 
                          readOnly
                          value={generatedListing}
                          className="w-full h-32 bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-300 font-mono"
                        />
                        <button 
                          onClick={() => navigator.clipboard.writeText(generatedListing)}
                          className="absolute top-2 right-2 p-1 bg-slate-700 rounded hover:bg-slate-600 text-white"
                          title="Copy"
                        >
                          <Copy size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
             </div>
             
             {/* Barcode Found Indicator */}
             {scoutResult.barcode && (
               <div className="flex items-center gap-3 px-3 py-2 bg-slate-800/80 border border-neon-green/30 rounded-lg shadow-sm">
                  <div className="flex items-center justify-center w-8 h-6 bg-white rounded-sm px-1">
                    <div className="w-full h-3 border-t-2 border-b-2 border-black"></div>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-neon-green font-mono font-bold tracking-wider uppercase">Barcode Verified</span>
                    <span className="text-sm font-mono text-white tracking-widest">{scoutResult.barcode}</span>
                  </div>
               </div>
             )}
             
             <ProfitCalculator 
               estimatedPrice={scoutResult.estimatedSoldPrice}
               estimatedShipping={scoutResult.estimatedShippingCost}
               onSave={handleSaveItem}
               isScanning={false}
             />

             {/* Explicit Discard Option */}
             <div className="pt-6 mt-6 border-t border-slate-800">
               <button 
                 onClick={() => {
                   if (window.confirm("Discard this scan? Data will be lost.")) {
                     setStatus(ScoutStatus.IDLE);
                   }
                 }} 
                 className="w-full py-4 rounded-lg border-2 border-slate-800 text-slate-500 font-bold hover:bg-slate-900 hover:text-neon-red hover:border-neon-red/30 transition-all flex items-center justify-center gap-2"
               >
                 <Trash2 size={20} /> DISCARD SCAN
               </button>
             </div>
          </>
        ) : (
          <div className="text-red-500 flex items-center gap-2">
            <AlertTriangle /> Analysis Failed
          </div>
        )}
      </div>
    </div>
  );

  const renderInventory = () => {
    const displayInventory = inventoryFilter 
      ? inventory.filter(i => i.storageUnitId === inventoryFilter)
      : inventory;

    return (
      <div className="h-full flex flex-col">
        <div className="p-4 bg-slate-900/50 backdrop-blur border-b border-slate-800 flex flex-col gap-3 sticky top-0 z-10">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Package className="text-neon-green" /> Inventory ({displayInventory.length})
            </h2>
            <button onClick={downloadLedger} className="p-2 text-slate-400 hover:text-white">
              <Download size={20} />
            </button>
          </div>

          {/* Active Filter Badge */}
          {inventoryFilter && (
            <div className="flex items-center justify-between bg-slate-800/80 border border-neon-green/30 px-3 py-2 rounded-lg">
               <div className="flex items-center gap-2">
                 <Filter size={14} className="text-neon-green" />
                 <span className="text-xs font-bold text-white">Filtered by Unit #{inventoryFilter}</span>
               </div>
               <button 
                 onClick={() => setInventoryFilter(null)}
                 className="text-[10px] font-bold text-slate-400 hover:text-white underline"
               >
                 CLEAR
               </button>
            </div>
          )}
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {displayInventory.length === 0 ? (
            <div className="text-center text-slate-600 mt-20">
              <p>{inventoryFilter ? `No items found in Unit #${inventoryFilter}` : "No items scanned yet."}</p>
              {!inventoryFilter && <p className="text-xs text-slate-700 mt-2">Items scanned will appear here.</p>}
            </div>
          ) : (
            displayInventory.map(item => (
              <div key={item.id} className="bg-slate-800 rounded-lg p-3 flex gap-3 border border-slate-700 items-center group">
                {/* Thumbnail */}
                <div className="w-16 h-16 bg-black rounded overflow-hidden shrink-0 relative">
                  <img src={item.imageUrl} alt="" className="w-full h-full object-cover opacity-80" />
                  {item.binLocation && (
                     <div className="absolute bottom-0 right-0 bg-slate-900/80 text-[8px] text-white px-1 font-mono border-tl rounded-tl">
                        {item.binLocation}
                     </div>
                  )}
                </div>
                
                {/* Info */}
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setEditingItem(item)}>
                  <div className="flex justify-between items-start">
                    <h3 className="text-white font-medium text-sm line-clamp-1">{item.title}</h3>
                    <span className="text-neon-green font-mono font-bold text-sm">
                      +${item.calculation.netProfit.toFixed(0)}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 font-mono mt-1">
                    {item.sku}
                  </div>
                  <div className="flex gap-2 mt-2">
                    <span className="px-1.5 py-0.5 bg-slate-700 rounded text-[10px] text-slate-300 uppercase">
                      Unit {item.storageUnitId}
                    </span>
                    {item.generatedListing && (
                      <span className="px-1.5 py-0.5 bg-blue-900/30 text-blue-300 rounded text-[10px] flex items-center gap-1">
                        <Check size={8} /> Copy Ready
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-1">
                   <button 
                      onClick={() => setEditingItem(item)}
                      className="p-2 text-slate-400 hover:text-neon-green hover:bg-slate-700/50 rounded-full transition-colors shrink-0"
                      title="Edit Item"
                   >
                      <Edit2 size={16} />
                   </button>
                   <button 
                      onClick={(e) => handleDeleteItem(e, item.id)}
                      className="p-2 text-slate-400 hover:text-neon-red hover:bg-slate-700/50 rounded-full transition-colors shrink-0"
                      title="Delete Item"
                   >
                      <Trash2 size={16} />
                   </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  // --- Main Render ---
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans overflow-hidden flex flex-col">
      
      {/* Main Content Area */}
      <main className="flex-1 relative overflow-hidden">
        {status === ScoutStatus.SCANNING && (
          <Scanner 
            onCapture={handleImageCaptured} 
            onClose={() => setStatus(ScoutStatus.IDLE)} 
          />
        )}
        
        {view === 'scout' && (status === ScoutStatus.IDLE) && renderIdleState()}
        {view === 'scout' && (status === ScoutStatus.ANALYZING || status === ScoutStatus.COMPLETE) && renderAnalysis()}
        {view === 'inventory' && renderInventory()}
      </main>

      {/* Bottom Navigation */}
      <nav className="h-16 bg-slate-900 border-t border-slate-800 flex items-center justify-around shrink-0 pb-safe">
        <button 
          onClick={() => {
            setView('scout');
            if (status === ScoutStatus.SCANNING) setStatus(ScoutStatus.IDLE);
          }}
          className={`flex flex-col items-center gap-1 p-2 transition-colors ${view === 'scout' ? 'text-neon-green' : 'text-slate-500'}`}
        >
          <LayoutDashboard size={24} />
          <span className="text-[10px] font-bold tracking-wider">SCOUT</span>
        </button>
        
        {/* Center FAB action for quick return to scan if in inventory */}
        <div className="relative -top-5">
           <button 
             onClick={() => {
               setView('scout');
               if (status !== ScoutStatus.SCANNING) {
                 setStatus(ScoutStatus.SCANNING);
               }
             }}
             className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center hover:scale-105 transition-transform ${isBulkMode ? 'bg-purple-500 shadow-purple-500/30' : 'bg-neon-green shadow-neon-green/30'}`}
           >
             {isBulkMode ? <Layers size={24} className="text-white" /> : <Camera size={28} className="text-slate-950" />}
           </button>
        </div>

        <button 
           onClick={() => {
             setView('inventory');
             if (status === ScoutStatus.SCANNING) setStatus(ScoutStatus.IDLE);
           }}
           className={`flex flex-col items-center gap-1 p-2 transition-colors ${view === 'inventory' ? 'text-neon-green' : 'text-slate-500'}`}
        >
          <Package size={24} />
          <span className="text-[10px] font-bold tracking-wider">STOCKS</span>
        </button>
      </nav>

      {/* Delete Confirmation Modal */}
      {itemToDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl shadow-black/50 scale-100 animate-in zoom-in-95 duration-200">
             <div className="flex flex-col items-center text-center gap-4">
                <div className="w-16 h-16 rounded-full bg-neon-red/10 flex items-center justify-center mb-2">
                  <Trash2 size={32} className="text-neon-red" />
                </div>
                
                <div>
                  <h3 className="text-xl font-bold text-white mb-1">Delete Item?</h3>
                  <p className="text-slate-400 text-sm leading-relaxed">
                    Are you sure you want to delete this item? This action cannot be undone.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 w-full mt-4">
                  <button 
                    onClick={() => setItemToDelete(null)}
                    className="py-3 px-4 rounded-xl font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors"
                  >
                    CANCEL
                  </button>
                  <button 
                    onClick={confirmDelete}
                    className="py-3 px-4 rounded-xl font-bold text-white bg-neon-red hover:bg-red-600 shadow-lg shadow-neon-red/20 transition-all active:scale-95"
                  >
                    DELETE
                  </button>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* Edit Inventory Item Modal */}
      {editingItem && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
           <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]">
             <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900 rounded-t-2xl">
               <h3 className="text-lg font-bold text-white flex items-center gap-2">
                 <Edit2 className="text-neon-green" size={18} /> Edit Inventory
               </h3>
               <button onClick={() => setEditingItem(null)} className="text-slate-400 hover:text-white">
                 <X size={24} />
               </button>
             </div>

             <div className="p-6 space-y-4 overflow-y-auto">
               {/* Title Edit */}
               <div className="space-y-2">
                 <div className="flex justify-between items-center">
                    <label className="text-xs font-mono text-slate-400 uppercase">Item Title</label>
                    <button onClick={() => toggleRecording('title')} className={`text-xs ${isRecording === 'title' ? 'text-neon-red animate-pulse' : 'text-slate-500 hover:text-white'}`}><Mic size={14} /></button>
                 </div>
                 <textarea 
                   value={editingItem.title}
                   onChange={e => setEditingItem({...editingItem, title: e.target.value})}
                   className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white text-sm focus:outline-none focus:border-neon-green h-20 resize-none"
                 />
               </div>

               {/* Financials Grid */}
               <div className="grid grid-cols-3 gap-3">
                 <div>
                    <label className="text-[10px] font-mono text-slate-500 uppercase block mb-1">Sold Price</label>
                    <input 
                      type="number"
                      value={editingItem.calculation.soldPrice}
                      onChange={e => setEditingItem({
                        ...editingItem, 
                        calculation: {...editingItem.calculation, soldPrice: parseFloat(e.target.value) || 0}
                      })}
                      className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white font-mono focus:outline-none focus:border-neon-green"
                    />
                 </div>
                 <div>
                    <label className="text-[10px] font-mono text-slate-500 uppercase block mb-1">Item Cost</label>
                    <input 
                      type="number"
                      value={editingItem.calculation.itemCost}
                      onChange={e => setEditingItem({
                        ...editingItem, 
                        calculation: {...editingItem.calculation, itemCost: parseFloat(e.target.value) || 0}
                      })}
                      className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white font-mono focus:outline-none focus:border-neon-green"
                    />
                 </div>
                 <div>
                    <label className="text-[10px] font-mono text-slate-500 uppercase block mb-1">Shipping</label>
                    <input 
                      type="number"
                      value={editingItem.calculation.shippingCost}
                      onChange={e => setEditingItem({
                        ...editingItem, 
                        calculation: {...editingItem.calculation, shippingCost: parseFloat(e.target.value) || 0}
                      })}
                      className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white font-mono focus:outline-none focus:border-neon-green"
                    />
                 </div>
               </div>

               {/* Logistics */}
               <div className="grid grid-cols-2 gap-3">
                 <div>
                    <label className="text-[10px] font-mono text-slate-500 uppercase block mb-1">Bin / Loc</label>
                    <div className="flex items-center bg-slate-800 border border-slate-700 rounded px-2">
                       <BoxIcon />
                       <input 
                         type="text"
                         value={editingItem.binLocation || ''}
                         onChange={e => setEditingItem({...editingItem, binLocation: e.target.value})}
                         className="w-full bg-transparent p-2 text-white text-sm focus:outline-none"
                       />
                    </div>
                 </div>
                 <div>
                    <label className="text-[10px] font-mono text-slate-500 uppercase block mb-1">Storage Unit</label>
                    <select 
                      value={editingItem.storageUnitId}
                      onChange={e => setEditingItem({...editingItem, storageUnitId: e.target.value})}
                      className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white text-sm focus:outline-none"
                    >
                      {storageUnits.map(u => (
                        <option key={u.id} value={u.storeNumber}>{u.storeNumber}</option>
                      ))}
                    </select>
                 </div>
               </div>

               {/* Condition */}
               <div className="space-y-2">
                 <div className="flex justify-between items-center">
                    <label className="text-xs font-mono text-slate-400 uppercase">Condition Notes</label>
                    <button onClick={() => toggleRecording('condition')} className={`text-xs ${isRecording === 'condition' ? 'text-neon-red animate-pulse' : 'text-slate-500 hover:text-white'}`}><Mic size={14} /></button>
                 </div>
                 <textarea 
                   value={editingItem.conditionNotes || ''}
                   onChange={e => setEditingItem({...editingItem, conditionNotes: e.target.value})}
                   className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-slate-300 text-sm focus:outline-none focus:border-neon-green h-20 resize-none"
                 />
               </div>
             </div>

             <div className="p-4 bg-slate-900 border-t border-slate-800">
               <button 
                 onClick={handleUpdateInventoryItem}
                 className="w-full py-3 bg-neon-green text-slate-950 font-bold rounded-xl hover:bg-neon-green/90 transition-all shadow-lg shadow-neon-green/20 flex items-center justify-center gap-2"
               >
                 <Save size={18} /> UPDATE ITEM
               </button>
             </div>
           </div>
        </div>
      )}

      {/* Add/Edit Unit Modal */}
      {isUnitModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl shadow-black/50 overflow-hidden flex flex-col max-h-[90vh]">
             
             {/* Modal Header */}
             <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900">
               <h3 className="text-lg font-bold text-white flex items-center gap-2">
                 <Warehouse className="text-neon-green" size={20} /> 
                 {editingUnitId ? 'Edit Storage Unit' : 'Add Storage Unit'}
               </h3>
               <button onClick={() => setIsUnitModalOpen(false)} className="text-slate-400 hover:text-white">
                 <X size={24} />
               </button>
             </div>

             {/* Modal Body */}
             <div className="p-6 space-y-4 overflow-y-auto">
                
                {/* Store # */}
                <div className="space-y-2">
                  <label className="text-xs font-mono text-slate-400 uppercase">Store Number / ID</label>
                  <div className="flex items-center gap-3 bg-slate-800 p-3 rounded-lg border border-slate-700 focus-within:border-neon-green transition-colors">
                    <Warehouse size={18} className="text-slate-500" />
                    <input 
                      type="text" 
                      value={unitForm.storeNumber}
                      onChange={e => setUnitForm({...unitForm, storeNumber: e.target.value})}
                      placeholder="e.g. Unit 55 or B-12"
                      className="bg-transparent text-white w-full focus:outline-none font-mono"
                    />
                  </div>
                </div>

                {/* Address */}
                <div className="space-y-2">
                  <label className="text-xs font-mono text-slate-400 uppercase">Address</label>
                  <div className="flex items-center gap-3 bg-slate-800 p-3 rounded-lg border border-slate-700 focus-within:border-neon-green transition-colors">
                    <MapPin size={18} className="text-slate-500" />
                    <input 
                      type="text" 
                      value={unitForm.address}
                      onChange={e => setUnitForm({...unitForm, address: e.target.value})}
                      placeholder="Street address..."
                      className="bg-transparent text-white w-full focus:outline-none"
                    />
                  </div>
                </div>

                {/* Cost */}
                <div className="space-y-2">
                  <label className="text-xs font-mono text-slate-400 uppercase">Monthly Cost</label>
                  <div className="flex items-center gap-3 bg-slate-800 p-3 rounded-lg border border-slate-700 focus-within:border-neon-green transition-colors">
                    <DollarSign size={18} className="text-slate-500" />
                    <input 
                      type="number" 
                      value={unitForm.cost}
                      onChange={e => setUnitForm({...unitForm, cost: e.target.value})}
                      placeholder="0.00"
                      className="bg-transparent text-white w-full focus:outline-none font-mono"
                    />
                  </div>
                </div>

                 {/* Image Selection */}
                 <div className="space-y-2">
                  <label className="text-xs font-mono text-slate-400 uppercase">Unit Photo</label>
                  
                  <div className="flex flex-col gap-3">
                    {/* Preview & Upload Box */}
                    <div className="relative w-full h-40 bg-black rounded-lg border border-slate-800 overflow-hidden group">
                        {unitForm.imageUrl ? (
                          <img src={unitForm.imageUrl} alt="Preview" className="w-full h-full object-cover opacity-80" />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-slate-600 bg-slate-900/50">
                             <ImageIcon size={32} className="mb-2 opacity-50" />
                             <span className="text-[10px] uppercase tracking-wider">No Image</span>
                          </div>
                        )}
                        
                        {/* Overlay for Upload */}
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 backdrop-blur-sm">
                           <button 
                             onClick={() => fileInputRef.current?.click()}
                             className="flex flex-col items-center gap-2 text-white hover:text-neon-green transition-colors p-2"
                           >
                              <div className="p-3 bg-slate-800 rounded-full border border-slate-600 group-hover:border-neon-green">
                                <Upload size={20} />
                              </div>
                              <span className="text-[10px] font-bold font-mono uppercase tracking-wider">Upload File</span>
                           </button>
                        </div>
                    </div>
                    
                    <input 
                      type="file"
                      ref={fileInputRef}
                      onChange={handlePhotoUpload}
                      accept="image/*"
                      className="hidden"
                    />

                    {/* URL Input Fallback */}
                    <div className="flex items-center gap-3 bg-slate-800 p-3 rounded-lg border border-slate-700 focus-within:border-neon-green transition-colors">
                      <span className="text-[10px] font-mono text-slate-500 uppercase shrink-0">OR URL</span>
                      <input 
                        type="text" 
                        value={unitForm.imageUrl}
                        onChange={e => setUnitForm({...unitForm, imageUrl: e.target.value})}
                        placeholder="https://..."
                        className="bg-transparent text-white w-full focus:outline-none text-xs font-mono"
                      />
                    </div>
                  </div>
                </div>

             </div>

             {/* Footer */}
             <div className="p-4 border-t border-slate-800 bg-slate-900">
               <button 
                 onClick={handleSaveUnit}
                 className="w-full py-3 bg-neon-green text-slate-950 font-bold rounded-xl hover:bg-neon-green/90 transition-all shadow-lg shadow-neon-green/20"
               >
                 SAVE STORAGE UNIT
               </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}

const BoxIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-500">
    <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>
    <path d="m3.3 7 8.7 5 8.7-5"/>
    <path d="M12 22V12"/>
  </svg>
);

export default App;
