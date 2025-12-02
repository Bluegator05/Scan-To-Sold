
import { supabase } from '../lib/supabaseClient';
import { InventoryItem, StorageUnit, ScanLog, Feedback } from '../types';

export const checkDbConnection = async (): Promise<boolean> => {
  const { error } = await supabase.from('profiles').select('count', { count: 'exact', head: true });
  return !error;
};

export const logTraffic = async (page: string) => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    await supabase.from('traffic_logs').insert({
        page,
        user_id: session?.user?.id,
        user_agent: navigator.userAgent,
        referrer: document.referrer
    });
  } catch (e) {
    console.error("Traffic Log Error", e);
  }
};

export const submitFeedback = async (feedback: Feedback): Promise<boolean> => {
  const { error } = await supabase.from('feedback').insert({
      user_id: feedback.userId,
      message: feedback.message,
      type: feedback.type,
      created_at: feedback.dateCreated
  });
  return !error;
};

export const logScanEvent = async (scan: Partial<ScanLog>, userId: string) => {
    try {
        await supabase.from('scan_history').insert({
            user_id: userId,
            image_url: scan.imageUrl,
            title: scan.title,
            barcode: scan.barcode,
            estimated_value: scan.estimatedValue,
            result_status: scan.resultStatus,
            created_at: scan.dateScanned || new Date().toISOString()
        });
    } catch (e) { console.error(e); }
};

export const fetchScanHistory = async (userId: string): Promise<ScanLog[]> => {
    const { data, error } = await supabase
        .from('scan_history')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);
    
    if (error) return [];
    return data.map((d: any) => ({
        id: d.id,
        dateScanned: d.created_at,
        imageUrl: d.image_url,
        title: d.title,
        barcode: d.barcode,
        estimatedValue: d.estimated_value,
        resultStatus: d.result_status
    }));
};

export const fetchStorageUnits = async (): Promise<StorageUnit[]> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
        .from('storage_units')
        .select('*')
        .eq('user_id', user.id);
    
    if (error) {
        console.error("Error fetching units:", error);
        return [];
    }

    return data.map((u: any) => ({
        id: u.id,
        storeNumber: u.name || u.store_number || 'Unknown',
        address: u.location,
        cost: u.monthly_cost,
        imageUrl: u.image_url
    }));
};

export const addStorageUnit = async (unit: StorageUnit, userId: string) => {
    const { error } = await supabase.from('storage_units').insert({
        user_id: userId,
        name: unit.storeNumber,
        location: unit.address,
        monthly_cost: unit.cost,
        image_url: unit.imageUrl
    });
    if (error) throw error;
};

export const updateStorageUnit = async (unit: StorageUnit) => {
    const { error } = await supabase.from('storage_units').update({
        name: unit.storeNumber,
        location: unit.address,
        monthly_cost: unit.cost,
        image_url: unit.imageUrl
    }).eq('id', unit.id);
    if (error) throw error;
};

export const deleteInventoryItem = async (itemId: string) => {
    if (itemId.startsWith('ebay-')) {
        return;
    }
    const { error } = await supabase.from('inventory_items').delete().eq('id', itemId);
    if (error) throw error;
};

export const batchUpdateUnitItemCosts = async (unitId: string, newCost: number) => {
    const { data: items } = await supabase.from('inventory_items').select('*').eq('storage_unit_id', unitId);
    if (!items) return;

    for (const item of items) {
        const net = item.sold_price - item.platform_fees - item.shipping_cost - newCost;
        await supabase.from('inventory_items').update({
            item_cost: newCost,
            net_profit: net,
            is_profitable: net > 0
        }).eq('id', item.id);
    }
};

// Helper to map DB response to InventoryItem
const mapDbItemToType = (data: any): InventoryItem => ({
    id: data.id,
    sku: data.sku,
    title: data.title,
    dateScanned: data.date_scanned,
    storageUnitId: data.storage_unit_id,
    costCode: data.cost_code,
    calculation: {
      soldPrice: Number(data.sold_price),
      shippingCost: Number(data.shipping_cost),
      itemCost: Number(data.item_cost),
      platformFees: Number(data.platform_fees),
      netProfit: Number(data.net_profit),
      isProfitable: data.is_profitable
    },
    imageUrl: data.image_url,
    additionalImages: data.additional_images || [],
    status: data.status,
    binLocation: data.bin_location,
    conditionNotes: data.condition_notes,
    itemSpecifics: data.item_specifics || {},
    postalCode: data.postal_code,
    generatedListing: (data.generated_listing_content && data.generated_listing_platform) ? {
      content: data.generated_listing_content,
      platform: data.generated_listing_platform
    } : undefined,

    ebayListingId: data.ebay_listing_id,
    ebayStatus: data.ebay_status?.toUpperCase(),
    ebayUrl: data.ebay_url,
    ebayViews: data.ebay_views,
    ebayWatchers: data.ebay_watchers,
    ebayPrice: data.ebay_price,
    quantity: data.quantity !== undefined ? data.quantity : 1,

    ebayShippingPolicyId: data.ebay_shipping_policy_id,
    ebayReturnPolicyId: data.ebay_return_policy_id,
    ebayPaymentPolicyId: data.ebay_payment_policy_id
});

export const addInventoryItem = async (item: InventoryItem, userId: string): Promise<InventoryItem | null> => {
  const payload: any = {
      user_id: userId,
      sku: item.sku,
      title: item.title,
      date_scanned: item.dateScanned,
      storage_unit_id: item.storageUnitId,
      cost_code: item.costCode,
      sold_price: item.calculation.soldPrice,
      shipping_cost: item.calculation.shippingCost,
      item_cost: item.calculation.itemCost,
      platform_fees: item.calculation.platformFees,
      net_profit: item.calculation.netProfit,
      is_profitable: item.calculation.isProfitable,
      
      image_url: item.imageUrl,
      additional_images: item.additionalImages || [], 
      status: item.status,
      bin_location: item.binLocation,
      condition_notes: item.conditionNotes,
      item_specifics: item.itemSpecifics || {},
      postal_code: item.postalCode,
      
      generated_listing_content: item.generatedListing?.content,
      generated_listing_platform: item.generatedListing?.platform,

      // New Policy IDs
      ebay_shipping_policy_id: item.ebayShippingPolicyId,
      ebay_return_policy_id: item.ebayReturnPolicyId,
      ebay_payment_policy_id: item.ebayPaymentPolicyId
  };

  if (item.ebayListingId) payload.ebay_listing_id = item.ebayListingId;
  if (item.ebayStatus) payload.ebay_status = item.ebayStatus;
  if (item.ebayUrl) payload.ebay_url = item.ebayUrl;
  if (item.ebayViews !== undefined) payload.ebay_views = item.ebayViews;
  if (item.ebayWatchers !== undefined) payload.ebay_watchers = item.ebayWatchers;
  if (item.ebayPrice !== undefined) payload.ebay_price = item.ebayPrice;
  if (item.quantity !== undefined) payload.quantity = item.quantity;

  const { data, error } = await supabase
    .from('inventory_items')
    .insert([payload])
    .select()
    .single();

  if (error) {
    console.error("Error adding item:", error);
    throw error;
  }

  return mapDbItemToType(data);
};

export const updateInventoryItem = async (item: InventoryItem): Promise<void> => {
  const payload: any = {
      title: item.title,
      storage_unit_id: item.storageUnitId,
      
      sold_price: item.calculation.soldPrice,
      shipping_cost: item.calculation.shippingCost,
      item_cost: item.calculation.itemCost,
      platform_fees: item.calculation.platformFees,
      net_profit: item.calculation.netProfit,
      is_profitable: item.calculation.isProfitable,
      
      bin_location: item.binLocation,
      condition_notes: item.conditionNotes,
      status: item.status,
      image_url: item.imageUrl,
      additional_images: item.additionalImages || [],
      postal_code: item.postalCode,

      // Policy IDs
      ebay_shipping_policy_id: item.ebayShippingPolicyId,
      ebay_return_policy_id: item.ebayReturnPolicyId,
      ebay_payment_policy_id: item.ebayPaymentPolicyId
  };

  if (item.itemSpecifics) {
      payload.item_specifics = item.itemSpecifics;
  }

  if (item.ebayListingId) payload.ebay_listing_id = item.ebayListingId;
  if (item.ebayStatus) payload.ebay_status = item.ebayStatus;
  if (item.ebayUrl) payload.ebay_url = item.ebayUrl;
  if (item.ebayViews !== undefined) payload.ebay_views = item.ebayViews;
  if (item.ebayWatchers !== undefined) payload.ebay_watchers = item.ebayWatchers;
  if (item.ebayPrice !== undefined) payload.ebay_price = item.ebayPrice;
  if (item.quantity !== undefined) payload.quantity = item.quantity;
  if (item.generatedListing) {
      payload.generated_listing_content = item.generatedListing.content;
      payload.generated_listing_platform = item.generatedListing.platform;
  }

  const { error } = await supabase
    .from('inventory_items')
    .update(payload)
    .eq('id', item.id);

  if (error) throw error;
};

export const fetchInventory = async (): Promise<InventoryItem[]> => {
  const { data: appItems, error: appError } = await supabase
    .from('inventory_items')
    .select('*')
    .order('created_at', { ascending: false });

  if (appError) throw appError;

  const { data: ebayItems } = await supabase.from('items').select('*');

  const mappedAppItems = appItems.map(mapDbItemToType);

  if (!ebayItems || ebayItems.length === 0) return mappedAppItems;

  const appItemMap = new Map<string, InventoryItem>();
  mappedAppItems.forEach(i => appItemMap.set(i.sku, i));
  const mergedItems: InventoryItem[] = [];
  const processedSkus = new Set<string>();

  ebayItems.forEach((eItem: any) => {
    const sku = eItem.sku;
    processedSkus.add(sku);
    const existingAppItem = appItemMap.get(sku);
    const qty = eItem.quantity !== undefined ? Number(eItem.quantity) : 1;
    const rawStatus = eItem.ebay_status?.toUpperCase();
    const isSold = qty <= 0 || rawStatus === 'SOLD' || rawStatus === 'ENDED' || rawStatus === 'SOLD_ON_EBAY';
    const derivedStatus = isSold ? 'SOLD' : (rawStatus === 'ACTIVE' ? 'LISTED' : 'DRAFT');

    if (existingAppItem) {
      mergedItems.push({
        ...existingAppItem,
        ebayListingId: eItem.ebay_listing_id,
        ebayStatus: isSold ? 'SOLD' : rawStatus,
        ebayViews: eItem.ebay_views,
        ebayWatchers: eItem.ebay_watchers,
        ebayPrice: eItem.price,
        imageUrl: existingAppItem.imageUrl || eItem.image_url,
        status: derivedStatus, 
        quantity: qty,
        ebayUrl: existingAppItem.ebayUrl || eItem.ebay_url // Ensure URL is preserved
      });
    } else {
      const price = Number(eItem.price) || 0;
      const fees = (price * 0.1325) + 0.30;
      const estimatedProfit = price - fees; 
      mergedItems.push({
        id: `ebay-${eItem.id}`,
        sku: eItem.sku,
        title: eItem.name,
        dateScanned: eItem.created_at || new Date().toISOString(),
        storageUnitId: 'eBay', 
        costCode: '',
        calculation: {
          soldPrice: price,
          shippingCost: 0,
          itemCost: 0,
          platformFees: fees,
          netProfit: estimatedProfit,
          isProfitable: estimatedProfit > 0
        },
        imageUrl: eItem.image_url,
        status: derivedStatus,
        ebayListingId: eItem.ebay_listing_id,
        ebayStatus: isSold ? 'SOLD' : rawStatus,
        ebayViews: eItem.ebay_views,
        ebayWatchers: eItem.ebay_watchers,
        ebayPrice: price,
        quantity: qty,
        ebayUrl: eItem.ebay_url
      });
    }
  });

  mappedAppItems.forEach(item => {
    if (!processedSkus.has(item.sku)) {
      mergedItems.push(item);
    }
  });

  return mergedItems.sort((a, b) => new Date(b.dateScanned).getTime() - new Date(a.dateScanned).getTime());
};
