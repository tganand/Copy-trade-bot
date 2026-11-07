export interface PolymarketActivityItem {
  proxyWallet: string;
  timestamp: number;
  conditionId: string;
  type: string; // "TRADE" | "REDEEM"
  size: number;
  usdcSize: number;
  transactionHash: string;
  price: number;
  asset: string;
  side: string; // "BUY" | "SELL" | ""
  outcomeIndex?: number;
  title: string;
  slug: string;
  icon?: string;
  eventSlug?: string;
  outcome: string; // "Up", "Down", "Yes", "No", etc.
  name?: string;
  pseudonym?: string;
}

export interface PolymarketPositionItem {
  proxyWallet: string;
  asset: string;
  conditionId: string;
  size: number;
  avgPrice: number;
  initialValue: number;
  grossInitialValue?: number;
  entryFeesUsdc?: number;
  currentValue: number;
  cashPnl: number;
  percentPnl: number;
  totalBought?: number;
  realizedPnl?: number;
  percentRealizedPnl?: number;
  curPrice: number;
  redeemable?: boolean;
  mergeable?: boolean;
  title: string;
  slug: string;
  icon?: string;
  eventId?: string;
  eventSlug?: string;
  outcome: string;
  outcomeIndex?: number;
  oppositeOutcome?: string;
  oppositeAsset?: string;
  endDate?: string;
  negativeRisk?: boolean;
}

export interface PaperPosition {
  id: string; // e.g. `${conditionId}_${outcome}`
  conditionId: string;
  asset: string;
  title: string;
  slug: string;
  outcome: string;
  icon?: string;
  oppositeAsset?: string;
  entryPrice: number;
  targetPrice?: number;
  shares: number;
  totalCost: number; // e.g. $5.00
  currentPrice: number;
  currentValue: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  openedAt: number;
  targetTxHash: string;
  halfSold?: boolean;
  tp30Taken?: boolean;
  tp50Taken?: boolean;
  breakEvenActive?: boolean;
  buyFeePaid?: number;
  targetSizeUsdc?: number;
  myInvestmentUsdc?: number;
  buyCount?: number;
  tp15Taken?: boolean;
  tp25Taken?: boolean;
}

export interface OrderBookLevel {
  price: number;
  size: number;
}

export interface OrderBookState {
  assetId: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  bestBid: number;
  bestAsk: number;
  lastPrice: number;
  spread: number;
  updatedAt: number;
  latencyMs?: number;
}

export interface CopyTradeRecord {
  id: string;
  targetTxHash: string;
  timestamp: number;
  side: 'BUY' | 'SELL';
  outcome: string;
  title: string;
  slug: string;
  asset: string;
  conditionId?: string;
  positionId?: string; // Grouping key for market & position lifecycle
  
  // Pricing
  targetPrice: number;
  copyPrice: number;
  exitPrice?: number;
  exitTimestamp?: number;

  // Investment & Shares
  targetSizeUsdc: number;
  targetShares?: number;
  copySizeUsdc: number; // Gross amount
  copyShares: number; // Shares traded
  sharesHeldAfterTrade?: number; // Total shares remaining/held after this trade
  remainingCostBasisUsdc?: number; // Remaining original capital invested in position

  // Sells & Capital Recovery
  capitalRecoveredUsdc?: number; // Portion of original invested capital recovered
  grossProceedsUsdc?: number; // Gross cash received from sale before fees
  netProceedsUsdc?: number; // Net cash deposited into balance (capital + profit - fees)
  realizedProfitUsdc?: number; // Net realized profit/loss after fees
  sellReason?: string; // e.g. 'TAKE_PROFIT_30%', 'TAKE_PROFIT_50%', 'TAKE_PROFIT_90%', 'STOP_LOSS_-40%', 'RESOLUTION'

  // Complete Fee Transparency
  feeUsdc?: number;
  feeRate?: number;
  feeSource?: 'market' | 'assumed';
  grossPnlUsdc?: number;
  buyFeeUsdc?: number;
  sellFeeUsdc?: number;
  netDeductionUsdc?: number; // For BUY: grossCost + fee

  // Status & Telemetry
  status: 'OPEN' | 'CLOSED' | 'PARTIAL';
  pnlUsdc?: number;
  pnlPercent?: number;
  sourceWallet?: string;
  sourceHandle?: string;
  source?: 'rtds' | 'poll';
  detectionTimestamp?: number;
  detectionDelayMs?: number;
  orderSubmissionTimestamp?: number;
  askPriceAtSubmission?: number;
  fillPrice?: number;
  fillQuantity?: number;
  slippagePercent?: number;
  fillStatus?: 'FILLED' | 'PARTIALLY_FILLED' | 'REJECTED' | 'MISSED';
  targetTradeTimestamp?: number;
  rtdsReceiptTimestamp?: number;
  parsingCompleteTimestamp?: number;
  decisionTimestamp?: number;
  executionCompleteTimestamp?: number;
  quoteTimestamp?: number;
  estimatedUpstreamDelayMs?: number;
  internalLatencyMs?: number;
  unfilledAmountUsdc?: number;
  fillReason?: string;
}

export interface PaperAccount {
  initialBalance: number; // $100.00
  cashBalance: number;
  positions: Record<string, PaperPosition>;
  history: CopyTradeRecord[];
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  totalRealizedPnl: number;
  totalFeesPaid: number;
  currentStakeSize?: number;
}

export interface PortfolioMetrics {
  initialBalance: number;
  cashBalance: number;
  activePositionsValue: number;
  totalPortfolioValue: number;
  unrealizedPnl: number;
  realizedPnl: number;
  totalFeesPaid: number;
  todayRealizedPnl: number;
  dailyTarget: number;
  isDailyTargetReached: boolean;
  totalPnl: number;
  totalPnlPercent: number;
  openPositionsCount: number;
  totalTradesCount: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
}

export interface BotConfig {
  targetWallet: string;
  targetHandle: string;
  telegramConfigured: boolean;
  isTelegramAlertsEnabled: boolean;
  copyTradeAmount: number; // default $5.00
  isAutoCopyEnabled: boolean;
  pollingIntervalSeconds: number; // default 5
  soundAlertsEnabled: boolean;
  browserNotificationsEnabled: boolean;
  ignoreDailyTarget?: boolean;
  maxSlippagePercent: number; // Slippage protection
}

export interface TraderTarget {
  handle: string;
  wallet: string;
  description: string;
  polymarketUrl: string;
  badge?: string;
  active?: boolean;
}

export interface ActiveBtcWindow {
  marketId: string;
  conditionId: string;
  title: string;
  slug: string;
  startDate: number;
  endDate: number;
  upTokenId: string;
  downTokenId: string;
  status: 'CURRENT' | 'EXPIRED';
  timeLeftSeconds: number;
  outcomePrices?: number[];
}

export interface Btc15mBotConfig {
  isEnabled: boolean;
  stakeSize: number; // $10.00 (Single trade, no hedge)
  entryThreshold: number; // 0.80 (80¢)
  takeProfitPrice: number; // 0.85 (85¢ on the spot)
  stopLossDollars: number; // $3.00 loss
}




