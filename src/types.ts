
export enum ScoutStatus {
  IDLE = 'IDLE',
  SCANNING = 'SCANNING',
  ANALYZING = 'ANALYZING',
  COMPLETE = 'COMPLETE',
  ERROR = 'ERROR'
}

export interface ScoutResult {
  itemTitle: string;
  searchQuery?: string; // New: Optimized shorter query for comps
  barcode?: string;
  estimatedSoldPrice: number;
  estimatedShippingCost?: number;
  estimatedWeight?: string;
  estimatedDimensions?: string; // New: L x W x H
  priceSourceUri?: string;
  confidence: number; // 0-100
  description: string;
  marketDemand?: 'HIGH' | 'MEDIUM' | 'LOW'; // New: Sell-through indicator
  condition?: 'NEW' | 'USED'; // New: Condition detected by AI
  listingSources?: {
    title: string;
    uri: string;
  }[];
  isBulkLot?: boolean;
  itemSpecifics?: ItemSpecifics; // New: Auto-detected specifics
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
  Brand?: string;
  Model?: string;
  MPN?: string;
  UPC?: string;
  Type?: string;
  CountryRegionOfManufacture?: string;
  [key: string]: string | undefined;
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
