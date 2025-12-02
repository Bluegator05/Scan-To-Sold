
export enum ScoutStatus {
  IDLE = 'IDLE',
  SCANNING = 'SCANNING',
  ANALYZING = 'ANALYZING',
  COMPLETE = 'COMPLETE',
  ERROR = 'ERROR'
}

export interface ScoutResult {
  itemTitle: string;
  barcode?: string;
  estimatedSoldPrice: number;
  estimatedShippingCost?: number;
  priceSourceUri?: string; // New field for the source of truth
  confidence: number; // 0-100
  description: string;
  listingSources?: {
    title: string;
    uri: string;
  }[];
  isBulkLot?: boolean; // Feature 4
}

export interface ProfitCalculation {
  soldPrice: number;
  shippingCost: number;
  itemCost: number;
  platformFees: number; // 13.25% + $0.30
  netProfit: number;
  isProfitable: boolean; // > $20
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
  status: 'DRAFT' | 'LISTED' | 'SOLD';
  // New Features
  binLocation?: string; // Feature 3
  conditionNotes?: string; // Feature 5
  generatedListing?: { // Feature 1
    platform: 'EBAY' | 'FACEBOOK';
    content: string;
  };
}

export interface StorageUnit {
  id: string;
  storeNumber: string;
  address: string;
  cost: number;
  imageUrl?: string;
}

export interface UserSettings {
  defaultStorageUnit: string;
  defaultShippingEstimate: number;
}
