export interface ItemAnalysis {
  title: string;
  keywords: string;
  category: string;
  condition: string;
  description: string;
  estimatedValue: {
    min: number;
    max: number;
    currency: string;
  };
  features: string[];
}

export interface MarketData {
  source: string;
  price: number;
  title: string;
  link: string;
  type: 'active' | 'sold';
}

export interface MarketAnalysis {
  listings: MarketData[];
  sellThroughRate: number;
  marketStatus: 'Hot' | 'Balanced' | 'Slow';
  activeCount: number;
  soldCount: number;
}

export interface GroundingChunk {
  web?: {
    uri: string;
    title: string;
  };
}