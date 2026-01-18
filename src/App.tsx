import React, { useState, useEffect, useRef } from 'react';
import Scanner from './components/Scanner';
import ProfitCalculator from './components/ProfitCalculator';
import PricingModal from './components/SubscriptionModal';
import SettingsModal from './components/SettingsModal';
import FeedbackModal from './components/FeedbackModal';
import StatsView from './components/StatsView';
import CompsModal from './components/CompsModal';
import { motion, AnimatePresence } from 'framer-motion';

import PreviewModal from './components/PreviewModal';
import HelpModal from './components/HelpModal';
import OnboardingTour from './components/OnboardingTour';
import DisclaimerModal from './components/DisclaimerModal';
import PrivacyPolicyModal from './components/PrivacyPolicyModal';
import Logo from './components/Logo';
import { ScoutStatus, ScoutResult, InventoryItem, ProfitCalculation, StorageUnit, ItemSpecifics } from './types';
import { analyzeItemImage, analyzeItemText, optimizeTitle, suggestItemSpecifics, refinePriceAnalysis, generateListingDescription, optimizeProductImage, identifyItem, analyzeItemDetails, analyzeListingWithGemini } from './services/geminiService';
import { useAuth } from './contexts/AuthContext';
import { useTheme } from './contexts/ThemeContext';
import AuthScreen from './components/AuthScreen';
import ResearchScreen from './components/ResearchScreen';
import { incrementDailyUsage } from './services/paymentService';
import { checkEbayConnection, extractEbayId, fetchEbayItemDetails, searchEbayByImage, searchEbayComps, fetchMarketData, getEbayPolicies, getSellThroughData, API_BASE_URL } from './services/ebayService';

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_FUNCTIONS_BASE_URL;

import { supabase } from './lib/supabaseClient';
import { compressImage, uploadScanImage } from './services/imageService';
import { analytics, logEvent } from './lib/firebase';
import { scheduleGoalReminder, NotificationSettings } from './services/notificationService';
import {
    fetchInventory, addInventoryItem, deleteInventoryItem, updateInventoryItem,
    fetchStorageUnits, addStorageUnit, updateStorageUnit, deleteStorageUnit, batchUpdateUnitItemCosts,
    logScanEvent
} from './services/databaseService';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { Camera, Search, LayoutDashboard, BarChart3, Package, Settings, Plus, X, Trash2, Edit2, ChevronDown, ChevronUp, ExternalLink, RefreshCw, Layers, CheckSquare, Sparkles, Image as ImageIcon, Link, ArrowLeft, Wand2, Calculator, Save, MoreHorizontal, Copy, Info, Check, AlertCircle, ScanLine, Share2, DollarSign, Zap, Eye, RotateCcw, Loader2, HelpCircle, Box, Upload, List as ListIcon, Lock, Download, ChevronRight, Warehouse, Sun, Moon, Aperture, ShoppingCart, Tag, Globe, Facebook, Mic, MicOff, ShieldAlert, CreditCard, Truck, ShieldCheck, Maximize2, Folder, AlertTriangle, Globe2, Barcode, MapPin, Calendar, Filter, ChevronLeft, ArrowRight, Search as SearchIcon, TrendingUp, CheckCircle2 } from 'lucide-react';
import { useFeatureGate, Feature } from './hooks/useFeatureGate';

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
import CropModal from './components/CropModal';

function App() {
    const { user, loading: authLoading, refreshSubscription, subscription } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const { canAccess, getLimit } = useFeatureGate();

    const [isLiteMode, setIsLiteMode] = useState(false);
    const [view, setView] = useState<'command' | 'scout' | 'inventory' | 'stats'>('scout');
    const [commandTab, setCommandTab] = useState<'analyze' | 'bulk'>('analyze');
    const [searchQuery, setSearchQuery] = useState('');
    const [isIntelligenceAnalyzing, setIsIntelligenceAnalyzing] = useState(false);
    const [intelligenceResult, setIntelligenceResult] = useState<any>(null);
    const [bulkSellerId, setBulkSellerId] = useState('');
    const [bulkItems, setBulkItems] = useState<any[]>([]);
    const [isBulkFetching, setIsBulkFetching] = useState(false);
    const [bulkProcessResults, setBulkProcessResults] = useState<any>({});
    const [expandedBulkItem, setExpandedBulkItem] = useState<string | null>(null);

    const [inventoryTab, setInventoryTab] = useState<'DRAFT' | 'LISTED' | 'SOLD'>('DRAFT');
    const [inventoryViewMode, setInventoryViewMode] = useState<'FOLDERS' | 'FLAT'>('FOLDERS');
    const [expandedUnits, setExpandedUnits] = useState<Set<string>>(new Set());

    const [status, setStatus] = useState<ScoutStatus>(ScoutStatus.IDLE);
    const [cameraMode, setCameraMode] = useState<'SCOUT' | 'EDIT'>('SCOUT');
    const [currentImage, setCurrentImage] = useState<string | null>(null);
    const [publicImageLink, setPublicImageLink] = useState<string | null>(null);
    const [scoutResult, setScoutResult] = useState<ScoutResult | null>(null);
    const [scannedBarcode, setScannedBarcode] = useState<string | null>(null);
    const [manualQuery, setManualQuery] = useState("");

    const [visualSearchResults, setVisualSearchResults] = useState<any[]>([]);
    const [isBackgroundAnalyzing, setIsBackgroundAnalyzing] = useState(false); // NEW: Discreet AI Indicator

    // Helper to clean HTML from imported descriptions (Define here to be accessible everywhere)
    const cleanDescription = (html: string) => {
        if (!html) return "";
        try {
            // 1. Remove style/script tags
            let text = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
            // 2. Structural tags to newlines
            text = text.replace(/<br\s*\/?>/gi, '\n')
                .replace(/<\/div>/gi, '\n')
                .replace(/<\/p>/gi, '\n')
                .replace(/<\/li>/gi, '\n');
            // 3. Strip all other tags
            text = text.replace(/<[^>]+>/g, '');
            // 4. Decode entities
            text = text.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
            // 5. Cleanup whitespace (trim lines, remove empty lines)
            return text.split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0)
                .join('\n');
        } catch (e) {
            return html; // Fallback
        }
    };

    const [isBulkMode, setIsBulkMode] = useState(false);
    const [activeUnit, setActiveUnit] = useState<string>("55");
    const [isEditingUnit, setIsEditingUnit] = useState(false);

    const [editedTitle, setEditedTitle] = useState("");
    const [conditionNotes, setConditionNotes] = useState("");
    const [binLocation, setBinLocation] = useState("");
    const [itemCondition, setItemCondition] = useState<'NEW' | 'USED'>('USED');
    const [isRecording, setIsRecording] = useState<'title' | 'condition' | null>(null);

    const [listingPlatform, setListingPlatform] = useState<'EBAY' | 'FACEBOOK' | null>(null);
    const [generatedListing, setGeneratedListing] = useState<{ platform: string, content: string } | string>("");
    const [isGeneratingListing, setIsGeneratingListing] = useState(false);
    const [customTemplates, setCustomTemplates] = useState<string[]>([]);
    const [isManagingTemplates, setIsManagingTemplates] = useState(false);
    const [isResearching, setIsResearching] = useState(false);

    const [ebayConnected, setEbayConnected] = useState(false);
    const [ebayPolicies, setEbayPolicies] = useState<{ paymentPolicies: any[], returnPolicies: any[], shippingPolicies: any[] }>({ paymentPolicies: [], returnPolicies: [], shippingPolicies: [] });

    const [isCreatingDraft, setIsCreatingDraft] = useState<string | null>(null);
    const [loadingMessage, setLoadingMessage] = useState<string>("");
    const [isSaving, setIsSaving] = useState(false);
    const [currentListingPrice, setCurrentListingPrice] = useState<number>(0);
    const [isOptimizingImage, setIsOptimizingImage] = useState<boolean>(false);
    const [initialCompsTab, setInitialCompsTab] = useState<'ACTIVE' | 'SOLD'>('ACTIVE');

    useEffect(() => {
        console.log("🚀 VERSION: V6_PREMIUM_LOADER");
    }, []);

    const [inventory, setInventory] = useState<InventoryItem[]>([]);
    const [storageUnits, setStorageUnits] = useState<StorageUnit[]>([]);

    const [isPricingOpen, setIsPricingOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
    const [isHelpOpen, setIsHelpOpen] = useState(false);
    const [showOnboarding, setShowOnboarding] = useState(false);
    const [bulkSessionCount, setBulkSessionCount] = useState(0);

    useEffect(() => {
        const hasSeen = localStorage.getItem('sts_has_seen_onboarding');
        if (!hasSeen && user) {
            setShowOnboarding(true);
        }
        const savedTemplates = localStorage.getItem('sts_custom_templates');
        if (savedTemplates) {
            try {
                setCustomTemplates(JSON.parse(savedTemplates));
            } catch (e) { console.error("Failed to load templates", e); }
        }

        // Fix: Removed Lens default setting for free users as Lens is being removed.
        // AI Scan will now be the primary mode for everyone, gate by credits/UI if needed.
    }, [user, subscription]);


    const handleCompleteOnboarding = () => {
        localStorage.setItem('sts_has_seen_onboarding', 'true');
        setShowOnboarding(false);
    };
    const [isCompsOpen, setIsCompsOpen] = useState(false);

    const handleOpenResearch = async (type: 'EBAY_SOLD' | 'EBAY_ACTIVE' | 'GOOGLE' | 'FB', query: string) => {
        if (!query) return;

        switch (type) {
            case 'EBAY_SOLD':
                setInitialCompsTab('SOLD');
                setIsCompsOpen(true);
                break;
            case 'EBAY_ACTIVE':
                setInitialCompsTab('ACTIVE');
                setIsCompsOpen(true);
                break;
            case 'GOOGLE':
                if (Capacitor.isNativePlatform()) {
                    await Browser.open({ url: `https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=shop` });
                } else {
                    window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=shop`, '_blank');
                }
                break;
            case 'FB':
                if (Capacitor.isNativePlatform()) {
                    await Browser.open({ url: `https://www.facebook.com/marketplace/search/?query=${encodeURIComponent(query)}` });
                } else {
                    window.open(`https://www.facebook.com/marketplace/search/?query=${encodeURIComponent(query)}`, '_blank');
                }
                break;
        }
    };
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [isUnitModalOpen, setIsUnitModalOpen] = useState(false);
    const [isDisclaimerOpen, setIsDisclaimerOpen] = useState(false); // Added
    const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
    const [showTos, setShowTos] = useState(false);

    // Notification State
    const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>({ enabled: false, frequency: '4h' });

    const [itemToDelete, setItemToDelete] = useState<string | null>(null);
    const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);

    const [viewingImageIndex, setViewingImageIndex] = useState<number | null>(null);
    const [isCropOpen, setIsCropOpen] = useState(false);
    const [optimizeBgColor, setOptimizeBgColor] = useState<'white' | 'black'>('white');

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

    // Schedule Goal Reminder
    useEffect(() => {
        scheduleGoalReminder(notificationSettings, listedTodayCount);
    }, [listedTodayCount, notificationSettings]);

    useEffect(() => {
        // Reset manual search title when switching editing items
        if (editingItem?.id) {
            setEditedTitle(editingItem.title || "");
            setVisualSearchResults([]);
        }
    }, [editingItem?.id]);

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

    const handleUpdateScoutSpecific = (key: string, val: string) => {
        setScoutResult(prev => {
            if (!prev) return null;
            return {
                ...prev,
                itemSpecifics: { ...prev.itemSpecifics, [key]: val }
            };
        });
    };

    const handleAddScoutSpecific = () => {
        const key = prompt("Specific Name (e.g. Brand, Model):");
        if (key) handleUpdateScoutSpecific(key, "");
    };

    const handleDeleteScoutSpecific = (key: string) => {
        if (!window.confirm(`Delete specific "${key}"?`)) return;
        setScoutResult(prev => {
            if (!prev) return null;
            const newSpecs = { ...prev.itemSpecifics };
            delete newSpecs[key];
            return { ...prev, itemSpecifics: newSpecs };
        });
    };

    const handleRenameScoutSpecific = (oldKey: string, newKey: string) => {
        setScoutResult(prev => {
            if (!prev) return null;
            const newSpecs = { ...prev.itemSpecifics };
            newSpecs[newKey] = newSpecs[oldKey];
            delete newSpecs[oldKey];
            return { ...prev, itemSpecifics: newSpecs };
        });
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

    /**
     * Deep Search: Extract Item Specifics from any nested structure in the response.
     * Searches for keys: 'ItemSpecifics', 'itemSpecifics', 'NameValueList'
     */
    const extractItemSpecifics = (data: any): ItemSpecifics => {
        const specifics: ItemSpecifics = {};

        // Helper to normalize a NameValueList array
        const parseNameValueList = (list: any[]) => {
            list.forEach((spec: any) => {
                const name = spec.Name || spec.name;
                const value = Array.isArray(spec.Value) ? spec.Value[0] : (spec.Value || spec.value);
                if (name && value) {
                    specifics[name] = String(value);
                }
            });
        };

        // Recursive search function
        const search = (obj: any) => {
            if (!obj || typeof obj !== 'object') return;

            // 1. Direct NameValueList?
            if (Array.isArray(obj)) {
                // Check if it looks like a NVL
                if (obj.length > 0 && (obj[0].Name || obj[0].name)) {
                    parseNameValueList(obj);
                } else {
                    obj.forEach(search); // Recurse into array
                }
                return;
            }

            // 2. Object keys
            for (const key in obj) {
                // If we found a specifics container, parse it immediately if it's an array, or recurse if object
                if (key.toLowerCase() === 'itemspecifics') {
                    const content = obj[key];
                    if (Array.isArray(content)) parseNameValueList(content); // Could be NVL directly
                    else if (content.NameValueList || content.nameValueList) {
                        const nvl = content.NameValueList || content.nameValueList;
                        if (Array.isArray(nvl)) parseNameValueList(nvl);
                    }
                    else {
                        // Might be a simple key-value object
                        if (typeof content === 'object') {
                            Object.entries(content).forEach(([k, v]) => {
                                if (typeof v === 'string' || typeof v === 'number') specifics[k] = String(v);
                            });
                        }
                    }
                }
                else if (key.toLowerCase() === 'namevaluelist' && Array.isArray(obj[key])) {
                    parseNameValueList(obj[key]);
                }
                else {
                    // Recurse deeper
                    search(obj[key]);
                }
            }
        };

        search(data);
        return specifics;
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
        if (!confirm("Are you sure you want to delete this photo?")) return;

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
        setVisualSearchResults([]);
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

        // Check Optimization Limit
        const limit = getLimit('DAILY_OPTIMIZATIONS');
        // We need a way to track optimizations. For now, we will double dip on 'scansToday' or add a new counter if backend supports it.
        // Assuming subscription.scansToday is actually "actions today" for now, or just client-side enforcing for prompt.
        // Since we don't have a separate 'optimizationsToday' in the type yet, we might have to skip strict enforcement OR assume scansToday tracks 'credits'.
        // However, user asked to separate. 
        // NOTE: Without backend changes, I cannot persist a separate 'optimizations' counter easily.
        // I will use localStorage as a temporary gate for the "Free" tier enforcement if needed, or just rely on the fact we increment usage.

        // Let's use localStorage for a simple client-side daily limit for now until backend is updated.
        const todayKey = `opt_count_${user.id}_${new Date().toDateString()}`;
        const count = parseInt(localStorage.getItem(todayKey) || '0');

        if (count >= limit) {
            setIsPricingOpen(true);
            return;
        }

        setIsOptimizingImage(true);
        try {
            const cachedBase64 = imageCache.current.get(currentUrl);
            const inputForAI = cachedBase64 || currentUrl;
            // Map the simple state to the descriptive string expected by the prompt
            const bgDesc = optimizeBgColor === 'white' ? 'pure white (#FFFFFF)' : 'pure black (#000000)';
            const { image: optimizedBase64, tokenUsage } = await optimizeProductImage(inputForAI, editingItem.title, bgDesc);
            if (!optimizedBase64) throw new Error("AI failed to generate image. Please retry.");

            // Log Token Usage
            if (tokenUsage) {
                // Increment local counter
                localStorage.setItem(todayKey, (count + 1).toString());

                logScanEvent({
                    imageUrl: currentUrl,
                    title: `Image Optimization: ${editingItem.title}`,
                    resultStatus: 'SCANNED',
                    dateScanned: new Date().toISOString()
                }, user.id);
            }

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

    const handleSellSimilar = async (importedData: any) => {
        // If we have an ID, fetch full details to ensure we get everything (specifics, shipping, etc)
        let fullData = importedData;
        const targetId = importedData.itemId || importedData.id;

        if (targetId) {
            try {
                // Show loading state if possible, or just await
                console.log("[DEBUG] Fetching full details for:", targetId);
                const details = await fetchEbayItemDetails(targetId);
                console.log("[DEBUG] Fetched Full Details RAW:", details);

                // Merge: fetched takes precedence, but if fetched is empty, imported fills in
                // Deep extract from both
                const fetchedSpecifics = extractItemSpecifics(details);
                const importedSpecifics = extractItemSpecifics(importedData);

                const mergedSpecifics = { ...importedSpecifics, ...fetchedSpecifics };
                console.log("[DEBUG] Final Merged Specifics for Import:", mergedSpecifics);

                fullData = {
                    ...importedData,
                    ...details,
                    itemSpecifics: mergedSpecifics,
                    shipping: {
                        ...importedData.shipping,
                        cost: details.shippingCost || importedData.shipping?.cost,
                        weight: details.weight || importedData.shipping?.weight
                    },
                    description: details.description || importedData.description
                };
            } catch (e) {
                console.warn("Could not fetch full details, using snippet", e);
                alert("Warning: Could not fetch full item details. Using available summary data."); // Alert user on failure
                // Fallback to importedData is implicit since fullData = importedData initially
            }
        }

        const newPrice = fullData.price ? parseFloat(fullData.price) : 0;
        const newShipping = fullData.shippingCost ? parseFloat(fullData.shippingCost) : (fullData.shipping?.cost || 0);
        const newCondition = (fullData.condition && fullData.condition.toLowerCase().includes('new')) ? 'NEW' : 'USED';

        // Robust weight extraction: check direct property, itemSpecifics, or shipping object
        const newWeight = fullData.weight || fullData.itemSpecifics?.Weight || fullData.shipping?.weight || "";
        const newDims = fullData.dimensions || fullData.shipping?.dimensions || "";

        if (editingItem) {
            // Merge imported data into existing item
            // Specifically merge itemSpecifics: imported overrides existing defaults
            const mergedSpecifics = { ...ensureDefaultSpecifics(editingItem.itemSpecifics), ...fullData.itemSpecifics };
            if (newWeight) mergedSpecifics.Weight = newWeight;

            setEditingItem({
                ...editingItem,
                title: fullData.title || editingItem.title,
                conditionNotes: fullData.condition || editingItem.conditionNotes,
                itemSpecifics: mergedSpecifics,
                generatedListing: { platform: 'EBAY', content: cleanDescription(fullData.description || '') },
                calculation: {
                    ...editingItem.calculation,
                    soldPrice: newPrice || editingItem.calculation.soldPrice,
                    shippingCost: newShipping || editingItem.calculation.shippingCost
                },
                dimensions: newDims || editingItem.dimensions
            });
            if (newPrice) setCurrentListingPrice(newPrice);
            // Also update the standalone state if needed
            setGeneratedListing({ platform: 'EBAY', content: cleanDescription(fullData.description || '') });
        } else if (scoutResult) {
            // Scout Mode -> Create Draft & Open Edit Modal
            const newItem: InventoryItem = {
                id: crypto.randomUUID(),
                sku: `SKU-${Date.now()}`,
                title: importedData.title,
                dateScanned: new Date().toISOString(),
                storageUnitId: activeUnit,
                costCode: '',
                calculation: {
                    soldPrice: newPrice,
                    shippingCost: newShipping,
                    itemCost: 0,
                    platformFees: (newPrice * 0.1325) + 0.30,
                    netProfit: newPrice - newShipping - ((newPrice * 0.1325) + 0.30),
                    isProfitable: false
                },
                imageUrl: currentImage, // Use captured image
                status: 'DRAFT',
                conditionNotes: newCondition,
                itemSpecifics: ensureDefaultSpecifics(importedData.itemSpecifics),
                generatedListing: { platform: 'EBAY', content: cleanDescription(importedData.description || '') },
                dimensions: newDims
            };

            if (newWeight) newItem.itemSpecifics!.Weight = newWeight;

            setEditingItem(newItem);
        }
        // alert("Success! All listing data imported."); // Removed alert as modal opening is feedback enough
    };

    const handleConditionChange = async (newCondition: 'NEW' | 'USED') => {
        setItemCondition(newCondition);
        if (scoutResult) {
            setScoutResult({ ...scoutResult, condition: newCondition });
            setLoadingMessage("Refining price...");
            const newPrice = await refinePriceAnalysis(editedTitle || scoutResult.itemTitle, newCondition);
            if (newPrice > 0) setScoutResult(prev => prev ? ({ ...prev, estimatedSoldPrice: newPrice }) : null);
            setLoadingMessage("");
        }
    };

    const [scoutAdditionalImages, setScoutAdditionalImages] = useState<string[]>([]); // New state for batch

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
        try {
            const title = editingItem ? editingItem.title : editedTitle;
            const notes = editingItem ? (editingItem.conditionNotes || '') : conditionNotes;

            // Parallel execution: Text generation AND Specifics extraction
            const [text, newSpecifics] = await Promise.all([
                generateListingDescription(title, notes, platform),
                suggestItemSpecifics(title, notes)
            ]);

            if (editingItem) {
                setEditingItem({
                    ...editingItem,
                    generatedListing: { ...editingItem.generatedListing!, platform, content: text },
                    itemSpecifics: { ...editingItem.itemSpecifics, ...newSpecifics }
                });
            } else {
                setGeneratedListing(text);
                // Also update local scout result specific if we are in scan mode flow
                if (scoutResult) {
                    // Update specific state if applicable, or generic state
                    // Note: In non-editingItem flow (scan results), specific state is tied to scoutResult
                    // We can't easily update scoutResult directly here without a setter, but usually we just set local states.
                    // For now, let's just alert the user or assume they will save soon.
                    // Actually, let's look at how itemSpecifics are stored in scan mode.
                    // They aren't stored in a separate state variable, they are in scoutResult.
                    // We can try to shallow merge if possible, or just ignore for scan view.
                }
            }
        } catch (e) {
            console.error("Generation failed", e);
        }
        setIsGeneratingListing(false);
    };

    const calculateDynamicCost = (unitId: string, countModifier: number = 0): number => {
        const unit = storageUnits.find(u => u.storeNumber === unitId);
        if (!unit) return 0;
        const currentCount = inventory.filter(i => i.storageUnitId === unitId).length;
        return Number((unit.cost / Math.max(1, currentCount + countModifier)).toFixed(2));
    };

    const handleImageCaptured = async (imageData: string | string[], barcode?: string) => {
        // Analytics: Track scan start
        if (cameraMode === 'SCOUT') {
            logEvent(analytics, 'item_scan_started', {
                has_barcode: !!barcode
            });
        }
        // Enforce Paywall (Only for AI Scout Mode)
        if (cameraMode === 'SCOUT' && !canAccess('AI_SCAN')) {
            setStatus(ScoutStatus.IDLE);
            setIsPricingOpen(true);
            return;
        }

        // --- NUCLEAR WATCHDOG (FAILSAVE) ---
        // Forces unlock if ANY part of this function hangs for > 15s
        const watchdogId = setTimeout(() => {
            console.warn("Watchdog Triggered");
            setLoadingMessage("System Timeout - Unlocking...");
            setTimeout(() => setStatus(ScoutStatus.COMPLETE), 1000);
        }, 15000);

        try {
            setLoadingMessage("Processing Images...");

            let allImages: string[] = [];
            if (Array.isArray(imageData)) {
                allImages = imageData;
            } else {
                allImages = [imageData];
            }

            if (allImages.length === 0) return;

            // --- EDIT MODE: APPEND PHOTOS ---
            // If we are in EDIT mode, we just want to add photos to the current item and close the camera.
            if (cameraMode === 'EDIT') {
                const processedImages: string[] = [];

                // Compress all images in parallel for speed
                const compressionPromises = allImages.map(img => compressImage(img));
                const compressedImages = await Promise.all(compressionPromises);

                // Start background uploads
                if (user) {
                    compressedImages.forEach(img => {
                        uploadScanImage(user.id, img).then(url => {
                            if (url) imageCache.current.set(url, img);
                        });
                    });
                }

                setEditingItem(prev => {
                    if (!prev) return null;
                    // Filter out any potential main image duplicates if modifying list
                    const currentImages = prev.additionalImages || [];
                    const newImages = [...currentImages, ...compressedImages].slice(0, 24); // Max 24 photos

                    return {
                        ...prev,
                        additionalImages: newImages
                    };
                });

                setLoadingMessage("");
                setStatus(ScoutStatus.IDLE); // Return to Edit Modal
                return;
            }

            // --- SOCUT MODE (NEW SCAN) ---

            const mainImage = allImages[0];
            const additionalRaw = allImages.slice(1);

            // --- STEP 1: COMPRESSION ---
            setStatus(ScoutStatus.ANALYZING);

            // Compress Main Image
            const mainVideoPromise = compressImage(mainImage);
            const mainTimeout = new Promise((resolve) => setTimeout(() => resolve(mainImage), 3000));
            // @ts-ignore
            const compressedMain = await Promise.race([mainVideoPromise, mainTimeout]) as string;

            // Compress Additional Images (Parallel)
            // This prevents "Load Failed" errors when saving large raw camera images
            const additionalPromises = additionalRaw.map(img => compressImage(img));
            const compressedAdditional = await Promise.all(additionalPromises);

            setCurrentImage(compressedMain);
            setScoutAdditionalImages(compressedAdditional);
            setScannedBarcode(barcode || null);

            // Upload in background (don't await)
            if (user) {
                uploadScanImage(user.id, compressedMain).then(url => {
                    if (url) { setPublicImageLink(url); imageCache.current.set(url, compressedMain); }
                });
                // Upload additional in background too
                compressedAdditional.forEach(img => {
                    uploadScanImage(user.id, img);
                });
            }

            // Reset UI
            setScoutResult(null);
            setEditedTitle("");
            setBinLocation("");
            setConditionNotes("");
            setGeneratedListing("");
            setListingPlatform(null);
            setCurrentListingPrice(0);
            setItemCondition('USED');
            setVisualSearchResults([]);



            // --- STEP 2: IDENTIFICATION (Phase 1) ---
            setLoadingMessage("Identifying item...");

            // Force UI Repaint so "STOP" button is visible and clickable
            await new Promise(r => setTimeout(r, 100));

            let initialResult;
            try {
                if (barcode) {
                    initialResult = await analyzeItemText(barcode);
                } else {
                    // Explicit 15s Timeout for Identification
                    const idPromise = identifyItem(compressedMain, barcode);
                    const idTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error("ID_TIMEOUT")), 15000));
                    // @ts-ignore
                    const fastId = await Promise.race([idPromise, idTimeout]) as any;

                    initialResult = {
                        itemTitle: fastId.itemTitle,
                        searchQuery: fastId.searchQuery,
                        listingSources: fastId.listingSources
                    };
                }
            } catch (err) {
                console.error("[SCAN] Phase 1 Identification Error:", err);
                initialResult = { itemTitle: "Scanning...", searchQuery: "", listingSources: [] };
            }

            console.log("[SCAN] Phase 1 Complete. Initial Result:", initialResult);

            // --- REFINEMENT: If ID failed or is generic, don't show "Item Detected" yet ---
            const isGeneric = !initialResult.searchQuery ||
                initialResult.itemTitle.toLowerCase().includes("item detected") ||
                initialResult.itemTitle === "Scanning...";

            const titleToUse = initialResult.searchQuery || initialResult.itemTitle || "Item";
            const displayTitle = isGeneric ? "Scanning..." : titleToUse;
            const displaySearch = isGeneric ? "" : titleToUse;

            setEditedTitle(displayTitle);
            console.log("[SCAN] Title State - titleToUse:", titleToUse, "displayTitle:", displayTitle, "isGeneric:", isGeneric);

            // --- NON-BLOCKING UI UNLOCK ---
            setLoadingMessage("");
            setStatus(ScoutStatus.COMPLETE);
            console.log("[SCAN] UI Unlocked. Status set to COMPLETE.");

            // Set Initial "Lite" Result
            const baseResult: ScoutResult = {
                itemTitle: titleToUse,
                searchQuery: displaySearch,
                estimatedSoldPrice: 0,
                estimatedShippingCost: 0,
                estimatedWeight: "",
                confidence: isGeneric ? 30 : 80,
                description: "",
                listingSources: initialResult.listingSources || [],
                itemSpecifics: {},
                isBulkLot: false
            };

            setScoutResult(baseResult);
            setEditingItem(prev => prev ? ({ ...prev, title: initialResult.searchQuery || initialResult.itemTitle }) : null);
            console.log("[SCAN] Base Result Set:", baseResult);

            // --- ASYNC STEP 3: DEEP ANALYSIS & COMPS ---
            const runAsyncTasks = async () => {
                setIsBackgroundAnalyzing(true);

                try {
                    console.log("[SCAN] Starting Phase 2: Deep Analysis");
                    setLoadingMessage("Extracting item details...");
                    // 1. Deep Analysis (Specs, Price, and Better Title)
                    const detailsPromise = analyzeItemDetails(compressedMain, initialResult.searchQuery || initialResult.itemTitle);
                    const detailsTimeout = new Promise((resolve) => setTimeout(() => resolve({}), 25000));

                    const details = await Promise.race([detailsPromise, detailsTimeout]) as Partial<ScoutResult>;
                    console.log("[SCAN] Deep Analysis Complete:", details);

                    // If we got a better title from deep analysis, use it for comps
                    const refinedTitle = details.itemTitle || initialResult.itemTitle;
                    const refinedSearch = details.searchQuery || refinedTitle;
                    console.log("[SCAN] Refined Search Query:", refinedSearch);

                    // 2. Start Comp Search & Market Stats with refined title
                    console.log("[SCAN] Starting Phase 3: Comps & Market Data");
                    setLoadingMessage("Checking market data...");
                    const [compsResults, marketStats, bestDescription] = await Promise.all([
                        searchEbayComps(refinedSearch, 'SOLD', 'USED'),
                        getSellThroughData(refinedSearch).catch(() => ({ activeCount: 0, soldCount: 0, sellThroughRate: 0 })),
                        generateListingDescription(refinedTitle, 'USED', 'EBAY')
                    ]);
                    console.log("[SCAN] Comps Results:", compsResults, "Market Stats:", marketStats);

                    if (marketStats && (marketStats.activeComps || marketStats.soldComps)) {
                        setVisualSearchResults(marketStats.activeComps || marketStats.soldComps);
                    }

                    const finalResult: ScoutResult = {
                        ...baseResult,
                        ...details,
                        itemTitle: refinedTitle,
                        searchQuery: refinedSearch,
                        description: bestDescription || details.description || "",
                        itemSpecifics: ensureDefaultSpecifics(details.itemSpecifics || {}),
                        marketData: {
                            sellThroughRate: marketStats.sellThroughRate,
                            totalActive: marketStats.activeCount,
                            totalSold: marketStats.soldCount,
                            activeComps: (marketStats as any).activeComps || [],
                            soldComps: (marketStats as any).soldComps || []
                        }
                    };

                    // Update Scout Result
                    setScoutResult(prev => prev ? ({ ...prev, ...finalResult }) : finalResult);
                    setEditedTitle(finalResult.itemTitle);
                    setItemCondition(finalResult.condition || 'USED');
                    setGeneratedListing({ platform: 'EBAY', content: finalResult.description || "" });

                    // NEW WORKFLOW: Stop at Research Review
                    console.log("[SCAN] Setting status to RESEARCH_REVIEW. Final Result:", finalResult);
                    setStatus(ScoutStatus.RESEARCH_REVIEW);

                    // Analytics: Track scan success
                    logEvent(analytics, 'item_scan_success', {
                        title: finalResult.itemTitle,
                        confidence: finalResult.confidence
                    });
                    // Do NOT open Edit Modal automatically yet. User must confirm.

                } catch (err) {
                    console.error("[SCAN] Async Deep Analysis Failed:", err);
                    console.error("[SCAN] Error Stack:", err instanceof Error ? err.stack : 'No stack trace');
                    // Fallback: If we at least have a title, show the research review screen
                    // This prevents a permanent hang if one component (like sold comps) fails.
                    if (baseResult.itemTitle && baseResult.itemTitle !== "Scanning..." && baseResult.itemTitle !== "Item") {
                        console.log("[SCAN] Showing partial results with title:", baseResult.itemTitle);
                        setStatus(ScoutStatus.RESEARCH_REVIEW);
                    } else {
                        console.error("[SCAN] No valid title. Setting status to ERROR.");
                        setStatus(ScoutStatus.ERROR);
                    }
                } finally {
                    setIsBackgroundAnalyzing(false);
                }
            };

            // Fire and forget (don't await in main thread)
            runAsyncTasks();

        } catch (error) {
            console.error("Capture Flow Error:", error);
            alert("Error during scan. Watchdog will reset.");
            setLoadingMessage("");
            setStatus(ScoutStatus.COMPLETE);
        } finally {
            clearTimeout(watchdogId);
            // Redundant safety clear
            setLoadingMessage("");
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

    const handleSaveToInventory = async (calc: ProfitCalculation, costCode: string, itemCost: number, weight: string, dimensions = "", shouldListAfterwards = false) => {
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
                if (storageUrl) {
                    finalImageUrl = storageUrl;
                    imageCache.current.set(storageUrl, currentImage);
                } else {
                    // Critical Fix: Do NOT fallback to Base64. It crashes the DB.
                    alert("Image upload failed. Please check your internet and try again.");
                    setIsSaving(false);
                    return;
                }
            }

            // Upload Additional Images
            const uploadedAdditional: string[] = [];
            for (const img of scoutAdditionalImages) {
                if (img.startsWith('data:')) {
                    const url = await uploadScanImage(user.id, img);
                    if (url) uploadedAdditional.push(url);
                } else {
                    uploadedAdditional.push(img);
                }
            }

            const currentUnit = activeUnit || "55";
            const newDynamicCost = calculateDynamicCost(currentUnit, 1);
            const sku = `UNIT${currentUnit}-${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase().replace(' ', '')}-C${Math.floor(newDynamicCost)}-${Math.floor(Math.random() * 1000)}`;

            const fees = calc.platformFees;
            const net = calc.soldPrice - fees - calc.shippingCost - newDynamicCost;

            const newItem: InventoryItem = {
                id: Date.now().toString(), // Temp ID
                sku, title: editedTitle || scoutResult.itemTitle || "Untitled Item",
                dateScanned: new Date().toISOString(), storageUnitId: currentUnit, costCode: `C${Math.floor(newDynamicCost)}`,
                calculation: { ...calc, itemCost: newDynamicCost, netProfit: net, isProfitable: net >= 15 },
                imageUrl: finalImageUrl, additionalImages: uploadedAdditional, status: 'DRAFT', binLocation, conditionNotes,
                itemSpecifics: { ...ensureDefaultSpecifics(scoutResult.itemSpecifics), Weight: weight }, postalCode: localStorage.getItem('sts_default_zip') || "95125",
                generatedListing: generatedListing ? {
                    platform: listingPlatform!,
                    content: typeof generatedListing === 'string' ? generatedListing : generatedListing.content
                } : undefined,
                dimensions: dimensions || "",
                ebayShippingPolicyId: localStorage.getItem('sts_default_shipping_policy') || undefined,
                ebayReturnPolicyId: localStorage.getItem('sts_default_return_policy') || undefined,
                ebayPaymentPolicyId: localStorage.getItem('sts_default_payment_policy') || undefined,
            };

            const savedId = await addInventoryItem(newItem, user.id);
            if (savedId) newItem.id = savedId.id;

            await batchUpdateUnitItemCosts(currentUnit, newDynamicCost);
            await refreshData();

            if (shouldListAfterwards) {
                // List immediately
                await handlePushToEbay(newItem);
            } else {
                // Just go to inventory
                setStatus(ScoutStatus.IDLE); setScoutResult(null); setScannedBarcode(null); setScoutAdditionalImages([]); setView('inventory'); setInventoryTab('DRAFT');
            }
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
        if (!editingItem || !user) return; // Add user check
        try {
            const updatedItem: InventoryItem = {
                ...editingItem,
                calculation: calc,
                costCode,
                itemSpecifics: { ...editingItem.itemSpecifics, Weight: weight },
                dimensions: dimensions || editingItem.dimensions,
                generatedListing: generatedListing ? {
                    platform: listingPlatform || 'EBAY',
                    content: typeof generatedListing === 'string' ? generatedListing : generatedListing.content
                } : editingItem.generatedListing
            };

            // Check if this is a NEW local item (e.g. from camera/scan) that hasn't been saved to DB yet
            // If it has a temporary ID or isn't found in the DB (implied by context), we should ADD it.
            // For now, let's assume we need to try adding it if it's not an "ebay-" item and we want to persist it.

            // However, our logic relies on `updateInventoryItem` for existing.
            // If the user scanned an item, `editingItem.id` is likely a timestamp or `scan-...`.
            // We need to know if it exists. 
            // Simplified Logic: If we are "Saving Draft", we should UPSERT in a way.

            // NOTE: The `updateInventoryItem` function in `databaseService` uses `.update().eq('id', item.id)`. 
            // If the ID doesn't exist in DB, `update` returns no error but updates 0 rows.

            // BETTER APPROACH:
            // 1. Try to Add (Insert).
            // 2. If it fails (duplicate), Try to Update.
            // OR checks if it is a "new" ID.

            // Let's modify behavior: 
            // If user explicitly clicks "Save Draft", we assume they want to persist it.
            // We'll try to add it first if it looks like a new scan.

            // Actually, best practice with Supabase is `upsert` but our service splits them.
            // Let's just try to ADD if it's a new draft capture.

            // FIXME: Start by trying to update. If we are unsure, maybe check if it is in `inventory` state?
            const isKnownItem = inventory.some(i => i.id === updatedItem.id);

            if (isKnownItem) {
                await updateInventoryItem(updatedItem);
            } else {
                // It's a new item (e.g. fresh scan), so ADD it.
                await addInventoryItem(updatedItem, user.id);
            }

            // Optimistic update
            setInventory(prev => {
                const exists = prev.some(item => item.id === updatedItem.id);
                if (exists) {
                    return prev.map(item => item.id === updatedItem.id ? updatedItem : item);
                } else {
                    return [updatedItem, ...prev];
                }
            });
            setEditingItem(updatedItem);

            // Force Refresh from DB to confirm persistence
            fetchInventory().then(setInventory);

            alert("Draft Saved to Inventory!");
            setEditingItem(null);

            // If we came from a scan flow (internal editor or modal), transition to inventory
            if (status === ScoutStatus.COMPLETE || status === ScoutStatus.RESEARCH_REVIEW) {
                setStatus(ScoutStatus.IDLE);
                setScoutResult(null);
                setScannedBarcode(null);
                setScoutAdditionalImages([]);
                setView('inventory');
                setInventoryTab('DRAFT');
            }
        } catch (e: any) {
            console.error("Save failed", e);
            alert("Failed to save: " + e.message);
        }
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
            // Reset input value to ensure onChange fires even if same file selected again
            e.target.value = '';

            const reader = new FileReader();
            reader.onloadend = async () => {
                const base64 = reader.result as string;
                // Enforce Cloud Storage Upload
                if (user) {
                    const publicUrl = await uploadScanImage(user.id, base64);
                    if (publicUrl) {
                        setUnitForm(prev => ({ ...prev, imageUrl: publicUrl }));
                    } else {
                        alert("Image upload failed. Check your connection or file size.");
                    }
                } else {
                    // Only fallback for offline/guest
                    setUnitForm(prev => ({ ...prev, imageUrl: base64 }));
                }
            };
            reader.readAsDataURL(file);
        }
    };

    const handleAnalyzeDraft = async () => {
        if (!editingItem || !editingItem.imageUrl) return;

        setLoadingMessage("Analyzing Draft...");

        try {
            let base64Image = editingItem.imageUrl;

            // If it's a remote URL, fetch and convert to Base64
            if (editingItem.imageUrl.startsWith('http')) {
                try {
                    // Use a proxy or ensure CORS is handled. For now, try direct fetch.
                    const response = await fetch(editingItem.imageUrl, { mode: 'cors' });
                    if (!response.ok) throw new Error(`Fetch failed: ${response.statusText}`);
                    const blob = await response.blob();
                    base64Image = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result as string);
                        reader.onerror = reject;
                        reader.readAsDataURL(blob);
                    });
                } catch (fetchErr) {
                    console.error("Failed to fetch image for analysis", fetchErr);
                    // Fallback: If fetch fails (CORS), we can't analyze.
                    alert("Could not access image. Please upload a local photo for analysis.");
                    setLoadingMessage("");
                    return;
                }
            }

            const result = await analyzeItemImage(base64Image);

            setEditingItem(prev => {
                if (!prev) return null;

                // Merge Item Specifics
                const newSpecifics = { ...ensureDefaultSpecifics(result.itemSpecifics) };
                if (result.estimatedWeight) newSpecifics.Weight = result.estimatedWeight;

                return {
                    ...prev,
                    title: result.itemTitle,
                    description: result.description,
                    itemSpecifics: newSpecifics,
                    dimensions: result.estimatedDimensions || prev.dimensions,
                    calculation: {
                        ...prev.calculation,
                        soldPrice: result.estimatedSoldPrice,
                        shippingCost: result.estimatedShippingCost,
                        itemCost: prev.calculation.itemCost,
                        netProfit: result.estimatedSoldPrice - result.estimatedShippingCost - prev.calculation.itemCost - (result.estimatedSoldPrice * 0.1325)
                    }
                };
            });
            setLoadingMessage(""); // Clear loading
            alert("Analysis Complete! Updated Title, Price, Weight, Dimensions, and Specifics.");
        } catch (e) {
            console.error("Draft analysis failed", e);
            setLoadingMessage("");
            alert("Analysis failed. Please try again.");
        }
    };

    const handleSaveUnit = async () => {
        if (!user) return;

        if (!unitForm.storeNumber || unitForm.storeNumber.trim() === '') {
            alert("Please enter a Source Name or ID (e.g. 'Garage Sale').");
            return;
        }

        try {
            const newUnitData: StorageUnit = {
                id: unitForm.id,
                storeNumber: unitForm.storeNumber,
                address: unitForm.address || '',
                cost: parseFloat(unitForm.cost) || 0,
                imageUrl: unitForm.imageUrl || '' // Ensure string type 
            };
            if (unitForm.id) {
                const oldUnit = storageUnits.find(u => u.id === unitForm.id);
                await updateStorageUnit(newUnitData, oldUnit?.storeNumber);
            } else {
                await addStorageUnit(newUnitData, user.id);
            }
            setIsUnitModalOpen(false); refreshData();
        } catch (e: any) {
            console.error("Failed to save unit:", e);
            alert(`Failed to save source: ${e.message || e.error_description || JSON.stringify(e)}`);
        }
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

    // --- eBay Command Handlers ---

    const handleIntelligenceSearch = async (overriddenQuery?: string) => {
        const queryToUse = overriddenQuery || searchQuery;
        if (!queryToUse) return;

        setIsIntelligenceAnalyzing(true);
        setIntelligenceResult(null); // Clear previous result

        try {
            const ebayId = extractEbayId(queryToUse);

            if (ebayId) {
                // URL-based Analysis (Listing Optimizer)
                const apiUrl = `${FUNCTIONS_URL}/ebay-item/${encodeURIComponent(ebayId)}`;
                const { data: { session } } = await supabase.auth.getSession();
                const headers: HeadersInit = { 'Content-Type': 'application/json' };
                if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;

                const response = await fetch(apiUrl, { headers });
                if (!response.ok) throw new Error(`API returned ${response.status}`);
                const data = await response.json();

                // 1. AI Analysis
                const aiResponse = await analyzeListingWithGemini({
                    title: data.title,
                    price: `${data.price.value} ${data.price.currency}`,
                    category: data.categoryPath,
                    condition: data.condition,
                    url: queryToUse,
                    specifics: data.localizedAspects || []
                });

                // 2. Market Data
                const marketData = await fetchMarketData(data.title, data.condition);

                const finalResult = {
                    ...(aiResponse || {}),
                    title: aiResponse?.title || data.title,
                    improvedTitle: aiResponse?.improvedTitle || data.title,
                    originalData: data,
                    itemWebUrl: data.itemWebUrl,
                    image: data.image,
                    isUrlSearch: true,
                    // Market data merge
                    soldItems: marketData?.soldComps || [],
                    activeItems: marketData?.activeComps || [],
                    soldCount: marketData?.soldCount || 0,
                    sellThroughRate: marketData?.sellThroughRate || 0,
                    medianSoldPrice: marketData?.medianSoldPrice || 0,
                    pricingRecommendations: marketData?.pricingRecommendations || null
                };

                setIntelligenceResult(finalResult);
            } else {
                // Keyword-based Research
                const marketData = await fetchMarketData(queryToUse);
                setIntelligenceResult({
                    ...marketData,
                    title: queryToUse,
                    isUrlSearch: false
                });
            }
        } catch (e) {
            console.error("Intelligence Search Error:", e);
            alert(`Search failed: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            setIsIntelligenceAnalyzing(false);
        }
    };

    const handleBulkFetch = async () => {
        if (!bulkSellerId) return;
        setIsBulkFetching(true);
        try {
            const response = await fetch(`${FUNCTIONS_URL}/ebay-seller/${encodeURIComponent(bulkSellerId)}`);
            const data = await response.json();
            if (data.error) throw new Error(data.error);

            // Map items for the queue
            const mappedItems = data.map((item: any) => ({
                itemId: item.itemId[0],
                title: item.title[0],
                price: { value: item.sellingStatus[0].currentPrice[0].__value__, currency: item.sellingStatus[0].currentPrice[0]['@currencyId'] },
                itemWebUrl: item.viewItemURL[0],
                image: { imageUrl: item.galleryURL?.[0] || '' },
                status: 'pending'
            }));

            setBulkItems(mappedItems);
        } catch (e: any) {
            console.error("Bulk Fetch Error:", e);
            alert(`Failed to fetch seller listings: ${e.message}`);
        }
        setIsBulkFetching(false);
    };

    const processBulkOptimization = async () => {
        if (bulkItems.length === 0) return;

        for (let i = 0; i < bulkItems.length; i++) {
            if (bulkItems[i].status !== 'pending') continue;

            const currentId = bulkItems[i].itemId;
            setBulkItems(prev => prev.map(item =>
                item.itemId === currentId ? { ...item, status: 'processing' } : item
            ));

            try {
                const response = await fetch(`${FUNCTIONS_URL}/ebay-item/${encodeURIComponent(currentId)}`);
                const data = await response.json();

                const aiResponse = await analyzeListingWithGemini({
                    title: data.title,
                    price: `${data.price.value} ${data.price.currency}`,
                    category: data.categoryPath,
                    condition: data.condition,
                    url: data.itemWebUrl,
                    specifics: data.localizedAspects || []
                });

                if (aiResponse) {
                    setBulkProcessResults(prev => ({
                        ...prev,
                        [currentId]: {
                            ...aiResponse,
                            improvedTitle: typeof aiResponse.improvedTitle === 'object' ? JSON.stringify(aiResponse.improvedTitle) : String(aiResponse.improvedTitle || '')
                        }
                    }));
                    setBulkItems(prev => prev.map(item =>
                        item.itemId === currentId ? { ...item, status: 'complete', score: aiResponse.score } : item
                    ));
                } else {
                    throw new Error("AI analysis failed");
                }
            } catch (error) {
                console.error(`Failed to process item ${currentId}:`, error);
                setBulkItems(prev => prev.map(item =>
                    item.itemId === currentId ? { ...item, status: 'error' } : item
                ));
            }
        }
    };



    const renderCommandView = () => {
        return (
            <div className="command-container flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden pt-safe">
                <div className="p-4 border-b border-slate-800 bg-[#141921] sticky top-0 z-10 backdrop-blur-md bg-opacity-80">
                    <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
                                <Zap className="text-emerald-400" size={18} />
                            </div>
                            <h2 className="text-xl font-black tracking-tight vibrant-gradient uppercase">Command Center <span className="text-[8px] opacity-30">v1.1</span></h2>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded text-[9px] font-black text-emerald-500 tracking-tighter">
                                LIVE
                            </div>
                            <div className="text-[9px] font-bold text-slate-500 tracking-widest uppercase">
                                AI-POWERED INSIGHTS
                            </div>
                        </div>
                    </div>

                    <div className="flex p-1 bg-[#1e2530] rounded-xl border border-white/5">
                        <button
                            onClick={() => setCommandTab('analyze')}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-[10px] font-black tracking-widest transition-all duration-300 ${commandTab === 'analyze' ? 'bg-[#06b6d4] text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            <Aperture size={14} /> INTELLIGENCE
                        </button>
                        <button
                            onClick={() => setCommandTab('bulk')}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-[10px] font-black tracking-widest transition-all duration-300 ${commandTab === 'bulk' ? 'bg-[#06b6d4] text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            <Layers size={14} /> BULK
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-24">
                    <AnimatePresence mode="wait">
                        {commandTab === 'analyze' && (
                            <motion.div
                                key="analyze"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="space-y-6"
                            >
                                <div className="glass-panel p-6">
                                    <div className="flex items-center gap-2 mb-4">
                                        <Sparkles size={18} className="text-[#10b981]" />
                                        <h3 className="font-black text-xs uppercase tracking-widest text-slate-400">Inventory Optimizer</h3>
                                    </div>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            placeholder="Paste eBay URL or Keywords..."
                                            className="w-full bg-[#1e2530] border border-white/5 rounded-xl py-3.5 px-5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#10b981]/50 transition-all shadow-inner"
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleIntelligenceSearch()}
                                        />
                                        <AnimatedButton
                                            disabled={isIntelligenceAnalyzing || !searchQuery}
                                            onClick={() => handleIntelligenceSearch()}
                                            text="Search"
                                            icon={Search}
                                            style={{
                                                position: 'absolute',
                                                right: '6px',
                                                top: '6px',
                                                bottom: '6px'
                                            }}
                                        />
                                    </div>
                                </div>

                                {intelligenceResult && (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.98 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="space-y-6"
                                    >
                                        {/* URL-Specific Analysis Section */}
                                        {intelligenceResult.isUrlSearch && (
                                            <>
                                                <div className="glass-panel p-6 flex gap-6 items-start">
                                                    <div className="relative">
                                                        <img src={intelligenceResult.image?.imageUrl} className="w-24 h-24 rounded-xl object-cover border border-white/10 shadow-xl" alt="" />
                                                        <div className="absolute -bottom-2 -right-2 w-10 h-10 rounded-full bg-[#141921] border-2 border-[#06b6d4] flex items-center justify-center font-black text-[#06b6d4] text-xs shadow-lg">
                                                            {String(intelligenceResult.score || 0)}%
                                                        </div>
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <h4 className="font-bold text-white text-base leading-tight mb-2 line-clamp-2">{typeof intelligenceResult.title === 'object' ? JSON.stringify(intelligenceResult.title) : String(intelligenceResult.title || '')}</h4>
                                                        <div className="flex gap-4">
                                                            <div>
                                                                <div className="text-[10px] font-black uppercase text-slate-500 mb-0.5 tracking-tighter">Current Price</div>
                                                                <div className="text-lg font-black text-white">${typeof intelligenceResult.originalData?.price?.value === 'object' ? JSON.stringify(intelligenceResult.originalData.price.value) : String(intelligenceResult.originalData?.price?.value || 0)}</div>
                                                            </div>
                                                            <div>
                                                                <div className="text-[10px] font-black uppercase text-[#10b981] mb-0.5 tracking-tighter">Market Target</div>
                                                                <div className="text-lg font-black text-[#10b981]">{typeof intelligenceResult.market?.median === 'object' ? JSON.stringify(intelligenceResult.market.median) : (intelligenceResult.market?.median || '...')}</div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="glass-panel p-5 space-y-4">
                                                        <h5 className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Health Metrics</h5>
                                                        <div className="space-y-3">
                                                            {(intelligenceResult.metrics || []).map((metric: any, i: number) => (
                                                                <div key={i}>
                                                                    <div className="flex justify-between text-[10px] font-bold uppercase mb-1">
                                                                        <span className="text-slate-400">{String(metric.label || '')}</span>
                                                                        <span className={Number(metric.value) > 80 ? 'text-[#10b981]' : Number(metric.value) > 60 ? 'text-[#f59e0b]' : 'text-[#ef4444]'}>{String(metric.value || 0)}%</span>
                                                                    </div>
                                                                    <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                                                        <motion.div
                                                                            initial={{ width: 0 }}
                                                                            animate={{ width: `${Number(metric.value) || 0}%` }}
                                                                            className={`h-full ${Number(metric.value) > 80 ? 'bg-[#10b981]' : Number(metric.value) > 60 ? 'bg-[#f59e0b]' : 'bg-[#ef4444]'}`}
                                                                            style={{ background: String(metric.color || '') }}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    <div className="glass-panel p-5">
                                                        <h5 className="text-[10px] font-black uppercase text-[#ef4444] tracking-widest mb-4">Actionable Fixes</h5>
                                                        <div className="space-y-3">
                                                            {(intelligenceResult.issues || []).map((issue: any, i: number) => (
                                                                <div key={i} className="flex gap-2 items-start">
                                                                    <div className={`w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${issue.type === 'error' ? 'bg-[#ef4444]' : issue.type === 'warning' ? 'bg-[#f59e0b]' : 'bg-[#10b981]'}`} />
                                                                    <p className="text-[11px] text-slate-300 leading-normal">{typeof issue.text === 'object' ? JSON.stringify(issue.text) : (issue.text || '')}</p>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="glass-panel p-6 border-l-4 border-l-[#06b6d4]">
                                                    <div className="flex items-center justify-between mb-3">
                                                        <div className="flex items-center gap-2">
                                                            <Sparkles size={16} className="text-[#10b981]" />
                                                            <span className="text-[10px] font-black uppercase text-[#10b981] tracking-widest">AI Optimized Title</span>
                                                        </div>
                                                        <span className={`text-[10px] font-mono font-bold ${(intelligenceResult.improvedTitle?.length || 0) > 80 ? 'text-red-400' : (intelligenceResult.improvedTitle?.length || 0) >= 75 ? 'text-[#10b981]' : 'text-yellow-400'}`}>
                                                            {(typeof intelligenceResult.improvedTitle === 'string' ? intelligenceResult.improvedTitle : '').length}/80
                                                        </span>
                                                    </div>
                                                    <div className="text-sm text-white font-medium leading-relaxed mb-4">{typeof intelligenceResult.improvedTitle === 'object' ? JSON.stringify(intelligenceResult.improvedTitle) : (intelligenceResult.improvedTitle || '')}</div>
                                                    <a href={intelligenceResult.itemWebUrl} target="_blank" rel="noreferrer" className="w-full py-3 px-4 bg-[#06b6d4]/10 hover:bg-[#06b6d4]/20 text-[#06b6d4] rounded-xl text-[10px] font-black tracking-widest uppercase transition-all border border-[#06b6d4]/20 flex items-center justify-center gap-2">
                                                        View on eBay <ExternalLink size={12} />
                                                    </a>
                                                    <AnimatedButton
                                                        onClick={() => handleIntelligenceSearch(intelligenceResult.improvedTitle)}
                                                        text="Run Deeper Market Research"
                                                        icon={Search}
                                                        className="w-full mt-3 bg-white/5 border border-white/5 hover:bg-white/10 text-white font-black text-[10px] tracking-widest uppercase"
                                                    />
                                                </div>
                                            </>
                                        )}

                                        {/* Market Metrics Summary */}
                                        <div className="grid grid-cols-3 gap-4">
                                            <div className="glass-panel p-5 text-center group">
                                                <div className="text-[10px] font-black uppercase text-slate-500 mb-2 tracking-widest group-hover:text-[#06b6d4] transition-colors">Sold Price</div>
                                                <div className="text-2xl font-black text-white">${typeof intelligenceResult.medianSoldPrice === 'object' ? JSON.stringify(intelligenceResult.medianSoldPrice) : String(intelligenceResult.medianSoldPrice || 0)}</div>
                                            </div>
                                            <div className="glass-panel p-5 text-center group">
                                                <div className="text-[10px] font-black uppercase text-slate-500 mb-2 tracking-widest group-hover:text-[#10b981] transition-colors">Sell-Through</div>
                                                <div className="text-2xl font-black text-[#10b981]">{typeof intelligenceResult.sellThroughRate === 'object' ? JSON.stringify(intelligenceResult.sellThroughRate) : String(intelligenceResult.sellThroughRate || '0%')}</div>
                                            </div>
                                            <div className="glass-panel p-5 text-center group">
                                                <div className="text-[10px] font-black uppercase text-slate-500 mb-2 tracking-widest group-hover:text-[#f59e0b] transition-colors">Active</div>
                                                <div className="text-2xl font-black text-slate-300">{typeof intelligenceResult.activeCount === 'object' ? JSON.stringify(intelligenceResult.activeCount) : String(intelligenceResult.activeCount || intelligenceResult.activeItems?.length || 0)}</div>
                                            </div>
                                        </div>

                                        {/* Pricing Strategies */}
                                        {intelligenceResult.pricingRecommendations && (
                                            <div className="glass-panel p-6">
                                                <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-6">Pricing Strategy</h4>
                                                <div className="flex gap-5 overflow-x-auto pb-5 no-scrollbar">
                                                    {(['quickSale', 'competitive', 'premium'] as const).map((tier) => {
                                                        const rec = (intelligenceResult.pricingRecommendations as any)[tier];
                                                        if (!rec) return null;
                                                        const colors: any = { quickSale: '#f59e0b', competitive: '#06b6d4', premium: '#10b981' };
                                                        const labels: any = { quickSale: 'Quick Sale', competitive: 'Competitive', premium: 'Premium' };
                                                        const icons: any = { quickSale: TrendingUp, competitive: CheckCircle2, premium: Sparkles };
                                                        const Icon = icons[tier];

                                                        return (
                                                            <div key={tier} className="pricing-card-container flex-shrink-0">
                                                                <div className="price-card" style={{ borderLeft: `4px solid ${colors[tier]}` }}>
                                                                    <div className="flex items-center gap-2 mb-2">
                                                                        <Icon size={14} style={{ color: colors[tier] }} />
                                                                        <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{labels[tier]}</span>
                                                                    </div>
                                                                    <div className="text-2xl font-black text-white">${typeof rec.price === 'object' ? JSON.stringify(rec.price) : String(rec.price || 0)}</div>
                                                                    <div className="mt-auto text-[10px] text-slate-500 font-bold uppercase">{tier === 'quickSale' ? '1-3 Days' : tier === 'competitive' ? '3-7 Days' : '7+ Days'}</div>
                                                                </div>
                                                                <div className="price-card-expansion">
                                                                    <div className="price-card-details space-y-2">
                                                                        <div className="text-[11px] text-slate-400 leading-normal">{typeof rec.description === 'object' ? JSON.stringify(rec.description) : String(rec.description || '')}</div>
                                                                    </div>
                                                                    <div className="price-card-footer" style={{ background: colors[tier], color: tier === 'quickSale' ? '#000' : '#fff' }}>
                                                                        {tier === 'quickSale' ? 'FAST' : tier === 'competitive' ? 'RECOMMENDED' : 'MAX PROFIT'}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {/* Comps List */}
                                        <div className="space-y-6">
                                            {intelligenceResult.activeItems && intelligenceResult.activeItems.length > 0 && (
                                                <div className="glass-panel p-6">
                                                    <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-4">Similar Active Listings</h4>
                                                    <div className="space-y-3">
                                                        {(intelligenceResult?.activeItems || []).map((comp: any, idx: number) => (
                                                            <div key={idx} className="bg-slate-900/50 border border-slate-800 hover:border-slate-600 p-3 rounded-xl flex gap-3 group transition-colors">
                                                                <div className="w-16 h-16 bg-slate-800 rounded-lg overflow-hidden border border-slate-700 shrink-0">
                                                                    {comp.image?.imageUrl ? <img src={comp.image.imageUrl} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-600"><ImageIcon size={20} /></div>}
                                                                </div>
                                                                <div className="flex-1 min-w-0 flex flex-col justify-between">
                                                                    <a href={comp.itemWebUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-slate-300 hover:text-white hover:underline line-clamp-2 leading-snug">{comp.title}</a>
                                                                    <div className="flex items-center justify-between mt-1">
                                                                        <span className="text-sm font-black text-white">${typeof comp.price?.value === 'object' ? JSON.stringify(comp.price.value) : Number(comp.price?.value || 0).toFixed(2)}</span>
                                                                        <span className="text-[9px] text-slate-500 font-mono uppercase text-right">Active</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            <div className="glass-panel p-6">
                                                <div className="flex items-center justify-between mb-4">
                                                    <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Recent Sold Listings</h4>
                                                    {intelligenceResult.soldItems && intelligenceResult.soldItems.length > 0 && (
                                                        <span className="text-[10px] font-mono text-slate-500">{intelligenceResult.soldCount || intelligenceResult.soldItems.length} Sold Total</span>
                                                    )}
                                                </div>
                                                {intelligenceResult.soldItems && intelligenceResult.soldItems.length > 0 ? (
                                                    <div className="space-y-3">
                                                        {(intelligenceResult?.soldItems || []).map((comp: any, idx: number) => (
                                                            <div key={idx} className="bg-slate-900/50 border border-slate-800 hover:border-slate-600 p-3 rounded-xl flex gap-3 group transition-colors">
                                                                <div className="w-16 h-16 bg-slate-800 rounded-lg overflow-hidden border border-slate-700 shrink-0">
                                                                    {comp.image?.imageUrl ? <img src={comp.image.imageUrl} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-600"><ImageIcon size={20} /></div>}
                                                                </div>
                                                                <div className="flex-1 min-w-0 flex flex-col justify-between">
                                                                    <a href={comp.itemWebUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-slate-300 hover:text-white hover:underline line-clamp-2 leading-snug">{comp.title}</a>
                                                                    <div className="flex items-center justify-between mt-1">
                                                                        <span className="text-sm font-black text-[#10b981]">${typeof comp.price?.value === 'object' ? JSON.stringify(comp.price.value) : Number(comp.price?.value || 0).toFixed(2)}</span>
                                                                        <span className="text-[8px] text-slate-500 font-mono uppercase text-right">Sold {comp.endTime ? new Date(comp.endTime).toLocaleDateString() : ''}</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="p-4 bg-slate-900/30 border border-dashed border-slate-800 rounded-xl text-center">
                                                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">No Recent Sales Found</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </motion.div>
                        )}

                        {commandTab === 'bulk' && (
                            <motion.div
                                key="bulk"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="space-y-6"
                            >
                                <div className="glass-panel p-6">
                                    <div className="flex items-center gap-2 mb-4">
                                        <Layers size={18} className="text-[#a855f7]" />
                                        <h3 className="font-black text-xs uppercase tracking-widest text-slate-400">Bulk Optimization</h3>
                                    </div>
                                    <div className="flex gap-3">
                                        <input
                                            type="text"
                                            placeholder="Enter eBay Seller ID..."
                                            className="flex-1 bg-[#1e2530] border border-white/5 rounded-xl py-3.5 px-5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#a855f7]/50 transition-all shadow-inner"
                                            value={bulkSellerId}
                                            onChange={(e) => setBulkSellerId(e.target.value)}
                                        />
                                        <AnimatedButton
                                            disabled={isBulkFetching || !bulkSellerId}
                                            onClick={handleBulkFetch}
                                            text="Fetch"
                                            icon={Search}
                                            className="px-8 font-black text-xs tracking-widest"
                                        />
                                    </div>
                                    <p className="mt-3 text-[10px] text-slate-500 font-bold uppercase tracking-tighter">
                                        Fetching oldest active listings for performance review
                                    </p>
                                </div>

                                {bulkItems.length > 0 && (
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="space-y-4"
                                    >
                                        <div className="flex justify-between items-center px-1">
                                            <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Listing Queue</h4>
                                            <AnimatedButton
                                                onClick={processBulkOptimization}
                                                text="Optimize All"
                                                icon={Zap}
                                                className="px-6 py-2 text-[10px] font-black"
                                            />
                                        </div>

                                        <div className="space-y-3">
                                            {bulkItems.map((item, idx) => (
                                                <div key={item.itemId} className="glass-card overflow-hidden border border-white/5">
                                                    <div
                                                        className="p-3 flex gap-4 items-center cursor-pointer hover:bg-white/5 transition-all"
                                                        onClick={() => setExpandedBulkItem(expandedBulkItem === item.itemId ? null : item.itemId)}
                                                    >
                                                        <div className="relative">
                                                            <img src={item.image?.imageUrl} className="w-12 h-12 rounded-lg object-cover border border-white/10" alt="" />
                                                            {item.status === 'complete' && (
                                                                <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#10b981] flex items-center justify-center text-[8px] text-white shadow-lg">
                                                                    ✓
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <h4 className="text-[11px] font-bold text-white line-clamp-1">{typeof item.title === 'object' ? JSON.stringify(item.title) : String(item.title || '')}</h4>
                                                            <div className="flex items-center gap-3 mt-1">
                                                                <span className="text-[11px] font-black text-[#06b6d4]">${typeof item.price?.value === 'object' ? JSON.stringify(item.price.value) : String(item.price?.value || 0)}</span>
                                                                {item.score && (
                                                                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${item.score > 80 ? 'bg-[#10b981]/10 text-[#10b981]' : 'bg-[#f59e0b]/10 text-[#f59e0b]'}`}>
                                                                        {String(item.score || 0)}% Score
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            {item.status === 'processing' ? (
                                                                <RotateCcw size={14} className="animate-spin text-[#06b6d4]" />
                                                            ) : item.status === 'complete' ? (
                                                                <ChevronRight size={14} className={`text-slate-600 transition-transform ${expandedBulkItem === item.itemId ? 'rotate-90' : ''}`} />
                                                            ) : (
                                                                <Wand2 size={14} className="text-slate-600 hover:text-[#06b6d4] transition-colors" />
                                                            )}
                                                        </div>
                                                    </div>

                                                    <AnimatePresence>
                                                        {expandedBulkItem === item.itemId && bulkProcessResults[item.itemId] && (
                                                            <motion.div
                                                                initial={{ height: 0, opacity: 0 }}
                                                                animate={{ height: 'auto', opacity: 1 }}
                                                                exit={{ height: 0, opacity: 0 }}
                                                                className="border-t border-white/5 bg-[#0a0e13]/50 p-4 space-y-4"
                                                            >
                                                                <div className="space-y-2">
                                                                    <div className="text-[9px] font-black uppercase text-[#10b981] tracking-widest">Optimized Title</div>
                                                                    <div className="text-xs text-white bg-[#141921] p-3 rounded-lg border border-white/5 leading-relaxed">
                                                                        {typeof bulkProcessResults[item.itemId].improvedTitle === 'object' ? JSON.stringify(bulkProcessResults[item.itemId].improvedTitle) : String(bulkProcessResults[item.itemId].improvedTitle || '')}
                                                                    </div>
                                                                </div>

                                                                <div className="grid grid-cols-2 gap-3">
                                                                    <div className="bg-[#141921] p-3 rounded-lg border border-white/5">
                                                                        <div className="text-[9px] font-black uppercase text-slate-500 mb-1">Target Price</div>
                                                                        <div className="text-sm font-black text-white">{typeof bulkProcessResults[item.itemId].market?.median === 'object' ? JSON.stringify(bulkProcessResults[item.itemId].market.median) : String(bulkProcessResults[item.itemId].market?.median || '...')}</div>
                                                                    </div>
                                                                    <div className="bg-[#141921] p-3 rounded-lg border border-white/5">
                                                                        <div className="text-[9px] font-black uppercase text-slate-500 mb-1">Action</div>
                                                                        <div className="flex gap-2">
                                                                            <a href={item.itemWebUrl} target="_blank" rel="noreferrer" className="text-[10px] text-[#06b6d4] font-bold">Edit Listing</a>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </motion.div>
                                                        )}
                                                    </AnimatePresence>
                                                </div>
                                            ))}
                                        </div>
                                    </motion.div>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        );
    };

    // --- Components ---

    const AnimatedButton = ({ onClick, text, children, icon: Icon, style, disabled, className = "" }: any) => {
        const content = text || (typeof children === 'string' ? children : null);
        const letters = content ? content.split("") : [];

        return (
            <div className={`btn-wrapper ${className}`} style={style}>
                <button
                    className="btn"
                    onClick={onClick}
                    disabled={disabled}
                    style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: disabled ? 0.6 : 1,
                        cursor: disabled ? 'not-allowed' : 'pointer'
                    }}
                >
                    {Icon && <Icon className="btn-svg" size={18} style={{ flexShrink: 0 }} />}
                    {content ? (
                        <div className="txt-wrapper" style={{ flexShrink: 0 }}>
                            <span className="txt-1">
                                {letters.map((char: string, i: number) => (
                                    <span key={i} className="btn-letter" style={{ animationDelay: `${i * 0.05}s` }}>{char === " " ? "\u00A0" : char}</span>
                                ))}
                            </span>
                            <span className="txt-2">
                                {letters.map((char: string, i: number) => (
                                    <span key={i} className="btn-letter" style={{ animationDelay: `${i * 0.05}s` }}>{char === " " ? "\u00A0" : char}</span>
                                ))}
                            </span>
                        </div>
                    ) : children}
                </button>
            </div>
        );
    };

    // --- Main Application ---

    const renderBottomNav = () => (
        <div className="fixed bottom-0 left-0 right-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-t border-gray-100 dark:border-slate-800 px-6 py-2 pb-safe z-50 shadow-2xl">
            <div className="flex justify-between items-center max-w-lg mx-auto">
                <button onClick={() => setView('command')} className={`flex flex-col items-center gap-1 transition-all ${view === 'command' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>
                    <LayoutDashboard size={20} className={view === 'command' ? 'scale-110' : ''} />
                    <span className="text-[10px] font-bold">COMMAND</span>
                </button>
                <button onClick={() => { setView('scout'); handleStartScan(); }} className={`flex flex-col items-center gap-1 transition-all ${view === 'scout' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>
                    <ScanLine size={20} className={view === 'scout' ? 'scale-110' : ''} />
                    <span className="text-[10px] font-bold">SCOUT</span>
                </button>
                <button onClick={() => setView('inventory')} className={`flex flex-col items-center gap-1 transition-all ${view === 'inventory' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>
                    <Package size={20} className={view === 'inventory' ? 'scale-110' : ''} />
                    <span className="text-[10px] font-bold">INVENTORY</span>
                </button>
                <button onClick={() => setView('stats')} className={`flex flex-col items-center gap-1 transition-all ${view === 'stats' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>
                    <BarChart3 size={20} className={view === 'stats' ? 'scale-110' : ''} />
                    <span className="text-[10px] font-bold">STATS</span>
                </button>
            </div>
        </div>
    );

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
                        <h4 className="font-bold text-sm text-slate-900 dark:text-white line-clamp-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{typeof item.title === 'object' ? JSON.stringify(item.title) : String(item.title || '')}</h4>
                        <span className={`font-mono font-bold text-xs ${item.calculation.netProfit > 0 ? 'text-emerald-600 dark:text-neon-green' : 'text-red-500'}`}>
                            {item.status === 'SOLD' ? 'SOLD' : `$${typeof item.calculation.soldPrice === 'object' ? JSON.stringify(item.calculation.soldPrice) : Number(item.calculation.soldPrice || 0).toFixed(0)}`}
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
                            <button
                                onClick={async (e) => {
                                    e.stopPropagation();
                                    if (Capacitor.isNativePlatform()) {
                                        await Browser.open({ url: item.ebayUrl! });
                                    } else {
                                        window.open(item.ebayUrl, '_blank');
                                    }
                                }}
                                className="text-blue-500 hover:text-blue-400 p-1 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                            >
                                <ExternalLink size={12} />
                            </button>
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
                            <button onClick={async () => {
                                if (!canAccess('CSV_EXPORT')) {
                                    setIsPricingOpen(true);
                                    return;
                                }

                                try {
                                    const csvContent = [
                                        ['Date Scanned', 'Title', 'Status', 'Sold Price', 'Item Cost', 'Shipping Cost', 'Fees', 'Net Profit', 'Storage Unit', 'Cost Code'].join(','),
                                        ...inventory.map(item => [
                                            new Date(item.dateScanned).toLocaleDateString(),
                                            `"${item.title.replace(/"/g, '""')}"`,
                                            item.status,
                                            item.calculation.soldPrice.toFixed(2),
                                            item.calculation.itemCost.toFixed(2),
                                            item.calculation.shippingCost.toFixed(2),
                                            item.calculation.platformFees.toFixed(2),
                                            item.calculation.netProfit.toFixed(2),
                                            item.storageUnitId,
                                            item.costCode
                                        ].join(','))
                                    ].join('\n');

                                    const fileName = `inventory_export_${new Date().toISOString().split('T')[0]}.csv`;
                                    const file = new File([csvContent], fileName, { type: 'text/csv' });

                                    // 1. Try Web Share API (Works on iOS 15+)
                                    if (navigator.canShare && navigator.canShare({ files: [file] })) {
                                        try {
                                            await navigator.share({
                                                files: [file],
                                                title: 'Export Inventory',
                                            });
                                            return; // Success!
                                        } catch (shareErr) {
                                            console.warn("Web Share failed", shareErr);
                                        }
                                    }

                                    // 2. Try Native Capacitor Plugin (if installed)
                                    if (Capacitor.isNativePlatform()) {
                                        try {
                                            const result = await Filesystem.writeFile({
                                                path: fileName,
                                                data: csvContent,
                                                directory: Directory.Documents,
                                                encoding: Encoding.UTF8
                                            });

                                            await Share.share({
                                                title: 'Export Inventory',
                                                text: 'Here is your inventory export.',
                                                url: result.uri,
                                                dialogTitle: 'Export Inventory CSV'
                                            });
                                        } catch (nativeErr: any) {
                                            console.error("Native export failed", nativeErr);

                                            // 3. Fallback to Clipboard
                                            try {
                                                await navigator.clipboard.writeText(csvContent);
                                                alert("Could not save file (System missing CocoaPods).\n\nFALLBACK: CSV data copied to Clipboard!");
                                            } catch (clipErr) {
                                                alert(`Export failed completely: ${nativeErr.message}`);
                                            }
                                        }
                                    } else {
                                        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                                        const link = document.createElement('a');
                                        const url = URL.createObjectURL(blob);
                                        link.setAttribute('href', url);
                                        link.setAttribute('download', fileName);
                                        link.style.visibility = 'hidden';
                                        document.body.appendChild(link);
                                        link.click();
                                        document.body.removeChild(link);
                                    }
                                } catch (e) {
                                    console.error("Export failed", e);
                                    alert("Export failed. Please try again.");
                                }
                            }} className="p-2 bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/30 border border-blue-200 dark:border-blue-900/30 flex items-center justify-center relative">
                                {!canAccess('CSV_EXPORT') && <div className="absolute -top-1 -right-1 bg-slate-800 text-white rounded-full p-0.5 border border-slate-600"><Lock size={8} /></div>}
                                <Download size={18} />
                            </button>
                        </div>
                    </div>
                    <div className="flex p-1 bg-gray-100 dark:bg-slate-800 rounded-xl">
                        {(['DRAFT', 'LISTED', 'SOLD'] as const).map(tab => (
                            <button key={tab} onClick={() => setInventoryTab(tab)} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${inventoryTab === tab ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>{tab}</button>
                        ))}
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-safe">
                    {inventoryViewMode === 'FOLDERS' && inventoryTab === 'DRAFT' ? (
                        (storageUnits || []).map(unit => {
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





    const renderResearchReview = () => {
        if (!scoutResult) return null;

        return (
            <ResearchScreen
                result={scoutResult}
                onResearch={handleOpenResearch}
                onDiscard={() => {
                    setStatus(ScoutStatus.IDLE);
                    setScoutResult(null);
                }}
                onCreateDraft={() => {
                    // Pre-fill local state for the integrated editor
                    setEditedTitle(scoutResult.optimizedTitle || scoutResult.itemTitle);
                    setGeneratedListing({
                        platform: 'EBAY',
                        content: scoutResult.description
                    });
                    setConditionNotes(scoutResult.description ? "" : "Identified Item"); // Default if no desc
                    setItemCondition(scoutResult.condition || 'USED');
                    setBinLocation(""); // Optional pre-fill

                    // Transition to the integrated internal editor (renderAnalysis)
                    setStatus(ScoutStatus.COMPLETE);
                }}
            />
        );
    };

    // --- SCOUT IDLE STATE ---
    const renderScoutView = () => {
        // Calculate daily listed count
        const today = new Date().toDateString();
        const dailyListedCount = inventory.filter(item =>
            item.status === 'LISTED' && item.ebayListedDate && new Date(item.ebayListedDate).toDateString() === today
        ).length;

        return (
            <div className="flex-1 flex flex-col items-center justify-between p-6 bg-slate-950 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(env(safe-area-inset-bottom)+6rem)]">
                {/* Daily Goal Tracker */}
                <div className="w-full max-w-sm mb-8">
                    <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 backdrop-blur-xl">
                        <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-slate-500 mb-2 text-center">Daily Goal</div>
                        <div className="flex items-center justify-center gap-3">
                            <div className="w-2 h-2 bg-neon-green rounded-full shadow-[0_0_10px_#39ff14]"></div>
                            <span className="text-4xl font-black text-white">{dailyListedCount}</span>
                            <span className="text-xl font-bold text-slate-400">Listed</span>
                        </div>
                    </div>
                </div>

                {/* AI SCAN Mode Indicator */}
                <div className="mb-6">
                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 border border-slate-800 rounded-xl">
                        <Zap size={16} className="text-blue-400" />
                        <span className="text-sm font-bold text-blue-400 uppercase tracking-wider">AI Scan</span>
                    </div>
                </div>

                {/* Bulk Mode Toggle */}
                <div className="mb-8">
                    <button
                        onClick={() => setIsBulkMode(!isBulkMode)}
                        className={`px-6 py-2 rounded-full font-bold text-sm transition-all ${isBulkMode
                            ? 'bg-neon-green text-slate-950 shadow-[0_0_20px_rgba(57,255,20,0.3)]'
                            : 'bg-white text-slate-700 border border-slate-300'
                            }`}
                    >
                        <Layers size={14} className="inline mr-2" />
                        Bulk Mode
                    </button>
                </div>

                {/* Large START SCAN Button */}
                <div className="flex-1 flex items-center justify-center mb-8">
                    <button
                        onClick={() => { setCameraMode('SCOUT'); setStatus(ScoutStatus.SCANNING); }}
                        className="relative group"
                    >
                        {/* Green Glow Effect */}
                        <div className="absolute inset-0 bg-neon-green rounded-full blur-[60px] opacity-40 group-hover:opacity-60 transition-opacity"></div>

                        {/* Button Circle */}
                        <div className="relative w-48 h-48 bg-slate-900 rounded-full border-4 border-slate-800 flex flex-col items-center justify-center group-hover:border-neon-green/50 transition-all group-active:scale-95">
                            <Aperture size={64} className="text-neon-green mb-2" strokeWidth={2} />
                            <span className="text-neon-green font-black text-sm tracking-[0.2em] uppercase">Start Scan</span>
                        </div>
                    </button>
                </div>

                {/* Active Source */}
                <div className="w-full max-w-sm mb-6">
                    <div className="flex items-center justify-center gap-2 text-slate-500">
                        <span className="text-[10px] font-mono uppercase tracking-[0.3em]">Active Source:</span>
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg">
                            <span className="text-sm font-bold text-white">{activeUnit || 'None'}</span>
                            <button
                                onClick={() => setIsUnitModalOpen(true)}
                                className="text-slate-500 hover:text-neon-green transition-colors"
                            >
                                <Edit2 size={12} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Manual Lookup Section */}
                <div className="w-full max-w-sm space-y-3">
                    <div className="flex gap-2">
                        <input
                            type="text"
                            placeholder="Manual Lookup (Name or UPC)"
                            value={manualQuery}
                            onChange={(e) => setManualQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleManualSearch()}
                            className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-neon-green/50 transition-all"
                        />
                        <button
                            onClick={handleManualSearch}
                            className="px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-slate-400 hover:text-neon-green hover:border-neon-green/50 transition-all"
                        >
                            <SearchIcon size={20} />
                        </button>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-slate-400 hover:text-blue-400 hover:border-blue-400/50 transition-all"
                        >
                            <Upload size={20} />
                        </button>
                    </div>

                    {/* Mode Indicator */}
                    <div className="flex items-center justify-center gap-2 py-2 px-4 bg-slate-900/50 border border-slate-800 rounded-xl">
                        <Box size={14} className="text-slate-500" />
                        <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500">
                            Mode: {isBulkMode ? 'Bulk' : 'Single Item'}
                        </span>
                    </div>
                </div>
            </div>
        );
    };

    const renderAnalysis = () => {
        if (status === ScoutStatus.RESEARCH_REVIEW) return renderResearchReview();

        return (
            <div className="flex flex-col h-full overflow-y-auto bg-gray-50 dark:bg-slate-950 pb-20 pt-safe">
                <div className="relative w-full h-72 bg-black shrink-0">
                    {currentImage ? (
                        <div className="relative w-full h-full overflow-hidden">
                            <img src={currentImage} alt="Captured" className="w-full h-full object-contain" />
                            {status === ScoutStatus.ANALYZING && (
                                <>
                                    <div className="absolute inset-0 bg-emerald-500/10 backdrop-blur-[2px] animate-pulse-slow"></div>
                                    <div className="absolute top-0 left-0 right-0 h-[2px] bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.8)] animate-scan z-10"></div>
                                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-emerald-500/10 to-transparent animate-scan z-10 h-24 opacity-60"></div>
                                </>
                            )}
                        </div>
                    ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900">
                            <SearchIcon size={48} className="text-slate-700 mb-2" />
                            <span className="text-slate-500 font-mono text-xs uppercase">Manual Lookup: {manualQuery}</span>
                        </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent z-20">
                        {status === ScoutStatus.ANALYZING ? (
                            <div className="flex items-center justify-between w-full">
                                <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-2 text-neon-green">
                                        <Loader2 className="animate-spin" size={16} />
                                        <span className="font-mono text-sm font-bold uppercase tracking-widest">{isBulkMode ? 'ANALYZING BULK LOT' : 'AI MARKET RESEARCH'}</span>
                                    </div>
                                    <div className="text-[10px] font-mono text-emerald-400 opacity-80 pl-6 animate-pulse">
                                        {loadingMessage || "Processing Image..."}
                                    </div>
                                </div>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setStatus(ScoutStatus.COMPLETE);
                                        setLoadingMessage("");
                                    }}
                                    className="px-3 py-1 bg-red-900/50 hover:bg-red-900/80 text-white text-[10px] font-bold rounded-full border border-red-500/30 transition-colors backdrop-blur-md"
                                >
                                    STOP
                                </button>
                            </div>
                        ) : (<div className="flex justify-between items-end">{scannedBarcode && (<div className="flex items-center gap-2 px-2 py-1 bg-white/10 backdrop-blur rounded text-xs font-mono text-white border border-white/20"><ScanLine size={12} /> {scannedBarcode}</div>)}
                            <div className="flex items-center gap-2">
                                {isBackgroundAnalyzing && (
                                    <div className="flex items-center gap-2 bg-black/40 backdrop-blur px-2 py-1 rounded-lg border border-white/10">
                                        <span className="relative flex h-2 w-2">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                        </span>
                                        <span className="text-[10px] font-bold text-emerald-400 font-mono tracking-wider">AI WORKING...</span>
                                    </div>
                                )}
                                <span className="text-xs font-mono bg-emerald-500/20 backdrop-blur px-2 py-1 rounded text-emerald-400 border border-emerald-500/30 font-bold">{scoutResult?.confidence}% CONFIDENCE</span>
                            </div>
                        </div>)
                        }
                    </div >
                    {status === ScoutStatus.COMPLETE && (<button onClick={handleStartScan} className="absolute top-[calc(env(safe-area-inset-top)+1rem)] right-4 p-2 bg-black/50 backdrop-blur text-white rounded-full hover:bg-black/70 transition-colors"><Camera size={20} /></button>)}
                </div >

                <div className="flex-1 p-4 space-y-6">
                    {status === ScoutStatus.ANALYZING ? (
                        <div className="space-y-6 mt-4 opacity-50"><div className="h-8 bg-slate-200 dark:bg-slate-800 rounded w-3/4 animate-pulse"></div><div className="h-32 bg-slate-200 dark:bg-slate-800 rounded w-full animate-pulse"></div><div className="h-40 bg-slate-200 dark:bg-slate-800 rounded w-full animate-pulse"></div></div>
                    ) : scoutResult ? (
                        <div className="animate-in slide-in-from-bottom-4 duration-500 space-y-6">
                            {/* ... Results Content ... */}


                            {/* --- EDITOR & DETAILS (Shared) --- */}
                            <div className="space-y-2">
                                <div className="flex justify-between items-center"><label className="text-xs text-slate-500 font-mono uppercase tracking-wider flex items-center gap-2">Item Title</label><div className="flex gap-2">
                                    <button onClick={handleOptimizeTitle} className="text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2 py-1 rounded font-bold flex items-center gap-1 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"><Wand2 size={10} /> Optimize</button>
                                    <button onClick={() => toggleRecording('title')} className={`p-1.5 rounded-full transition-all ${isRecording === 'title' ? 'bg-red-500 text-white animate-pulse' : 'text-slate-400 hover:text-slate-600 dark:hover:text-white'}`}>{isRecording === 'title' ? <MicOff size={14} /> : <Mic size={14} />}</button></div></div>
                                <textarea value={editedTitle} onChange={(e) => setEditedTitle(e.target.value)} className="w-full bg-white dark:bg-slate-800 p-3 rounded-xl border border-gray-200 dark:border-slate-700 text-slate-900 dark:text-white font-bold text-lg focus:outline-none focus:border-emerald-500 dark:focus:border-neon-green transition-colors resize-none min-h-[80px] shadow-sm" placeholder="Item description..." />
                            </div>

                            {/* Description Field with Templates */}
                            {/* Description Field with Templates */}
                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <label className="text-xs text-slate-500 font-mono uppercase tracking-wider">Description</label>
                                </div>

                                {/* Templates - Moved to own line for visibility */}
                                <div className="flex gap-2 overflow-x-auto no-scrollbar w-full pb-2">
                                    {/* Default Templates */}
                                    <button onClick={() => {
                                        const currentContent = typeof generatedListing === 'string' ? generatedListing : (generatedListing?.content || "");
                                        const newContent = currentContent + (currentContent ? "\n\n" : "") + "• Tested and working perfectly.\n• Includes original accessories.\n• Fast shipping!";
                                        setGeneratedListing({ platform: 'EBAY', content: newContent });
                                    }} className="text-[10px] bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors whitespace-nowrap font-medium">Tested</button>

                                    <button onClick={() => {
                                        const currentContent = typeof generatedListing === 'string' ? generatedListing : (generatedListing?.content || "");
                                        const newContent = currentContent + (currentContent ? "\n\n" : "") + "• Good used condition.\n• Shows minor signs of wear.\n• See photos for details.";
                                        setGeneratedListing({ platform: 'EBAY', content: newContent });
                                    }} className="text-[10px] bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors whitespace-nowrap font-medium">Used</button>

                                    <button onClick={() => {
                                        const currentContent = typeof generatedListing === 'string' ? generatedListing : (generatedListing?.content || "");
                                        const newContent = currentContent + (currentContent ? "\n\n" : "") + "• For parts or repair only.\n• Does not power on.\n• No returns.";
                                        setGeneratedListing({ platform: 'EBAY', content: newContent });
                                    }} className="text-[10px] bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors whitespace-nowrap font-medium">Parts</button>

                                    {/* Custom Templates */}
                                    {customTemplates.map((tmpl, idx) => (
                                        <button key={idx} onClick={() => {
                                            const currentContent = typeof generatedListing === 'string' ? generatedListing : (generatedListing?.content || "");
                                            const newContent = currentContent + (currentContent ? "\n\n" : "") + tmpl;
                                            setGeneratedListing({ platform: 'EBAY', content: newContent });
                                        }} className="text-[10px] bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-3 py-1.5 rounded-lg border border-blue-100 dark:border-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors whitespace-nowrap truncate max-w-[100px]" title={tmpl}>{tmpl.substring(0, 10)}...</button>
                                    ))}

                                    {/* Add Custom Template */}
                                    <button onClick={() => {
                                        const text = prompt("Enter new template text:");
                                        if (text) {
                                            const newTemplates = [...customTemplates, text];
                                            setCustomTemplates(newTemplates);
                                            localStorage.setItem('sts_custom_templates', JSON.stringify(newTemplates));
                                        }
                                    }} className="text-[10px] bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 px-3 py-1.5 rounded-lg border border-emerald-100 dark:border-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors whitespace-nowrap font-bold flex items-center gap-1"><Plus size={12} /> Add</button>
                                </div>
                                <textarea
                                    value={typeof generatedListing === 'string' ? generatedListing : (generatedListing?.content || "")}
                                    onChange={(e) => setGeneratedListing({ platform: 'EBAY', content: e.target.value })}
                                    className="w-full bg-white dark:bg-slate-800 p-3 rounded-xl border border-gray-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-emerald-500 dark:focus:border-neon-green transition-colors resize-none h-32 shadow-sm"
                                    placeholder="Detailed item description..."
                                />
                            </div>

                            {/* Research Links for Premium - MOVED TO TOP */}
                            <div className="flex gap-2 overflow-x-auto pb-3 no-scrollbar mb-2">
                                {(() => {
                                    const searchTitle = (editedTitle || scoutResult?.itemTitle || "").toLowerCase().includes("scanning") ? "" : (editedTitle || scoutResult?.itemTitle || "item");
                                    return (
                                        <>
                                            <button onClick={() => handleOpenResearch('EBAY_SOLD', searchTitle)} className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-800 rounded-lg border border-blue-200 dark:border-slate-700 text-xs font-bold text-emerald-600 dark:text-neon-green shrink-0 hover:border-emerald-500 shadow-sm"><ShoppingCart size={14} /> eBay Sold</button>
                                            <button onClick={() => handleOpenResearch('EBAY_ACTIVE', searchTitle)} className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-800 rounded-lg border border-blue-200 dark:border-slate-700 text-xs font-bold text-blue-500 shrink-0 hover:border-blue-500 shadow-sm"><Tag size={14} /> eBay Active</button>
                                            <button onClick={() => handleOpenResearch('GOOGLE', searchTitle)} className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-800 rounded-lg border border-blue-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 shrink-0 hover:border-blue-500 shadow-sm"><SearchIcon size={14} /> Google</button>
                                            <button onClick={() => handleOpenResearch('FB', searchTitle)} className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-800 rounded-lg border border-blue-200 dark:border-slate-700 text-xs font-bold text-blue-600 dark:text-blue-400 shrink-0 hover:border-blue-500 shadow-sm"><Facebook size={14} /> FB Market</button>
                                        </>
                                    );
                                })()}
                            </div>

                            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                                <button onClick={() => setIsCompsOpen(true)} className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold shrink-0 hover:bg-blue-500 shadow-lg shadow-blue-500/20"><SearchIcon size={14} /> Deep Analysis</button>
                            </div>
                            {/* Sources Section Restored */}
                            {scoutResult?.listingSources && scoutResult.listingSources.length > 0 && (
                                <div className="bg-gray-50 dark:bg-slate-800/50 p-3 rounded-lg border border-gray-100 dark:border-slate-800">
                                    <h4 className="text-[10px] uppercase font-bold text-slate-500 mb-2 flex items-center gap-1">
                                        <Globe size={10} /> Sources Found
                                    </h4>
                                    <div className="space-y-1">
                                        {(scoutResult?.listingSources || []).slice(0, 3).map((source, idx) => (
                                            <a key={idx} href={source.uri} target="_blank" rel="noreferrer" className="block text-xs text-blue-500 hover:underline truncate">
                                                {source.title}
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-gray-200 dark:border-slate-700"><label className="text-[10px] text-slate-500 font-mono uppercase mb-1 block">Condition</label><div className="flex bg-gray-100 dark:bg-slate-900 rounded p-1"><button onClick={() => handleConditionChange('USED')} className={`flex-1 text-xs font-bold py-1 rounded transition-colors ${itemCondition === 'USED' ? 'bg-white dark:bg-slate-800 shadow text-slate-900 dark:text-white' : 'text-slate-500'}`}>Used</button><button onClick={() => handleConditionChange('NEW')} className={`flex-1 text-xs font-bold py-1 rounded transition-colors ${itemCondition === 'NEW' ? 'bg-white dark:bg-slate-800 shadow text-slate-900 dark:text-white' : 'text-slate-500'}`}>New</button></div></div>
                                <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-gray-200 dark:border-slate-700"><label className="text-[10px] text-slate-500 font-mono uppercase mb-1 block">Location / Bin</label><input type="text" value={binLocation} onChange={(e) => setBinLocation(e.target.value)} placeholder="e.g. A1" className="w-full bg-transparent text-slate-900 dark:text-white font-bold focus:outline-none" /></div>
                            </div>

                            {/* --- ITEM SPECIFICS EDITOR (Integrated) --- */}
                            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-200 dark:border-slate-700 space-y-3">
                                <div className="flex justify-between items-center mb-1 border-b border-gray-100 dark:border-slate-700 pb-2">
                                    <div className="flex items-center gap-2">
                                        <Tag size={14} className="text-emerald-500" />
                                        <label className="text-[10px] font-black font-mono uppercase text-slate-500">Item Specifics</label>
                                    </div>
                                    <button onClick={handleAddScoutSpecific} className="text-[10px] text-blue-500 hover:text-blue-400 font-bold flex items-center gap-1 bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded-lg border border-blue-100 dark:border-blue-800">+ Add</button>
                                </div>
                                <div className="space-y-2 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
                                    {Object.entries(scoutResult.itemSpecifics || {}).filter(([key]) => key !== 'Weight').map(([key, val], idx) => (
                                        <div key={idx} className="flex gap-2 items-center group">
                                            <input
                                                className="w-1/3 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-lg px-2 py-1.5 text-[10px] text-slate-600 dark:text-slate-400 focus:outline-none focus:border-emerald-500 font-mono"
                                                value={key}
                                                onChange={(e) => handleRenameScoutSpecific(key, e.target.value)}
                                                placeholder="Field Name"
                                                disabled={['Brand', 'Model', 'Type', 'Color', 'Material'].includes(key)}
                                            />
                                            <input
                                                className="flex-1 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-lg px-2 py-1.5 text-[10px] text-slate-900 dark:text-white font-bold focus:outline-none focus:border-emerald-500"
                                                value={typeof val === 'object' ? JSON.stringify(val) : String(val || '')}
                                                onChange={(e) => handleUpdateScoutSpecific(key, e.target.value)}
                                                placeholder="Value"
                                            />
                                            <button onClick={() => handleDeleteScoutSpecific(key)} className="text-slate-400 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-opacity"><X size={12} /></button>
                                        </div>
                                    ))}
                                    {(!scoutResult.itemSpecifics || Object.keys(scoutResult.itemSpecifics).length === 0) && (
                                        <div className="text-center text-slate-500 text-[10px] py-4 italic bg-gray-50 dark:bg-slate-900/50 rounded-lg border border-dashed border-gray-200 dark:border-slate-800">No specifics detected. Click "Add" to manually enter details.</div>
                                    )}
                                </div>
                            </div>

                            {/* --- SOURCE / STORAGE UNIT --- */}
                            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-200 dark:border-slate-700 space-y-1">
                                <label className="text-[10px] text-slate-500 font-mono uppercase block mb-1">Source / Storage Unit</label>
                                <div className="flex items-center gap-2 bg-gray-50 dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-lg px-3 py-2">
                                    <Warehouse size={16} className="text-slate-400" />
                                    <select
                                        value={activeUnit || ""}
                                        onChange={(e) => setActiveUnit(e.target.value)}
                                        className="flex-1 bg-transparent text-sm font-bold text-slate-900 dark:text-white focus:outline-none"
                                    >
                                        <option value="" disabled>Select Unit</option>
                                        {(storageUnits || []).map(unit => (
                                            <option key={unit.id} value={unit.storeNumber}>
                                                {unit.storeNumber} {unit.address ? `(${unit.address})` : ''}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* --- BUSINESS POLICIES --- */}
                            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-200 dark:border-slate-700 space-y-3">
                                <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-700 pb-2 mb-1">
                                    <div className="flex items-center gap-2">
                                        <CreditCard size={14} className="text-blue-500" />
                                        <h4 className="text-[10px] font-black font-mono uppercase text-slate-500">eBay Policies</h4>
                                    </div>
                                    {!ebayConnected && <span className="text-[9px] text-red-500 font-bold uppercase tracking-tighter">Connect eBay Required</span>}
                                </div>

                                {ebayConnected ? (
                                    <div className="space-y-4">
                                        <div>
                                            <div className="text-[9px] text-slate-400 uppercase font-bold mb-1 ml-1">Shipping</div>
                                            <select
                                                value={localStorage.getItem('sts_default_shipping_policy') || ""}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    if (val) localStorage.setItem('sts_default_shipping_policy', val);
                                                }}
                                                className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-lg p-2.5 text-xs text-slate-900 dark:text-white focus:border-blue-500 outline-none transition-all shadow-inner"
                                            >
                                                <option value="">Select Shipping Policy...</option>
                                                {(Array.isArray(ebayPolicies?.shippingPolicies) ? ebayPolicies.shippingPolicies : []).map((p: any) => (
                                                    <option key={p.fulfillmentPolicyId} value={p.fulfillmentPolicyId}>{p.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <div className="text-[9px] text-slate-400 uppercase font-bold mb-1 ml-1">Returns</div>
                                            <select
                                                value={localStorage.getItem('sts_default_return_policy') || ""}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    if (val) localStorage.setItem('sts_default_return_policy', val);
                                                }}
                                                className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-lg p-2.5 text-xs text-slate-900 dark:text-white focus:border-blue-500 outline-none transition-all shadow-inner"
                                            >
                                                <option value="">Select Return Policy...</option>
                                                {(Array.isArray(ebayPolicies?.returnPolicies) ? ebayPolicies.returnPolicies : []).map((p: any) => (
                                                    <option key={p.returnPolicyId} value={p.returnPolicyId}>{p.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="py-2 text-center">
                                        <p className="text-[10px] text-slate-400 italic">Policies will load once eBay is connected in settings.</p>
                                    </div>
                                )}
                            </div>

                            <div className="relative">
                                <div className="flex justify-between items-center mb-1">
                                    <label className="text-[10px] text-slate-500 font-mono uppercase">Condition Notes</label>
                                    <div className="flex gap-2">
                                        <button onClick={() => setConditionNotes(prev => prev + (prev ? "\n" : "") + "Tested and working perfectly.")} className="text-[9px] bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">Tested</button>
                                        <button onClick={() => setConditionNotes(prev => prev + (prev ? "\n" : "") + "Good cosmetic condition with minor wear.")} className="text-[9px] bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">Good Cond.</button>
                                        <button onClick={() => setConditionNotes(prev => prev + (prev ? "\n" : "") + "Sold as-is for parts or repair.")} className="text-[9px] bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">Parts Only</button>
                                    </div>
                                </div>
                                <textarea value={conditionNotes} onChange={(e) => setConditionNotes(e.target.value)} className="w-full bg-white dark:bg-slate-800 p-3 rounded-xl border border-gray-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-emerald-500 dark:focus:border-neon-green transition-colors resize-none h-20 shadow-sm" placeholder="Condition notes (e.g. scratches, missing box)..." />
                                <button onClick={() => toggleRecording('condition')} className={`absolute bottom-2 right-2 p-1.5 rounded-full transition-all ${isRecording === 'condition' ? 'bg-red-500 text-white animate-pulse' : 'bg-gray-100 dark:bg-slate-700 text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}>{isRecording === 'condition' ? <MicOff size={12} /> : <Mic size={12} />}</button>
                            </div>

                            <ProfitCalculator
                                estimatedPrice={scoutResult.estimatedSoldPrice}
                                estimatedShipping={scoutResult.estimatedShippingCost}
                                estimatedWeight={scoutResult.estimatedWeight}
                                onSave={(calc, code, cost, weight, dims) => handleSaveToInventory(calc, code, cost, weight, dims)}
                                onList={(calc, code, cost, weight, dims) => handleSaveToInventory(calc, code, cost, weight, dims, true)}
                                isScanning={false}
                                isLoading={isSaving}
                            />



                            <div className="mt-4 p-3 bg-red-900/10 border border-red-900/30 rounded-lg flex gap-3 items-start">
                                <ShieldAlert className="text-red-500 shrink-0 mt-0.5" size={16} />
                                <div className="text-[10px] text-slate-400 leading-relaxed">
                                    <strong className="text-red-400">LIABILITY DISCLAIMER:</strong> Calculations are estimates. Verify all prices, weights, and fees before listing. We are not liable for losses.
                                </div>
                            </div>

                            <button onClick={() => { if (window.confirm("Discard this scan? Data will be lost.")) setStatus(ScoutStatus.IDLE); }} className="w-full py-4 rounded-xl border-2 border-dashed border-gray-300 dark:border-slate-800 text-slate-400 font-bold hover:bg-red-50 dark:hover:bg-red-900/10 hover:border-red-300 dark:hover:border-red-900 hover:text-red-500 transition-all flex items-center justify-center gap-2"><Trash2 size={18} /> Discard Scan</button>
                        </div>
                    ) : (
                        // If status is COMPLETE but no result, it usually means we just saved a draft or are in a transitional state.
                        // Instead of showing "Analysis Failed", we should probably show the Idle state or a "Scan Complete" message.
                        // However, if we truly failed, we should show error.
                        // Let's check if we have an editingItem (which means we are in the modal).
                        // If we are here, editingItem is null (modal closed).
                        // So we should probably just go back to IDLE.
                        <div className="flex flex-col items-center justify-center h-64 text-slate-500 gap-4">
                            <div className="text-center">
                                <h3 className="font-bold">Ready to Scan</h3>
                                <p className="text-sm opacity-80 mt-1">Tap the camera to start.</p>
                            </div>
                            <button onClick={() => setStatus(ScoutStatus.IDLE)} className="px-6 py-2 bg-blue-600 text-white rounded-lg font-bold">Start New Scan</button>
                        </div>
                    )}
                </div>
                {isCompsOpen && scoutResult && (<CompsModal isOpen={isCompsOpen} onClose={() => setIsCompsOpen(false)} initialQuery={scoutResult.searchQuery || editedTitle || scoutResult.itemTitle} condition={itemCondition} initialTab={initialCompsTab} onApplyPrice={(price) => setScoutResult(prev => prev ? ({ ...prev, estimatedSoldPrice: price }) : null)} onSellSimilar={handleSellSimilar} />)}
            </div >
        );
    };

    if (authLoading) {
        return (
            <div className="fixed inset-0 bg-slate-950 flex flex-col items-center justify-center z-50">
                <Loader2 className="w-12 h-12 text-neon-green animate-spin mb-4" />
                <p className="text-slate-400 font-mono text-xs animate-pulse tracking-widest">INITIALIZING...</p>
            </div>
        );
    }

    if (isLiteMode) {
        return <LiteView onExit={() => setIsLiteMode(false)} onResearch={handleOpenResearch} />;
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
                onClose={() => {
                    setIsSettingsOpen(false);
                    // Refresh settings in case they changed
                    const savedNotif = localStorage.getItem('sts_notification_settings');
                    if (savedNotif) setNotificationSettings(JSON.parse(savedNotif));
                }}
                onOpenPricing={() => { setIsSettingsOpen(false); setIsPricingOpen(true); }}
                onOpenFeedback={() => { setIsSettingsOpen(false); setIsFeedbackOpen(true); }}
                onOpenPrivacy={() => { setIsSettingsOpen(false); setIsPrivacyOpen(true); }}
                onOpenHelp={() => { setIsSettingsOpen(false); setIsHelpOpen(true); }}
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
            {editingItem && isPreviewOpen && (<PreviewModal isOpen={isPreviewOpen} onClose={() => setIsPreviewOpen(false)} item={editingItem} onImageClick={(index) => setViewingImageIndex(index)} />)}
            {editingItem && viewingImageIndex !== null && (
                <div className="fixed inset-0 z-[100] flex flex-col bg-black animate-in fade-in duration-200">
                    {/* Top Bar - Floating Close */}
                    <div className="absolute top-0 left-0 right-0 p-4 z-20 flex justify-between items-start pt-[calc(env(safe-area-inset-top)+1rem)] pointer-events-none">
                        <span className="bg-black/40 backdrop-blur-md text-white/70 px-3 py-1 rounded-full text-xs font-mono border border-white/10">PREVIEW MODE</span>
                        <button
                            onClick={() => setViewingImageIndex(null)}
                            className="pointer-events-auto p-3 rounded-full bg-black/40 backdrop-blur-md text-white hover:bg-white/20 border border-white/10 transition-colors shadow-xl"
                        >
                            <X size={24} />
                        </button>
                    </div>

                    {/* Main Image Area - Full Screen */}
                    <div className="flex-1 relative flex items-center justify-center overflow-hidden group">
                        <img
                            src={editingItem.additionalImages ? (viewingImageIndex === 0 ? editingItem.imageUrl : editingItem.additionalImages[viewingImageIndex - 1]) : editingItem.imageUrl}
                            className="w-full h-full object-contain p-4 transition-transform duration-300"
                            alt="Full View"
                        />

                        {isOptimizingImage && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-30">
                                <div className="flex flex-col items-center gap-4">
                                    <Loader2 className="animate-spin text-neon-green" size={64} />
                                    <span className="text-white font-mono tracking-widest text-sm animate-pulse">OPTIMIZING AI...</span>
                                </div>
                            </div>
                        )}

                        {/* Navigation Arrows (Floating) */}
                        <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 flex justify-between pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-10">
                            <button onClick={(e) => { e.stopPropagation(); handleNavigateImage('prev'); }} className="pointer-events-auto p-4 bg-black/50 hover:bg-black/70 text-white rounded-full transition-all active:scale-95 backdrop-blur-md border border-white/10"><ChevronLeft size={32} /></button>
                            <button onClick={(e) => { e.stopPropagation(); handleNavigateImage('next'); }} className="pointer-events-auto p-4 bg-black/50 hover:bg-black/70 text-white rounded-full transition-all active:scale-95 backdrop-blur-md border border-white/10"><ChevronRight size={32} /></button>
                        </div>
                    </div>

                    {/* Bottom Controls Panel */}
                    <div className="bg-slate-900/90 backdrop-blur-xl border-t border-white/10 pb-[env(safe-area-inset-bottom)] animate-in slide-in-from-bottom duration-300 z-20 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
                        <div className="p-6 space-y-6">

                            {/* Row 1: Background Toggle */}
                            <div className="flex justify-center">
                                <div className="bg-black/40 p-1 rounded-full flex border border-white/10">
                                    <button
                                        onClick={() => setOptimizeBgColor('white')}
                                        className={`flex items-center gap-2 px-6 py-2 rounded-full text-xs font-bold transition-all ${optimizeBgColor === 'white' ? 'bg-white text-black shadow-lg' : 'text-slate-400 hover:text-white'}`}
                                    >
                                        <div className={`w-3 h-3 rounded-full ${optimizeBgColor === 'white' ? 'bg-black' : 'bg-white'}`} /> White BG
                                    </button>
                                    <button
                                        onClick={() => setOptimizeBgColor('black')}
                                        className={`flex items-center gap-2 px-6 py-2 rounded-full text-xs font-bold transition-all ${optimizeBgColor === 'black' ? 'bg-slate-800 text-white shadow-lg border border-slate-700' : 'text-slate-400 hover:text-white'}`}
                                    >
                                        <div className={`w-3 h-3 rounded-full ${optimizeBgColor === 'black' ? 'bg-white' : 'bg-black border border-white/30'}`} /> Black BG
                                    </button>
                                </div>
                            </div>

                            {/* Row 2: Action Buttons */}
                            <div className="grid grid-cols-3 gap-3">
                                <button
                                    onClick={() => handleOptimizeImage(viewingImageIndex, editingItem.additionalImages ? (viewingImageIndex === 0 ? editingItem.imageUrl : editingItem.additionalImages[viewingImageIndex - 1]) : editingItem.imageUrl)}
                                    disabled={isOptimizingImage}
                                    className="flex flex-col items-center justify-center gap-2 p-3 bg-white text-black rounded-xl font-bold hover:bg-gray-200 disabled:opacity-50 active:scale-95 transition-all shadow-lg"
                                >
                                    <Wand2 size={24} />
                                    <span className="text-xs">Optimize</span>
                                </button>

                                <button
                                    onClick={() => setIsCropOpen(true)}
                                    className="flex flex-col items-center justify-center gap-2 p-3 bg-slate-800 text-white border border-slate-700 rounded-xl font-bold hover:bg-slate-700 active:scale-95 transition-all"
                                >
                                    <ScanLine size={24} />
                                    <span className="text-xs">Crop</span>
                                </button>

                                <button
                                    onClick={async () => {
                                        const imgUrl = viewingImageIndex === 0 ? editingItem.imageUrl : (editingItem.additionalImages?.[viewingImageIndex! - 1] || '');
                                        if (!imgUrl) return;

                                        try {
                                            const img = new Image();
                                            img.crossOrigin = "anonymous";
                                            img.src = imgUrl;
                                            await new Promise((r, j) => { img.onload = r; img.onerror = j; });

                                            const canvas = document.createElement('canvas');
                                            canvas.width = img.height;
                                            canvas.height = img.width;
                                            const ctx = canvas.getContext('2d');
                                            if (ctx) {
                                                ctx.translate(canvas.width / 2, canvas.height / 2);
                                                ctx.rotate(90 * Math.PI / 180);
                                                ctx.drawImage(img, -img.width / 2, -img.height / 2);
                                                const rotated = canvas.toDataURL('image/jpeg', 0.8);

                                                if (viewingImageIndex === 0) {
                                                    setEditingItem({ ...editingItem, imageUrl: rotated });
                                                } else {
                                                    const newImages = [...(editingItem.additionalImages || [])];
                                                    newImages[viewingImageIndex! - 1] = rotated;
                                                    setEditingItem({ ...editingItem, additionalImages: newImages });
                                                }
                                            }
                                        } catch (e) {
                                            console.error("Rotation failed", e);
                                            alert("Cannot rotate this image. Try re-uploading.");
                                        }
                                    }}
                                    className="flex flex-col items-center justify-center gap-2 p-3 bg-slate-800 text-white border border-slate-700 rounded-xl font-bold hover:bg-slate-700 active:scale-95 transition-all"
                                >
                                    <RefreshCw size={24} />
                                    <span className="text-xs">Rotate</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {isCropOpen && editingItem && viewingImageIndex !== null && (
                <CropModal
                    isOpen={isCropOpen}
                    image={viewingImageIndex === 0 ? editingItem.imageUrl : (editingItem.additionalImages?.[viewingImageIndex - 1] || '')}
                    onClose={() => setIsCropOpen(false)}
                    onSave={async (cropped) => {
                        // Optimistically update
                        const publicUrl = await uploadScanImage(user?.id || 'anon', cropped);
                        const finalUrl = publicUrl || cropped;

                        if (viewingImageIndex === 0) {
                            setEditingItem({ ...editingItem, imageUrl: finalUrl });
                        } else {
                            const newImages = [...(editingItem.additionalImages || [])];
                            newImages[viewingImageIndex - 1] = finalUrl;
                            setEditingItem({ ...editingItem, additionalImages: newImages });
                        }
                    }}
                />
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
                        <div className="p-4 border-t border-slate-800 bg-slate-900 flex gap-3">
                            {unitForm.id && (
                                <button onClick={async () => {
                                    if (confirm("Are you sure you want to delete this source? Items in this source will be hidden from the folder view.")) {
                                        try {
                                            await deleteStorageUnit(unitForm.id!);
                                            setIsUnitModalOpen(false);
                                            refreshData();
                                        } catch (e: any) {
                                            alert(`Failed to delete source: ${e.message}`);
                                        }
                                    }
                                }} className="px-4 py-3 bg-red-500/10 text-red-500 hover:bg-red-500/20 font-bold rounded-xl transition-colors border border-red-500/50"><Trash2 size={20} /></button>
                            )}
                            <button onClick={handleSaveUnit} className="flex-1 py-3 bg-neon-green text-slate-950 font-bold rounded-xl hover:bg-neon-green/90 transition-all shadow-lg shadow-neon-green/20">SAVE SOURCE</button>
                        </div>
                    </div>
                </div>
            )}
            {/* ... (keep editingItem && !viewingImageIndex && !isPreviewOpen block) */}
            {/* Edit Draft Modal - Only show if NOT viewing full image and NOT in preview */}
            {editingItem && viewingImageIndex === null && !isPreviewOpen && (
                <div className="fixed inset-0 z-[9999] animate-in fade-in">
                    {/* Backdrop */}
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setEditingItem(null)} />

                    {/* Modal Content - Full Screen Mobile, Centered Desktop */}
                    <div className="absolute inset-0 w-full h-full bg-white dark:bg-slate-900 flex flex-col overflow-hidden md:relative md:inset-auto md:m-auto md:w-[95vw] md:h-[90vh] md:max-w-4xl md:rounded-2xl md:shadow-2xl md:border md:border-gray-200 md:dark:border-slate-800 md:top-1/2 md:-translate-y-1/2">
                        <div className="p-4 pt-[calc(env(safe-area-inset-top)+1rem)] md:p-4 border-b border-gray-200 dark:border-slate-800 flex justify-between items-center bg-gray-50 dark:bg-slate-900">
                            <h3 className="font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                                <Edit2 className="text-emerald-500 dark:text-neon-green" size={18} />
                                Edit Draft <span className="text-[9px] bg-slate-200 dark:bg-slate-700 px-1 rounded text-slate-500">v1.2</span>
                            </h3>
                            <div className="flex gap-2">
                                <button onClick={(e) => {
                                    if (window.confirm("Delete this draft?")) {
                                        handleDeleteItem(e, editingItem.id);
                                        setEditingItem(null);
                                    }
                                }} className="p-1 text-red-500 hover:bg-red-50 rounded"><Trash2 size={20} /></button>
                                <button onClick={() => setEditingItem(null)}><X size={24} className="text-slate-400 hover:text-slate-600 dark:hover:text-white" /></button>
                            </div>
                        </div>
                        {/* Header/Footer Separator Removed - Consolidated layout */}

                        {/* SCROLLABLE CONTENT BODY (Research + Form) */}
                        <div className="flex-1 overflow-y-auto overflow-x-hidden bg-white dark:bg-slate-900 pb-64">
                            {/* RESEARCH PANEL */}
                            <div className="px-6 pt-4 pb-0">
                                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/30 rounded-xl p-4">
                                    <h4 className="text-sm font-bold text-blue-800 dark:text-blue-300 mb-3 flex items-center gap-2">
                                        <Globe size={16} /> Research & Comps
                                        {isResearching && <span className="text-xs font-normal opacity-70 animate-pulse">(Searching...)</span>}
                                    </h4>

                                    {/* Search Input */}
                                    <div className="flex gap-2 mb-3">
                                        <input
                                            type="text"
                                            value={editedTitle}
                                            onChange={(e) => setEditedTitle(e.target.value)}
                                            className="flex-1 bg-white dark:bg-slate-800 border border-blue-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                                            placeholder="Search term..."
                                        />
                                        <button
                                            onClick={async () => {
                                                setIsResearching(true);
                                                try {
                                                    const term = editedTitle || editingItem?.title || "";
                                                    if (!term) return;
                                                    const conditionParam = itemCondition === 'NEW' ? 'NEW' : 'USED';
                                                    const data = await searchEbayComps(term, 'ACTIVE', conditionParam);
                                                    setVisualSearchResults(data.comps || []);
                                                } catch (e) {
                                                    console.error(e);
                                                } finally {
                                                    setIsResearching(false);
                                                }
                                            }}
                                            className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-blue-500 transition-colors"
                                        >
                                            Search
                                        </button>
                                    </div>

                                    {/* Research Links - Use editedTitle OR first visual match OR "item" */}
                                    {/* Research Links - Use editedTitle OR editingItem.title OR AI Result OR "item" */}
                                    <div className="flex gap-2 overflow-x-auto pb-3 no-scrollbar mb-2">
                                        {(() => {
                                            const searchTitle = (editedTitle || editingItem?.title || scoutResult?.itemTitle || "").toLowerCase().includes("scanning") ? "" : (editedTitle || editingItem?.title || scoutResult?.itemTitle || visualSearchResults[0]?.title || "item");
                                            return (
                                                <>
                                                    <button onClick={() => handleOpenResearch('EBAY_SOLD', searchTitle)} className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-800 rounded-lg border border-blue-200 dark:border-slate-700 text-xs font-bold text-emerald-600 dark:text-neon-green shrink-0 hover:border-emerald-500 shadow-sm"><ShoppingCart size={14} /> eBay Sold</button>
                                                    <button onClick={() => handleOpenResearch('EBAY_ACTIVE', searchTitle)} className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-800 rounded-lg border border-blue-200 dark:border-slate-700 text-xs font-bold text-blue-500 shrink-0 hover:border-blue-500 shadow-sm"><Tag size={14} /> eBay Active</button>
                                                    <button onClick={() => handleOpenResearch('GOOGLE', searchTitle)} className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-800 rounded-lg border border-blue-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 shrink-0 hover:border-blue-500 shadow-sm"><SearchIcon size={14} /> Google</button>
                                                    <button onClick={() => handleOpenResearch('FB', searchTitle)} className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-800 rounded-lg border border-blue-200 dark:border-slate-700 text-xs font-bold text-blue-600 dark:text-blue-400 shrink-0 hover:border-blue-500 shadow-sm"><Facebook size={14} /> FB Market</button>
                                                </>
                                            );
                                        })()}
                                    </div>

                                    {isResearching ? (
                                        <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
                                            {[1, 2, 3].map(i => (
                                                <div key={i} className="min-w-[200px] h-[80px] bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 shadow-sm animate-pulse" />
                                            ))}
                                        </div>
                                    ) : visualSearchResults.length > 0 ? (
                                        <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
                                            {visualSearchResults.map(match => (
                                                <div key={match.id} className="min-w-[200px] bg-white dark:bg-slate-800 p-3 rounded-lg border border-gray-200 dark:border-slate-700 shadow-sm flex flex-col gap-2">
                                                    <div className="flex gap-2">
                                                        <div className="w-12 h-12 bg-gray-100 rounded shrink-0 overflow-hidden">
                                                            {match.image && <img src={match.image} className="w-full h-full object-cover" />}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="text-[10px] font-bold line-clamp-2 leading-tight mb-1">{match.title}</div>
                                                            <div className="font-black text-blue-600">${match.price?.toFixed(2)}</div>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => handleSellSimilar(match)}
                                                        className="w-full py-1.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-[10px] font-bold rounded hover:bg-blue-200 dark:hover:bg-blue-900/60 transition-colors"
                                                    >
                                                        Import Data
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : scoutResult?.listingSources && scoutResult.listingSources.length > 0 ? (
                                        <div className="space-y-2">
                                            <div className="text-xs font-bold text-slate-400 flex items-center gap-1"><SearchIcon size={12} /> Google Matches (AI Found)</div>
                                            <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
                                                {(scoutResult?.listingSources || []).map((source, i) => (
                                                    <a key={i} href={source.uri} target="_blank" rel="noreferrer" className="min-w-[160px] max-w-[160px] bg-white dark:bg-slate-800 p-3 rounded-lg border border-gray-200 dark:border-slate-700 shadow-sm flex flex-col gap-2 hover:border-blue-400 transition-colors group">
                                                        <div className="flex-1 min-w-0">
                                                            <div className="text-[10px] font-bold line-clamp-3 leading-tight text-slate-700 dark:text-slate-300 group-hover:text-blue-500 mb-1">{source.title}</div>
                                                        </div>
                                                        <div className="w-full py-1.5 bg-slate-50 dark:bg-slate-900 text-slate-500 text-[10px] font-bold rounded flex items-center justify-center gap-1">
                                                            Visit <ExternalLink size={10} />
                                                        </div>
                                                    </a>
                                                ))}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-xs text-slate-500 italic">No matches found. Try entering a title manually to search again.</div>
                                    )}
                                </div>
                            </div>

                            {/* FORM CONTENT */}
                            <div className="p-6 space-y-6">
                                <div className="grid grid-cols-4 gap-2">
                                    <div className="aspect-square bg-black rounded-lg overflow-hidden relative group border-2 border-emerald-500 dark:border-neon-green shadow-sm cursor-pointer hover:opacity-90 transition-opacity" onClick={() => setViewingImageIndex(0)}>
                                        <img src={editingItem.imageUrl} className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                            <button onClick={(e) => { e.stopPropagation(); setViewingImageIndex(0); }} className="p-1.5 bg-white/20 backdrop-blur rounded-full hover:bg-white/40 text-white" title="View"><Eye size={14} /></button>
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

                                    <button onClick={() => { setCameraMode('EDIT'); setStatus(ScoutStatus.SCANNING); }} className="aspect-square bg-gray-50 dark:bg-slate-800 rounded-lg flex flex-col items-center justify-center text-slate-400 hover:text-emerald-500 border-2 border-dashed border-gray-300 dark:border-slate-700 transition-colors"><Camera size={18} /><span className="text-[8px] font-bold uppercase mt-1">Camera</span></button>
                                    <button onClick={() => additionalImageInputRef.current?.click()} className="aspect-square bg-gray-50 dark:bg-slate-800 rounded-lg flex flex-col items-center justify-center text-slate-400 hover:text-emerald-500 border-2 border-dashed border-gray-300 dark:border-slate-700 transition-colors"><Upload size={18} /><span className="text-[8px] font-bold uppercase mt-1">File</span></button>
                                </div>

                                {/* --- EDIT ITEM SOURCE --- */}
                                <div className="space-y-1">
                                    <label className="text-xs font-mono uppercase text-slate-500">Source / Location</label>
                                    <div className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2">
                                        <Warehouse size={16} className="text-slate-400" />
                                        <select
                                            value={editingItem.storageUnitId || ''}
                                            onChange={(e) => setEditingItem({ ...editingItem, storageUnitId: e.target.value })}
                                            className="flex-1 w-full min-w-0 bg-transparent text-sm font-bold text-slate-900 dark:text-white focus:outline-none"
                                        >
                                            <option value="" disabled>Select Source</option>
                                            {(storageUnits || []).map(unit => (
                                                <option key={unit.id} value={unit.storeNumber}>
                                                    {unit.storeNumber} {unit.address ? `(${unit.address})` : ''}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                            </div>
                            <input ref={editImageInputRef} type="file" accept="image/*" className="hidden" onChange={handleEditImageUpload} />
                            <input ref={additionalImageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleAdditionalImageUpload} />

                            <div className="space-y-4">
                                <div>
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="text-xs font-mono uppercase text-slate-500">Title</label>
                                        <div className="flex gap-2">
                                            <button onClick={() => {
                                                if (canAccess('AI_GENERATOR')) handleAnalyzeDraft();
                                                else setIsPricingOpen(true);
                                            }} className="text-xs flex items-center gap-1 text-slate-950 font-bold hover:bg-neon-green/90 bg-neon-green px-2 py-0.5 rounded transition-all shadow-sm">
                                                {!canAccess('AI_GENERATOR') && <Lock size={10} />} <Wand2 size={12} /> Analyze Image
                                            </button>
                                            <button onClick={handleOptimizeTitle} className="text-xs flex items-center gap-1 text-blue-500 font-bold hover:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded transition-all border border-blue-100 dark:border-blue-800"><Wand2 size={12} /> Optimize Text</button>
                                            <button onClick={() => toggleRecording('title')} className={`text-xs ${isRecording === 'title' ? 'text-red-500 animate-pulse' : ''}`}><Mic size={14} /></button>
                                        </div>
                                    </div>
                                    <textarea value={editingItem.title} onChange={e => setEditingItem({ ...editingItem, title: e.target.value })} className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-lg p-3 text-sm text-slate-900 dark:text-white h-24 resize-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all" />
                                </div>

                                {/* --- CONDITION TOGGLE --- */}
                                <div>
                                    <label className="text-xs font-mono uppercase text-slate-500 mb-1 block">Condition</label>
                                    <div className="flex bg-gray-100 dark:bg-slate-800 p-1 rounded-lg">
                                        <button
                                            onClick={() => {
                                                const newCond = 'NEW';
                                                setItemCondition(newCond);
                                                setEditingItem({ ...editingItem, conditionNotes: 'NEW' });
                                            }}
                                            className={`flex-1 py-2 rounded-md text-xs font-bold transition-all ${itemCondition === 'NEW' ? 'bg-white dark:bg-slate-600 shadow text-emerald-600 dark:text-neon-green' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}
                                        >
                                            NEW
                                        </button>
                                        <button
                                            onClick={() => {
                                                const newCond = 'USED';
                                                setItemCondition(newCond);
                                                setEditingItem({ ...editingItem, conditionNotes: 'USED' });
                                            }}
                                            className={`flex-1 py-2 rounded-md text-xs font-bold transition-all ${itemCondition === 'USED' ? 'bg-white dark:bg-slate-600 shadow text-blue-600 dark:text-blue-400' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}
                                        >
                                            USED
                                        </button>
                                    </div>
                                </div>

                                {/* --- ITEM SPECIFICS EDITOR --- */}
                                <div>
                                    <div className="flex justify-between items-center mb-2">
                                        <label className="text-xs font-mono uppercase text-slate-500">Item Specifics</label>
                                        <div className="flex gap-3">
                                            <button onClick={() => {
                                                if (canAccess('AI_GENERATOR')) handleAnalyzeDraft();
                                                else setIsPricingOpen(true);
                                            }} className="text-[10px] text-neon-green hover:underline font-bold flex items-center gap-1">
                                                {!canAccess('AI_GENERATOR') && <Lock size={8} />} <Wand2 size={10} /> Auto-Fill (AI)
                                            </button>
                                            <button onClick={handleAddSpecific} className="text-[10px] text-blue-500 hover:underline font-bold flex items-center gap-1">+ Add</button>
                                        </div>
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

                                    {/* Templates in Modal */}
                                    {/* Templates in Modal */}
                                    <div className="flex gap-2 overflow-x-auto no-scrollbar w-full pb-2 mt-1 items-center">
                                        {/* Manage Toggle */}
                                        <button
                                            onClick={() => setIsManagingTemplates(!isManagingTemplates)}
                                            className={`text-[10px] px-2 py-1.5 rounded-lg border transition-colors whitespace-nowrap font-bold flex items-center gap-1 ${isManagingTemplates ? 'bg-slate-800 text-white border-slate-900' : 'bg-white dark:bg-slate-800 border-gray-300 dark:border-slate-700 text-slate-500'}`}
                                        >
                                            {isManagingTemplates ? <Check size={12} /> : <Settings size={12} />}
                                        </button>

                                        {/* Add Button (Only in Manage Mode) */}
                                        {isManagingTemplates && (
                                            <button
                                                onClick={() => {
                                                    const txt = prompt("Enter new template text:");
                                                    if (txt) {
                                                        const newT = [...customTemplates, txt];
                                                        setCustomTemplates(newT);
                                                        localStorage.setItem('sts_custom_templates', JSON.stringify(newT));
                                                    }
                                                }}
                                                className="text-[10px] bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors whitespace-nowrap font-bold flex items-center gap-1"
                                            >
                                                <Plus size={12} /> Add New
                                            </button>
                                        )}

                                        {!isManagingTemplates && (
                                            <>
                                                <button onClick={() => {
                                                    const currentContent = editingItem.generatedListing?.content || "";
                                                    const newContent = currentContent + (currentContent ? "\n\n" : "") + "• Tested and working perfectly.\n• Includes original accessories.\n• Fast shipping!";
                                                    setEditingItem({ ...editingItem, generatedListing: { platform: 'EBAY', content: newContent } });
                                                }} className="text-[10px] bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors whitespace-nowrap font-medium">Tested</button>

                                                <button onClick={() => {
                                                    const currentContent = editingItem.generatedListing?.content || "";
                                                    const newContent = currentContent + (currentContent ? "\n\n" : "") + "• Good used condition.\n• Shows minor signs of wear.\n• See photos for details.";
                                                    setEditingItem({ ...editingItem, generatedListing: { platform: 'EBAY', content: newContent } });
                                                }} className="text-[10px] bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors whitespace-nowrap font-medium">Used</button>

                                                <button onClick={() => {
                                                    const currentContent = editingItem.generatedListing?.content || "";
                                                    const newContent = currentContent + (currentContent ? "\n\n" : "") + "• For parts or repair only.\n• Does not power on.\n• No returns.";
                                                    setEditingItem({ ...editingItem, generatedListing: { platform: 'EBAY', content: newContent } });
                                                }} className="text-[10px] bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors whitespace-nowrap font-medium">Parts</button>
                                            </>
                                        )}

                                        {(customTemplates || []).map((tmpl, idx) => (
                                            <div key={idx} className="relative group">
                                                <button onClick={() => {
                                                    const currentContent = editingItem.generatedListing?.content || "";
                                                    const newContent = currentContent + (currentContent ? "\n\n" : "") + tmpl;
                                                    setEditingItem({ ...editingItem, generatedListing: { platform: 'EBAY', content: newContent } });
                                                }} className="text-[10px] bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-3 py-1.5 rounded-lg border border-blue-100 dark:border-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors whitespace-nowrap truncate max-w-[100px]" title={tmpl}>{tmpl.substring(0, 10)}...</button>

                                                {isManagingTemplates && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (window.confirm("Delete template?")) {
                                                                const newT = customTemplates.filter((_, i) => i !== idx);
                                                                setCustomTemplates(newT);
                                                                localStorage.setItem('sts_custom_templates', JSON.stringify(newT));
                                                            }
                                                        }}
                                                        className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 shadow-sm hover:scale-110 transition-transform"
                                                    >
                                                        <X size={8} />
                                                    </button>
                                                )}
                                            </div>
                                        ))}

                                        {!isManagingTemplates && (
                                            <button onClick={() => {
                                                if (window.confirm("Clear description?")) {
                                                    setEditingItem({ ...editingItem, generatedListing: { platform: 'EBAY', content: "" } });
                                                }
                                            }} className="text-[10px] bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-3 py-1.5 rounded-lg border border-red-100 dark:border-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors whitespace-nowrap font-bold flex items-center gap-1"><Trash2 size={12} /> Clear</button>
                                        )}
                                    </div>

                                    <textarea value={editingItem.generatedListing?.content || ''} onChange={e => setEditingItem({ ...editingItem, generatedListing: { platform: 'EBAY', content: e.target.value } })} className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-lg p-3 text-sm h-32 resize-none focus:border-emerald-500 outline-none transition-all mt-1" placeholder="Item description..." />
                                    <div className="flex justify-end mt-1"><button onClick={() => handleGenerateListing('EBAY')} className="text-[10px] text-blue-500 hover:underline flex items-center gap-1"><Wand2 size={10} /> Auto-Write Description</button></div>
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
                                        <div className="flex items-center gap-2">
                                            <CreditCard size={16} className="text-blue-500" />
                                            <h4 className="text-xs font-bold font-mono uppercase text-slate-600 dark:text-slate-300">Business Policies</h4>
                                            <span className="text-[8px] bg-blue-500/10 text-blue-500 px-1 rounded border border-blue-500/20">V3-SAFE</span>
                                        </div>
                                        {!ebayConnected && <span className="text-[10px] text-red-500 font-bold">Connect eBay first</span>}
                                    </div>
                                    {ebayConnected ? (
                                        <div className="space-y-3">
                                            <div>
                                                <label className="text-[10px] text-slate-500 uppercase mb-1 block flex items-center gap-1"><Truck size={10} /> Shipping Policy</label>
                                                <select value={editingItem.ebayShippingPolicyId || ""} onChange={(e) => { const val = e.target.value; setEditingItem({ ...editingItem, ebayShippingPolicyId: val }); if (val) localStorage.setItem('sts_default_shipping_policy', val); }} className="w-full bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded p-2 text-xs text-slate-900 dark:text-white focus:border-emerald-500 outline-none">
                                                    <option value="">Select Shipping Policy...</option>
                                                    {(Array.isArray(ebayPolicies?.shippingPolicies) ? ebayPolicies.shippingPolicies : []).map((p: any) => (<option key={p.fulfillmentPolicyId} value={p.fulfillmentPolicyId}>{p.name} - {p.description || 'No desc'}</option>))}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="text-[10px] text-slate-500 uppercase mb-1 block flex items-center gap-1"><ShieldCheck size={10} /> Return Policy</label>
                                                <select value={editingItem.ebayReturnPolicyId || ""} onChange={(e) => { const val = e.target.value; setEditingItem({ ...editingItem, ebayReturnPolicyId: val }); if (val) localStorage.setItem('sts_default_return_policy', val); }} className="w-full bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded p-2 text-xs text-slate-900 dark:text-white focus:border-emerald-500 outline-none">
                                                    <option value="">Select Return Policy...</option>
                                                    {(Array.isArray(ebayPolicies?.returnPolicies) ? ebayPolicies.returnPolicies : []).map((p: any) => (<option key={p.returnPolicyId} value={p.returnPolicyId}>{p.name}</option>))}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="text-[10px] text-slate-500 uppercase mb-1 block flex items-center gap-1"><CreditCard size={10} /> Payment Policy</label>
                                                <select value={editingItem.ebayPaymentPolicyId || ""} onChange={(e) => { const val = e.target.value; setEditingItem({ ...editingItem, ebayPaymentPolicyId: val }); if (val) localStorage.setItem('sts_default_payment_policy', val); }} className="w-full bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded p-2 text-xs text-slate-900 dark:text-white focus:border-emerald-500 outline-none">
                                                    <option value="">Select Payment Policy...</option>
                                                    {(Array.isArray(ebayPolicies?.paymentPolicies) ? ebayPolicies.paymentPolicies : []).map((p: any) => (<option key={p.paymentPolicyId} value={p.paymentPolicyId}>{p.name}</option>))}
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


                    <div className="absolute bottom-0 left-0 right-0 w-full p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] border-t border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-900 flex flex-col gap-3 z-50 shadow-xl">
                        <div className="flex gap-3">
                            <button onClick={() => setEditingItem(null)} className="px-4 py-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-bold rounded-xl uppercase text-xs hover:bg-gray-50 dark:hover:bg-slate-700">Close</button>
                            <button onClick={() => setIsPreviewOpen(true)} className="px-4 py-3 bg-gray-200 dark:bg-slate-800 text-slate-700 dark:text-white border border-gray-300 dark:border-slate-600 font-bold rounded-xl uppercase text-xs hover:bg-gray-300 dark:hover:bg-slate-700 flex items-center gap-2"><Eye size={16} /> Preview</button>
                            <button onClick={() => handleUpdateInventoryItem(
                                editingItem.calculation,
                                editingItem.costCode,
                                editingItem.calculation.itemCost,
                                editingItem.itemSpecifics?.Weight || "",
                                editingItem.dimensions
                            )} className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-xl uppercase text-xs shadow-lg hover:bg-emerald-500 flex items-center justify-center gap-2"><Save size={16} /> Save</button>
                        </div>
                        <button
                            onClick={() => handlePushToEbay(editingItem)}
                            className="w-full py-4 bg-blue-600 text-white font-black rounded-xl uppercase text-sm shadow-lg shadow-blue-600/20 hover:bg-blue-500 flex items-center justify-center gap-2 transition-all active:scale-95"
                        >
                            <Globe size={18} /> List Item Now
                        </button>
                    </div>
                </div>

            )
            }
            {itemToDelete && (<div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"><div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl shadow-black/50 scale-100 animate-in zoom-in-95 duration-200"><div className="flex flex-col items-center text-center gap-4"><div className="w-16 h-16 rounded-full bg-neon-red/10 flex items-center justify-center mb-2"><Trash2 size={32} className="text-neon-red" /></div><div><h3 className="text-xl font-bold text-white mb-1">Delete Item?</h3><p className="text-slate-400 text-sm leading-relaxed">Are you sure you want to delete this item? This action cannot be undone.</p></div><div className="grid grid-cols-2 gap-3 w-full mt-4"><button onClick={() => setItemToDelete(null)} className="py-3 px-4 rounded-xl font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors">CANCEL</button><button onClick={confirmDelete} className="py-3 px-4 rounded-xl font-bold text-white bg-neon-red hover:bg-red-600 shadow-lg shadow-neon-red/20 transition-all active:scale-95">DELETE</button></div></div></div></div>)}

            <main className="flex-1 relative overflow-hidden flex flex-col">
                {status === ScoutStatus.SCANNING ? (<Scanner onCapture={handleImageCaptured} onClose={() => { setStatus(ScoutStatus.IDLE); setBulkSessionCount(0); }} bulkSessionCount={bulkSessionCount} feedbackMessage={loadingMessage} singleCapture={cameraMode !== 'EDIT'} />) : view === 'command' ? (renderCommandView()) : view === 'scout' ? (status === ScoutStatus.IDLE ? renderScoutView() : renderAnalysis()) : view === 'inventory' ? (renderInventoryView()) : view === 'stats' ? (<StatsView inventory={inventory} onSettings={() => setIsSettingsOpen(true)} />) : null}
            </main>

            {status !== ScoutStatus.SCANNING && renderBottomNav()}
            {showOnboarding && <OnboardingTour onComplete={handleCompleteOnboarding} />}

            {/* Loading Overlay */}
            {
                loadingMessage && (
                    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
                        <div className="bg-slate-900 border border-slate-700 rounded-2xl p-8 flex flex-col items-center gap-4 shadow-2xl max-w-xs w-full text-center">
                            <div className="relative">
                                <div className="w-16 h-16 border-4 border-slate-700 border-t-neon-green rounded-full animate-spin"></div>
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <Zap size={24} className="text-neon-green animate-pulse" />
                                </div>
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-white mb-1">AI Working...</h3>
                                <p className="text-slate-400 text-sm">{loadingMessage}</p>
                            </div>
                        </div>
                    </div>
                )
            }
            {/* Hidden File Inputs */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
            />
        </div >
    );
};





export default App;