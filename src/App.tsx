import React, { useState, useEffect, useRef } from 'react';
import Scanner from './components/Scanner';
import ProfitCalculator from './components/ProfitCalculator';
import PricingModal from './components/PricingModal';
import SettingsModal from './components/SettingsModal';
import FeedbackModal from './components/FeedbackModal';
import StatsView from './components/StatsView';
import CompsModal from './components/CompsModal';
import PreviewModal from './components/PreviewModal';
import HelpModal from './components/HelpModal';
import DisclaimerModal from './components/DisclaimerModal';
import PrivacyPolicyModal from './components/PrivacyPolicyModal';
import Logo from './components/Logo';
import { ScoutStatus, ScoutResult, InventoryItem, ProfitCalculation, StorageUnit, ItemSpecifics } from './types';
import { analyzeItemImage, analyzeItemText, generateListingDescription, refinePriceAnalysis, optimizeTitle, suggestItemSpecifics, optimizeProductImage } from './services/geminiService';
import { useAuth } from './contexts/AuthContext';
import { useTheme } from './contexts/ThemeContext';
import AuthScreen from './components/AuthScreen';
import { incrementDailyUsage } from './services/paymentService';
import { checkEbayConnection, getEbayPolicies, extractEbayId, fetchEbayItemDetails, searchEbayByImage, searchEbayComps, API_BASE_URL } from './services/ebayService';
import { compressImage, uploadScanImage } from './services/imageService';
import {
    fetchInventory, addInventoryItem, deleteInventoryItem, updateInventoryItem,
    fetchStorageUnits, addStorageUnit, updateStorageUnit, batchUpdateUnitItemCosts,
    logScanEvent
} from './services/databaseService';
import { Camera, LayoutDashboard, Package, Settings, Edit2, Save, Trash2, Plus, X, Image as ImageIcon, Search as SearchIcon, Upload, Layers, Mic, MicOff, Sun, Moon, ScanLine, Filter, Calendar, RefreshCw, Tag, Wand2, Warehouse, MapPin, DollarSign, ChevronDown as ChevronDownIcon, ChevronUp, Box, Barcode, Globe2, Maximize2, Folder, List as ListIcon, AlertTriangle, Eye, Truck, ShieldCheck, CreditCard, Loader2, ShoppingCart, ExternalLink, BarChart3, HelpCircle, Facebook, ShieldAlert, Zap, Globe, Download, Link as LinkIcon, Camera as CameraIcon, ChevronDown, ChevronLeft, ChevronRight, ArrowRight, Copy } from 'lucide-react';

const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

const DEFAULT_SPECIFIC_KEYS = ['Brand', 'Model', 'MPN', 'Type', 'UPC'];

const EbayLogo = () => (
    <div className="flex items-baseline font-black tracking-tighter leading-none select-none text-sm">
        <span className="text-[#e53238]">e</span>
        <span className="text-[#0064d2]">b</span>
        <span className="text-[#f5af02]">a</span>
        <span className="text-[#86b817]">y</span>
    </div>
);

import LiteView from './components/LiteView';

function App() {
    const { user, loading: authLoading, refreshSubscription } = useAuth();
    const { theme, toggleTheme } = useTheme();

    const [isLiteMode, setIsLiteMode] = useState(false);
    const [view, setView] = useState<'scout' | 'inventory' | 'stats'>('scout');
    const [inventoryTab, setInventoryTab] = useState<'DRAFT' | 'LISTED' | 'SOLD'>('DRAFT');
    const [inventoryViewMode, setInventoryViewMode] = useState<'FOLDERS' | 'FLAT'>('FOLDERS');
    const [expandedUnits, setExpandedUnits] = useState<Set<string>>(new Set());

    const [status, setStatus] = useState<ScoutStatus>(ScoutStatus.IDLE);
    const [scanMode, setScanMode] = useState<'AI' | 'LENS'>('AI');
    const [cameraMode, setCameraMode] = useState<'SCOUT' | 'EDIT'>('SCOUT');
    const [currentImage, setCurrentImage] = useState<string | null>(null);
    const [publicImageLink, setPublicImageLink] = useState<string | null>(null);
    const [scoutResult, setScoutResult] = useState<ScoutResult | null>(null);
    const [scannedBarcode, setScannedBarcode] = useState<string | null>(null);
    const [manualQuery, setManualQuery] = useState("");

    // Lens Mode States
    const [importUrl, setImportUrl] = useState("");
    const [isImporting, setIsImporting] = useState(false);
    const [visualSearchResults, setVisualSearchResults] = useState<any[]>([]);
    const [isVisualSearching, setIsVisualSearching] = useState(false);
    const [lensKeyword, setLensKeyword] = useState("");

    const [isBulkMode, setIsBulkMode] = useState(false);
    const [activeUnit, setActiveUnit] = useState<string>("55");
    const [isEditingUnit, setIsEditingUnit] = useState(false);

    const [editedTitle, setEditedTitle] = useState("");
    const [conditionNotes, setConditionNotes] = useState("");
    const [binLocation, setBinLocation] = useState("");
    const [itemCondition, setItemCondition] = useState<'NEW' | 'USED'>('USED');
    const [isRecording, setIsRecording] = useState<'title' | 'condition' | null>(null);

    const [listingPlatform, setListingPlatform] = useState<'EBAY' | 'FACEBOOK' | null>(null);
    const [generatedListing, setGeneratedListing] = useState("");
    const [isGeneratingListing, setIsGeneratingListing] = useState(false);

    const [ebayConnected, setEbayConnected] = useState(false);
    const [ebayPolicies, setEbayPolicies] = useState<{ paymentPolicies: any[], returnPolicies: any[], shippingPolicies: any[] }>({ paymentPolicies: [], returnPolicies: [], shippingPolicies: [] });

    const [isCreatingDraft, setIsCreatingDraft] = useState<string | null>(null);
    const [loadingMessage, setLoadingMessage] = useState<string>("");
    const [isSaving, setIsSaving] = useState(false);
    const [currentListingPrice, setCurrentListingPrice] = useState<number>(0);
    const [isOptimizingImage, setIsOptimizingImage] = useState<boolean>(false);

    const [inventory, setInventory] = useState<InventoryItem[]>([]);
    const [storageUnits, setStorageUnits] = useState<StorageUnit[]>([]);

    const [isPricingOpen, setIsPricingOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
    const [isCompsOpen, setIsCompsOpen] = useState(false);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [isUnitModalOpen, setIsUnitModalOpen] = useState(false);
    const [isHelpOpen, setIsHelpOpen] = useState(false);
    const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
    const [showTos, setShowTos] = useState(false);

    const [itemToDelete, setItemToDelete] = useState<string | null>(null);
    const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);

    const [viewingImageIndex, setViewingImageIndex] = useState<number | null>(null);

    const [unitForm, setUnitForm] = useState({ id: '', storeNumber: '', address: '', cost: '', imageUrl: '' });

    const scoutInputRef = useRef<HTMLInputElement>(null);
    const editImageInputRef = useRef<HTMLInputElement>(null);
    const additionalImageInputRef = useRef<HTMLInputElement>(null);
    const unitImageInputRef = useRef<HTMLInputElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const recognitionRef = useRef<any>(null);

    const imageCache = useRef<Map<string, string>>(new Map());

    // Derived State
    const listedTodayCount = inventory.filter(i => i.status === 'LISTED' && new Date(i.ebayListedDate || i.dateScanned).toDateString() === new Date().toDateString()).length;

    useEffect(() => {
        const accepted = localStorage.getItem('sts_tos_accepted');
        if (!accepted) {
            setShowTos(true);
        }
    }, []);

    const handleAcceptTos = () => {
        localStorage.setItem('sts_tos_accepted', 'true');
        setShowTos(false);
    };

    useEffect(() => {
        if (user) {
            const connected = localStorage.getItem('sts_ebay_connected');
            if (connected) {
                setEbayConnected(true);
                loadEbayPolicies(user.id);
            }

            Promise.all([
                fetchInventory(),
                fetchStorageUnits(),
                checkEbayConnection()
            ]).then(([inv, units, connected]) => {
                setInventory(inv);
                setStorageUnits(units);
                setEbayConnected(connected);
                if (connected) loadEbayPolicies(user.id);

                if (units.length > 0 && activeUnit === "55") {
                    setActiveUnit(units[0].storeNumber);
                }
            });
        }
    }, [user]);

    const loadEbayPolicies = async (userId: string) => {
        const policies = await getEbayPolicies(userId);
        setEbayPolicies(policies);
    };

    const refreshData = async () => {
        const [inv, units] = await Promise.all([fetchInventory(), fetchStorageUnits()]);
        setInventory(inv);
        setStorageUnits(units);
    };

    const getUnitStats = (storeNumber: string, unitCost: number) => {
        const unitItems = inventory.filter(i => i.storageUnitId === storeNumber);
        const totalSoldValue = unitItems.reduce((sum, i) => sum + i.calculation.soldPrice, 0);
        const totalProfit = unitItems.reduce((sum, i) => sum + i.calculation.netProfit, 0);
        const progressPercent = Math.min(100, (totalSoldValue / (unitCost || 1)) * 100);
        const isBreakEven = totalSoldValue >= unitCost;

        return { totalSoldValue, totalProfit, progressPercent, isBreakEven };
    };

    const ensureDefaultSpecifics = (existing: ItemSpecifics = {}) => {
        const updated = { ...existing };
        DEFAULT_SPECIFIC_KEYS.forEach(key => {
            if (!updated[key]) updated[key] = "Unknown";
        });
        return updated;
    };

    const openEditModal = (item: InventoryItem) => {
        const defaultShipping = localStorage.getItem('sts_default_shipping_policy');
        const defaultReturn = localStorage.getItem('sts_default_return_policy');
        const defaultPayment = localStorage.getItem('sts_default_payment_policy');

        setEditingItem({
            ...item,
            itemSpecifics: ensureDefaultSpecifics(item.itemSpecifics),
            ebayShippingPolicyId: item.ebayShippingPolicyId || defaultShipping || undefined,
            ebayReturnPolicyId: item.ebayReturnPolicyId || defaultReturn || undefined,
            ebayPaymentPolicyId: item.ebayPaymentPolicyId || defaultPayment || undefined,
        });
        setViewingImageIndex(null);
    };

    const handleDeleteImage = (indexToDelete: number) => {
        if (!editingItem) return;
        if (indexToDelete === 0) {
            const nextImage = editingItem.additionalImages && editingItem.additionalImages.length > 0
                ? editingItem.additionalImages[0]
                : '';
            const remainingAdditional = editingItem.additionalImages && editingItem.additionalImages.length > 0
                ? editingItem.additionalImages.slice(1)
                : [];
            setEditingItem({
                ...editingItem,
                imageUrl: nextImage,
                additionalImages: remainingAdditional
            });
        } else {
            const arrayIndex = indexToDelete - 1;
            const newAdditional = [...(editingItem.additionalImages || [])];
            newAdditional.splice(arrayIndex, 1);
            setEditingItem({
                ...editingItem,
                additionalImages: newAdditional
            });
        }
    };

    // Helper: Item Specifics Management
    const handleUpdateSpecific = (key: string, value: string) => {
        if (!editingItem) return;
        const newSpecifics = { ...editingItem.itemSpecifics, [key]: value };
        setEditingItem({ ...editingItem, itemSpecifics: newSpecifics });
    };

    const handleRenameSpecific = (oldKey: string, newKey: string) => {
        if (!editingItem || !editingItem.itemSpecifics) return;
        const value = editingItem.itemSpecifics[oldKey];
        const newSpecifics = { ...editingItem.itemSpecifics };
        delete newSpecifics[oldKey];
        if (newKey) newSpecifics[newKey] = value;
        setEditingItem({ ...editingItem, itemSpecifics: newSpecifics });
    };

    const handleDeleteSpecific = (key: string) => {
        if (!editingItem || !editingItem.itemSpecifics) return;
        const newSpecifics = { ...editingItem.itemSpecifics };
        delete newSpecifics[key];
        setEditingItem({ ...editingItem, itemSpecifics: newSpecifics });
    };

    const handleAddSpecific = () => {
        if (!editingItem) return;
        const newKey = prompt("Enter specific name (e.g. Color, Size, Material):");
        if (newKey) {
            const newSpecifics = { ...editingItem.itemSpecifics, [newKey]: "" };
            setEditingItem({ ...editingItem, itemSpecifics: newSpecifics });
        }
    };

    const handleStartScan = () => {
        setCameraMode('SCOUT');
        setStatus(ScoutStatus.SCANNING);
        setCurrentImage(null);
        setPublicImageLink(null);
        setScoutResult(null);
        setScannedBarcode(null);
        setEditedTitle("");
        setBinLocation("");
        setConditionNotes("");
        setGeneratedListing("");
        setListingPlatform(null);
        setCurrentListingPrice(0);
        setItemCondition('USED');
        setImportUrl("");
        setVisualSearchResults([]);
        setLensKeyword("");
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64 = reader.result as string;
                handleImageCaptured(base64);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleEditImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && editingItem && user) {
            const reader = new FileReader();
            reader.onloadend = async () => {
                const base64 = reader.result as string;
                const publicUrl = await uploadScanImage(user.id, base64);
                if (publicUrl) {
                    imageCache.current.set(publicUrl, base64);
                    setEditingItem({ ...editingItem, imageUrl: publicUrl });
                } else {
                    setEditingItem({ ...editingItem, imageUrl: base64 });
                }
            };
            reader.readAsDataURL(file);
        }
    };

    const handleAdditionalImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!editingItem || !user || !e.target.files) return;
        const files = Array.from(e.target.files);
        if (files.length === 0) return;
        const newImages: string[] = [];
        for (const file of files) {
            const reader = new FileReader();
            await new Promise<void>((resolve) => {
                reader.onloadend = async () => {
                    const base64 = reader.result as string;
                    const publicUrl = await uploadScanImage(user.id, base64);
                    const finalUrl = publicUrl || base64;
                    if (publicUrl) imageCache.current.set(publicUrl, base64);
                    newImages.push(finalUrl);
                    resolve();
                };
                reader.readAsDataURL(file);
            });
        }
        const currentAdditional = editingItem.additionalImages || [];
        const updated = [...currentAdditional, ...newImages].slice(0, 24);
        setEditingItem({ ...editingItem, additionalImages: updated });
    };

    const handleOptimizeImage = async (index: number, currentUrl: string | undefined) => {
        if (!currentUrl || !user || !editingItem) return;
        setIsOptimizingImage(true);
        try {
            const cachedBase64 = imageCache.current.get(currentUrl);
            const inputForAI = cachedBase64 || currentUrl;
            const optimizedBase64 = await optimizeProductImage(inputForAI, editingItem.title);
            if (!optimizedBase64) throw new Error("AI failed to generate image. Please retry.");
            const publicUrl = await uploadScanImage(user.id, optimizedBase64);
            if (!publicUrl) throw new Error("Upload failed");
            imageCache.current.set(publicUrl, optimizedBase64);
            if (index === 0) {
                setEditingItem({ ...editingItem, imageUrl: publicUrl });
            } else {
                const adjIndex = index - 1;
                const updatedAdd = [...(editingItem.additionalImages || [])];
                if (updatedAdd[adjIndex]) {
                    updatedAdd[adjIndex] = publicUrl;
                    setEditingItem({ ...editingItem, additionalImages: updatedAdd });
                }
            }
            alert("Image Optimized Successfully!");
        } catch (e: any) {
            console.error("Optimization error:", e);
            alert(`Optimization failed: ${e.message || "Unknown Error"}`);
        } finally {
            setIsOptimizingImage(false);
        }
    };

    const handleManualSearch = async () => {
        if (!manualQuery.trim()) return;
        setStatus(ScoutStatus.ANALYZING);
        setCurrentImage(null);
        setScoutResult(null);
        setScannedBarcode(null);
        const result = await analyzeItemText(manualQuery);
        setScoutResult(result);
        setEditedTitle(result.itemTitle);
        setItemCondition(result.condition || 'USED');
        setStatus(ScoutStatus.COMPLETE);
        if (user) incrementDailyUsage();
    };

    const handlePerformVisualSearch = async () => {
        if (!currentImage) return;
        setIsVisualSearching(true);
        setVisualSearchResults([]);
        try {
            const results = await searchEbayByImage(currentImage);
            if (results && results.length > 0) {
                setVisualSearchResults(results);
            } else {
                // Fallback?
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsVisualSearching(false);
        }
    };

    const handleLensKeywordSearch = async () => {
        if (!lensKeyword.trim()) return;
        setIsVisualSearching(true);
        try {
            const data = await searchEbayComps(lensKeyword, 'ACTIVE', 'USED');
            if (data.comps && data.comps.length > 0) {
                setVisualSearchResults(data.comps.map(c => ({
                    id: c.id,
                    title: c.title,
                    price: c.price,
                    shipping: c.shipping,
                    image: c.image,
                    url: c.url,
                    condition: c.condition
                })));
            } else {
                alert("No matches found for keywords.");
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsVisualSearching(false);
        }
    };

    const handleSelectVisualMatch = async (match: any) => {
        setIsImporting(true);
        try {
            const details = await fetchEbayItemDetails(match.id);
            const price = parseFloat(details.price || match.price || '0');
            setEditedTitle(details.title);
            const mergedSpecifics = ensureDefaultSpecifics(details.itemSpecifics);
            if (details.weight) mergedSpecifics.Weight = details.weight;

            setScoutResult({
                itemTitle: details.title,
                estimatedSoldPrice: price,
                estimatedShippingCost: 0,
                estimatedWeight: details.weight || "",
                confidence: 100,
                description: details.description,
                condition: details.condition,
                itemSpecifics: mergedSpecifics,
                listingSources: [{ title: 'eBay Import', uri: details.url }]
            });
            setGeneratedListing(details.description);
            setListingPlatform('EBAY');
            setItemCondition(details.condition === 'New' ? 'NEW' : 'USED');
        } catch (e) {
            console.error(e);
            setEditedTitle(match.title);
            setScoutResult({
                itemTitle: match.title,
                estimatedSoldPrice: match.price,
                estimatedShippingCost: match.shipping || 0,
                estimatedWeight: "",
                confidence: 90,
                description: "",
                condition: 'USED',
                itemSpecifics: ensureDefaultSpecifics({}),
                listingSources: [{ title: 'eBay Match', uri: match.url }]
            });
        } finally {
            setIsImporting(false);
            setVisualSearchResults([]);
        }
    };

    const handleUsePrice = (match: any) => {
        setScoutResult(prev => {
            if (!prev) return null;
            return {
                ...prev,
                estimatedSoldPrice: match.price,
                estimatedShippingCost: match.shipping || 0
            };
        });
    };

    const handleImageCaptured = async (imageData: string, barcode?: string) => {
        // 1. Compress immediately for UI responsiveness
        const compressed = await compressImage(imageData);

        // EDIT MODE LOGIC
        if (cameraMode === 'EDIT' && editingItem) {
            let newUrl = compressed;
            // Background upload for edit mode
            if (user) {
                uploadScanImage(user.id, compressed).then(publicUrl => {
                    if (publicUrl) {
                        imageCache.current.set(publicUrl, compressed);
                        // We'd ideally update the item again here, but for now local blob is fine until save
                    }
                });
            }

            const current = editingItem.additionalImages || [];
            if (!editingItem.imageUrl || editingItem.imageUrl.includes('unsplash') || !editingItem.imageUrl) {
                setEditingItem({ ...editingItem, imageUrl: newUrl });
            } else {
                setEditingItem({
                    ...editingItem,
                    additionalImages: [...current, newUrl].slice(0, 24)
                });
            }
            setStatus(ScoutStatus.IDLE);
            return;
        }

        // SCOUT MODE LOGIC
        setStatus(ScoutStatus.ANALYZING);
        setCurrentImage(compressed);
        setScannedBarcode(barcode || null);

        // SPEED OPTIMIZATION: Start Upload in Background (Do not await)
        if (user) {
            uploadScanImage(user.id, compressed).then(url => {
                if (url) setPublicImageLink(url);
            });
        }

        // LENS MODE: Speed is key. Identify -> Keyword -> eBay Search
        if (scanMode === 'LENS' && !barcode) {
            setLoadingMessage("Identifying...");

            try {
                // Step 1: Fast ID with Gemini
                const idResult = await analyzeItemImage(compressed, undefined, false);
                const query = idResult.searchQuery || idResult.itemTitle;

                setLensKeyword(query);
                setEditedTitle(idResult.itemTitle);

                setLoadingMessage(`Searching: ${query.substring(0, 20)}...`);

                // Step 2: Immediate eBay Search with identified keywords
                const data = await searchEbayComps(query, 'ACTIVE', 'USED');
                if (data.comps && data.comps.length > 0) {
                    setVisualSearchResults(data.comps.map(c => ({
                        id: c.id,
                        title: c.title,
                        price: c.price,
                        shipping: c.shipping,
                        image: c.image,
                        url: c.url,
                        condition: c.condition
                    })));
                }

                setScoutResult({
                    itemTitle: idResult.itemTitle,
                    estimatedSoldPrice: 0,
                    estimatedShippingCost: 0,
                    estimatedWeight: "",
                    confidence: 0,
                    description: "Visual Search",
                    listingSources: [],
                    isBulkLot: false,
                    itemSpecifics: ensureDefaultSpecifics(idResult.itemSpecifics)
                });
            } catch (e) {
                console.error("Lens flow failed", e);
                setScoutResult(null); // Will show error UI
            }

            setStatus(ScoutStatus.COMPLETE);
            return;
        }

        // AI PREMIUM MODE (Standard)
        let result: ScoutResult;
        if (barcode) {
            result = await analyzeItemText(barcode);
            result.barcode = barcode;
        } else {
            result = await analyzeItemImage(compressed, undefined, isBulkMode);
        }

        result.itemSpecifics = ensureDefaultSpecifics(result.itemSpecifics);
        setScoutResult(result);
        setEditedTitle(result.itemTitle);
        setItemCondition(result.condition || 'USED');
        setStatus(ScoutStatus.COMPLETE);

        if (user) {
            incrementDailyUsage();
            // Log in background
            logScanEvent({
                dateScanned: new Date().toISOString(),
                // Use compressed local image if public link isn't ready yet, it's just for history
                imageUrl: compressed,
                title: result.itemTitle,
                barcode: barcode,
                estimatedValue: result.estimatedSoldPrice,
                resultStatus: 'SCANNED'
            }, user.id);
        }
    };

    const handleImportFromUrl = async () => {
        if (!importUrl) return;
        const id = extractEbayId(importUrl);
        if (!id) {
            alert("Could not find a valid eBay Item ID in that URL.");
            return;
        }
        setIsImporting(true);
        try {
            const details = await fetchEbayItemDetails(id);
            const price = parseFloat(details.price || '0');
            setEditedTitle(details.title);
            const mergedSpecifics = ensureDefaultSpecifics(details.itemSpecifics);
            if (details.weight) mergedSpecifics.Weight = details.weight;

            setScoutResult({
                itemTitle: details.title,
                estimatedSoldPrice: price,
                estimatedShippingCost: 0,
                estimatedWeight: details.weight || "",
                confidence: 100,
                description: details.description,
                condition: details.condition,
                itemSpecifics: mergedSpecifics,
                listingSources: [{ title: 'eBay Import', uri: details.url }]
            });
            setGeneratedListing(details.description);
            setListingPlatform('EBAY');
            setItemCondition(details.condition === 'New' ? 'NEW' : 'USED');
            alert("Details Imported Successfully!");
        } catch (e: any) {
            alert("Import failed: " + e.message);
        } finally {
            setIsImporting(false);
            setImportUrl("");
        }
    };

    const handleRetryAnalysis = async () => {
        if (!currentImage) return;
        setStatus(ScoutStatus.ANALYZING);
        setScoutResult(null);
        const result = await analyzeItemImage(currentImage, scoutResult?.barcode, isBulkMode);
        result.itemSpecifics = ensureDefaultSpecifics(result.itemSpecifics);
        setScoutResult(result);
        setEditedTitle(result.itemTitle);
        setItemCondition(result.condition || 'USED');
        setStatus(ScoutStatus.COMPLETE);
    };

    const handleSellSimilar = (importedData: any) => {
        const newPrice = importedData.price ? parseFloat(importedData.price) : 0;
        // Robust weight extraction: check direct property, itemSpecifics, or shipping object
        const newWeight = importedData.weight || importedData.itemSpecifics?.Weight || importedData.shipping?.weight || "";
        const newDims = importedData.dimensions || importedData.shipping?.dimensions || "";

        if (editingItem) {
            // Merge imported data into existing item
            // Specifically merge itemSpecifics: imported overrides existing defaults
            const mergedSpecifics = { ...ensureDefaultSpecifics(editingItem.itemSpecifics), ...importedData.itemSpecifics };
            if (newWeight) mergedSpecifics.Weight = newWeight;

            setEditingItem({
                ...editingItem,
                title: importedData.title || editingItem.title,
                conditionNotes: importedData.condition || editingItem.conditionNotes,
                itemSpecifics: mergedSpecifics,
                generatedListing: { platform: 'EBAY', content: importedData.description || '' },
                calculation: { ...editingItem.calculation, soldPrice: newPrice || editingItem.calculation.soldPrice }
            });
            if (newPrice) setCurrentListingPrice(newPrice);
        } else if (scoutResult) {
            // Scout Mode
            setEditedTitle(importedData.title);
            const newSpecifics = ensureDefaultSpecifics(importedData.itemSpecifics);
            if (newWeight) newSpecifics.Weight = newWeight;

            setScoutResult(prev => prev ? ({
                ...prev,
                itemTitle: importedData.title,
                estimatedSoldPrice: newPrice,
                itemSpecifics: newSpecifics,
                estimatedWeight: newWeight,
                description: importedData.description
            }) : null);
            setGeneratedListing(importedData.description || '');
            setListingPlatform('EBAY');
        }
        alert("Success! All listing data imported.");
    };

    const handleConditionChange = async (newCondition: 'NEW' | 'USED') => {
        setItemCondition(newCondition);
        if (scoutResult && scanMode === 'AI') {
            setScoutResult({ ...scoutResult, condition: newCondition });
            setLoadingMessage("Refining price...");
            const newPrice = await refinePriceAnalysis(editedTitle || scoutResult.itemTitle, newCondition);
            if (newPrice > 0) setScoutResult(prev => prev ? ({ ...prev, estimatedSoldPrice: newPrice }) : null);
            setLoadingMessage("");
        }
    };

    const handleOptimizeTitle = async () => {
        setLoadingMessage("Optimizing Title...");
        const newTitle = await optimizeTitle(editingItem ? editingItem.title : editedTitle);
        if (editingItem) setEditingItem({ ...editingItem, title: newTitle });
        else setEditedTitle(newTitle);
        setLoadingMessage("");
    };

    const toggleRecording = (field: 'title' | 'condition') => {
        if (isRecording) { recognitionRef.current?.stop(); setIsRecording(null); return; }
        if (!SpeechRecognition) { alert("Voice recognition not supported."); return; }
        const recognition = new SpeechRecognition();
        recognition.continuous = false; recognition.lang = 'en-US';
        recognition.onstart = () => setIsRecording(field);
        recognition.onend = () => setIsRecording(null);
        recognition.onresult = (event: any) => {
            const transcript = event.results[0][0].transcript;
            if (field === 'title') {
                if (editingItem) setEditingItem({ ...editingItem, title: editingItem.title + ' ' + transcript });
                else setEditedTitle(prev => prev ? `${prev} ${transcript}` : transcript);
            } else {
                if (editingItem) setEditingItem({ ...editingItem, conditionNotes: (editingItem.conditionNotes || '') + ' ' + transcript });
                else setConditionNotes(prev => prev ? `${prev} ${transcript}` : transcript);
            }
        };
        recognitionRef.current = recognition; recognition.start();
    };

    const handleGenerateListing = async (platform: 'EBAY' | 'FACEBOOK') => {
        setListingPlatform(platform); setIsGeneratingListing(true);
        const text = await generateListingDescription(
            editingItem ? editingItem.title : editedTitle,
            editingItem ? (editingItem.conditionNotes || '') : conditionNotes,
            platform
        );
        if (editingItem) setEditingItem({ ...editingItem, generatedListing: { ...editingItem.generatedListing!, platform, content: text } });
        else setGeneratedListing(text);
        setIsGeneratingListing(false);
    };

    const calculateDynamicCost = (unitId: string, countModifier: number = 0): number => {
        const unit = storageUnits.find(u => u.storeNumber === unitId);
        if (!unit) return 0;
        const currentCount = inventory.filter(i => i.storageUnitId === unitId).length;
        return Number((unit.cost / Math.max(1, currentCount + countModifier)).toFixed(2));
    };

    const handleSaveToInventory = async (calc: ProfitCalculation, costCode: string, itemCost: number, weight: string) => {
        if (!scoutResult || !user) return;
        setIsSaving(true);
        try {
            let finalImageUrl = currentImage || undefined;
            // If we have a public link from background upload, use it. Otherwise try uploading again or fallback to compressed.
            if (publicImageLink) {
                finalImageUrl = publicImageLink;
            } else if (currentImage) {
                // Upload wasn't finished or failed, try once more
                const storageUrl = await uploadScanImage(user.id, currentImage);
                if (storageUrl) { finalImageUrl = storageUrl; imageCache.current.set(storageUrl, currentImage); }
                else finalImageUrl = await compressImage(currentImage, 800, 0.6);
            }

            const currentUnit = activeUnit || "55";
            const newDynamicCost = calculateDynamicCost(currentUnit, 1);
            const sku = `UNIT${currentUnit}-${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase().replace(' ', '')}-C${Math.floor(newDynamicCost)}-${Math.floor(Math.random() * 1000)}`;

            const fees = calc.platformFees;
            const net = calc.soldPrice - fees - calc.shippingCost - newDynamicCost;

            const newItem: InventoryItem = {
                id: '', sku, title: editedTitle || scoutResult.itemTitle || "Untitled Item",
                dateScanned: new Date().toISOString(), storageUnitId: currentUnit, costCode: `C${Math.floor(newDynamicCost)}`,
                calculation: { ...calc, itemCost: newDynamicCost, netProfit: net, isProfitable: net >= 15 },
                imageUrl: finalImageUrl, additionalImages: [], status: 'DRAFT', binLocation, conditionNotes,
                itemSpecifics: { ...ensureDefaultSpecifics(scoutResult.itemSpecifics), Weight: weight }, postalCode: localStorage.getItem('sts_default_zip') || "95125",
                generatedListing: generatedListing ? { platform: listingPlatform!, content: generatedListing } : undefined,
                ebayShippingPolicyId: localStorage.getItem('sts_default_shipping_policy') || undefined,
                ebayReturnPolicyId: localStorage.getItem('sts_default_return_policy') || undefined,
                ebayPaymentPolicyId: localStorage.getItem('sts_default_payment_policy') || undefined,
            };

            await addInventoryItem(newItem, user.id);
            await batchUpdateUnitItemCosts(currentUnit, newDynamicCost);
            await refreshData();

            setStatus(ScoutStatus.IDLE); setScoutResult(null); setScannedBarcode(null); setView('inventory'); setInventoryTab('DRAFT');
        } catch (e: any) { alert("Failed to save: " + e.message); } finally { setIsSaving(false); }
    };

    const handleEstimateWeight = async () => {
        if (!editingItem || !editingItem.imageUrl) return;
        setIsGeneratingListing(true);
        try {
            // Fetch image and convert to base64 if needed
            let base64Image = editingItem.imageUrl;
            if (base64Image.startsWith('http') || base64Image.startsWith('blob:')) {
                const response = await fetch(base64Image);
                const blob = await response.blob();
                base64Image = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.readAsDataURL(blob);
                });
            }

            // Call Gemini with weight/dims focus (re-using analyzeItemImage)
            const analysis = await analyzeItemImage(base64Image, undefined, false, true);

            // Update editing item with new weight and dims
            const newWeight = analysis.estimatedWeight || "";
            let newDims = analysis.estimatedDimensions;
            let dimMsg = newDims;

            if (!newDims) {
                newDims = "12 x 10 x 8";
                dimMsg = "12 x 10 x 8 (Defaulted - AI Unsure)";
            }

            setEditingItem(prev => prev ? ({
                ...prev,
                itemSpecifics: { ...prev.itemSpecifics, Weight: newWeight },
                dimensions: newDims
            }) : null);

            alert(`Estimated: ${newWeight} | ${dimMsg}`);
        } catch (e) {
            console.error("Weight estimation failed:", e);
            alert("Failed to estimate weight/dims. Please try again.");
        } finally {
            setIsGeneratingListing(false);
        }
    };

    const handleUpdateInventoryItem = async (calc: ProfitCalculation, costCode: string, itemCost: number, weight: string, dimensions?: string) => {
        if (!editingItem) return;
        try {
            const updatedItem: InventoryItem = {
                ...editingItem,
                calculation: calc,
                costCode,
                itemSpecifics: { ...editingItem.itemSpecifics, Weight: weight },
                dimensions: dimensions || editingItem.dimensions
            };

            // Optimistic update
            setInventory(prev => prev.map(item => item.id === editingItem.id ? updatedItem : item));
            setEditingItem(updatedItem);

            await updateInventoryItem(updatedItem);
            alert("Updated.");
        } catch (e: any) {
            alert("Failed: " + e.message);
        }
    };

    const handlePushToEbay = async (item: InventoryItem) => {
        if (!user) return;
        if (!ebayConnected) { setIsSettingsOpen(true); return; }
        if (!confirm(`List "${item.title}" on eBay?`)) return;
        setIsCreatingDraft(item.id); setLoadingMessage("Listing on eBay...");
        const zipToSend = localStorage.getItem('sts_default_zip') || "95125";

        try {
            const processedImages: string[] = [];
            const rawImages = [item.imageUrl, ...(item.additionalImages || [])].filter((img): img is string => !!img);
            for (const img of rawImages) {
                if (img.startsWith('http')) processedImages.push(img);
                else { const url = await uploadScanImage(user.id, img); if (url) processedImages.push(url); }
            }

            const payload = {
                userId: user.id,
                item: {
                    ...item, imageUrl: processedImages[0], additionalImages: processedImages.slice(1),
                    price: currentListingPrice || item.calculation.soldPrice,
                    description: item.generatedListing?.content || item.conditionNotes || item.title,
                    condition: itemCondition,
                    itemSpecifics: Object.fromEntries(Object.entries(item.itemSpecifics || {}).map(([k, v]) => {
                        if (typeof v === 'string' && v.toLowerCase() === 'unknown' && (k.toUpperCase() === 'MPN' || k.toUpperCase() === 'UPC')) {
                            return [k, "Does Not Apply"];
                        }
                        return [k, v];
                    })),
                    ebayShippingPolicyId: item.ebayShippingPolicyId, ebayReturnPolicyId: item.ebayReturnPolicyId, ebayPaymentPolicyId: item.ebayPaymentPolicyId,
                    weight: item.itemSpecifics?.Weight,
                    dimensions: item.dimensions,
                    postalCode: zipToSend
                }
            };
            const response = await fetch(`${API_BASE_URL}/api/ebay/draft`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const data = await response.json();
            if (!response.ok || !data.success) {
                if (data.actionRequiredUrl) { if (confirm(data.message)) window.open(data.actionRequiredUrl, '_blank'); return; }
                // Enhanced Error Reporting
                const errorMsg = data.error || data.message || "Listing Failed";
                throw new Error(errorMsg);
            }
            alert(data.message);
            const updatedItem: InventoryItem = { ...item, status: 'LISTED', ebayListingId: data.itemId, ebayListedDate: new Date().toISOString(), ebayUrl: data.inventoryUrl, ebayStatus: 'ACTIVE', ebayPrice: payload.item.price };
            await updateInventoryItem(updatedItem);
            setInventory(prev => prev.map(i => i.id === item.id ? updatedItem : i));
            if (editingItem?.id === item.id) setEditingItem(null);
            setInventoryTab('LISTED');
        } catch (e: any) { alert(`Failed: ${e.message}`); } finally { setIsCreatingDraft(null); setLoadingMessage(""); }
    };

    const handleDeleteItem = async (e: React.MouseEvent, id: string) => { e.stopPropagation(); setItemToDelete(id); };
    const confirmDelete = async () => {
        if (itemToDelete) {
            await deleteInventoryItem(itemToDelete);
            setInventory(prev => prev.filter(item => item.id !== itemToDelete));
            setItemToDelete(null); if (editingItem?.id === itemToDelete) setEditingItem(null);
            refreshData();
        }
    };

    const handleUnitImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = async () => {
                const base64 = reader.result as string;
                // Optionally upload to storage if user is logged in
                if (user) {
                    const publicUrl = await uploadScanImage(user.id, base64);
                    if (publicUrl) {
                        setUnitForm(prev => ({ ...prev, imageUrl: publicUrl }));
                        return;
                    }
                }
                // Fallback to base64
                setUnitForm(prev => ({ ...prev, imageUrl: base64 }));
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSaveUnit = async () => {
        if (!user || !unitForm.storeNumber) return;
        const newUnitData: StorageUnit = { id: unitForm.id, storeNumber: unitForm.storeNumber, address: unitForm.address, cost: parseFloat(unitForm.cost) || 0, imageUrl: unitForm.imageUrl };
        if (unitForm.id) await updateStorageUnit(newUnitData);
        else await addStorageUnit(newUnitData, user.id);
        setIsUnitModalOpen(false); refreshData();
    };

    const toggleUnitExpanded = (unitId: string) => {
        const newExpanded = new Set(expandedUnits);
        if (newExpanded.has(unitId)) {
            newExpanded.delete(unitId);
        } else {
            newExpanded.add(unitId);
        }
        setExpandedUnits(newExpanded);
    };

    const handleNavigateImage = (direction: 'next' | 'prev') => {
        if (!editingItem || viewingImageIndex === null) return;
        const allImages = [editingItem.imageUrl, ...(editingItem.additionalImages || [])].filter(Boolean);
        const total = allImages.length;
        if (total <= 1) return;

        if (direction === 'next') {
            setViewingImageIndex((prev) => (prev! + 1) % total);
        } else {
            setViewingImageIndex((prev) => (prev! - 1 + total) % total);
        }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
        if (!editingItem || viewingImageIndex === null) return;
        if (e.key === 'ArrowRight') handleNavigateImage('next');
        if (e.key === 'ArrowLeft') handleNavigateImage('prev');
        if (e.key === 'Escape') setViewingImageIndex(null);
    };

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [viewingImageIndex, editingItem]);

    // ... (renderInventoryItem, renderInventoryView unchanged)
    const renderInventoryItem = (item: InventoryItem) => (
        <div key={item.id} className="p-3 flex gap-3 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors group bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-lg mb-2 shadow-sm">
            <div className="w-16 h-16 bg-gray-200 dark:bg-slate-800 rounded-lg overflow-hidden shrink-0 relative border border-gray-200 dark:border-slate-700">
                {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-400"><ImageIcon size={20} /></div>
                )}
                {item.quantity && item.quantity > 1 && (
                    <div className="absolute top-0 right-0 bg-blue-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-bl shadow-sm">x{item.quantity}</div>
                )}
            </div>

            <div className="flex-1 min-w-0 flex flex-col justify-between" onClick={() => openEditModal(item)}>
                <div>
                    <div className="flex justify-between items-start">
                        <h4 className="font-bold text-sm text-slate-900 dark:text-white line-clamp-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{item.title}</h4>
                        <span className={`font-mono font-bold text-xs ${item.calculation.netProfit > 0 ? 'text-emerald-600 dark:text-neon-green' : 'text-red-500'}`}>
                            {item.status === 'SOLD' ? 'SOLD' : `$${item.calculation.soldPrice.toFixed(0)}`}
                        </span>
                    </div>
                    <div className="flex gap-2 text-[10px] text-slate-500 mt-1">
                        <span className="bg-gray-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-gray-200 dark:border-slate-700 flex items-center gap-1"><Box size={10} /> {item.binLocation || 'No Bin'}</span>
                        <span className="bg-gray-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-gray-200 dark:border-slate-700">Unit {item.storageUnitId}</span>
                    </div>
                </div>

                <div className="flex justify-between items-end mt-2">
                    <div className="flex items-center gap-2">
                        <div className="text-[10px] text-slate-400 font-mono">{new Date(item.dateScanned).toLocaleDateString()}</div>
                        {(item.status === 'LISTED' || item.status === 'SOLD') && item.ebayUrl && (
                            <a href={item.ebayUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-blue-500 hover:text-blue-400 p-1 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"><ExternalLink size={12} /></a>
                        )}
                    </div>
                    <div className="flex gap-2 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={(e) => { e.stopPropagation(); openEditModal(item); }} className="p-1.5 bg-gray-100 dark:bg-slate-800 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-slate-500 hover:text-blue-600 rounded-lg transition-colors"><Edit2 size={14} /></button>
                        {item.status === 'DRAFT' && <button onClick={(e) => { e.stopPropagation(); handlePushToEbay(item); }} className="p-1.5 bg-gray-100 dark:bg-slate-800 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-slate-500 hover:text-blue-600 rounded-lg transition-colors flex items-center gap-1 font-bold text-[10px]"><Upload size={14} /> List</button>}
                        <button onClick={(e) => handleDeleteItem(e, item.id)} className="p-1.5 bg-gray-100 dark:bg-slate-800 hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-500 hover:text-red-600 rounded-lg transition-colors"><Trash2 size={14} /></button>
                    </div>
                </div>
            </div>
        </div>
    );

    const renderInventoryView = () => {
        const filteredInventory = inventory.filter(item => {
            if (inventoryTab === 'DRAFT') return item.status === 'DRAFT';
            if (inventoryTab === 'LISTED') return item.status === 'LISTED';
            if (inventoryTab === 'SOLD') return item.status === 'SOLD';
            return true;
        });

        return (
            <div className="flex flex-col h-full bg-gray-50 dark:bg-slate-950 pt-safe">
                <div className="p-4 border-b border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 z-10 shadow-sm">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-black flex items-center gap-2 text-slate-900 dark:text-white">
                            <Package className="text-emerald-600 dark:text-neon-green" size={24} />
                            Inventory <span className="text-xs font-mono bg-gray-100 dark:bg-slate-800 px-2 py-1 rounded-full text-slate-500">{filteredInventory.length}</span>
                        </h2>
                        <div className="flex gap-2">
                            <button onClick={() => setInventoryViewMode(prev => prev === 'FLAT' ? 'FOLDERS' : 'FLAT')} className="p-2 bg-gray-100 dark:bg-slate-800 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-gray-200 dark:border-slate-700">
                                {inventoryViewMode === 'FLAT' ? <Layers size={18} /> : <ListIcon size={18} />}
                            </button>
                            <button onClick={() => { setIsUnitModalOpen(true); setUnitForm({ id: '', storeNumber: '', address: '', cost: '', imageUrl: '' }); }} className="p-2 bg-emerald-100 dark:bg-neon-green/20 text-emerald-700 dark:text-neon-green rounded-lg hover:bg-emerald-200 dark:hover:bg-neon-green/30 border border-emerald-200 dark:border-neon-green/30">
                                <Plus size={18} />
                            </button>
                        </div>
                    </div>
                    <div className="flex p-1 bg-gray-100 dark:bg-slate-800 rounded-xl">
                        {(['DRAFT', 'LISTED', 'SOLD'] as const).map(tab => (
                            <button key={tab} onClick={() => setInventoryTab(tab)} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${inventoryTab === tab ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>{tab}</button>
                        ))}
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-safe">
                    {inventoryViewMode === 'FOLDERS' && inventoryTab === 'DRAFT' ? (
                        storageUnits.map(unit => {
                            const unitItems = filteredInventory.filter(i => i.storageUnitId === unit.storeNumber);
                            if (unitItems.length === 0) return null;
                            const isExpanded = expandedUnits.has(unit.storeNumber);
                            return (
                                <div key={unit.id} className="border border-gray-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 overflow-hidden">
                                    <div className="p-3 flex items-center justify-between bg-gray-50 dark:bg-slate-800/50 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors" onClick={() => toggleUnitExpanded(unit.storeNumber)}>
                                        <div className="flex items-center gap-3">
                                            {isExpanded ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                                            <div className="flex items-center gap-2"><Warehouse size={16} className="text-blue-500" /><span className="font-bold text-sm text-slate-700 dark:text-slate-200">{unit.storeNumber}</span><span className="text-xs text-slate-400 font-normal">({unitItems.length})</span></div>
                                        </div>
                                        <button onClick={(e) => { e.stopPropagation(); setIsUnitModalOpen(true); setUnitForm({ id: unit.id, storeNumber: unit.storeNumber, address: unit.address, cost: String(unit.cost), imageUrl: unit.imageUrl || '' }); }} className="text-xs text-slate-400 hover:text-blue-500 underline">Edit Unit</button>
                                    </div>
                                    {isExpanded && (<div className="divide-y divide-gray-100 dark:divide-slate-800">{unitItems.map(item => renderInventoryItem(item))}</div>)}
                                </div>
                            );
                        })
                    ) : (
                        filteredInventory.length > 0 ? filteredInventory.map(item => renderInventoryItem(item)) : <div className="text-center py-12 text-slate-500"><Package size={48} className="mx-auto mb-4 opacity-20" /><p>No {inventoryTab.toLowerCase()} items found.</p></div>
                    )}
                </div>
            </div>
        );
    };

    const renderIdleState = () => {
        return (
            <div className="flex flex-col h-full overflow-y-auto bg-gray-50 dark:bg-slate-950 transition-colors duration-300 pt-safe pb-safe">
                <div className="flex flex-col items-center justify-center p-6 space-y-8 shrink-0 animate-in fade-in zoom-in duration-500 min-h-[80vh]">
                    <div className="w-full flex justify-between items-center px-4 absolute top-4 pt-safe left-0 z-20">
                        <button onClick={() => setIsHelpOpen(true)} className="p-2 rounded-full bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-neon-green transition-colors shadow-sm"><HelpCircle size={20} /></button>
                        <div className="flex gap-2">
                            <button onClick={() => setIsSettingsOpen(true)} className="p-2 rounded-full bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors shadow-sm"><Settings size={20} /></button>
                            <button onClick={toggleTheme} className="p-2 rounded-full bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-emerald-500 dark:hover:text-neon-green transition-colors shadow-sm">{theme === 'dark' ? <Sun size={18} className="text-yellow-400" /> : <Moon size={18} />}</button>
                        </div>
                    </div>

                    {/* Daily Progress Badge - Moved into flow to prevent overlap */}
                    <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-2xl px-6 py-3 flex flex-col items-center gap-1 shadow-2xl animate-in slide-in-from-top-4 duration-700 mt-10">
                        <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest font-bold">DAILY GOAL</span>
                        <div className="flex items-center gap-3">
                            <span className="w-3 h-3 bg-neon-green rounded-full animate-pulse shadow-[0_0_10px_#39ff14]"></span>
                            <span className="text-3xl font-black text-white tracking-tight">{listedTodayCount} Listed</span>
                        </div>
                    </div>

                    {/* Mode Toggle */}
                    <div className="flex bg-gray-200 dark:bg-slate-800 p-1 rounded-xl mb-2 shadow-inner">
                        <button onClick={() => setScanMode('AI')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${scanMode === 'AI' ? 'bg-white dark:bg-slate-700 shadow-sm text-emerald-600 dark:text-neon-green' : 'text-slate-500 dark:text-slate-400'}`}><Zap size={14} fill={scanMode === 'AI' ? 'currentColor' : 'none'} /> AI Premium</button>
                        <button onClick={() => setScanMode('LENS')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${scanMode === 'LENS' ? 'bg-white dark:bg-slate-700 shadow-sm text-blue-500 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'}`}><Globe size={14} /> Free Search</button>
                    </div>

                    <div className="relative group cursor-pointer" onClick={handleStartScan}>
                        <div className={`absolute inset-0 rounded-full blur-3xl transition-all duration-500 ${scanMode === 'AI' ? 'bg-emerald-500/20 dark:bg-neon-green/20 group-hover:bg-emerald-500/30 dark:group-hover:bg-neon-green/30' : 'bg-blue-500/20 dark:bg-blue-400/20 group-hover:bg-blue-500/30 dark:group-hover:bg-blue-400/30'}`}></div>
                        <div className={`w-40 h-40 rounded-full bg-white dark:bg-slate-900 border-4 flex items-center justify-center shadow-[0_0_50px_rgba(16,185,129,0.1)] dark:shadow-[0_0_50px_rgba(57,255,20,0.1)] relative z-10 group-hover:scale-105 transition-transform duration-300 ${scanMode === 'AI' ? 'border-gray-200 dark:border-slate-800 group-hover:border-emerald-500/50 dark:group-hover:border-neon-green/50' : 'border-blue-200 dark:border-blue-900 group-hover:border-blue-500/50'}`}>
                            <div className="absolute inset-2 border border-gray-200 dark:border-slate-700 rounded-full border-dashed animate-[spin_10s_linear_infinite] opacity-50"></div>
                            {scanMode === 'AI' ? (<Logo className="w-20 h-20 drop-shadow-[0_0_15px_rgba(57,255,20,0.5)]" />) : (<CameraIcon size={64} className="text-blue-500 dark:text-blue-400 drop-shadow-md" />)}
                            <div className={`absolute bottom-8 text-[10px] font-bold tracking-widest opacity-80 ${scanMode === 'AI' ? 'text-emerald-600 dark:text-neon-green' : 'text-blue-600 dark:text-blue-400'}`}>{scanMode === 'AI' ? 'START SCAN' : 'OPEN CAMERA'}</div>
                        </div>
                    </div>

                    {/* Source Selector */}
                    <div className="flex items-center justify-center gap-2">
                        <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Active Source:</span>
                        {isEditingUnit ? (
                            <div className="flex items-center gap-2">
                                <input autoFocus type="text" value={activeUnit} onChange={(e) => setActiveUnit(e.target.value.toUpperCase())} onBlur={() => setIsEditingUnit(false)} className="w-24 bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-emerald-500 dark:border-neon-green rounded px-2 py-1 font-mono text-center uppercase focus:outline-none text-xs" />
                                <button onClick={() => setIsEditingUnit(false)} className="text-emerald-500 dark:text-neon-green"><Save size={14} /></button>
                            </div>
                        ) : (
                            <button onClick={() => setIsEditingUnit(true)} className="flex items-center gap-2 bg-white dark:bg-slate-800 px-3 py-1 rounded hover:bg-gray-50 dark:hover:bg-slate-700 border border-gray-200 dark:border-slate-700 group transition-all">
                                <span className="font-mono font-bold text-slate-900 dark:text-white group-hover:text-emerald-500 dark:group-hover:text-neon-green text-xs">{activeUnit}</span>
                                <Edit2 size={10} className="text-slate-400 group-hover:text-emerald-500 dark:group-hover:text-neon-green" />
                            </button>
                        )}
                    </div>

                    <div className="flex flex-col w-full max-w-xs gap-4 relative z-10">
                        <div className="flex gap-2">
                            <input ref={scoutInputRef} type="text" value={manualQuery} onChange={(e) => setManualQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleManualSearch()} placeholder="Manual Lookup (Name or UPC)" className="flex-1 bg-white dark:bg-slate-900/80 border border-gray-200 dark:border-slate-700 rounded-xl px-4 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 dark:focus:border-neon-green placeholder-slate-400 dark:placeholder-slate-600 h-12 shadow-sm" />
                            <button onClick={handleManualSearch} className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-neon-green text-slate-900 dark:text-white w-12 rounded-xl flex items-center justify-center shadow-sm"><SearchIcon size={20} /></button>
                            <div className="relative">
                                <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
                                <button onClick={() => fileInputRef.current?.click()} className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 hover:border-blue-400 text-blue-500 dark:text-blue-400 w-12 h-12 rounded-xl flex items-center justify-center shadow-sm"><Upload size={20} /></button>
                            </div>
                        </div>
                        {scanMode === 'AI' && (
                            <button onClick={() => setIsBulkMode(!isBulkMode)} className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl border transition-all ${isBulkMode ? 'bg-purple-100 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 border-purple-300 dark:border-purple-500' : 'bg-white dark:bg-slate-900/50 text-slate-500 border-gray-200 dark:border-slate-800 hover:border-gray-300 dark:hover:border-slate-600 shadow-sm'}`}>
                                {isBulkMode ? <Layers size={16} /> : <Box size={16} />}
                                <span className="text-xs font-bold tracking-wider">{isBulkMode ? 'MODE: DEATH PILE (BULK)' : 'MODE: SINGLE ITEM'}</span>
                            </button>
                        )}
                    </div>

                    {/* ROI Tracker (Sources) */}
                    <div className="w-full max-w-sm pt-8 pb-4">
                        <div className="flex justify-between items-center mb-3 px-1">
                            <h3 className="text-[10px] font-mono uppercase tracking-widest text-slate-500 flex items-center gap-2"><Warehouse size={12} /> ROI Tracker</h3>
                            <button onClick={() => { setIsUnitModalOpen(true); setUnitForm({ id: '', storeNumber: '', address: '', cost: '', imageUrl: '' }); }} className="text-[10px] font-bold text-emerald-600 dark:text-neon-green hover:underline">+ New Source</button>
                        </div>
                        <div className="space-y-3">
                            {storageUnits.map(unit => {
                                const stats = getUnitStats(unit.storeNumber, unit.cost);
                                return (
                                    <div key={unit.id} onClick={() => setActiveUnit(unit.storeNumber)} className={`bg-white dark:bg-slate-900 border ${activeUnit === unit.storeNumber ? 'border-emerald-500 dark:border-neon-green shadow-sm' : 'border-gray-200 dark:border-slate-800'} rounded-xl p-3 cursor-pointer transition-all hover:scale-[1.02]`}>
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden">
                                                    {unit.imageUrl ? <img src={unit.imageUrl} className="w-full h-full object-cover" /> : <Package size={14} className="text-slate-400" />}
                                                </div>
                                                <div>
                                                    <div className="text-xs font-bold text-slate-900 dark:text-white">#{unit.storeNumber}</div>
                                                    <div className="text-[9px] text-slate-500">${unit.cost} Cost</div>
                                                </div>
                                            </div>
                                            {stats.isBreakEven && <span className="text-[8px] bg-emerald-100 dark:bg-neon-green/20 text-emerald-700 dark:text-neon-green px-1.5 py-0.5 rounded font-bold uppercase">Profitable</span>}
                                        </div>
                                        <div className="w-full bg-gray-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                                            <div className={`h-full rounded-full transition-all duration-1000 ${stats.isBreakEven ? 'bg-emerald-500 dark:bg-neon-green' : 'bg-blue-500'}`} style={{ width: `${stats.progressPercent}%` }}></div>
                                        </div>
                                        <div className="flex justify-between mt-1 text-[8px] font-mono text-slate-400">
                                            <span>Rev: ${stats.totalSoldValue.toFixed(0)}</span>
                                            <span>Net: {stats.totalProfit > 0 ? '+' : ''}${stats.totalProfit.toFixed(0)}</span>
                                        </div>
                                    </div>
                                );
                            })}
                            {storageUnits.length === 0 && <div className="text-center p-4 text-xs text-slate-500 border border-dashed border-slate-700 rounded-xl">No sources added. Tap + New Source to track ROI.</div>}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const renderAnalysis = () => (
        <div className="flex flex-col h-full overflow-y-auto bg-gray-50 dark:bg-slate-950 pb-20 pt-safe">
            <div className="relative w-full h-72 bg-black shrink-0">
                {currentImage ? <img src={currentImage} alt="Captured" className="w-full h-full object-contain" /> : <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900"><SearchIcon size={48} className="text-slate-700 mb-2" /><span className="text-slate-500 font-mono text-xs uppercase">Manual Lookup: {manualQuery}</span></div>}
                <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
                    {status === ScoutStatus.ANALYZING ? (
                        <div className="flex items-center gap-2 text-neon-green animate-pulse"><Loader2 className="animate-spin" size={16} /><span className="font-mono text-sm font-bold">{isBulkMode ? 'ANALYZING BULK LOT...' : loadingMessage || 'AI MARKET RESEARCH...'}</span></div>
                    ) : (<div className="flex justify-between items-end">{scannedBarcode && (<div className="flex items-center gap-2 px-2 py-1 bg-white/10 backdrop-blur rounded text-xs font-mono text-white border border-white/20"><ScanLine size={12} /> {scannedBarcode}</div>)}
                        {scanMode === 'AI' && <span className="text-xs font-mono bg-emerald-500/20 backdrop-blur px-2 py-1 rounded text-emerald-400 border border-emerald-500/30 font-bold">{scoutResult?.confidence}% CONFIDENCE</span>}
                        {scanMode === 'LENS' && <span className="text-xs font-mono bg-blue-500/20 backdrop-blur px-2 py-1 rounded text-blue-400 border border-blue-500/30 font-bold">VISUAL SEARCH</span>}
                    </div>)}
                </div>
                {status === ScoutStatus.COMPLETE && (<button onClick={handleStartScan} className="absolute top-[calc(env(safe-area-inset-top)+1rem)] right-4 p-2 bg-black/50 backdrop-blur text-white rounded-full hover:bg-black/70 transition-colors"><Camera size={20} /></button>)}
            </div>

            <div className="flex-1 p-4 space-y-6">
                {status === ScoutStatus.ANALYZING ? (
                    <div className="space-y-6 mt-4 opacity-50"><div className="h-8 bg-slate-200 dark:bg-slate-800 rounded w-3/4 animate-pulse"></div><div className="h-32 bg-slate-200 dark:bg-slate-800 rounded w-full animate-pulse"></div><div className="h-40 bg-slate-200 dark:bg-slate-800 rounded w-full animate-pulse"></div></div>
                ) : scoutResult ? (
                    <div className="animate-in slide-in-from-bottom-4 duration-500 space-y-6">
                        {/* ... Results Content ... */}
                        {scanMode === 'LENS' && !scoutResult.barcode && (
                            <div className="space-y-4">
                                {/* Research Buttons Row (Using Lens Keyword) */}
                                <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                                    <a href={`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(lensKeyword || editedTitle)}&LH_Sold=1&LH_Complete=1`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 text-xs font-bold text-emerald-600 dark:text-neon-green shrink-0 hover:border-emerald-500"><ShoppingCart size={14} /> eBay Sold</a>
                                    <a href={`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(lensKeyword || editedTitle)}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 text-xs font-bold text-blue-500 shrink-0 hover:border-blue-500"><Tag size={14} /> eBay Listed</a>
                                    <a href={`https://www.google.com/search?q=${encodeURIComponent(lensKeyword || editedTitle)}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-white shrink-0 hover:border-slate-500"><Globe size={14} /> Google</a>
                                    <a href={`https://www.facebook.com/marketplace/search/?query=${encodeURIComponent(lensKeyword || editedTitle)}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 text-xs font-bold text-blue-600 dark:text-blue-400 shrink-0 hover:border-blue-500"><Facebook size={14} /> FB Market</a>
                                </div>

                                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-sm">
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                            <Tag size={18} className="text-blue-500" /> eBay Matches
                                        </h3>
                                        {isVisualSearching && <Loader2 size={16} className="animate-spin text-blue-500" />}
                                    </div>

                                    {/* Keyword Fallback Input */}
                                    <div className="flex gap-2 mb-4">
                                        <input
                                            type="text"
                                            placeholder="Search items..."
                                            value={lensKeyword}
                                            onChange={(e) => setLensKeyword(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleLensKeywordSearch()}
                                            className="flex-1 bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                                        />
                                        <button onClick={handleLensKeywordSearch} className="px-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold"><SearchIcon size={14} /></button>
                                    </div>

                                    {/* List Layout for Visual Matches */}
                                    {visualSearchResults.length > 0 ? (
                                        <div className="flex flex-col gap-3">
                                            {visualSearchResults.slice(0, 5).map(item => (
                                                <div key={item.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 rounded-lg flex gap-3 items-center">
                                                    {/* Image */}
                                                    <div className="w-14 h-14 bg-gray-100 dark:bg-slate-950 rounded-md overflow-hidden shrink-0 relative">
                                                        {item.image ? <img src={item.image} className="w-full h-full object-cover" /> : <div className="flex items-center justify-center h-full text-slate-300"><ImageIcon size={16} /></div>}
                                                    </div>
                                                    {/* Info */}
                                                    <div className="flex-1 min-w-0">
                                                        <h4 className="text-xs font-bold text-slate-900 dark:text-white line-clamp-2 leading-snug mb-1">{item.title}</h4>
                                                        <div className="flex flex-col">
                                                            <span className="text-sm font-black text-blue-600 dark:text-blue-400">${item.price?.toFixed(2)}</span>
                                                            <span className="text-[10px] text-slate-500">{item.shipping > 0 ? `+${item.shipping?.toFixed(2)} Ship` : 'Free Shipping'}</span>
                                                        </div>
                                                    </div>

                                                    {/* Buttons Column */}
                                                    <div className="flex flex-col gap-2 w-24 shrink-0">
                                                        <button
                                                            onClick={() => handleUsePrice(item)}
                                                            className="w-full py-1.5 bg-gray-100 dark:bg-slate-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-slate-700 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-400 text-[9px] font-bold rounded border border-gray-200 dark:border-slate-700 transition-colors uppercase"
                                                        >
                                                            Use Price
                                                        </button>
                                                        <button
                                                            onClick={() => handleSelectVisualMatch(item)}
                                                            className="w-full py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-[9px] font-bold rounded flex items-center justify-center gap-1 transition-colors shadow-sm uppercase"
                                                        >
                                                            Sell Similar
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}

                                        </div>
                                    ) : (
                                        <div className="text-center py-6 px-4 bg-gray-50 dark:bg-slate-800/50 rounded-lg border border-dashed border-slate-300 dark:border-slate-700">
                                            <p className="text-[10px] text-slate-500 mb-2">No matches found.</p>
                                            <button onClick={handlePerformVisualSearch} className="text-blue-500 text-[10px] font-bold hover:underline">Retry Visual Scan</button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* --- EDITOR & DETAILS (Shared) --- */}
                        <div className="space-y-2">
                            <div className="flex justify-between items-center"><label className="text-xs text-slate-500 font-mono uppercase tracking-wider flex items-center gap-2">Item Title {scanMode === 'LENS' && '(Manual Entry)'}</label><div className="flex gap-2">
                                {scanMode === 'AI' && <button onClick={handleOptimizeTitle} className="text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2 py-1 rounded font-bold flex items-center gap-1 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"><Wand2 size={10} /> Optimize</button>}
                                <button onClick={() => toggleRecording('title')} className={`p-1.5 rounded-full transition-all ${isRecording === 'title' ? 'bg-red-500 text-white animate-pulse' : 'text-slate-400 hover:text-slate-600 dark:hover:text-white'}`}>{isRecording === 'title' ? <MicOff size={14} /> : <Mic size={14} />}</button></div></div>
                            <textarea value={editedTitle} onChange={(e) => setEditedTitle(e.target.value)} className="w-full bg-white dark:bg-slate-800 p-3 rounded-xl border border-gray-200 dark:border-slate-700 text-slate-900 dark:text-white font-bold text-lg focus:outline-none focus:border-emerald-500 dark:focus:border-neon-green transition-colors resize-none min-h-[80px] shadow-sm" placeholder={scanMode === 'LENS' ? "Enter item name..." : "Item description..."} />
                        </div>

                        {scanMode === 'AI' && (
                            <>
                                <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                                    <a href={`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(editedTitle || scoutResult.itemTitle)}&LH_Sold=1&LH_Complete=1`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 text-xs font-bold text-emerald-600 dark:text-neon-green shrink-0 hover:border-emerald-500"><ShoppingCart size={14} /> Sold Comps</a>
                                    <a href={`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(editedTitle || scoutResult.itemTitle)}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 text-xs font-bold text-blue-500 shrink-0 hover:border-blue-500"><Tag size={14} /> Active Listings</a>
                                    <a href={`https://www.facebook.com/marketplace/search/?query=${encodeURIComponent(editedTitle || scoutResult.itemTitle)}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 text-xs font-bold text-blue-600 dark:text-blue-400 shrink-0 hover:border-blue-500"><Facebook size={14} /> FB Market</a>
                                    <button onClick={() => setIsCompsOpen(true)} className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold shrink-0 hover:bg-blue-500 shadow-lg shadow-blue-500/20"><SearchIcon size={14} /> Deep Analysis</button>
                                </div>
                                {/* Sources Section Restored */}
                                {scoutResult.listingSources && scoutResult.listingSources.length > 0 && (
                                    <div className="bg-gray-50 dark:bg-slate-800/50 p-3 rounded-lg border border-gray-100 dark:border-slate-800">
                                        <h4 className="text-[10px] uppercase font-bold text-slate-500 mb-2 flex items-center gap-1">
                                            <Globe size={10} /> Sources Found
                                        </h4>
                                        <div className="space-y-1">
                                            {scoutResult.listingSources.slice(0, 3).map((source, idx) => (
                                                <a key={idx} href={source.uri} target="_blank" rel="noreferrer" className="block text-xs text-blue-500 hover:underline truncate">
                                                    {source.title}
                                                </a>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}

                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-gray-200 dark:border-slate-700"><label className="text-[10px] text-slate-500 font-mono uppercase mb-1 block">Condition</label><div className="flex bg-gray-100 dark:bg-slate-900 rounded p-1"><button onClick={() => handleConditionChange('USED')} className={`flex-1 text-xs font-bold py-1 rounded transition-colors ${itemCondition === 'USED' ? 'bg-white dark:bg-slate-800 shadow text-slate-900 dark:text-white' : 'text-slate-500'}`}>Used</button><button onClick={() => handleConditionChange('NEW')} className={`flex-1 text-xs font-bold py-1 rounded transition-colors ${itemCondition === 'NEW' ? 'bg-white dark:bg-slate-800 shadow text-slate-900 dark:text-white' : 'text-slate-500'}`}>New</button></div></div>
                            <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-gray-200 dark:border-slate-700"><label className="text-[10px] text-slate-500 font-mono uppercase mb-1 block">Location / Bin</label><input type="text" value={binLocation} onChange={(e) => setBinLocation(e.target.value)} placeholder="e.g. A1" className="w-full bg-transparent text-slate-900 dark:text-white font-bold focus:outline-none" /></div>
                        </div>
                        <div className="relative">
                            <textarea value={conditionNotes} onChange={(e) => setConditionNotes(e.target.value)} className="w-full bg-white dark:bg-slate-800 p-3 rounded-xl border border-gray-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-emerald-500 dark:focus:border-neon-green transition-colors resize-none h-20 shadow-sm" placeholder="Condition notes (e.g. scratches, missing box)..." />
                            <button onClick={() => toggleRecording('condition')} className={`absolute bottom-2 right-2 p-1.5 rounded-full transition-all ${isRecording === 'condition' ? 'bg-red-500 text-white animate-pulse' : 'bg-gray-100 dark:bg-slate-700 text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}>{isRecording === 'condition' ? <MicOff size={12} /> : <Mic size={12} />}</button>
                        </div>

                        <ProfitCalculator estimatedPrice={scoutResult.estimatedSoldPrice} estimatedShipping={scoutResult.estimatedShippingCost} estimatedWeight={scoutResult.estimatedWeight} onSave={handleSaveToInventory} isScanning={false} isLoading={isSaving} />

                        <div className="mt-4 p-3 bg-red-900/10 border border-red-900/30 rounded-lg flex gap-3 items-start">
                            <ShieldAlert className="text-red-500 shrink-0 mt-0.5" size={16} />
                            <div className="text-[10px] text-slate-400 leading-relaxed">
                                <strong className="text-red-400">LIABILITY DISCLAIMER:</strong> Calculations are estimates. Verify all prices, weights, and fees before listing. We are not liable for losses.
                            </div>
                        </div>

                        <button onClick={() => { if (window.confirm("Discard this scan? Data will be lost.")) setStatus(ScoutStatus.IDLE); }} className="w-full py-4 rounded-xl border-2 border-dashed border-gray-300 dark:border-slate-800 text-slate-400 font-bold hover:bg-red-50 dark:hover:bg-red-900/10 hover:border-red-300 dark:hover:border-red-900 hover:text-red-500 transition-all flex items-center justify-center gap-2"><Trash2 size={18} /> Discard Scan</button>
                    </div>
                ) : <div className="flex flex-col items-center justify-center h-64 text-red-500 gap-4"><AlertTriangle size={48} /><div className="text-center"><h3 className="font-bold">Analysis Failed</h3><p className="text-sm opacity-80 mt-1 max-w-xs">Could not analyze image. Please check connection and try again.</p></div><button onClick={handleRetryAnalysis} className="px-6 py-2 bg-slate-800 text-white rounded-lg font-bold flex items-center gap-2"><RefreshCw size={16} /> Retry</button></div>}
            </div>
            {isCompsOpen && scoutResult && (<CompsModal isOpen={isCompsOpen} onClose={() => setIsCompsOpen(false)} initialQuery={scoutResult.searchQuery || editedTitle || scoutResult.itemTitle} condition={itemCondition} onApplyPrice={(price) => setScoutResult(prev => prev ? ({ ...prev, estimatedSoldPrice: price }) : null)} onSellSimilar={handleSellSimilar} />)}
        </div>
    );

    if (authLoading) {
        return (
            <div className="fixed inset-0 bg-slate-950 flex flex-col items-center justify-center z-50">
                <Loader2 className="w-12 h-12 text-neon-green animate-spin mb-4" />
                <p className="text-slate-400 font-mono text-xs animate-pulse tracking-widest">INITIALIZING...</p>
            </div>
        );
    }

    if (isLiteMode) {
        return <LiteView onExit={() => setIsLiteMode(false)} />;
    }

    if (!user) {
        return <AuthScreen onLiteMode={() => setIsLiteMode(true)} />;
    }
    return (
        <div className={`${theme} fixed inset-0 flex flex-col overflow-hidden bg-gray-50 dark:bg-slate-950 text-slate-900 dark:text-white font-sans transition-colors duration-300`}>
            {/* Modals remain the same... */}
            <PricingModal isOpen={isPricingOpen} onClose={() => setIsPricingOpen(false)} onSuccess={refreshSubscription} />
            <SettingsModal
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
                onOpenPricing={() => setIsPricingOpen(true)}
                onOpenFeedback={() => setIsFeedbackOpen(true)}
                onOpenPrivacy={() => setIsPrivacyOpen(true)}
                onConnectionChange={(connected) => {
                    setEbayConnected(connected);
                    if (connected && user) loadEbayPolicies(user.id);
                }}
                onSwitchToLiteMode={() => setIsLiteMode(true)}
            />
            <FeedbackModal isOpen={isFeedbackOpen} onClose={() => setIsFeedbackOpen(false)} />
            <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
            <PrivacyPolicyModal isOpen={isPrivacyOpen} onClose={() => setIsPrivacyOpen(false)} />
            {showTos && <DisclaimerModal onAccept={handleAcceptTos} />}
            {editingItem && isPreviewOpen && (<PreviewModal isOpen={isPreviewOpen} onClose={() => setIsPreviewOpen(false)} item={editingItem} />)}
            {editingItem && viewingImageIndex !== null && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-200">
                    <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
                        <div className="flex justify-end p-4 border-b border-slate-800 bg-slate-900/50">
                            <button onClick={() => setViewingImageIndex(null)} className="p-2 rounded-full bg-slate-800 text-white hover:bg-slate-700 border border-slate-600 transition-colors"><X size={20} /></button>
                        </div>
                        <div className="flex-1 relative flex items-center justify-center bg-black p-4 overflow-hidden group">
                            <img src={editingItem.additionalImages ? (viewingImageIndex === 0 ? editingItem.imageUrl : editingItem.additionalImages[viewingImageIndex - 1]) : editingItem.imageUrl} className="max-h-full max-w-full object-contain" alt="Full View" />
                            {isOptimizingImage && <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm"><div className="flex flex-col items-center gap-4"><Loader2 className="animate-spin text-neon-green" size={48} /><span className="text-white font-mono tracking-widest text-sm animate-pulse">OPTIMIZING AI...</span></div></div>}

                            {/* Navigation Arrows */}
                            <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 flex justify-between pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={(e) => { e.stopPropagation(); handleNavigateImage('prev'); }} className="pointer-events-auto p-3 bg-black/50 hover:bg-black/70 text-white rounded-full transition-all hover:scale-110"><ChevronLeft size={32} /></button>
                                <button onClick={(e) => { e.stopPropagation(); handleNavigateImage('next'); }} className="pointer-events-auto p-3 bg-black/50 hover:bg-black/70 text-white rounded-full transition-all hover:scale-110"><ChevronRight size={32} /></button>
                            </div>
                        </div>
                        <div className="p-6 bg-slate-900 border-t border-slate-800 flex justify-center gap-4">
                            <button onClick={() => handleOptimizeImage(viewingImageIndex, editingItem.additionalImages ? (viewingImageIndex === 0 ? editingItem.imageUrl : editingItem.additionalImages[viewingImageIndex - 1]) : editingItem.imageUrl)} disabled={isOptimizingImage} className="px-8 py-3 bg-white text-black rounded-xl font-bold flex items-center gap-2 hover:bg-gray-200 disabled:opacity-50 shadow-lg"><Wand2 size={20} /> Optimize Image</button>
                            <button onClick={() => setViewingImageIndex(null)} className="px-8 py-3 bg-slate-800 text-white border border-slate-700 rounded-xl font-bold hover:bg-slate-700 transition-colors">Close</button>
                        </div>
                    </div>
                </div>
            )}
            {isUnitModalOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl shadow-black/50 overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <Warehouse className="text-neon-green" size={20} /> {unitForm.id ? 'Edit Source' : 'Add Source'}
                            </h3>
                            <button onClick={() => setIsUnitModalOpen(false)} className="text-slate-400 hover:text-white"><X size={24} /></button>
                        </div>
                        <div className="p-6 space-y-4 overflow-y-auto">
                            <div className="space-y-2">
                                <label className="text-xs font-mono text-slate-400 uppercase">Source Name / ID</label>
                                <div className="flex items-center gap-3 bg-slate-800 p-3 rounded-lg border border-slate-700 focus-within:border-neon-green transition-colors">
                                    <Warehouse size={18} className="text-slate-500" />
                                    <input type="text" value={unitForm.storeNumber} onChange={e => setUnitForm({ ...unitForm, storeNumber: e.target.value })} placeholder="e.g. Estate Sale, Garage Sale, Unit 55" className="bg-transparent text-white w-full focus:outline-none font-mono" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-mono text-slate-400 uppercase">Address</label>
                                <div className="flex items-center gap-3 bg-slate-800 p-3 rounded-lg border border-slate-700 focus-within:border-neon-green transition-colors">
                                    <MapPin size={18} className="text-slate-500" />
                                    <input type="text" value={unitForm.address} onChange={e => setUnitForm({ ...unitForm, address: e.target.value })} placeholder="Street address..." className="bg-transparent text-white w-full focus:outline-none" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-mono text-slate-400 uppercase">Buy Cost</label>
                                <div className="flex items-center gap-3 bg-slate-800 p-3 rounded-lg border border-slate-700 focus-within:border-neon-green transition-colors">
                                    <DollarSign size={18} className="text-slate-500" />
                                    <input type="number" value={unitForm.cost} onChange={e => setUnitForm({ ...unitForm, cost: e.target.value })} placeholder="0.00" className="bg-transparent text-white w-full focus:outline-none font-mono" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-mono text-slate-400 uppercase">Source Photo</label>
                                <div className="flex flex-col gap-3">
                                    <div className="relative w-full h-40 bg-black rounded-lg border border-slate-800 overflow-hidden group">
                                        {unitForm.imageUrl ? (
                                            <img src={unitForm.imageUrl} alt="Preview" className="w-full h-full object-cover opacity-80" />
                                        ) : (
                                            <div className="w-full h-full flex flex-col items-center justify-center text-slate-600 bg-slate-900/50">
                                                <ImageIcon size={32} className="mb-2 opacity-50" />
                                                <span className="text-[10px] uppercase tracking-wider">No Image</span>
                                            </div>
                                        )}
                                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 backdrop-blur-sm">
                                            <button onClick={() => unitImageInputRef.current?.click()} className="flex flex-col items-center gap-2 text-white hover:text-neon-green transition-colors p-2">
                                                <div className="p-3 bg-slate-800 rounded-full border border-slate-600 group-hover:border-neon-green">
                                                    <Upload size={20} />
                                                </div>
                                                <span className="text-[10px] font-bold font-mono uppercase tracking-wider">Upload File</span>
                                            </button>
                                        </div>
                                    </div>
                                    <input type="file" ref={unitImageInputRef} onChange={handleUnitImageUpload} accept="image/*" className="hidden" />
                                    <div className="flex items-center gap-3 bg-slate-800 p-3 rounded-lg border border-slate-700 focus-within:border-neon-green transition-colors">
                                        <span className="text-[10px] font-mono text-slate-500 uppercase shrink-0">OR URL</span>
                                        <input type="text" value={unitForm.imageUrl} onChange={e => setUnitForm({ ...unitForm, imageUrl: e.target.value })} placeholder="https://..." className="bg-transparent text-white w-full focus:outline-none text-xs font-mono" />
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="p-4 border-t border-slate-800 bg-slate-900">
                            <button onClick={handleSaveUnit} className="w-full py-3 bg-neon-green text-slate-950 font-bold rounded-xl hover:bg-neon-green/90 transition-all shadow-lg shadow-neon-green/20">SAVE SOURCE</button>
                        </div>
                    </div>
                </div>
            )}
            {/* ... (keep editingItem && !viewingImageIndex && !isPreviewOpen block) */}
            {editingItem && !viewingImageIndex && !isPreviewOpen && (
                <div className="fixed inset-0 z-[9999] animate-in fade-in">
                    {/* Backdrop */}
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setEditingItem(null)} />

                    {/* Modal Content - Full Screen Mobile, Centered Desktop */}
                    <div className="absolute inset-0 w-full h-full bg-white dark:bg-slate-900 flex flex-col overflow-hidden md:relative md:inset-auto md:m-auto md:w-[95vw] md:h-[90vh] md:max-w-4xl md:rounded-2xl md:shadow-2xl md:border md:border-gray-200 md:dark:border-slate-800 md:top-1/2 md:-translate-y-1/2">
                        <div className="p-4 pt-[calc(env(safe-area-inset-top)+1rem)] md:p-4 border-b border-gray-200 dark:border-slate-800 flex justify-between items-center bg-gray-50 dark:bg-slate-900">
                            <h3 className="font-bold flex items-center gap-2 text-slate-900 dark:text-white"><Edit2 className="text-emerald-500 dark:text-neon-green" size={18} /> Edit Draft</h3>
                            <div className="flex gap-2">
                                <button onClick={(e) => handleDeleteItem(e, editingItem.id)} className="p-1 text-red-500 hover:bg-red-50 rounded"><Trash2 size={20} /></button>
                                <button onClick={() => setEditingItem(null)}><X size={24} className="text-slate-400 hover:text-slate-600 dark:hover:text-white" /></button>
                            </div>
                        </div>
                        <div className="p-4 border-t border-gray-200 dark:border-slate-800 flex justify-between items-center bg-gray-50 dark:bg-slate-900 rounded-b-2xl">
                            <button onClick={() => handleDeleteItem(null as any, editingItem.id)} className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 p-2 rounded-lg transition-colors"><Trash2 size={20} /></button>
                            <div className="flex gap-3">
                                <button onClick={() => setEditingItem(null)} className="px-6 py-2 font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white transition-colors">Cancel</button>
                                <button onClick={() => handlePushToEbay(editingItem)} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg shadow-lg shadow-blue-500/20 transition-all active:scale-95 flex items-center gap-2">
                                    List to eBay
                                </button>
                                <button onClick={() => handleUpdateInventoryItem(editingItem.calculation, editingItem.costCode, editingItem.calculation.itemCost, editingItem.itemSpecifics?.Weight || "", editingItem.dimensions)} className="px-8 py-2 bg-emerald-500 hover:bg-emerald-400 text-white font-bold rounded-lg shadow-lg shadow-emerald-500/20 transition-all active:scale-95">
                                    Save Draft
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-white dark:bg-slate-900">
                            <div className="grid grid-cols-4 gap-2">
                                <div className="aspect-square bg-black rounded-lg overflow-hidden relative group border-2 border-emerald-500 dark:border-neon-green shadow-sm cursor-pointer hover:opacity-90 transition-opacity" onClick={() => setViewingImageIndex(0)}>
                                    <img src={editingItem.imageUrl} className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                        <button onClick={(e) => { e.stopPropagation(); setViewingImageIndex(0); }} className="p-1.5 bg-white/20 backdrop-blur rounded-full hover:bg-white/40 text-white" title="Optimize"><Wand2 size={14} /></button>
                                        <button onClick={(e) => { e.stopPropagation(); handleDeleteImage(0); }} className="p-1.5 bg-red-500/80 backdrop-blur rounded-full hover:bg-red-600 text-white" title="Delete"><Trash2 size={14} /></button>
                                    </div>
                                </div>

                                {editingItem.additionalImages?.map((img, i) => (
                                    <div key={i} className="aspect-square bg-gray-100 dark:bg-slate-800 rounded-lg overflow-hidden relative group border border-gray-200 dark:border-slate-700 cursor-pointer hover:opacity-90 transition-opacity" onClick={() => setViewingImageIndex(i + 1)}>
                                        <img src={img} className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                            <button onClick={(e) => { e.stopPropagation(); setViewingImageIndex(i + 1); }} className="p-1.5 bg-white/20 backdrop-blur rounded-full hover:bg-white/40 text-white" title="Optimize"><Wand2 size={14} /></button>
                                            <button onClick={(e) => { e.stopPropagation(); handleDeleteImage(i + 1); }} className="p-1.5 bg-red-500/80 backdrop-blur rounded-full hover:bg-red-600 text-white" title="Delete"><Trash2 size={14} /></button>
                                        </div>
                                    </div>
                                ))}

                                <button onClick={() => { setCameraMode('EDIT'); setStatus(ScoutStatus.SCANNING); }} className="aspect-square bg-gray-50 dark:bg-slate-800 rounded-lg flex flex-col items-center justify-center text-slate-400 hover:text-emerald-500 border-2 border-dashed border-gray-300 dark:border-slate-700 transition-colors"><Camera size={18} /><span className="text-[8px] font-bold uppercase mt-1">Photo</span></button>
                                <button onClick={() => additionalImageInputRef.current?.click()} className="aspect-square bg-gray-50 dark:bg-slate-800 rounded-lg flex flex-col items-center justify-center text-slate-400 hover:text-emerald-500 border-2 border-dashed border-gray-300 dark:border-slate-700 transition-colors"><Upload size={18} /><span className="text-[8px] font-bold uppercase mt-1">File</span></button>
                            </div>
                            <input ref={editImageInputRef} type="file" accept="image/*" className="hidden" onChange={handleEditImageUpload} />
                            <input ref={additionalImageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleAdditionalImageUpload} />

                            <div className="space-y-4">
                                <div>
                                    <div className="flex justify-between items-center mb-1"><label className="text-xs font-mono uppercase text-slate-500">Title</label><div className="flex gap-2"><button onClick={handleOptimizeTitle} className="text-xs flex items-center gap-1 text-blue-500 font-bold hover:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded transition-all border border-blue-100 dark:border-blue-800"><Wand2 size={12} /> Optimize</button><button onClick={() => toggleRecording('title')} className={`text-xs ${isRecording === 'title' ? 'text-red-500 animate-pulse' : ''}`}><Mic size={14} /></button></div></div>
                                    <textarea value={editingItem.title} onChange={e => setEditingItem({ ...editingItem, title: e.target.value })} className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-lg p-3 text-sm text-slate-900 dark:text-white h-24 resize-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all" />
                                </div>

                                {/* --- ITEM SPECIFICS EDITOR --- */}
                                <div>
                                    <div className="flex justify-between items-center mb-2">
                                        <label className="text-xs font-mono uppercase text-slate-500">Item Specifics</label>
                                        <button onClick={handleAddSpecific} className="text-[10px] text-blue-500 hover:underline font-bold flex items-center gap-1">+ Add</button>
                                    </div>
                                    <div className="bg-gray-50 dark:bg-slate-900/50 p-3 rounded-lg border border-gray-200 dark:border-slate-800 space-y-2 max-h-48 overflow-y-auto">
                                        {Object.entries(editingItem.itemSpecifics || {}).filter(([key]) => key !== 'Weight').map(([key, val], idx) => (
                                            <div key={idx} className="flex gap-2 items-center">
                                                <input
                                                    className="w-1/3 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded px-2 py-1 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:border-blue-500"
                                                    value={key}
                                                    onChange={(e) => handleRenameSpecific(key, e.target.value)}
                                                    placeholder="Name"
                                                    disabled={DEFAULT_SPECIFIC_KEYS.includes(key)}
                                                />
                                                <input
                                                    className="flex-1 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded px-2 py-1 text-xs text-slate-900 dark:text-white font-medium focus:outline-none focus:border-blue-500"
                                                    value={val}
                                                    onChange={(e) => handleUpdateSpecific(key, e.target.value)}
                                                    placeholder="Value"
                                                />
                                                <button onClick={() => handleDeleteSpecific(key)} className="text-slate-400 hover:text-red-500 p-1"><X size={12} /></button>
                                            </div>
                                        ))}
                                        {(!editingItem.itemSpecifics || Object.keys(editingItem.itemSpecifics).length === 0) && (
                                            <div className="text-center text-slate-500 text-[10px] py-2">No item specifics added.</div>
                                        )}
                                    </div>
                                </div>

                                <div>
                                    <label className="text-xs font-mono uppercase text-slate-500">Description</label>
                                    <textarea value={editingItem.generatedListing?.content || editingItem.conditionNotes || ''} onChange={e => setEditingItem({ ...editingItem, generatedListing: { platform: 'EBAY', content: e.target.value } })} className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-lg p-3 text-sm h-32 resize-none focus:border-emerald-500 outline-none transition-all mt-1" placeholder="Item description..." />
                                    <div className="flex justify-end mt-1"><button onClick={() => handleGenerateListing('EBAY')} className="text-[10px] text-blue-500 hover:underline flex items-center gap-1"><Wand2 size={10} /> Auto-Write Description</button></div>
                                </div>

                                <div className="grid grid-cols-4 gap-2">
                                    <a href={`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(editingItem.title)}&LH_Sold=1`} target="_blank" rel="noreferrer" className="py-2 rounded bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-center text-[9px] font-bold text-emerald-600 dark:text-neon-green uppercase hover:border-emerald-500">Sold</a>
                                    <a href={`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(editingItem.title)}`} target="_blank" rel="noreferrer" className="py-2 rounded bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-center text-[9px] font-bold text-blue-500 uppercase hover:border-blue-500">Active</a>
                                    <a href={`https://www.google.com/search?q=${encodeURIComponent(editingItem.title)}`} target="_blank" rel="noreferrer" className="py-2 rounded bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-center text-[9px] font-bold text-slate-600 dark:text-white uppercase hover:border-slate-400">Google</a>
                                    <button onClick={() => setIsCompsOpen(true)} className="py-2 rounded bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-900 text-center text-[9px] font-bold text-blue-600 dark:text-blue-300 uppercase">Comps</button>
                                </div>

                                <ProfitCalculator
                                    estimatedPrice={editingItem.calculation.soldPrice}
                                    estimatedShipping={editingItem.calculation.shippingCost}
                                    estimatedWeight={editingItem.itemSpecifics?.Weight}
                                    estimatedDimensions={editingItem.dimensions}
                                    onSave={handleUpdateInventoryItem}
                                    onPriceChange={setCurrentListingPrice}
                                    onEstimate={handleEstimateWeight}
                                    isScanning={false}
                                    isLoading={isGeneratingListing}
                                />

                                <div className="bg-gray-50 dark:bg-slate-900/50 p-4 rounded-xl border border-gray-200 dark:border-slate-700">
                                    <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-200 dark:border-slate-700">
                                        <div className="flex items-center gap-2"><CreditCard size={16} className="text-blue-500" /><h4 className="text-xs font-bold font-mono uppercase text-slate-600 dark:text-slate-300">Business Policies</h4></div>
                                        {!ebayConnected && <span className="text-[10px] text-red-500 font-bold">Connect eBay first</span>}
                                    </div>
                                    {ebayConnected ? (
                                        <div className="space-y-3">
                                            <div>
                                                <label className="text-[10px] text-slate-500 uppercase mb-1 block flex items-center gap-1"><Truck size={10} /> Shipping Policy</label>
                                                <select value={editingItem.ebayShippingPolicyId || ""} onChange={(e) => { const val = e.target.value; setEditingItem({ ...editingItem, ebayShippingPolicyId: val }); if (val) localStorage.setItem('sts_default_shipping_policy', val); }} className="w-full bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded p-2 text-xs text-slate-900 dark:text-white focus:border-emerald-500 outline-none">
                                                    <option value="">Select Shipping Policy...</option>
                                                    {ebayPolicies.shippingPolicies.map((p: any) => (<option key={p.fulfillmentPolicyId} value={p.fulfillmentPolicyId}>{p.name} - {p.description || 'No desc'}</option>))}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="text-[10px] text-slate-500 uppercase mb-1 block flex items-center gap-1"><ShieldCheck size={10} /> Return Policy</label>
                                                <select value={editingItem.ebayReturnPolicyId || ""} onChange={(e) => { const val = e.target.value; setEditingItem({ ...editingItem, ebayReturnPolicyId: val }); if (val) localStorage.setItem('sts_default_return_policy', val); }} className="w-full bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded p-2 text-xs text-slate-900 dark:text-white focus:border-emerald-500 outline-none">
                                                    <option value="">Select Return Policy...</option>
                                                    {ebayPolicies.returnPolicies.map((p: any) => (<option key={p.returnPolicyId} value={p.returnPolicyId}>{p.name}</option>))}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="text-[10px] text-slate-500 uppercase mb-1 block flex items-center gap-1"><CreditCard size={10} /> Payment Policy</label>
                                                <select value={editingItem.ebayPaymentPolicyId || ""} onChange={(e) => { const val = e.target.value; setEditingItem({ ...editingItem, ebayPaymentPolicyId: val }); if (val) localStorage.setItem('sts_default_payment_policy', val); }} className="w-full bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded p-2 text-xs text-slate-900 dark:text-white focus:border-emerald-500 outline-none">
                                                    <option value="">Select Payment Policy...</option>
                                                    {ebayPolicies.paymentPolicies.map((p: any) => (<option key={p.paymentPolicyId} value={p.paymentPolicyId}>{p.name}</option>))}
                                                </select>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-center text-xs text-slate-500 py-4">Connect eBay in Settings to load your Shipping & Return policies.</div>
                                    )}
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="col-span-2">
                                        <label className="text-[10px] font-mono text-slate-500 uppercase block mb-1">Bin / Loc (Custom SKU)</label>
                                        <div className="flex items-center bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded px-2 focus-within:border-emerald-500">
                                            <Box size={14} className="text-slate-400" />
                                            <input type="text" value={editingItem.binLocation || ''} onChange={e => setEditingItem({ ...editingItem, binLocation: e.target.value })} className="w-full bg-transparent p-2 text-slate-900 dark:text-white text-sm focus:outline-none" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>
                    <div className="p-4 border-t border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-900 flex flex-col gap-3">
                        <div className="flex gap-3">
                            <button onClick={() => setEditingItem(null)} className="px-4 py-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-bold rounded-xl uppercase text-xs hover:bg-gray-50 dark:hover:bg-slate-700">Close</button>
                            <button onClick={() => setIsPreviewOpen(true)} className="px-4 py-3 bg-gray-200 dark:bg-slate-800 text-slate-700 dark:text-white border border-gray-300 dark:border-slate-600 font-bold rounded-xl uppercase text-xs hover:bg-gray-300 dark:hover:bg-slate-700 flex items-center gap-2"><Eye size={16} /> Preview</button>
                            <button onClick={() => handleUpdateInventoryItem()} className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-xl uppercase text-xs shadow-lg hover:bg-emerald-500 flex items-center justify-center gap-2"><Save size={16} /> Save</button>
                        </div>
                        {editingItem.status === 'DRAFT' && (
                            <button
                                onClick={() => handlePushToEbay(editingItem)}
                                className="w-full py-4 bg-blue-600 text-white font-black rounded-xl uppercase text-sm shadow-lg shadow-blue-600/20 hover:bg-blue-500 flex items-center justify-center gap-2 transition-all active:scale-95"
                            >
                                <Globe size={18} /> List on eBay
                            </button>
                        )}
                    </div>
                </div>
            )}
            {itemToDelete && (<div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"><div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl shadow-black/50 scale-100 animate-in zoom-in-95 duration-200"><div className="flex flex-col items-center text-center gap-4"><div className="w-16 h-16 rounded-full bg-neon-red/10 flex items-center justify-center mb-2"><Trash2 size={32} className="text-neon-red" /></div><div><h3 className="text-xl font-bold text-white mb-1">Delete Item?</h3><p className="text-slate-400 text-sm leading-relaxed">Are you sure you want to delete this item? This action cannot be undone.</p></div><div className="grid grid-cols-2 gap-3 w-full mt-4"><button onClick={() => setItemToDelete(null)} className="py-3 px-4 rounded-xl font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors">CANCEL</button><button onClick={confirmDelete} className="py-3 px-4 rounded-xl font-bold text-white bg-neon-red hover:bg-red-600 shadow-lg shadow-neon-red/20 transition-all active:scale-95">DELETE</button></div></div></div></div>)}

            <main className="flex-1 relative overflow-hidden flex flex-col">
                {status === ScoutStatus.SCANNING ? (<Scanner onCapture={handleImageCaptured} onClose={() => setStatus(ScoutStatus.IDLE)} />) : view === 'scout' ? (status === ScoutStatus.IDLE ? renderIdleState() : renderAnalysis()) : view === 'inventory' ? (renderInventoryView()) : view === 'stats' ? (<StatsView inventory={inventory} onSettings={() => setIsSettingsOpen(true)} />) : null}
            </main>

            {status !== ScoutStatus.SCANNING && (<nav className="h-auto min-h-[4rem] bg-white dark:bg-slate-900 border-t border-gray-200 dark:border-slate-800 flex items-start pt-2 pb-safe-bottom justify-around shrink-0 shadow-lg z-50"><button onClick={() => { setView('scout'); setStatus(ScoutStatus.IDLE); }} className={`flex flex-col items-center gap-1 p-2 transition-all ${view === 'scout' ? 'text-emerald-600 dark:text-neon-green scale-110' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}><LayoutDashboard size={24} /><span className="text-[8px] font-black tracking-widest uppercase mt-1">Command</span></button><button onClick={() => { setView('stats'); setStatus(ScoutStatus.IDLE); }} className={`flex flex-col items-center gap-1 p-2 transition-all ${view === 'stats' ? 'text-emerald-600 dark:text-neon-green scale-110' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}><BarChart3 size={24} /><span className="text-[8px] font-black tracking-widest uppercase mt-1">Insights</span></button><button onClick={() => { setView('inventory'); setStatus(ScoutStatus.IDLE); }} className={`flex flex-col items-center gap-1 p-2 transition-all ${view === 'inventory' ? 'text-emerald-600 dark:text-neon-green scale-110' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}><Package size={24} /><span className="text-[8px] font-black tracking-widest uppercase mt-1">Inventory</span></button></nav>)}
        </div >
    );
}

export default App;