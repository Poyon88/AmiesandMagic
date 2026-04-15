export type AuctionStatus = 'active' | 'ended_sold' | 'ended_unsold' | 'cancelled';
export type SellerType = 'player' | 'admin';
export type ItemSourceType = 'collection' | 'print' | 'admin';
export type NotificationType =
  | 'auction_outbid'
  | 'auction_won'
  | 'auction_sold'
  | 'auction_ended_unsold'
  | 'auction_cancelled';

export interface AuctionSettings {
  id: number;
  commission_rate: number;
  min_bid_increment: number;
  allowed_durations: number[];
  max_items_per_lot: number;
  is_marketplace_open: boolean;
  updated_at: string;
  updated_by: string | null;
}

export interface Auction {
  id: string;
  seller_id: string;
  seller_type: SellerType;
  status: AuctionStatus;
  starting_bid: number;
  buyout_price: number | null;
  current_bid: number | null;
  current_bidder_id: string | null;
  bid_count: number;
  commission_rate: number;
  duration_minutes: number;
  starts_at: string;
  ends_at: string;
  settled_at: string | null;
  created_at: string;
}

export interface AuctionWithDetails extends Auction {
  items: AuctionItemWithCard[];
  seller_username?: string;
  current_bidder_username?: string;
}

export interface AuctionItem {
  id: string;
  auction_id: string;
  card_id: number;
  source_type: ItemSourceType;
  source_id: number | null;
  quantity: number;
  created_at: string;
}

export interface AuctionItemWithCard extends AuctionItem {
  card: import("@/lib/game/types").Card;
}

export interface AuctionBid {
  id: string;
  auction_id: string;
  bidder_id: string;
  amount: number;
  is_buyout: boolean;
  wallet_tx_id: string | null;
  refund_tx_id: string | null;
  created_at: string;
  bidder_username?: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
}

export interface AuctionFilters {
  search?: string;
  faction?: string;
  rarity?: string;
  card_type?: string;
  min_price?: number;
  max_price?: number;
  sort?: 'ending_soon' | 'price_asc' | 'price_desc' | 'newest';
  page?: number;
  limit?: number;
}

export interface CreateAuctionPayload {
  items: {
    card_id: number;
    source_type: ItemSourceType;
    source_id?: number;
    quantity: number;
  }[];
  starting_bid: number;
  buyout_price?: number;
  duration_minutes: number;
}

export interface PlaceBidPayload {
  amount: number;
  is_buyout?: boolean;
}
