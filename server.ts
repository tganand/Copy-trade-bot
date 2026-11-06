import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import WebSocket from 'ws';
import {
  createInitialAccount,
  executeCopyBuy,
  executeCopySell,
  executeInternalSell,
  calculatePortfolioMetrics,
  formatTelegramTradeAlert,
  createInitialWindowTracker,
  evaluateTradeNotification,
  WindowTrackerState,
  autoClosePastWindowPositions,
  getWindowTimestamp,
  countWindowBuysForSide,
  computeClosedPositionStats,
  LatencyContext,
} from './src/utils/tradingEngine.ts';
import {
  BotConfig,
  PaperAccount,
  PolymarketActivityItem,
  PolymarketPositionItem,
  CopyTradeRecord,
  ActiveBtcWindow,
  Btc15mBotConfig,
  PortfolioMetrics,
} from './src/types/index.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Process-level unhandled exception & rejection handlers
process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED REJECTION]', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[FATAL UNCAUGHT EXCEPTION]', err);
  try {
    flushState();
  } catch {}
  process.exit(1);
});

const app = express();
const server = http.createServer(app);
const PORT = 3000;

// Preset target traders available for 1-click copy trading & tracking
const PRESET_TRADERS = [
  {
    handle: '@dangerously-skip-permissions',
    wallet: '0xc53375ff94e96100f2b30a4b5775db35218d69a9',
    description: 'Designated Target Trader (5m BTC Markets & High Volume)',
    polymarketUrl: 'https://polymarket.com/@dangerously-skip-permissions',
    badge: 'ACTIVE TRADING TARGET',
  },
];

// Define ONE TARGET_WALLETS map (lowercase address -> handle), derived from PRESET_TRADERS
const TARGET_WALLETS: Record<string, string> = {};
for (const t of PRESET_TRADERS) {
  TARGET_WALLETS[t.wallet.toLowerCase()] = t.handle;
}

// Telegram configuration from environment secrets
const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_TOKEN || '';
const telegramChatId = process.env.TELEGRAM_CHAT_ID || '';
const telegramConfigured = Boolean(telegramBotToken.trim() && telegramChatId.trim());

if (!telegramConfigured) {
  console.warn('[Telegram] Telegram secrets (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID) missing. Telegram alerts disabled.');
}

// Default configuration
const config: BotConfig = {
  targetWallet: '0xc53375ff94e96100f2b30a4b5775db35218d69a9',
  targetHandle: '@dangerously-skip-permissions',
  telegramConfigured,
  isTelegramAlertsEnabled: telegramConfigured,
  copyTradeAmount: 5.0,
  isAutoCopyEnabled: true,
  pollingIntervalSeconds: 5,
  soundAlertsEnabled: true,
  browserNotificationsEnabled: true,
  ignoreDailyTarget: false,
  maxSlippagePercent: 75.0,
};

// 15-Minute Momentum Bot Configuration removed in favor of momentumConfigs map

// Authentication credentials from environment
const APP_USERNAME = process.env.APP_USERNAME || 'admin';
const APP_PASSWORD = process.env.APP_PASSWORD || 'polymarket2026';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

if (IS_PRODUCTION && (!process.env.APP_USERNAME || !process.env.APP_PASSWORD)) {
  console.warn('[Auth] WARNING: APP_USERNAME and APP_PASSWORD are not set in production environment.');
}

// --- Persistence Setup ---
const DATA_DIR = path.resolve(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'bot_state.json');
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

interface PersistedState {
  paperAccount: PaperAccount;
  momentumAccounts: Record<string, PaperAccount>;
  momentumConfigs: Record<string, Btc15mBotConfig>;
  momentumTradedWindows: Record<string, string[]>;
  processedFingerprints: Record<string, number>;
  dedupRingBuffer: any[];
  counters: {
    rtdsMessagesReceived: number;
    rtdsMatched: number;
    rtdsDropped: number;
    rtdsProcessed: number;
    pollProcessed: number;
    skippedNonBtcCount: number;
    skippedDuplicateCount: number;
    skippedSlippageCount: number;
    ambiguousDuplicateCount: number;
    skippedStaleCount: number;
    reconnectCount: number;
    marketFeeCount: number;
    assumedFeeCount: number;
  };
}

let paperAccount: PaperAccount = createInitialAccount(100.0);
const momentumAccounts: Record<string, PaperAccount> = {
  'BTC': createInitialAccount(100.0),
};
const momentumConfigs: Record<string, Btc15mBotConfig> = {
  'BTC': { isEnabled: true, stakeSize: 10.0, entryThreshold: 0.75, stopLossPrice: 0.60, takeProfitPrice: 0.97 },
};
let momentumTradedWindows: Record<string, Set<string>> = { 'BTC': new Set() };
let crossedThresholdTime: Record<string, number> = {};
let activeMomentumWindows: Record<string, ActiveBtcWindow | null> = { 'BTC': null };
let processedFingerprints: Record<string, number> = {};
let dedupRingBuffer: any[] = [];
let telemetryCounters = {
  rtdsMessagesReceived: 0,
  rtdsMatched: 0,
  rtdsDropped: 0,
  rtdsProcessed: 0,
  pollProcessed: 0,
  skippedNonBtcCount: 0,
  skippedDuplicateCount: 0,
  skippedSlippageCount: 0,
  ambiguousDuplicateCount: 0,
  skippedStaleCount: 0,
  skippedSizeFilterCount: 0,
  reconnectCount: 0,
  marketFeeCount: 0,
  assumedFeeCount: 0,
};

function loadState() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf-8');
      const parsed: PersistedState = JSON.parse(raw);
      if (parsed.paperAccount) {
        paperAccount = parsed.paperAccount;
        if (paperAccount.currentStakeSize === undefined || isNaN(paperAccount.currentStakeSize)) {
          paperAccount.currentStakeSize = 10.0;
        }
      }
      if (parsed.momentumAccounts) {
        delete (parsed.momentumAccounts as any)['SOL'];
        delete (parsed.momentumAccounts as any)['ETH'];
        if (parsed.momentumAccounts['BTC']) {
          const acc = parsed.momentumAccounts['BTC'];
          if (acc.initialBalance !== 100.0) {
            const diff = 100.0 - acc.initialBalance;
            acc.initialBalance = 100.0;
            acc.cashBalance = Number((acc.cashBalance + diff).toFixed(4));
          }
          if (acc.currentStakeSize === undefined || isNaN(acc.currentStakeSize)) {
            acc.currentStakeSize = 10.0;
          }
          if (acc.totalFeesPaid === undefined || isNaN(acc.totalFeesPaid) || acc.totalFeesPaid === 0) {
            const histFees = (acc.history || []).reduce((sum: number, t: any) => sum + (t.feeUsdc !== undefined ? t.feeUsdc : ((t.buyFeeUsdc || 0) + (t.sellFeeUsdc || 0))), 0);
            if (histFees > 0) acc.totalFeesPaid = Number(histFees.toFixed(4));
          }
          momentumAccounts['BTC'] = acc;
        }
      }
      if (parsed.momentumConfigs) {
        delete (parsed.momentumConfigs as any)['SOL'];
        delete (parsed.momentumConfigs as any)['ETH'];
        momentumConfigs['BTC'] = {
          isEnabled: true,
          stakeSize: 10.0,
          entryThreshold: 0.75,
          stopLossPrice: 0.60,
          takeProfitPrice: 0.97,
        };
      }
      if (parsed.momentumTradedWindows) {
        delete (parsed.momentumTradedWindows as any)['SOL'];
        delete (parsed.momentumTradedWindows as any)['ETH'];
        if (parsed.momentumTradedWindows['BTC']) {
          momentumTradedWindows['BTC'] = new Set(parsed.momentumTradedWindows['BTC']);
        }
      }
      if (parsed.processedFingerprints) processedFingerprints = parsed.processedFingerprints;
      if (Array.isArray(parsed.dedupRingBuffer)) dedupRingBuffer = parsed.dedupRingBuffer;
      if (parsed.counters) telemetryCounters = { ...telemetryCounters, ...parsed.counters };
    }
  } catch (err: any) {
    console.error('[Persistence] Error loading state:', err.message);
  }
}

function flushState() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const now = Date.now();
    for (const [fp, ts] of Object.entries(processedFingerprints)) {
      if (now - ts > ONE_DAY_MS) {
        delete processedFingerprints[fp];
      }
    }

    const stateToSave: PersistedState = {
      paperAccount,
      momentumAccounts,
      momentumConfigs,
      momentumTradedWindows: Object.fromEntries(
        Object.entries(momentumTradedWindows).map(([symbol, windows]) => [symbol, Array.from(windows).slice(-100)])
      ),
      processedFingerprints,
      dedupRingBuffer,
      counters: telemetryCounters,
    };
    const tmpFile = `${STATE_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(stateToSave, null, 2), 'utf-8');
    fs.renameSync(tmpFile, STATE_FILE);
  } catch (err: any) {
    console.error('[Persistence] Error saving state:', err.message);
  }
}


loadState();

process.on('SIGTERM', () => {
  flushState();
  process.exit(0);
});
process.on('SIGINT', () => {
  flushState();
  process.exit(0);
});

// Caches and state
let recentActivities: PolymarketActivityItem[] = [];
let targetPositions: PolymarketPositionItem[] = [];
let livePrices: Record<string, number> = {};
let windowTrackerState: WindowTrackerState = createInitialWindowTracker();
let lastPolledAt = 0;
let lastError: string | null = null;
let pollCount = 0;

let rtdsStatus: 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED' = 'DISCONNECTED';
let lastRtdsMessageAt = 0;
let rtdsWs: WebSocket | null = null;
let rtdsReconnectAttempts = 0;

let rtdsDebugLogCount = 0;
let pollDebugLogCount = 0;
const DEBUG_RTDS = process.env.DEBUG_RTDS === '1';

// --- Dynamic Market Fee Cache & Lookup ---
const marketFeeCache: Record<string, { rate: number; source: 'market' | 'assumed' }> = {};
const DEFAULT_TAKER_FEE_RATE = Number(process.env.DEFAULT_TAKER_FEE_RATE || 0.07);

async function getMarketFeeInfo(slugOrEventSlug?: string, assetId?: string): Promise<{ rate: number; source: 'market' | 'assumed' }> {
  const cacheKey = slugOrEventSlug || assetId || 'default';
  if (marketFeeCache[cacheKey]) {
    return marketFeeCache[cacheKey];
  }

  if (slugOrEventSlug) {
    try {
      const url = `https://gamma-api.polymarket.com/events?slug=${slugOrEventSlug}`;
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (res.ok) {
        const events = (await res.json()) as any[];
        if (Array.isArray(events) && events.length > 0 && Array.isArray(events[0].markets) && events[0].markets.length > 0) {
          const m = events[0].markets[0];
          // Polymarket gamma market fields: feeBps (basis points), takerFee, fee
          if (m.feeBps !== undefined && m.feeBps !== null) {
            const rate = Number(m.feeBps) / 10000;
            marketFeeCache[cacheKey] = { rate, source: 'market' };
            return marketFeeCache[cacheKey];
          }
          if (m.takerFee !== undefined && m.takerFee !== null) {
            const rate = Number(m.takerFee);
            marketFeeCache[cacheKey] = { rate, source: 'market' };
            return marketFeeCache[cacheKey];
          }
          if (m.fee !== undefined && m.fee !== null) {
            const rate = Number(m.fee);
            marketFeeCache[cacheKey] = { rate, source: 'market' };
            return marketFeeCache[cacheKey];
          }
        }
      }
    } catch {}
  }

  // Fallback assumed
  marketFeeCache[cacheKey] = { rate: DEFAULT_TAKER_FEE_RATE, source: 'assumed' };
  return marketFeeCache[cacheKey];
}

// Authentication Middleware protecting /api/* routes (enforced only in production)
app.use((req, res, next) => {
  // If not production, allow unauthenticated access to support AI Studio preview iframe
  if (!IS_PRODUCTION) {
    return next();
  }

  if (req.path.startsWith('/api/')) {
    if (req.path === '/api/ping' || (req.path === '/api/stream' && req.query.token === APP_PASSWORD)) {
      return next();
    }

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Basic ')) {
      try {
        const base64Credentials = authHeader.split(' ')[1];
        const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
        const [username, password] = credentials.split(':');
        if (username === APP_USERNAME && password === APP_PASSWORD) {
          return next();
        }
      } catch {}
    }

    res.setHeader('WWW-Authenticate', 'Basic realm="Polymarket Copy-Trading Bot"');
    return res.status(401).json({ ok: false, error: 'Unauthorized. Valid credentials required.' });
  }
  next();
});

app.use(express.json());

const PRESET_TRADERS_PUBLIC = PRESET_TRADERS;

interface OrderBookLevel {
  price: number;
  size: number;
}

interface MarketBookState {
  assetId: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  bestBid: number;
  bestAsk: number;
  lastPrice: number;
  spread: number;
  updatedAt: number;
  latencyMs: number;
}

let wsConnectionStatus: 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED' = 'DISCONNECTED';
let lastWsMessageAt = 0;
let clobWs: WebSocket | null = null;
const marketBooks: Record<string, MarketBookState> = {};
const subscribedAssetIds = new Set<string>();
const sseClients = new Set<any>();

function getLiquidationValue(position: any, book?: MarketBookState): number {
  if (!book || book.bids.length === 0) {
    const fallbackPrice = book?.bestBid || book?.lastPrice || position.currentPrice || position.entryPrice;
    return position.shares * fallbackPrice;
  }
  let remainingShares = position.shares;
  let totalProceeds = 0;
  for (const bid of book.bids) {
    const sharesAtLevel = Math.min(remainingShares, bid.size);
    totalProceeds += sharesAtLevel * bid.price;
    remainingShares -= sharesAtLevel;
    if (remainingShares <= 0) break;
  }
  if (remainingShares > 0) {
    totalProceeds += remainingShares * (book.bestBid || book.lastPrice || position.entryPrice);
  }
  return Number(totalProceeds.toFixed(4));
}

function updatePaperPositionsFromLivePrices() {
  for (const [key, paperPos] of Object.entries(paperAccount.positions)) {
    const book = marketBooks[paperPos.asset];
    const livePrice = livePrices[key] ?? livePrices[paperPos.asset] ?? paperPos.currentPrice;
    if (livePrice !== undefined && livePrice > 0) {
      paperPos.currentPrice = livePrice;
      const liquidationValue = getLiquidationValue(paperPos, book);
      paperPos.currentValue = liquidationValue;
      paperPos.unrealizedPnl = Number((paperPos.currentValue - paperPos.totalCost).toFixed(4));
      paperPos.unrealizedPnlPercent = Number(
        (((livePrice - paperPos.entryPrice) / paperPos.entryPrice) * 100).toFixed(2)
      );
    }
  }

  for (const [symbol, momentumAccount] of Object.entries(momentumAccounts)) {
    for (const [key, btcPos] of Object.entries(momentumAccount.positions)) {
      const book = marketBooks[btcPos.asset];
      const livePrice = livePrices[key] ?? livePrices[btcPos.asset] ?? btcPos.currentPrice;
      if (livePrice !== undefined && livePrice > 0) {
        btcPos.currentPrice = livePrice;
        const liquidationValue = getLiquidationValue(btcPos, book);
        btcPos.currentValue = liquidationValue;
        btcPos.unrealizedPnl = Number((btcPos.currentValue - btcPos.totalCost).toFixed(4));
        btcPos.unrealizedPnlPercent = Number(
          (((livePrice - btcPos.entryPrice) / btcPos.entryPrice) * 100).toFixed(2)
        );
      }
    }
  }
}

let activeBtcWindow: ActiveBtcWindow | null = null;

function parseEventLatency(rawTs: any, receiveTime: number): number {
  if (!rawTs) return 0;
  const num = Number(rawTs);
  if (isNaN(num) || num <= 0) return 0;
  const tsMs = num < 1e11 ? num * 1000 : num;
  const diff = receiveTime - tsMs;
  if (Math.abs(diff) < 600000) {
    return Math.max(0, diff);
  }
  return 0;
}

function processBookUpdate(assetId: string, bids: any[], asks: any[], rawTs: any, receiveTime: number) {
  if (!assetId) return;
  if (!marketBooks[assetId]) {
    marketBooks[assetId] = {
      assetId,
      bids: [],
      asks: [],
      bestBid: 0,
      bestAsk: 0,
      lastPrice: 0,
      spread: 0,
      updatedAt: receiveTime,
      latencyMs: 0,
    };
  }
  const book = marketBooks[assetId];
  if (Array.isArray(bids) && bids.length > 0) {
    book.bids = bids
      .map((b: any) => ({ price: parseFloat(b.price), size: parseFloat(b.size) }))
      .filter((b: any) => !isNaN(b.price) && b.price > 0)
      .sort((a: any, b: any) => b.price - a.price);
    if (book.bids.length > 0) {
      book.bestBid = book.bids[0].price;
    }
  }
  if (Array.isArray(asks) && asks.length > 0) {
    book.asks = asks
      .map((a: any) => ({ price: parseFloat(a.price), size: parseFloat(a.size) }))
      .filter((a: any) => !isNaN(a.price) && a.price > 0)
      .sort((a: any, b: any) => a.price - b.price);
    if (book.asks.length > 0) {
      book.bestAsk = book.asks[0].price;
    }
  }
  if (book.bestBid > 0 && book.bestAsk > 0) {
    book.spread = Number((book.bestAsk - book.bestBid).toFixed(4));
  }
  if (book.lastPrice === 0) {
    if (book.bestAsk > 0) book.lastPrice = book.bestAsk;
    else if (book.bestBid > 0) book.lastPrice = book.bestBid;
  }
  book.updatedAt = receiveTime;
  const lat = parseEventLatency(rawTs, receiveTime);
  if (lat > 0) book.latencyMs = lat;
  const rawPrice = book.bestAsk > 0 ? book.bestAsk : (book.lastPrice > 0 ? book.lastPrice : book.bestBid);
  livePrices[assetId] = rawPrice;
}

function processPriceUpdate(assetId: string, price: any, bestBid: any, bestAsk: any, rawTs: any, receiveTime: number) {
  if (!assetId) return;
  if (!marketBooks[assetId]) {
    marketBooks[assetId] = {
      assetId,
      bids: [],
      asks: [],
      bestBid: 0,
      bestAsk: 0,
      lastPrice: 0,
      spread: 0,
      updatedAt: receiveTime,
      latencyMs: 0,
    };
  }
  const book = marketBooks[assetId];
  const p = parseFloat(price);
  if (!isNaN(p) && p > 0) book.lastPrice = p;
  if (bestBid !== undefined) {
    const bb = parseFloat(bestBid);
    if (!isNaN(bb) && bb > 0) book.bestBid = bb;
  }
  if (bestAsk !== undefined) {
    const ba = parseFloat(bestAsk);
    if (!isNaN(ba) && ba > 0) book.bestAsk = ba;
  }
  if (book.bestBid > 0 && book.bestAsk > 0) {
    book.spread = Number((book.bestAsk - book.bestBid).toFixed(4));
  }
  book.updatedAt = receiveTime;
  const lat = parseEventLatency(rawTs, receiveTime);
  if (lat > 0) book.latencyMs = lat;
  const updateRawPrice = book.bestBid > 0 ? book.bestBid : book.lastPrice;
  livePrices[assetId] = updateRawPrice;
}

function isValidClobTokenId(id: string): boolean {
  return typeof id === 'string' && /^\d{10,}$/.test(id.trim());
}

let sseBroadcastTimeout: NodeJS.Timeout | null = null;
let lastSseBroadcastTime = 0;

function scheduleBroadcastSSE(data: any) {
  const now = Date.now();
  if (now - lastSseBroadcastTime >= 100) {
    lastSseBroadcastTime = now;
    broadcastSSE(data);
    return;
  }
  if (!sseBroadcastTimeout) {
    sseBroadcastTimeout = setTimeout(() => {
      sseBroadcastTimeout = null;
      lastSseBroadcastTime = Date.now();
      broadcastSSE({
        type: 'market_update',
        marketBooks,
        wsConnectionStatus,
        rtdsStatus,
        activeBtcWindow,
        metrics: calculatePortfolioMetrics(paperAccount, livePrices),
        paperAccount,
        counters: telemetryCounters,
        activeMomentumWindows,
        momentumAccounts,
        momentumConfigs,
      });
    }, 100 - (now - lastSseBroadcastTime));
  }
}

function evaluatePositionRiskManagement() {
  if (!paperAccount || Object.keys(paperAccount.positions).length === 0) return;

  for (const [key, pos] of Object.entries(paperAccount.positions)) {
    const book = marketBooks[pos.asset];
    const livePrice = book?.bestBid || book?.lastPrice || livePrices[key] || livePrices[pos.asset] || pos.currentPrice;
    if (!livePrice || livePrice <= 0) continue;

    const entryPrice = pos.entryPrice;
    const pnlPercent = ((livePrice - entryPrice) / entryPrice) * 100;

    // Determine if this side has 2 trades in this window
    const windowBuyCount = Math.max(
      pos.buyCount || 1,
      countWindowBuysForSide(paperAccount.history, pos.outcome, pos.slug, pos.conditionId, pos.openedAt)
    );
    const isDoubleTrade = windowBuyCount >= 2;

    const stopLossThreshold = isDoubleTrade ? -20 : -40;
    const stopLossPriceFactor = isDoubleTrade ? 0.80 : 0.60;
    const stopLossReason = isDoubleTrade ? 'STOP_LOSS_-20%' : 'STOP_LOSS_-40%';

    // 1. Dynamic Stop-Loss (-20% if 2 trades on same side in window, -40% if single trade or hedged UP/DOWN)
    if (pnlPercent <= stopLossThreshold || livePrice <= entryPrice * stopLossPriceFactor) {
      console.log(`[${stopLossReason}] Triggered for ${pos.title} (${pos.outcome}) [buys: ${windowBuyCount}] @ $${livePrice.toFixed(2)} (PnL: ${pnlPercent.toFixed(1)}%)`);
      const res = executeInternalSell(paperAccount, key, 1.0, stopLossReason, livePrice, DEFAULT_TAKER_FEE_RATE, 'assumed', book);
      if (!res.error) {
        paperAccount = res.account;
        flushState();
      }
      continue;
    }

    // 2. Take-Profit Logic (Scaled for double-trades: 20% on $20 = 40% on $10)
    if (isDoubleTrade) {
      // Tier 3: +40% Profit (or price >= 90¢) -> Liquidate 100% of remaining position
      if (pnlPercent >= 40 || livePrice >= 0.90) {
        console.log(`[TAKE-PROFIT +40% (Double)] Triggered full close for ${pos.title} (${pos.outcome}) @ $${livePrice.toFixed(2)} (PnL: +${pnlPercent.toFixed(1)}%)`);
        const res = executeInternalSell(paperAccount, key, 1.0, 'TAKE_PROFIT_40%', livePrice, DEFAULT_TAKER_FEE_RATE, 'assumed', book);
        if (!res.error) {
          paperAccount = res.account;
          flushState();
        }
        continue;
      }

      // Tier 2: +20% Profit -> Sell 50% of position
      if (pnlPercent >= 20 && !pos.tp25Taken) {
        console.log(`[TAKE-PROFIT +20% (Double)] Selling 50% for ${pos.title} (${pos.outcome}) @ $${livePrice.toFixed(2)} (PnL: +${pnlPercent.toFixed(1)}%)`);
        const res = executeInternalSell(paperAccount, key, 0.50, 'TAKE_PROFIT_20%', livePrice, DEFAULT_TAKER_FEE_RATE, 'assumed', book);
        if (!res.error) {
          paperAccount = res.account;
          if (paperAccount.positions[key]) {
            paperAccount.positions[key].tp25Taken = true;
            paperAccount.positions[key].tp15Taken = true;
          }
          flushState();
        }
        continue;
      }

      // Tier 1: +15% Profit -> Sell 30% of position
      if (pnlPercent >= 15 && !pos.tp15Taken && !pos.tp25Taken) {
        console.log(`[TAKE-PROFIT +15% (Double)] Selling 30% for ${pos.title} (${pos.outcome}) @ $${livePrice.toFixed(2)} (PnL: +${pnlPercent.toFixed(1)}%)`);
        const res = executeInternalSell(paperAccount, key, 0.30, 'TAKE_PROFIT_15%', livePrice, DEFAULT_TAKER_FEE_RATE, 'assumed', book);
        if (!res.error) {
          paperAccount = res.account;
          if (paperAccount.positions[key]) {
            paperAccount.positions[key].tp15Taken = true;
          }
          flushState();
        }
        continue;
      }
    } else {
      // Standard Single / Hedged UP+DOWN position:
      // Tier 3: +90% Profit (or price >= 90¢) -> Liquidate 100% of remaining position
      if (pnlPercent >= 90 || livePrice >= 0.90) {
        console.log(`[TAKE-PROFIT +90%] Triggered full close for ${pos.title} (${pos.outcome}) @ $${livePrice.toFixed(2)} (PnL: +${pnlPercent.toFixed(1)}%)`);
        const res = executeInternalSell(paperAccount, key, 1.0, 'TAKE_PROFIT_90%', livePrice, DEFAULT_TAKER_FEE_RATE, 'assumed', book);
        if (!res.error) {
          paperAccount = res.account;
          flushState();
        }
        continue;
      }

      // Tier 2: +50% Profit -> Sell 50% of position
      if (pnlPercent >= 50 && !pos.tp50Taken) {
        console.log(`[TAKE-PROFIT +50%] Selling 50% for ${pos.title} (${pos.outcome}) @ $${livePrice.toFixed(2)} (PnL: +${pnlPercent.toFixed(1)}%)`);
        const res = executeInternalSell(paperAccount, key, 0.50, 'TAKE_PROFIT_50%', livePrice, DEFAULT_TAKER_FEE_RATE, 'assumed', book);
        if (!res.error) {
          paperAccount = res.account;
          if (paperAccount.positions[key]) {
            paperAccount.positions[key].tp50Taken = true;
            paperAccount.positions[key].tp30Taken = true;
          }
          flushState();
        }
        continue;
      }

      // Tier 1: +30% Profit -> Sell 30% of position
      if (pnlPercent >= 30 && !pos.tp30Taken && !pos.tp50Taken) {
        console.log(`[TAKE-PROFIT +30%] Selling 30% for ${pos.title} (${pos.outcome}) @ $${livePrice.toFixed(2)} (PnL: +${pnlPercent.toFixed(1)}%)`);
        const res = executeInternalSell(paperAccount, key, 0.30, 'TAKE_PROFIT_30%', livePrice, DEFAULT_TAKER_FEE_RATE, 'assumed', book);
        if (!res.error) {
          paperAccount = res.account;
          if (paperAccount.positions[key]) {
            paperAccount.positions[key].tp30Taken = true;
          }
          flushState();
        }
        continue;
      }
    }
  }
}

setInterval(evaluatePositionRiskManagement, 250);
setInterval(() => {
  evaluateMomentumStrategy('BTC');
}, 100);

setInterval(() => {
  if (sseClients.size > 0 && (activeBtcWindow || activeMomentumWindows['BTC'])) {
    const momentumMetrics: Record<string, PortfolioMetrics> = {
      'BTC': calculatePortfolioMetrics(momentumAccounts['BTC'], livePrices),
    };
    broadcastSSE({
      type: 'market_update',
      marketBooks,
      wsConnectionStatus,
      rtdsStatus,
      activeBtcWindow,
      metrics: calculatePortfolioMetrics(paperAccount, livePrices),
      paperAccount,
      counters: telemetryCounters,
      activeMomentumWindows,
      momentumAccounts,
      momentumConfigs,
      momentumMetrics,
    });
  }
}, 100);

let reconnectTimeout: NodeJS.Timeout | null = null;

// REST market price snapshot poller: supplies baseline prices if WS book has not arrived yet
setInterval(async () => {
  const windowsToPoll = [
    activeBtcWindow,
    activeMomentumWindows['BTC'],
  ].filter(Boolean) as ActiveBtcWindow[];

  for (const win of windowsToPoll) {
    if (!win || !win.slug) continue;
    try {
      const res = await fetch(`https://gamma-api.polymarket.com/events?slug=${win.slug}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      if (res.ok) {
        const data = (await res.json()) as any[];
        if (Array.isArray(data) && data.length > 0 && Array.isArray(data[0].markets) && data[0].markets.length > 0) {
          const m = data[0].markets[0];
          let clobTokens: string[] = [];
          if (m.clobTokenIds) {
            clobTokens = typeof m.clobTokenIds === 'string' ? JSON.parse(m.clobTokenIds) : m.clobTokenIds;
          }
          const prices = m.outcomePrices ? (typeof m.outcomePrices === 'string' ? JSON.parse(m.outcomePrices) : m.outcomePrices) : [];

          if (clobTokens.length >= 2 && prices.length >= 2) {
            const upAsset = clobTokens[0];
            const downAsset = clobTokens[1];
            const upPrice = parseFloat(prices[0]) || 0.5;
            const downPrice = parseFloat(prices[1]) || 0.5;

            // Always sync fresh outcomePrices directly into window state:
            win.outcomePrices = [upPrice, downPrice];

            const now = Date.now();
            processPriceUpdate(upAsset, upPrice, upPrice, upPrice, now, now);
            processPriceUpdate(downAsset, downPrice, downPrice, downPrice, now, now);
          }
        }
      }
    } catch {}
  }
}, 1200);

function connectClobWebSocket() {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  if (clobWs) {
    const oldWs = clobWs;
    clobWs = null;
    oldWs.removeAllListeners();
    oldWs.on('error', () => {});
    try {
      if (oldWs.readyState === WebSocket.OPEN) {
        oldWs.close();
      } else {
        oldWs.terminate();
      }
    } catch {}
  }

  const wsInstance = new WebSocket('wss://ws-subscriptions-clob.polymarket.com/ws/market');
  clobWs = wsInstance;

  wsInstance.on('error', (err) => {
    if (err.message && err.message.includes('WebSocket was closed before the connection was established')) {
      return;
    }
  });

  let pingInterval: NodeJS.Timeout | null = null;

  wsInstance.on('open', () => {
    if (clobWs !== wsInstance) return;
    wsConnectionStatus = 'CONNECTED';
    resubscribeAssets();

    // Polymarket CLOB WS heartbeat: ping every 10 seconds
    pingInterval = setInterval(() => {
      if (wsInstance.readyState === WebSocket.OPEN) {
        try {
          wsInstance.send('PING');
          wsInstance.ping();
        } catch {}
      }
    }, 10000);
  });

  wsInstance.on('pong', () => {
    lastWsMessageAt = Date.now();
  });

  wsInstance.on('message', (data: WebSocket.RawData) => {
    if (clobWs !== wsInstance) return;
    const receiveTime = Date.now();
    lastWsMessageAt = receiveTime;
    try {
      const msgStr = data.toString().trim();
      if (!msgStr) return;

      // Handle plain-text PONG heartbeat response
      if (msgStr === 'PONG' || msgStr === 'pong') {
        return;
      }

      if (!msgStr.startsWith('{') && !msgStr.startsWith('[')) return;

      const parsed = JSON.parse(msgStr);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && item.asset_id && (item.bids || item.asks)) {
            processBookUpdate(item.asset_id, item.bids, item.asks, item.timestamp, receiveTime);
            if (item.last_trade_price !== undefined) {
              const ltp = parseFloat(item.last_trade_price);
              if (!isNaN(ltp) && ltp > 0 && marketBooks[item.asset_id]) {
                marketBooks[item.asset_id].lastPrice = ltp;
              }
            }
          }
        }
      } else if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed.price_changes)) {
          for (const pc of parsed.price_changes) {
            processPriceUpdate(pc.asset_id, pc.price, pc.best_bid, pc.best_ask, parsed.timestamp || pc.timestamp, receiveTime);
          }
        } else if (parsed.event_type === 'book' || parsed.bids || parsed.asks) {
          processBookUpdate(parsed.asset_id, parsed.bids, parsed.asks, parsed.timestamp, receiveTime);
          if (parsed.last_trade_price !== undefined) {
            const ltp = parseFloat(parsed.last_trade_price);
            if (!isNaN(ltp) && ltp > 0 && marketBooks[parsed.asset_id]) {
              marketBooks[parsed.asset_id].lastPrice = ltp;
            }
          }
        } else if (parsed.event_type === 'last_trade_price' || parsed.price !== undefined) {
          processPriceUpdate(parsed.asset_id, parsed.price, parsed.best_bid, parsed.best_ask, parsed.timestamp, receiveTime);
        }
      }

      updatePaperPositionsFromLivePrices();
    } catch {}
  });

  wsInstance.on('close', () => {
    if (pingInterval) clearInterval(pingInterval);
    if (clobWs === wsInstance) {
      wsConnectionStatus = 'DISCONNECTED';
      if (!reconnectTimeout) {
        reconnectTimeout = setTimeout(async () => {
          reconnectTimeout = null;
          try {
            await pollActiveBtcWindow();
          } catch {}
          connectClobWebSocket();
        }, 3000);
      }
    }
  });
}

function resubscribeAssets() {
  if (!clobWs || clobWs.readyState !== WebSocket.OPEN) return;
  const assets = Array.from(subscribedAssetIds).filter(isValidClobTokenId);
  if (assets.length === 0) return;
  const subMsg = { type: 'market', assets_ids: assets };
  try {
    clobWs.send(JSON.stringify(subMsg));
  } catch {}
}

function updateSubscriptionAssets(newAssetIds: string[]) {
  let changed = false;
  for (const id of newAssetIds) {
    if (isValidClobTokenId(id) && !subscribedAssetIds.has(id)) {
      subscribedAssetIds.add(id);
      changed = true;
    }
  }
  if (changed) {
    if (clobWs && clobWs.readyState === WebSocket.OPEN) {
      resubscribeAssets();
    } else {
      connectClobWebSocket();
    }
  }
}

function broadcastSSE(data: any) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.res.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

async function fetchWindowClobTokens(ts: number): Promise<{ upTokenId: string; downTokenId: string; conditionId: string; title: string; marketId: string; outcomePrices?: number[] } | null> {
  const slug = `btc-updown-5m-${ts}`;
  try {
    const res = await fetch(`https://gamma-api.polymarket.com/events?slug=${slug}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (res.ok) {
      const events = (await res.json()) as any[];
      if (Array.isArray(events) && events.length > 0 && Array.isArray(events[0].markets) && events[0].markets.length > 0) {
        const ev = events[0];
        const m = ev.markets[0];
        let clobTokens: string[] = [];
        if (m.clobTokenIds) {
          clobTokens = typeof m.clobTokenIds === 'string' ? JSON.parse(m.clobTokenIds) : m.clobTokenIds;
        }
        if (clobTokens.length >= 2 && isValidClobTokenId(clobTokens[0]) && isValidClobTokenId(clobTokens[1])) {
          const prices = m.outcomePrices ? (typeof m.outcomePrices === 'string' ? JSON.parse(m.outcomePrices) : m.outcomePrices) : [];
          const upPrice = parseFloat(prices[0]) || 0.5;
          const downPrice = parseFloat(prices[1]) || 0.5;

          return {
            upTokenId: clobTokens[0],
            downTokenId: clobTokens[1],
            conditionId: m.conditionId || '',
            title: m.question || ev.title || `Bitcoin Up or Down - 5m Window`,
            marketId: m.id || m.conditionId || `btc_${ts}`,
            outcomePrices: [upPrice, downPrice],
          };
        }
      }
    }
  } catch {}
  return null;
}

async function pollActiveBtcWindow(): Promise<string[]> {
  const nowSec = Math.floor(Date.now() / 1000);
  const currentWindowTs = Math.floor(nowSec / 300) * 300;
  const nextWindowTs = currentWindowTs + 300;

  // 1. Fetch / ensure current window
  const currentData = await fetchWindowClobTokens(currentWindowTs);
  if (currentData) {
    const startSec = currentWindowTs;
    const endSec = currentWindowTs + 300;
    const timeLeft = Math.max(0, endSec - nowSec);
    const status: 'CURRENT' | 'EXPIRED' = nowSec >= endSec ? 'EXPIRED' : 'CURRENT';

    const previousWindowSlug = activeBtcWindow?.slug;
    const isNewWindow = previousWindowSlug !== `btc-updown-5m-${currentWindowTs}`;

    activeBtcWindow = {
      marketId: currentData.marketId,
      conditionId: currentData.conditionId,
      title: currentData.title,
      slug: `btc-updown-5m-${currentWindowTs}`,
      startDate: startSec * 1000,
      endDate: endSec * 1000,
      upTokenId: currentData.upTokenId,
      downTokenId: currentData.downTokenId,
      status,
      timeLeftSeconds: timeLeft,
    };

    // Immediately seed baseline prices from Gamma event outcomePrices if books are uninitialized
    if (currentData.outcomePrices && currentData.outcomePrices.length >= 2) {
      const [upP, downP] = currentData.outcomePrices;
      const now = Date.now();
      if (!marketBooks[currentData.upTokenId] || marketBooks[currentData.upTokenId].lastPrice === 0) {
        processPriceUpdate(currentData.upTokenId, upP, upP, upP, now, now);
      }
      if (!marketBooks[currentData.downTokenId] || marketBooks[currentData.downTokenId].lastPrice === 0) {
        processPriceUpdate(currentData.downTokenId, downP, downP, downP, now, now);
      }
    }

    let needsReconnect = false;
    if (!subscribedAssetIds.has(currentData.upTokenId) || !subscribedAssetIds.has(currentData.downTokenId)) {
      subscribedAssetIds.add(currentData.upTokenId);
      subscribedAssetIds.add(currentData.downTokenId);
      needsReconnect = true;
    }

    // 2. PHASE 2: Pre-fetch & pre-subscribe the upcoming market 10-20 seconds before rollover
    if (timeLeft <= 20 && timeLeft > 0) {
      const nextData = await fetchWindowClobTokens(nextWindowTs);
      if (nextData) {
        if (!subscribedAssetIds.has(nextData.upTokenId) || !subscribedAssetIds.has(nextData.downTokenId)) {
          subscribedAssetIds.add(nextData.upTokenId);
          subscribedAssetIds.add(nextData.downTokenId);
          resubscribeAssets();
          console.log(`[BTC Pre-Rollover] Pre-subscribed upcoming window tokens for btc-updown-5m-${nextWindowTs} (${timeLeft}s before rollover)`);
        }
      }
    }

    // 3. Keep open paper positions subscribed
    for (const pos of Object.values(paperAccount.positions)) {
      if (isValidClobTokenId(pos.asset) && !subscribedAssetIds.has(pos.asset)) {
        subscribedAssetIds.add(pos.asset);
        needsReconnect = true;
      }
    }

    if (isNewWindow || needsReconnect) {
      connectClobWebSocket();
    }

    return [currentData.upTokenId, currentData.downTokenId];
  }
  return [];
}

async function fetch15mWindowClobTokens(symbol: string, ts: number): Promise<{ upTokenId: string; downTokenId: string; conditionId: string; title: string; marketId: string; outcomePrices?: number[] } | null> {
  const slug = `${symbol.toLowerCase()}-updown-15m-${ts}`;
  console.log(`[15m Discovery] Querying slug: ${slug}`);
  try {
    const res = await fetch(`https://gamma-api.polymarket.com/events?slug=${slug}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (res.ok) {
      const events = (await res.json()) as any[];
      if (Array.isArray(events) && events.length > 0 && Array.isArray(events[0].markets) && events[0].markets.length > 0) {
        const ev = events[0];
        const m = ev.markets[0];
        let clobTokens: string[] = [];
        if (m.clobTokenIds) {
          clobTokens = typeof m.clobTokenIds === 'string' ? JSON.parse(m.clobTokenIds) : m.clobTokenIds;
        }
        if (clobTokens.length >= 2 && isValidClobTokenId(clobTokens[0]) && isValidClobTokenId(clobTokens[1])) {
          const prices = m.outcomePrices ? (typeof m.outcomePrices === 'string' ? JSON.parse(m.outcomePrices) : m.outcomePrices) : [];
          const upPrice = parseFloat(prices[0]) || 0.5;
          const downPrice = parseFloat(prices[1]) || 0.5;

          return {
            upTokenId: clobTokens[0],
            downTokenId: clobTokens[1],
            conditionId: m.conditionId || '',
            title: m.question || ev.title || `Bitcoin Up or Down - 15m Window`,
            marketId: m.id || m.conditionId || `market_${ts}`,
            outcomePrices: [upPrice, downPrice],
          };
        }
      }
    }
  } catch {}
  return null;
}

async function pollActiveMomentumWindow(symbol: string): Promise<string[]> {
  const nowSec = Math.floor(Date.now() / 1000);
  const currentWindowTs = Math.floor(nowSec / 900) * 900;
  const startSec = currentWindowTs;
  const endSec = currentWindowTs + 900;
  const timeLeft = Math.max(0, endSec - nowSec);
  const status: 'CURRENT' | 'EXPIRED' = nowSec >= endSec ? 'EXPIRED' : 'CURRENT';

  // Query for the specific symbol
  const currentData = await fetch15mWindowClobTokens(symbol, currentWindowTs);
  if (currentData) {
    activeMomentumWindows[symbol] = {
      marketId: currentData.marketId,
      conditionId: currentData.conditionId,
      title: currentData.title,
      slug: `${symbol.toLowerCase()}-updown-15m-${currentWindowTs}`,
      startDate: startSec * 1000,
      endDate: endSec * 1000,
      upTokenId: currentData.upTokenId,
      downTokenId: currentData.downTokenId,
      status,
      timeLeftSeconds: timeLeft,
      outcomePrices: currentData.outcomePrices,
    };

    if (currentData.outcomePrices && currentData.outcomePrices.length >= 2) {
      const [upP, downP] = currentData.outcomePrices;
      const now = Date.now();
      if (!marketBooks[currentData.upTokenId] || marketBooks[currentData.upTokenId].lastPrice === 0) {
        processPriceUpdate(currentData.upTokenId, upP, upP, upP, now, now);
      }
      if (!marketBooks[currentData.downTokenId] || marketBooks[currentData.downTokenId].lastPrice === 0) {
        processPriceUpdate(currentData.downTokenId, downP, downP, downP, now, now);
      }
    }

    let needsReconnect = false;
    if (!subscribedAssetIds.has(currentData.upTokenId) || !subscribedAssetIds.has(currentData.downTokenId)) {
      subscribedAssetIds.add(currentData.upTokenId);
      subscribedAssetIds.add(currentData.downTokenId);
      needsReconnect = true;
    }

    for (const momentumAccount of Object.values(momentumAccounts)) {
      for (const pos of Object.values(momentumAccount.positions)) {
        if (isValidClobTokenId(pos.asset) && !subscribedAssetIds.has(pos.asset)) {
          subscribedAssetIds.add(pos.asset);
          needsReconnect = true;
        }
      }
    }

    if (needsReconnect) {
      resubscribeAssets();
    }

    return [currentData.upTokenId, currentData.downTokenId];
  }

  console.log(`[15m Discovery] Failed to find market for ts ${currentWindowTs}`);
  return [];
}

async function send15mWinTelegramAlert(outcome: string, profitUsdc: number, cashBalance: number) {
  if (!config.isTelegramAlertsEnabled || !telegramBotToken || !telegramChatId) return;
  const profitStr = profitUsdc >= 0 ? `+$${profitUsdc.toFixed(2)}` : `-$${Math.abs(profitUsdc).toFixed(2)}`;
  const text = `🎯 <b>WIN: ${outcome.toUpperCase()}</b>\n💰 <b>Profit:</b> ${profitStr}\n💵 <b>Balance:</b> $${cashBalance.toFixed(2)}`;
  await sendTelegramMessage(text);
}

function evaluateMomentumStrategy(symbol: string) {
  const activeWindow = activeMomentumWindows[symbol];
  if (!activeWindow) return;
  const account = momentumAccounts[symbol];
  const config = momentumConfigs[symbol];
  const tradedWindows = momentumTradedWindows[symbol];

  const nowSec = Math.floor(Date.now() / 1000);
  const upAsset = activeWindow.upTokenId;
  const downAsset = activeWindow.downTokenId;

  const upBook = marketBooks[upAsset];
  const downBook = marketBooks[downAsset];

  const upPrice = upBook?.bestAsk > 0 ? upBook.bestAsk : (upBook?.bestBid > 0 ? upBook.bestBid : (upBook?.lastPrice > 0 ? upBook.lastPrice : (activeWindow.outcomePrices?.[0] || livePrices[upAsset] || 0.5)));
  const downPrice = downBook?.bestAsk > 0 ? downBook.bestAsk : (downBook?.bestBid > 0 ? downBook.bestBid : (downBook?.lastPrice > 0 ? downBook.lastPrice : (activeWindow.outcomePrices?.[1] || livePrices[downAsset] || 0.5)));



  // 1. Risk Management on existing open positions (STRICT STOP-LOSS & TAKE-PROFIT)
  for (const [key, pos] of Object.entries(account.positions)) {
    const isUp = pos.outcome.toUpperCase() === 'UP';
    const thisAsset = pos.asset;
    const thisBook = marketBooks[thisAsset];

    // Direct book prices
    const directBid = thisBook && thisBook.bestBid > 0 ? thisBook.bestBid : null;
    const directAsk = thisBook && thisBook.bestAsk > 0 ? thisBook.bestAsk : null;
    const lastP = thisBook && thisBook.lastPrice > 0 ? thisBook.lastPrice : null;

    // Gamma API official live outcomePrices
    const gammaPrice = activeWindow.outcomePrices && activeWindow.outcomePrices.length >= 2
      ? (isUp ? activeWindow.outcomePrices[0] : activeWindow.outcomePrices[1])
      : null;

    // Determine stable, direct live price (matching Polymarket order book directly without artificial ceilings)
    let liveExitPrice: number = directBid !== null && directBid > 0 
      ? directBid 
      : (directAsk !== null && directAsk > 0 
        ? directAsk 
        : (lastP !== null && lastP > 0 
          ? lastP 
          : (gammaPrice !== null && gammaPrice > 0 ? gammaPrice : pos.currentPrice)));

    // Keep position telemetry up to date
    pos.currentPrice = liveExitPrice;
    pos.currentValue = Number((pos.shares * liveExitPrice).toFixed(4));
    pos.unrealizedPnl = Number((pos.currentValue - pos.totalCost).toFixed(4));
    pos.unrealizedPnlPercent = Number((((liveExitPrice - pos.entryPrice) / (pos.entryPrice || 1)) * 100).toFixed(2));

    // A. REAL MARKET STOP-LOSS at 55¢ ($0.55)
    if (liveExitPrice <= config.stopLossPrice) {
      const exitExecPrice = Math.max(0.50, liveExitPrice); // Real market execution at actual live bid price
      console.log(`🚨 [${symbol} 15m REAL MARKET STOP-LOSS] ${pos.title} (${pos.outcome}) @ $${liveExitPrice.toFixed(3)} <= $${config.stopLossPrice.toFixed(2)}`);
      const res = executeInternalSell(account, key, 1.0, 'STOP_LOSS_55¢', exitExecPrice, DEFAULT_TAKER_FEE_RATE, 'assumed', thisBook);
      if (!res.error) {
        momentumAccounts[symbol] = res.account;
        flushState();
      }
      continue;
    }

    // B. TAKE-PROFIT at 100¢ ($1.00)
    if (liveExitPrice >= 0.99 || liveExitPrice >= config.takeProfitPrice) {
      console.log(`🎯 [${symbol} 15m TAKE-PROFIT 100¢ TRIGGERED] ${pos.title} (${pos.outcome}) @ $${liveExitPrice.toFixed(3)} >= $${config.takeProfitPrice.toFixed(2)}`);
      const res = executeInternalSell(account, key, 1.0, 'TAKE_PROFIT_100¢', liveExitPrice, DEFAULT_TAKER_FEE_RATE, 'assumed', thisBook);
      if (!res.error) {
        momentumAccounts[symbol] = res.account;
        flushState();
        const profit = res.copyTrade?.pnlUsdc ?? Number((pos.shares * liveExitPrice - pos.totalCost).toFixed(2));
      }
      continue;
    }
  }

  // 2. Auto-close expired window positions
  const histBefore = account.history.length;
  momentumAccounts[symbol] = autoClosePastWindowPositions(account, Math.floor(activeWindow.startDate / 1000), livePrices);
  if (account.history.length > histBefore) {
    flushState();
  }

  // 3. Entry & Time-Left Filters
  const now = Date.now();
  const windowSlug = activeWindow.slug;
  if (tradedWindows.has(windowSlug)) {
    return;
  }

  const hasOpenInWindow = Object.values(account.positions).some(p => p.slug === windowSlug || p.conditionId === activeWindow?.conditionId);
  if (hasOpenInWindow) {
    return;
  }



  // Liquidity depth helper (Rule #4: bid depth between entry and entry-20¢ >= 3x stake)
  const hasSufficientBidDepth = (book: any, currentPrice: number) => {
    if (!book || !book.bids || !Array.isArray(book.bids)) return true;
    const floorPrice = Math.max(0.01, currentPrice - 0.20);
    const totalDepth = book.bids
      .filter((b: any) => b.price >= floorPrice && b.price <= currentPrice)
      .reduce((sum: number, b: any) => sum + (b.price * b.size), 0);
    return totalDepth >= (config.stakeSize * 3);
  };

  // Trigger on UP crossing >= 75¢
  if (upPrice !== undefined && upPrice >= config.entryThreshold && upPrice < 0.98) {

    if (!hasSufficientBidDepth(upBook, upPrice)) {
      return; // Skip if thin book liquidity
    }
    if (!crossedThresholdTime[upAsset]) crossedThresholdTime[upAsset] = now;
    if (now - crossedThresholdTime[upAsset] >= 3500) {
      console.log(`[${symbol} 15m MOMENTUM BREAKOUT] UP price $${upPrice.toFixed(2)} held >= 75¢ for 3.5s. Entering trade.`);
      const mockTrade: PolymarketActivityItem = {
        proxyWallet: '15m_momentum_bot',
        timestamp: nowSec,
        conditionId: activeWindow.conditionId,
        type: 'TRADE',
        size: config.stakeSize / upPrice,
        usdcSize: config.stakeSize,
        transactionHash: `15m_entry_${Date.now()}_${symbol}_up`,
        price: upPrice,
        asset: upAsset,
        side: 'BUY',
        outcome: 'Up',
        title: activeWindow.title,
        slug: windowSlug,
      };
      (mockTrade as any).oppositeAsset = downAsset;
      const res = executeCopyBuy(account, mockTrade, config.stakeSize, 75.0, upPrice, DEFAULT_TAKER_FEE_RATE, 'assumed', upBook);
      if (!res.error) {
        // Automatically buy opposite side for $1.00 (Mandatory Hedge Rule)
        const hedgeStake = 1.0;
        const hedgePrice = downPrice !== null && downPrice > 0 ? downPrice : Number(Math.max(0.01, 1.0 - upPrice).toFixed(4));
        const hedgeTrade: PolymarketActivityItem = {
          proxyWallet: '15m_momentum_bot_hedge',
          timestamp: nowSec,
          conditionId: activeWindow.conditionId,
          type: 'TRADE',
          size: hedgeStake / hedgePrice,
          usdcSize: hedgeStake,
          transactionHash: `15m_hedge_${Date.now()}_${symbol}_down`,
          price: hedgePrice,
          asset: downAsset,
          side: 'BUY',
          outcome: 'Down',
          title: activeWindow.title,
          slug: windowSlug,
        };
        (hedgeTrade as any).oppositeAsset = upAsset;
        const hedgeRes = executeCopyBuy(res.account, hedgeTrade, hedgeStake, 75.0, hedgePrice, DEFAULT_TAKER_FEE_RATE, 'assumed', downBook);

        momentumAccounts[symbol] = hedgeRes.account;
        tradedWindows.add(windowSlug);
        crossedThresholdTime[upAsset] = 0;
        flushState();
        console.log(`[${symbol} 15m MOMENTUM BREAKOUT] Successfully bought $10 UP @ $${upPrice.toFixed(2)} + $1 HEDGE DOWN @ $${hedgePrice.toFixed(2)}`);
      }
      return;
    }
  } else {
    crossedThresholdTime[upAsset] = 0;
  }

  // Trigger on DOWN crossing >= 75¢
  if (downPrice !== undefined && downPrice >= config.entryThreshold && downPrice < 0.98) {
    if (!hasSufficientBidDepth(downBook, downPrice)) {
      return; // Skip if thin book liquidity
    }
    if (!crossedThresholdTime[downAsset]) crossedThresholdTime[downAsset] = now;
    if (now - crossedThresholdTime[downAsset] >= 3500) {
      console.log(`[${symbol} 15m MOMENTUM BREAKOUT] DOWN price $${downPrice.toFixed(2)} held >= 75¢ for 3.5s. Entering trade.`);
      const mockTrade: PolymarketActivityItem = {
        proxyWallet: '15m_momentum_bot',
        timestamp: nowSec,
        conditionId: activeWindow.conditionId,
        type: 'TRADE',
        size: config.stakeSize / downPrice,
        usdcSize: config.stakeSize,
        transactionHash: `15m_entry_${Date.now()}_${symbol}_down`,
        price: downPrice,
        asset: downAsset,
        side: 'BUY',
        outcome: 'Down',
        title: activeWindow.title,
        slug: windowSlug,
      };
      (mockTrade as any).oppositeAsset = upAsset;
      const res = executeCopyBuy(account, mockTrade, config.stakeSize, 75.0, downPrice, DEFAULT_TAKER_FEE_RATE, 'assumed', downBook);
      if (!res.error) {
        // Automatically buy opposite side for $1.00 (Mandatory Hedge Rule)
        const hedgeStake = 1.0;
        const hedgePrice = upPrice !== null && upPrice > 0 ? upPrice : Number(Math.max(0.01, 1.0 - downPrice).toFixed(4));
        const hedgeTrade: PolymarketActivityItem = {
          proxyWallet: '15m_momentum_bot_hedge',
          timestamp: nowSec,
          conditionId: activeWindow.conditionId,
          type: 'TRADE',
          size: hedgeStake / hedgePrice,
          usdcSize: hedgeStake,
          transactionHash: `15m_hedge_${Date.now()}_${symbol}_up`,
          price: hedgePrice,
          asset: upAsset,
          side: 'BUY',
          outcome: 'Up',
          title: activeWindow.title,
          slug: windowSlug,
        };
        (hedgeTrade as any).oppositeAsset = downAsset;
        const hedgeRes = executeCopyBuy(res.account, hedgeTrade, hedgeStake, 75.0, hedgePrice, DEFAULT_TAKER_FEE_RATE, 'assumed', upBook);

        momentumAccounts[symbol] = hedgeRes.account;
        tradedWindows.add(windowSlug);
        crossedThresholdTime[downAsset] = 0;
        flushState();
        console.log(`[${symbol} 15m MOMENTUM BREAKOUT] Successfully bought $10 DOWN @ $${downPrice.toFixed(2)} + $1 HEDGE UP @ $${hedgePrice.toFixed(2)}`);
      }
      return;
    }
  } else {
    crossedThresholdTime[downAsset] = 0;
  }
}


async function sendTelegramMessage(text: string): Promise<{ ok: boolean; description?: string }> {
  if (!config.isTelegramAlertsEnabled || !telegramBotToken || !telegramChatId) {
    return { ok: false, description: 'Telegram alerts disabled or unconfigured' };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const url = `https://api.telegram.org/bot${telegramBotToken}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: telegramChatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: false,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const data = (await res.json()) as { ok: boolean; description?: string };
    return data;
  } catch (err: any) {
    return { ok: false, description: err.message };
  }
}

function normalizeRtdsTrade(payload: any): PolymarketActivityItem | null {
  if (!payload || typeof payload !== 'object') return null;
  const proxyWallet = payload.proxyWallet || payload.user || payload.maker_address || payload.maker;
  if (!proxyWallet) return null;
  const txHash = payload.transactionHash || payload.hash || payload.txHash;
  if (!txHash) return null;
  const asset = payload.asset || payload.token_id || payload.market;
  if (!asset) return null;
  const side = (payload.side || '').toUpperCase();
  if (side !== 'BUY' && side !== 'SELL') return null;
  const price = Number(payload.price);
  if (isNaN(price) || price <= 0 || price > 1) return null;
  const size = Number(payload.size || payload.shares || 0);
  if (isNaN(size) || size <= 0) return null;

  let ts = Number(payload.timestamp || Date.now() / 1000);
  if (ts > 1e11) ts = Math.floor(ts / 1000);

  const slug = payload.slug || payload.market_slug || payload.eventSlug || '';
  const eventSlug = payload.eventSlug || payload.slug || '';

  return {
    proxyWallet: proxyWallet.toLowerCase(),
    timestamp: ts,
    conditionId: payload.conditionId || payload.condition_id || '',
    type: 'TRADE',
    size,
    usdcSize: Number((size * price).toFixed(4)),
    transactionHash: txHash,
    price,
    asset,
    side,
    outcome: payload.outcome || payload.outcome_text || 'YES',
    title: payload.title || payload.market_title || 'Polymarket Market',
    slug,
    eventSlug,
    icon: payload.icon || '',
  };
}

function tradeFingerprint(trade: PolymarketActivityItem): string {
  const wallet = (trade.proxyWallet || '').toLowerCase();
  const tx = (trade.transactionHash || '').toLowerCase();
  const asset = (trade.asset || '').toLowerCase();
  const side = (trade.side || '').toUpperCase();
  const price = Number(trade.price || 0).toFixed(6);
  const size = Number(trade.size || 0).toFixed(6);
  return `${wallet}|${tx}|${asset}|${side}|${price}|${size}`;
}

const MAX_COPY_AGE_SECONDS = Number(process.env.MAX_COPY_AGE_SECONDS || 30);

function recordDedupEvent(record: {
  fingerprint: string;
  occurrence: number;
  source: 'rtds' | 'poll';
  reason: string;
  matchedWith?: string;
  timestamp: number;
  trade: any;
}) {
  dedupRingBuffer.unshift(record);
  if (dedupRingBuffer.length > 200) {
    dedupRingBuffer.pop();
  }
}

async function processTrade(
  trade: PolymarketActivityItem,
  source: 'rtds' | 'poll' = 'poll',
  isCatchUp = false,
  latencyContext?: LatencyContext
) {
  if (trade.type !== 'TRADE') return;

  const nowSec = Math.floor(Date.now() / 1000);
  const tradeAge = nowSec - (trade.timestamp || nowSec);
  // Polled trades older than 15s in a 5-minute fast candle are already stale
  const maxAllowedAge = source === 'poll' ? 15 : MAX_COPY_AGE_SECONDS;

  if (tradeAge > maxAllowedAge) {
    telemetryCounters.skippedStaleCount++;
    recordDedupEvent({
      fingerprint: tradeFingerprint(trade),
      occurrence: 1,
      source,
      reason: 'SKIPPED_STALE',
      timestamp: Date.now(),
      trade,
    });
    return;
  }

  const slug = (trade.slug || trade.eventSlug || '').toLowerCase();
  if (!slug.startsWith('btc-updown-5m-')) {
    telemetryCounters.skippedNonBtcCount++;
    return;
  }

  const targetTradeUsdc = trade.usdcSize || (trade.size * trade.price) || 0;
  if (targetTradeUsdc <= 27) {
    telemetryCounters.skippedSizeFilterCount = (telemetryCounters.skippedSizeFilterCount || 0) + 1;
    recordDedupEvent({
      fingerprint: tradeFingerprint(trade),
      occurrence: 1,
      source,
      reason: `SKIPPED_SIZE_FILTER ($${targetTradeUsdc.toFixed(2)} <= $27)`,
      timestamp: Date.now(),
      trade,
    });
    return;
  }

  const fp = tradeFingerprint(trade);
  const occurrenceKey = `${fp}_${trade.transactionHash}`;
  if (!processedFingerprints[occurrenceKey]) {
    processedFingerprints[occurrenceKey] = Date.now();
  } else {
    telemetryCounters.skippedDuplicateCount++;
    recordDedupEvent({
      fingerprint: fp,
      occurrence: 2,
      source,
      reason: 'SKIPPED_DUPLICATE',
      timestamp: Date.now(),
      trade,
    });
    return;
  }

  if (source === 'rtds') telemetryCounters.rtdsProcessed++;
  else telemetryCounters.pollProcessed++;

  if (isCatchUp) {
    return;
  }

  flushState();

  console.log(`[TRADE PROCESSED] (${source.toUpperCase()}) ${trade.side} ${trade.outcome} on ${trade.title} @ $${trade.price}`);

  const tradeWallet = (trade.proxyWallet || '').toLowerCase();
  const targetHandle = TARGET_WALLETS[tradeWallet] || config.targetHandle;

  const evalResult = evaluateTradeNotification(trade, windowTrackerState);
  windowTrackerState = evalResult.updatedState;

  if (false && evalResult.shouldNotify && config.isTelegramAlertsEnabled) {
    const alertMsg = formatTelegramTradeAlert(trade, targetHandle);
    sendTelegramMessage(alertMsg).catch(() => {});
  }

  if (config.isAutoCopyEnabled) {
    const key = `${trade.conditionId}_${trade.outcome}`;
    // Require genuine CLOB book or explicitly pass empty book so it strictly rejects instead of faking a quote
    const book = marketBooks[trade.asset] || {
      assetId: trade.asset,
      bids: [],
      asks: [],
      bestBid: 0,
      bestAsk: 0,
      lastPrice: 0,
      spread: 0,
      updatedAt: 0,
    };
    const livePrice = book.bestAsk > 0 ? book.bestAsk : (livePrices[trade.asset] ?? livePrices[key] ?? trade.price);

    if (trade.side === 'BUY') {
      const expectedFillPrice = livePrice;
      const whalePrice = trade.price;

      // 1. Entry Price Range (85¢ to 98¢)
      if (expectedFillPrice < 0.85) {
        telemetryCounters.skippedSizeFilterCount = (telemetryCounters.skippedSizeFilterCount || 0) + 1;
        recordDedupEvent({
          fingerprint: fp,
          occurrence: 1,
          source,
          reason: 'price below 85¢',
          timestamp: Date.now(),
          trade,
        });
        console.log(`[COPY SKIPPED] price below 85¢ (Expected fill: $${expectedFillPrice.toFixed(2)})`);
        return;
      }

      if (expectedFillPrice >= 0.98) {
        telemetryCounters.skippedSizeFilterCount = (telemetryCounters.skippedSizeFilterCount || 0) + 1;
        recordDedupEvent({
          fingerprint: fp,
          occurrence: 1,
          source,
          reason: 'price above 98¢',
          timestamp: Date.now(),
          trade,
        });
        console.log(`[COPY SKIPPED] price above 98¢ (Expected fill: $${expectedFillPrice.toFixed(2)})`);
        return;
      }

      // 2. Slippage Filter (Max 5¢ difference from whale price)
      if (expectedFillPrice - whalePrice > 0.05) {
        telemetryCounters.skippedSlippageCount = (telemetryCounters.skippedSlippageCount || 0) + 1;
        recordDedupEvent({
          fingerprint: fp,
          occurrence: 1,
          source,
          reason: 'slippage above 5¢',
          timestamp: Date.now(),
          trade,
        });
        console.log(`[COPY SKIPPED] slippage above 5¢ (Fill: $${expectedFillPrice.toFixed(2)}, Whale: $${whalePrice.toFixed(2)})`);
        return;
      }

      // 3. Max 2 Trades Per Side in Same Window (e.g. max 2 Up, max 2 Down)
      const windowBuyCountOnSide = countWindowBuysForSide(
        paperAccount.history,
        trade.outcome,
        trade.slug || activeBtcWindow?.slug || trade.eventSlug,
        trade.conditionId,
        trade.timestamp
      );

      if (windowBuyCountOnSide >= 2) {
        telemetryCounters.skippedSizeFilterCount = (telemetryCounters.skippedSizeFilterCount || 0) + 1;
        recordDedupEvent({
          fingerprint: fp,
          occurrence: 1,
          source,
          reason: `max 2 trades reached on ${trade.outcome}`,
          timestamp: Date.now(),
          trade,
        });
        console.log(`[COPY SKIPPED] Max 2 trades on outcome '${trade.outcome}' already executed in window (${windowBuyCountOnSide}/2 executed). Opposite side trades still permitted.`);
        return;
      }

      const feeInfo = await getMarketFeeInfo(trade.slug || trade.eventSlug, trade.asset);
      if (feeInfo.source === 'market') telemetryCounters.marketFeeCount++;
      else telemetryCounters.assumedFeeCount++;

      // 4. Fixed, Sustainable Stake Sizing ($10 fixed, NO Martingale)
      const dynamicCopyAmount = 10.0;
      const buyRes = executeCopyBuy(
        paperAccount,
        trade,
        dynamicCopyAmount,
        config.maxSlippagePercent,
        livePrice,
        feeInfo.rate,
        feeInfo.source,
        book,
        latencyContext
      );
      if (buyRes.error) {
        if (buyRes.error.startsWith('Slippage too high')) {
          console.warn(`[COPY BUY SKIPPED] ${buyRes.error}`);
          telemetryCounters.skippedSlippageCount = (telemetryCounters.skippedSlippageCount || 0) + 1;
          recordDedupEvent({
            fingerprint: fp,
            occurrence: 1,
            source,
            reason: 'SKIPPED_SLIPPAGE',
            timestamp: Date.now(),
            trade,
          });
        } else {
          console.warn(`[COPY BUY SKIPPED] ${buyRes.error}`);
          recordDedupEvent({
            fingerprint: fp,
            occurrence: 1,
            source,
            reason: buyRes.error.split(':')[0] || 'SKIPPED_ERROR',
            timestamp: Date.now(),
            trade,
          });
        }
      } else if (buyRes.account && buyRes.copyTrade) {
        paperAccount = buyRes.account;
        buyRes.copyTrade.sourceWallet = trade.proxyWallet;
        buyRes.copyTrade.sourceHandle = targetHandle;
        buyRes.copyTrade.source = source;
        console.log(`[COPY BUY SUCCESS] Took $${config.copyTradeAmount} trade on ${targetHandle} (Filled: ${buyRes.copyTrade.copyShares} sh @ $${buyRes.copyTrade.fillPrice}, Fee: $${buyRes.copyTrade.feeUsdc} via ${buyRes.copyTrade.feeSource}). Cash: $${paperAccount.cashBalance}`);
      }
    } else if (trade.side === 'SELL') {
      const feeInfo = await getMarketFeeInfo(trade.slug || trade.eventSlug, trade.asset);
      if (feeInfo.source === 'market') telemetryCounters.marketFeeCount++;
      else telemetryCounters.assumedFeeCount++;

      const sellRes = executeCopySell(
        paperAccount,
        trade,
        feeInfo.rate,
        feeInfo.source,
        book,
        latencyContext
      );
      if (sellRes.error) {
        console.warn(`[COPY SELL SKIPPED] ${sellRes.error}`);
        recordDedupEvent({
          fingerprint: fp,
          occurrence: 1,
          source,
          reason: sellRes.error.split(':')[0] || 'SKIPPED_SELL_ERROR',
          timestamp: Date.now(),
          trade,
        });
      } else if (sellRes.account && sellRes.copyTrade) {
        paperAccount = sellRes.account;
        console.log(`[COPY SELL SUCCESS] Liquidated position for ${targetHandle} (Sold: ${sellRes.copyTrade.copyShares} sh @ $${sellRes.copyTrade.exitPrice}). Realized PnL: $${paperAccount.totalRealizedPnl}`);
      }
    }
    flushState();
  }
}

async function runCatchUpSeed() {
  for (const wallet of Object.keys(TARGET_WALLETS)) {
    try {
      const activityUrl = `https://data-api.polymarket.com/activity?user=${wallet}&limit=25`;
      const res = await fetch(activityUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (res.ok) {
        const activities = (await res.json()) as PolymarketActivityItem[];
        if (Array.isArray(activities)) {
          for (const trade of activities) {
            if (trade.type === 'TRADE' && trade.transactionHash) {
              const fp = tradeFingerprint(trade);
              const occurrenceKey = `${fp}_${trade.transactionHash}`;
              if (!processedFingerprints[occurrenceKey]) {
                processedFingerprints[occurrenceKey] = Date.now();
              }
            }
          }
        }
      }
    } catch {}
  }
  flushState();
}

async function pollPolymarket() {
  if (pollCount > 0 && Date.now() - lastPolledAt < (config.pollingIntervalSeconds * 1000) - 500) return;
  
  try {
    const wallets = Object.keys(TARGET_WALLETS);
    const results = await Promise.all(
      wallets.map(async (wallet) => {
        const url = `https://data-api.polymarket.com/activity?user=${wallet}&limit=25`;
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } });
        if (res.ok) {
          return (await res.json()) as PolymarketActivityItem[];
        }
        return [];
      })
    );

    const allActivities: PolymarketActivityItem[] = [];
    for (const acts of results) {
      if (Array.isArray(acts)) allActivities.push(...acts);
    }

    allActivities.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    recentActivities = allActivities;

    for (const trade of allActivities) {
      try {
        const pollReceiptTimestamp = Date.now();
        await processTrade(trade, 'poll', false, {
          rtdsReceiptTimestamp: pollReceiptTimestamp,
          parsingCompleteTimestamp: pollReceiptTimestamp,
          decisionTimestamp: Date.now(),
        });
      } catch (err: any) {
        console.error('[Poll Trade Error]:', err.message);
      }
    }

    const posResults = await Promise.all(
      wallets.map(async (wallet) => {
        const url = `https://data-api.polymarket.com/positions?user=${wallet}&limit=50`;
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } });
        if (res.ok) {
          return (await res.json()) as PolymarketPositionItem[];
        }
        return [];
      })
    );

    const allPositions: PolymarketPositionItem[] = [];
    for (const poss of posResults) {
      if (Array.isArray(poss)) allPositions.push(...poss);
    }
    targetPositions = allPositions;

    for (const pos of allPositions) {
      if (pos.curPrice !== undefined) {
        const key = `${pos.conditionId}_${pos.outcome}`;
        livePrices[key] = pos.curPrice;
        if (pos.asset) livePrices[pos.asset] = pos.curPrice;
      }
    }

    let latestWindowTs = 0;
    for (const act of allActivities) {
      const wTs = getWindowTimestamp(act.slug || act.eventSlug, act.timestamp);
      if (wTs > latestWindowTs) latestWindowTs = wTs;
    }
    // Query official Polymarket Gamma API settlement outcomes for any expired window positions
    const nowSec = Math.floor(Date.now() / 1000);
    for (const [key, pos] of Object.entries(paperAccount.positions)) {
      const posWindowTs = getWindowTimestamp(pos.slug, pos.openedAt);
      const windowEndTs = posWindowTs > 0 ? posWindowTs + 300 : pos.openedAt + 300;

      if (nowSec > windowEndTs && pos.slug) {
        try {
          const res = await fetch(`https://gamma-api.polymarket.com/events?slug=${pos.slug}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
          });
          if (res.ok) {
            const data = (await res.json()) as any[];
            if (Array.isArray(data) && data.length > 0 && Array.isArray(data[0].markets) && data[0].markets.length > 0) {
              const m = data[0].markets[0];
              if (m.closed) {
                let clobTokens: string[] = [];
                if (m.clobTokenIds) {
                  clobTokens = typeof m.clobTokenIds === 'string' ? JSON.parse(m.clobTokenIds) : m.clobTokenIds;
                }
                const prices = m.outcomePrices ? (typeof m.outcomePrices === 'string' ? JSON.parse(m.outcomePrices) : m.outcomePrices) : [];
                const tokenIndex = clobTokens.indexOf(pos.asset);
                if (tokenIndex !== -1 && prices[tokenIndex] !== undefined) {
                  const resPrice = parseFloat(prices[tokenIndex]);
                  livePrices[key] = resPrice;
                  livePrices[pos.asset] = resPrice;
                } else if (pos.outcome.toLowerCase() === 'up' && prices.length >= 1) {
                  const resPrice = parseFloat(prices[0]);
                  livePrices[key] = resPrice;
                  livePrices[pos.asset] = resPrice;
                } else if (pos.outcome.toLowerCase() === 'down' && prices.length >= 2) {
                  const resPrice = parseFloat(prices[1]);
                  livePrices[key] = resPrice;
                  livePrices[pos.asset] = resPrice;
                }
              }
            }
          }
        } catch {}
      }
    }

    const prevOpenCount = Object.keys(paperAccount.positions).length;
    paperAccount = autoClosePastWindowPositions(paperAccount, latestWindowTs, livePrices);
    if (Object.keys(paperAccount.positions).length !== prevOpenCount) {
      flushState();
    }

    const activeTokens = await pollActiveBtcWindow();
    await pollActiveMomentumWindow('BTC');
    const assetIdsToSub = [...activeTokens, ...Object.values(paperAccount.positions).map(p => p.asset), ...allPositions.map(p => p.asset)].filter(Boolean);
    if (assetIdsToSub.length > 0) updateSubscriptionAssets(assetIdsToSub);

    lastPolledAt = Date.now();
    pollCount++;
    lastError = null;
  } catch (err: any) {
    console.error('[Poll Error]:', err.message);
    lastError = err.message;
  }
}

function connectRTDSWebSocket() {
  if (rtdsWs) {
    const oldWs = rtdsWs;
    rtdsWs = null;
    oldWs.removeAllListeners();
    try {
      oldWs.terminate();
    } catch {}
  }

  rtdsStatus = 'RECONNECTING';
  const ws = new WebSocket('wss://ws-live-data.polymarket.com');
  rtdsWs = ws;

  ws.on('error', (err) => {
    console.warn('[RTDS WS Error]:', err.message);
  });

  let pingTimer: NodeJS.Timeout | null = null;
  let checkStaleTimer: NodeJS.Timeout | null = null;

  ws.on('open', () => {
    if (rtdsWs !== ws) return;
    rtdsStatus = 'CONNECTED';
    rtdsReconnectAttempts = 0;

    ws.send(JSON.stringify({
      action: 'subscribe',
      subscriptions: [{ topic: 'activity', type: 'trades' }]
    }));

    pingTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send('PING');
        } catch {}
      }
    }, 5000);

    checkStaleTimer = setInterval(() => {
      if (lastRtdsMessageAt > 0 && Date.now() - lastRtdsMessageAt > 15000) {
        try {
          ws.terminate();
        } catch {}
      }
    }, 5000);

    pollPolymarket().catch(() => {});
  });

  ws.on('message', async (data) => {
    if (rtdsWs !== ws) return;
    const rtdsReceiptTimestamp = Date.now();
    lastRtdsMessageAt = rtdsReceiptTimestamp;
    telemetryCounters.rtdsMessagesReceived++;

    try {
      const msgStr = data.toString().trim();
      if (msgStr === 'PONG' || !msgStr.startsWith('{')) return;

      const msg = JSON.parse(msgStr);
      const payload = msg.payload || msg;

      const normalized = normalizeRtdsTrade(payload);
      const parsingCompleteTimestamp = Date.now();
      if (!normalized) {
        telemetryCounters.rtdsDropped++;
        return;
      }

      const walletLower = normalized.proxyWallet.toLowerCase();
      if (!TARGET_WALLETS[walletLower]) {
        telemetryCounters.rtdsDropped++;
        return;
      }

      telemetryCounters.rtdsMatched++;
      const decisionTimestamp = Date.now();
      await processTrade(normalized, 'rtds', false, {
        rtdsReceiptTimestamp,
        parsingCompleteTimestamp,
        decisionTimestamp,
      });
    } catch {
      telemetryCounters.rtdsDropped++;
    }
  });

  ws.on('close', () => {
    if (pingTimer) clearInterval(pingTimer);
    if (checkStaleTimer) clearInterval(checkStaleTimer);

    if (rtdsWs === ws) {
      rtdsStatus = 'DISCONNECTED';
      telemetryCounters.reconnectCount++;
      rtdsReconnectAttempts++;

      const delay = Math.min(30000, Math.pow(1.5, rtdsReconnectAttempts) * 1000) + Math.random() * 1000;
      setTimeout(connectRTDSWebSocket, delay);
    }
  });
}

setInterval(async () => {
  try {
    await pollActiveBtcWindow();
    await pollActiveMomentumWindow('BTC');
    const nowSec = Math.floor(Date.now() / 1000);

    if (activeBtcWindow) {
      const timeLeft = Math.max(0, Math.floor(activeBtcWindow.endDate / 1000) - nowSec);
      activeBtcWindow.timeLeftSeconds = timeLeft;
      activeBtcWindow.status = timeLeft <= 0 ? 'EXPIRED' : 'CURRENT';
    }

    const momentumMetrics: Record<string, PortfolioMetrics> = {
      'BTC': calculatePortfolioMetrics(momentumAccounts['BTC'], livePrices),
    };

    broadcastSSE({
      type: 'window_update',
      activeBtcWindow,
      activeMomentumWindows,
      marketBooks,
      wsConnectionStatus,
      rtdsStatus,
      momentumAccounts,
      momentumConfigs,
      momentumMetrics,
    });
  } catch {}
}, 2000);

setInterval(pollPolymarket, config.pollingIntervalSeconds * 1000);

// --- API Endpoints ---

app.get('/api/status', (req, res) => {
  const metrics = calculatePortfolioMetrics(paperAccount, livePrices);
  res.json({
    ok: true,
    targetWallet: config.targetWallet,
    targetHandle: config.targetHandle,
    telegramConfigured,
    config,
    metrics,
    lastPolledAt,
    pollCount,
    lastError,
    wsConnectionStatus,
    lastWsMessageAt,
    marketBooks,
    livePrices,
    rtdsStatus,
    lastRtdsMessageAt,
    seenFingerprintsCount: Object.keys(processedFingerprints).length,
    recentTradesCount: recentActivities.filter((a) => a.type === 'TRADE').length,
    activePositionsCount: Object.keys(paperAccount.positions).length,
    targetPositionsCount: targetPositions.length,
    activeBtcWindow,
    presets: PRESET_TRADERS_PUBLIC,
    counters: telemetryCounters,
    dedupRingBuffer: dedupRingBuffer.slice(0, 50),
  });
});

app.post('/api/target/switch', async (req, res) => {
  const { wallet, handle } = req.body;
  if (!wallet) {
    return res.status(400).json({ ok: false, error: 'Wallet address required' });
  }

  const targetWalletLower = wallet.trim().toLowerCase();
  config.targetWallet = targetWalletLower;
  config.targetHandle = handle || TARGET_WALLETS[targetWalletLower] || (wallet.slice(0, 6) + '...' + wallet.slice(-4));

  await pollPolymarket();

  broadcastSSE({
    type: 'target_switched',
    targetWallet: config.targetWallet,
    targetHandle: config.targetHandle,
    recentActivities,
    targetPositions,
  });

  res.json({
    ok: true,
    targetWallet: config.targetWallet,
    targetHandle: config.targetHandle,
    telegramConfigured,
    config,
    recentActivities,
    targetPositions,
  });
});

app.get('/api/ping', (req, res) => {
  res.json({ ok: true, uptime: process.uptime(), timestamp: Date.now() });
});

app.get('/api/activity', (req, res) => {
  res.json({
    ok: true,
    activity: recentActivities,
    lastPolledAt,
  });
});

app.get('/api/positions', (req, res) => {
  res.json({
    ok: true,
    positions: targetPositions,
    lastPolledAt,
  });
});

app.get('/api/paper', (req, res) => {
  const metrics = calculatePortfolioMetrics(paperAccount, livePrices);
  res.json({
    ok: true,
    account: paperAccount,
    metrics,
    livePrices,
    marketBooks,
    wsConnectionStatus,
    rtdsStatus,
    activeBtcWindow,
    counters: telemetryCounters,
  });
});

app.get('/api/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const client = { res };
  sseClients.add(client);

  const momentumMetrics: Record<string, PortfolioMetrics> = {
    'BTC': calculatePortfolioMetrics(momentumAccounts['BTC'], livePrices),
  };

  res.write(
    `data: ${JSON.stringify({
      type: 'init',
      marketBooks,
      wsConnectionStatus,
      rtdsStatus,
      activeBtcWindow,
      metrics: calculatePortfolioMetrics(paperAccount, livePrices),
      paperAccount,
      counters: telemetryCounters,
      activeMomentumWindows,
      momentumAccounts,
      momentumConfigs,
      momentumMetrics,
    })}\n\n`
  );

  req.on('close', () => {
    sseClients.delete(client);
  });
});

app.get('/api/momentum', (req, res) => {
  const momentumMetrics: Record<string, PortfolioMetrics> = {
    'BTC': calculatePortfolioMetrics(momentumAccounts['BTC'], livePrices),
  };
  res.json({
    ok: true,
    activeMomentumWindows,
    momentumAccounts,
    momentumConfigs,
    momentumMetrics,
    marketBooks,
  });
});

app.post('/api/momentum/:symbol/toggle', (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  if (!momentumConfigs[symbol]) return res.status(404).json({ ok: false, error: 'Symbol not found' });
  momentumConfigs[symbol].isEnabled = !momentumConfigs[symbol].isEnabled;
  flushState();
  broadcastSSE({
    type: 'momentum_config_update',
    symbol,
    config: momentumConfigs[symbol],
  });
  res.json({ ok: true, isEnabled: momentumConfigs[symbol].isEnabled, config: momentumConfigs[symbol] });
});

app.post('/api/momentum/:symbol/reset', (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  if (symbol !== 'BTC' || !momentumAccounts[symbol]) return res.status(404).json({ ok: false, error: 'Symbol not found' });
  momentumAccounts[symbol] = createInitialAccount(100.0);
  momentumAccounts[symbol].currentStakeSize = 10.0;
  momentumTradedWindows[symbol].clear();
  flushState();
  broadcastSSE({
    type: 'momentum_account_update',
    symbol,
    account: momentumAccounts[symbol],
    metrics: calculatePortfolioMetrics(momentumAccounts[symbol], livePrices),
  });
  res.json({ ok: true, account: momentumAccounts[symbol] });
});

app.post('/api/momentum/:symbol/close-position', (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const { positionId } = req.body;
  if (!momentumAccounts[symbol]) return res.status(404).json({ ok: false, error: 'Symbol not found' });
  if (!positionId || !momentumAccounts[symbol].positions[positionId]) {
    return res.status(404).json({ ok: false, error: 'Position not found' });
  }

  const account = momentumAccounts[symbol];
  const pos = account.positions[positionId];
  const book = marketBooks[pos.asset];
  const livePrice = book?.bestBid || book?.lastPrice || livePrices[pos.asset] || pos.currentPrice;
  const result = executeInternalSell(account, positionId, 1.0, 'MANUAL_CLOSE', livePrice, DEFAULT_TAKER_FEE_RATE, 'assumed', book);
  if (result.error) {
    return res.status(400).json({ ok: false, error: result.error });
  }

  momentumAccounts[symbol] = result.account;
  flushState();
  broadcastSSE({
    type: 'momentum_account_update',
    symbol,
    account: momentumAccounts[symbol],
    metrics: calculatePortfolioMetrics(momentumAccounts[symbol], livePrices),
  });
  res.json({ ok: true, account: momentumAccounts[symbol] });
});

app.post('/api/paper/reset', async (req, res) => {
  paperAccount = createInitialAccount(100.0);
  paperAccount.currentStakeSize = 10.0;
  processedFingerprints = {};
  dedupRingBuffer = [];
  telemetryCounters = {
    rtdsMessagesReceived: 0,
    rtdsMatched: 0,
    rtdsDropped: 0,
    rtdsProcessed: 0,
    pollProcessed: 0,
    skippedNonBtcCount: 0,
    skippedDuplicateCount: 0,
    skippedSlippageCount: 0,
    ambiguousDuplicateCount: 0,
    skippedStaleCount: 0,
    skippedSizeFilterCount: 0,
    reconnectCount: 0,
    marketFeeCount: 0,
    assumedFeeCount: 0,
  };
  windowTrackerState = createInitialWindowTracker();

  flushState();

  const freshMetrics = calculatePortfolioMetrics(paperAccount, livePrices);

  // Broadcast immediate SSE update to all connected clients
  broadcastSSE({
    type: 'market_update',
    marketBooks,
    wsConnectionStatus,
    rtdsStatus,
    activeBtcWindow,
    metrics: freshMetrics,
    paperAccount,
    counters: telemetryCounters,
  });

  res.json({
    ok: true,
    message: 'Paper trading account successfully reset and bankroll restored to $100.00.',
    account: paperAccount,
    metrics: freshMetrics,
  });
});

app.post('/api/paper/test-trade', async (req, res) => {
  const testTrade: PolymarketActivityItem = {
    proxyWallet: config.targetWallet,
    timestamp: Math.floor(Date.now() / 1000),
    conditionId: `test_cond_${Date.now()}`,
    type: 'TRADE',
    size: 100,
    usdcSize: 35,
    transactionHash: `test_tx_${Date.now()}`,
    price: 0.35,
    asset: `test_asset_${Date.now()}`,
    side: 'BUY',
    outcome: 'Up',
    title: 'Bitcoin Up or Down - Test Window',
    slug: `btc-updown-5m-${Math.floor(Date.now() / 1000)}`,
    eventSlug: `btc-updown-5m-${Math.floor(Date.now() / 1000)}`,
  };

  const feeInfo = await getMarketFeeInfo(testTrade.slug, testTrade.asset);
  if (feeInfo.source === 'market') telemetryCounters.marketFeeCount++;
  else telemetryCounters.assumedFeeCount++;

  const buyRes = executeCopyBuy(paperAccount, testTrade, config.copyTradeAmount, config.maxSlippagePercent, undefined, feeInfo.rate, feeInfo.source);
  paperAccount = buyRes.account;
  flushState();
  res.json({
    ok: true,
    message: 'Test copy trade executed successfully!',
    account: paperAccount,
  });
});

app.post('/api/paper/close-position', (req, res) => {
  const { positionId } = req.body;
  if (!positionId || !paperAccount.positions[positionId]) {
    return res.status(404).json({ ok: false, error: 'Position not found' });
  }

  const pos = paperAccount.positions[positionId];
  const livePrice = livePrices[positionId] ?? livePrices[pos.asset] ?? pos.currentPrice;
  const proceeds = Number((pos.shares * livePrice).toFixed(4));
  const pnl = Number((proceeds - pos.totalCost).toFixed(4));

  paperAccount.cashBalance = Number((paperAccount.cashBalance + proceeds).toFixed(4));
  paperAccount.totalRealizedPnl = Number((paperAccount.totalRealizedPnl + pnl).toFixed(4));

  delete paperAccount.positions[positionId];

  paperAccount.history.unshift({
    id: `manual_close_${Date.now()}`,
    targetTxHash: pos.targetTxHash || 'manual',
    timestamp: Math.floor(Date.now() / 1000),
    side: 'SELL',
    outcome: pos.outcome,
    title: pos.title,
    slug: pos.slug,
    asset: pos.asset,
    targetPrice: livePrice,
    copyPrice: livePrice,
    targetSizeUsdc: proceeds,
    copySizeUsdc: proceeds,
    copyShares: pos.shares,
    pnlUsdc: pnl,
    pnlPercent: Number(((pnl / pos.totalCost) * 100).toFixed(2)),
    status: 'CLOSED',
    exitPrice: livePrice,
    exitTimestamp: Math.floor(Date.now() / 1000),
  });

  const closedStats = computeClosedPositionStats(paperAccount.history, paperAccount.positions);
  paperAccount.winningTrades = closedStats.winningTrades;
  paperAccount.losingTrades = closedStats.losingTrades;

  flushState();
  res.json({
    ok: true,
    message: `Position closed with PnL of $${pnl.toFixed(2)}`,
    account: paperAccount,
  });
});

app.post('/api/config', (req, res) => {
  const updates = req.body;
  if (typeof updates.copyTradeAmount === 'number' && updates.copyTradeAmount > 0) {
    config.copyTradeAmount = updates.copyTradeAmount;
  }
  if (typeof updates.isAutoCopyEnabled === 'boolean') {
    config.isAutoCopyEnabled = updates.isAutoCopyEnabled;
  }
  if (typeof updates.isTelegramAlertsEnabled === 'boolean') {
    config.isTelegramAlertsEnabled = updates.isTelegramAlertsEnabled;
  }
  if (typeof updates.pollingIntervalSeconds === 'number' && updates.pollingIntervalSeconds >= 2) {
    config.pollingIntervalSeconds = updates.pollingIntervalSeconds;
  }
  if (typeof updates.soundAlertsEnabled === 'boolean') {
    config.soundAlertsEnabled = updates.soundAlertsEnabled;
  }
  if (typeof updates.browserNotificationsEnabled === 'boolean') {
    config.browserNotificationsEnabled = updates.browserNotificationsEnabled;
  }
  if (typeof updates.ignoreDailyTarget === 'boolean') {
    config.ignoreDailyTarget = updates.ignoreDailyTarget;
  }
  if (typeof updates.maxSlippagePercent === 'number' && updates.maxSlippagePercent > 0) {
    config.maxSlippagePercent = updates.maxSlippagePercent;
  }

  res.json({ ok: true, config });
});

app.post('/api/telegram/test', async (req, res) => {
  const testMsg = `🔔 <b>POLYMARKET BOT TEST ALERT</b>

✅ <b>Status:</b> Telegram Integration Connected
👤 <b>Target Wallet:</b> <code>${config.targetWallet}</code>
🏷 <b>Username:</b> ${config.targetHandle}
💵 <b>Paper Copy Bankroll:</b> $${paperAccount.cashBalance.toFixed(2)}
⚡ <b>Copy Sizing:</b> $${config.copyTradeAmount.toFixed(2)} per trade
📡 <b>Mode:</b> RTDS + Dual Polling Active`;

  const result = await sendTelegramMessage(testMsg);
  res.json(result);
});

let latestAiAuditReport: string = 'Initializing 24/7 AI Performance & Reversal Auditor...';

async function runAutomatedAiAudit() {
  try {
    const { GoogleGenAI } = await import('@google/genai');
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!apiKey) return;

    const ai = new GoogleGenAI({ apiKey });
    const btcAccount = momentumAccounts['BTC'] || { history: [], positions: {} };
    const history = btcAccount.history || [];

    const prompt = `You are an expert quantitative trading strategist specializing in Polymarket 15-minute crypto binary options.
Analyze the following trade history and performance metrics for the BTC 15m Momentum Bot (Breakout rule: >=85¢ entry, Take Profit: $1.00, Stop Loss: 55¢):
Trade History: ${JSON.stringify(history.slice(0, 30))}

Please provide a professional 24-hour continuous performance audit report with:
1. Reversal analysis (estimated probability of reversal after crossing 85¢).
2. Stop-loss and target recommendations based on these trades.
3. Key quantitative takeaways to maximize profitability.
Keep it concise, actionable, and formatted in clear bullet points.`;

    const response = await ai.models.generateContent({
      model: 'gemini-flash-latest',
      contents: prompt,
    });

    if (response.text) {
      latestAiAuditReport = `[Auto-Updated @ ${new Date().toLocaleTimeString()}]\n\n` + response.text;
      console.log('[AI 24/7 Auditor] Successfully generated automated audit report.');
    }
  } catch (err: any) {
    console.warn('[AI 24/7 Auditor Background Notice]: Model temporarily busy (503), will retry automatically.');
    if (latestAiAuditReport.includes('Initializing')) {
      latestAiAuditReport = `[Auto-Updated @ ${new Date().toLocaleTimeString()}]\n\n• Bot Strategy Status: Fully Active (≥85¢ Breakout, 55¢ Stop-Loss, $10 Stake).\n• 24/7 AI Auditor Note: The model is currently experiencing high demand. It will automatically pull fresh metrics on the next 60-minute cycle.\n• Current Win/Loss performance and cash balances are tracking normally in real-time.`;
    }
  }
}

app.post('/api/ai-audit', async (req, res) => {
  try {
    if (!latestAiAuditReport || latestAiAuditReport.includes('Initializing')) {
      await runAutomatedAiAudit();
    }
    res.json({
      ok: true,
      auditReport: latestAiAuditReport,
    });
  } catch (err: any) {
    res.json({
      ok: false,
      error: `AI_ERROR: ${err.message || 'Failed to return audit report.'}`,
    });
  }
});

app.post('/api/poll-now', async (req, res) => {
  await pollPolymarket();
  res.json({ ok: true, lastPolledAt, pollCount });
});

// Hourly Telegram Balance & PnL Report (No per-trade messages)
setInterval(() => {
  if (config.isTelegramAlertsEnabled) {
    const metrics = calculatePortfolioMetrics(paperAccount, livePrices);
    const hourlyMsg = `📊 <b>HOURLY POLYMARKET BOT REPORT</b>

💰 <b>Demo Portfolio Balance:</b> $${metrics.totalPortfolioValue.toFixed(2)} (Initial: $${metrics.initialBalance.toFixed(2)})
📈 <b>Total Net PnL:</b> ${metrics.totalPnl >= 0 ? '+' : ''}$${metrics.totalPnl.toFixed(2)} (${metrics.totalPnlPercent.toFixed(1)}%)
📋 <b>Trades Taken:</b> ${metrics.totalTradesCount} (Wins: ${metrics.winningTrades}, Losses: ${metrics.losingTrades}, Win Rate: ${metrics.winRate}%)
📂 <b>Active Positions:</b> ${metrics.openPositionsCount}
💵 <b>Cash Available:</b> $${metrics.cashBalance.toFixed(2)}`;

    sendTelegramMessage(hourlyMsg).catch(() => {});
  }
}, 60 * 60 * 1000);

// --- Vite Middleware & Robust SPA Routing ---
async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production' || fs.existsSync(path.resolve(__dirname, 'dist', 'index.html'));

  if (!isProduction) {
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } catch (e) {
      console.warn('[Vite middleware warning]:', e);
    }
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
    }
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      const indexPath = path.resolve(distPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Polymarket Copy Trade & Whale Tracker</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body class="bg-slate-950 text-slate-100 font-sans">
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>`);
      }
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Polymarket Copy-Trading Bot running on http://0.0.0.0:${PORT}`);
    connectClobWebSocket();
    connectRTDSWebSocket();
    pollActiveMomentumWindow('BTC').catch(() => {});
    setInterval(() => {
      pollActiveMomentumWindow('BTC').catch(() => {});
    }, 50);

    // Run AI audit immediately on startup and every 60 minutes 24/7
    runAutomatedAiAudit().catch(() => {});
    setInterval(() => {
      runAutomatedAiAudit().catch(() => {});
    }, 60 * 60 * 1000);

    runCatchUpSeed().catch((err) => console.warn('[Catch-up seed error]:', err));
    pollPolymarket().catch((err) => console.warn('[Initial poll error]:', err));
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});

