
export enum ScoutStatus {
  IDLE = 'IDLE',
  SCANNING = 'SCANNING',
  ANALYZING = 'ANALYZING',
  RESEARCH_REVIEW = 'RESEARCH_REVIEW',
  COMPLETE = 'COMPLETE',
  ERROR = 'ERROR'
}

export interface ScoutResult {
  itemTitle: string;
  searchQuery?: string; // New: Optimized shorter query for comps
  optimizedTitle?: string; // New: SEO listing title (Max 80)
  barcode?: string;
  estimatedSoldPrice: number;
  estimatedShippingCost?: number;
  estimatedWeight?: string;
  estimatedDimensions?: string; // New: L x W x H
  dimensionReasoning?: string; // New: Reasoning for dimensions
  priceSourceUri?: string;
  confidence: number; // 0-100
  description: string;
  marketDemand?: 'HIGH' | 'MEDIUM' | 'LOW'; // New: Sell-through indicator
  // NEW: Precise Market Data for Review Screen
  marketData?: {
    sellThroughRate: number; // 0-100+
    totalSold: number;
    totalActive: number;
    activeComps?: Comp[]; // New: Full list for detailed view
    soldComps?: Comp[]; // New: Full list for detailed view
    isEstimated?: boolean;
    queryUsed?: string;
  };
  condition?: 'NEW' | 'USED'; // New: Condition detected by AI
  listingSources?: {
    title: string;
    uri: string;
  }[];
  isBulkLot?: boolean;
  itemSpecifics?: ItemSpecifics; // New: Auto-detected specifics
  tokenUsage?: {
    input: number;
    output: number;
    total: number;
  };
  extractedDetails?: string; // New: Proof of cross-image analysis
  totalImagesAnalyzed?: number; // New: Count of photos used
}

export interface Comp {
  id: string;
  title: string;
  price: number;
  shipping: number;
  total: number;
  url: string;
  gtin?: string;
  epid?: string;
  condition?: string;
  image?: string; // New field for thumbnail
  dateSold?: string; // New: Sale date (for SOLD items) or End Date
  listingDate?: string; // New: Start date
}

export interface MarketData {
  source?: string;
  price: number;
  title: string;
  link?: string;
  type: 'active' | 'sold';
}

export interface ProfitCalculation {
  soldPrice: number;
  shippingCost: number;
  itemCost: number;
  platformFees: number; // 13.25% + $0.30
  netProfit: number;
  isProfitable: boolean; // > $20
}

export interface ItemSpecifics {
  [key: string]: string;
}

export interface InventoryItem {
  id: string;
  sku: string;
  title: string;
  dateScanned: string;
  storageUnitId: string;
  costCode: string;
  calculation: ProfitCalculation;
  imageUrl?: string;
  additionalImages?: string[];
  status: 'DRAFT' | 'LISTED' | 'SOLD';

  binLocation?: string;
  conditionNotes?: string;
  itemSpecifics?: ItemSpecifics; // New field for eBay specifics
  dimensions?: string; // New: Package dimensions
  postalCode?: string; // New: Item location zip code

  generatedListing?: {
    platform: 'EBAY' | 'FACEBOOK';
    content: string;
  };

  ebayListingId?: string;
  ebayListedDate?: string; // Track when it went live
  ebayStatus?: 'ACTIVE' | 'ENDED' | 'SOLD' | 'SOLD_ON_EBAY';
  ebayUrl?: string;
  ebayViews?: number;
  ebayWatchers?: number;
  ebayPrice?: number;
  quantity?: number;

  // Policy IDs
  ebayShippingPolicyId?: string;
  ebayReturnPolicyId?: string;
  ebayPaymentPolicyId?: string;
}

export interface ScanLog {
  id: string;
  dateScanned: string;
  imageUrl?: string;
  title: string;
  barcode?: string;
  estimatedValue: number;
  resultStatus: 'SAVED' | 'DISCARDED' | 'SCANNED';
  tokenUsage?: {
    input: number;
    output: number;
    total: number;
  };
}

export type SourceType = 'STORAGE_UNIT' | 'GARAGE_SALE' | 'THRIFT_STORE' | 'RETAIL_STORE' | 'ESTATE_SALE' | 'PERSONAL' | 'OTHER';

export interface StorageUnit {
  id: string;
  storeNumber: string;
  address: string;
  cost: number;
  imageUrl?: string;
  type?: SourceType;
}

export interface UserSettings {
  defaultStorageUnit: string;
  defaultShippingEstimate: number;
}

export type SubscriptionTier = 'FREE' | 'PLUS' | 'PRO';

export interface SubscriptionStatus {
  tier: SubscriptionTier;
  scansToday: number;
  maxDailyScans: number;
  renewsAt?: string;
  stripeCustomerId?: string;
}

export interface ProxyUserProfile {
  id: string;
  email: string;
  tier: SubscriptionTier;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
}

export interface UserProfile {
  id: string;
  email: string;
  tier: SubscriptionTier;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
}

export interface Feedback {
  id?: string;
  userId: string;
  message: string;
  type: 'BUG' | 'FEATURE' | 'GENERAL';
  dateCreated: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export interface TrafficLog {
  page: string;
  user_id?: string;
  user_agent: string;
  referrer: string;
}
