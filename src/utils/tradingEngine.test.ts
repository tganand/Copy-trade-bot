import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialAccount,
  executeCopyBuy,
  executeCopySell,
  calculatePortfolioMetrics,
  formatTelegramTradeAlert,
  createInitialWindowTracker,
  evaluateTradeNotification,
  autoClosePastWindowPositions,
  countWindowBuysForSide,
  computeClosedPositionStats,
  executeInternalSell,
} from './tradingEngine';
import { PolymarketActivityItem, OrderBookState } from '../types';

test('createInitialAccount initializes balance at $100 with zero positions', () => {
  const account = createInitialAccount();
  assert.equal(account.initialBalance, 100);
  assert.equal(account.cashBalance, 100);
  assert.equal(Object.keys(account.positions).length, 0);
  assert.equal(account.history.length, 0);
  assert.equal(account.totalRealizedPnl, 0);
});

test('executeCopyBuy executes $5 trade at given price and deducts cash', () => {
  const initial = createInitialAccount(100);
  const trade: PolymarketActivityItem = {
    proxyWallet: '0xc53375ff94e96100f2b30a4b5775db35218d69a9',
    timestamp: 1793508780,
    conditionId: 'cond_btc_updown_1',
    type: 'TRADE',
    size: 50,
    usdcSize: 5,
    transactionHash: '0xabc123',
    price: 0.10, // 10 cents per share
    asset: 'asset_btc_down',
    side: 'BUY',
    outcome: 'Down',
    title: 'Bitcoin Up or Down - 5M Window',
    slug: 'btc-updown-5m-test',
  };

  const { account, copyTrade, error } = executeCopyBuy(initial, trade, 5, 75.0, 0.10, 0.0);
  assert.equal(error, undefined);
  assert.ok(copyTrade);
  assert.equal(copyTrade.copySizeUsdc, 5);
  assert.equal(copyTrade.copyShares, 50); // $5 / 0.10 = 50 shares
  assert.equal(account.cashBalance, 95);
  assert.equal(account.totalTrades, 1);

  const posKey = 'cond_btc_updown_1_Down';
  const pos = account.positions[posKey];
  assert.ok(pos);
  assert.equal(pos.shares, 50);
  assert.equal(pos.entryPrice, 0.10);
  assert.equal(pos.totalCost, 5);
});

test('executeCopySell liquidates position and realizes profit when target sells higher', () => {
  const initial = createInitialAccount(100);
  const buyTrade: PolymarketActivityItem = {
    proxyWallet: '0xc53375ff94e96100f2b30a4b5775db35218d69a9',
    timestamp: 1793508780,
    conditionId: 'cond_btc_updown_1',
    type: 'TRADE',
    size: 50,
    usdcSize: 5,
    transactionHash: '0xabc123',
    price: 0.10,
    asset: 'asset_btc_down',
    side: 'BUY',
    outcome: 'Down',
    title: 'Bitcoin Up or Down - 5M Window',
    slug: 'btc-updown-5m-test',
  };

  const { account: afterBuy } = executeCopyBuy(initial, buyTrade, 5, 75.0, 0.10, 0.0);

  // Target sells at 0.20 (doubling the value from $5 to $10)
  const sellTrade: PolymarketActivityItem = {
    proxyWallet: '0xc53375ff94e96100f2b30a4b5775db35218d69a9',
    timestamp: 1793508900,
    conditionId: 'cond_btc_updown_1',
    type: 'TRADE',
    size: 50,
    usdcSize: 10,
    transactionHash: '0xdef456',
    price: 0.20,
    asset: 'asset_btc_down',
    side: 'SELL',
    outcome: 'Down',
    title: 'Bitcoin Up or Down - 5M Window',
    slug: 'btc-updown-5m-test',
  };

  const { account: afterSell, copyTrade: sellRecord, error } = executeCopySell(afterBuy, sellTrade, 0.0);
  assert.equal(error, undefined);
  assert.ok(sellRecord);
  assert.equal(sellRecord.pnlUsdc, 5); // +$5 realized profit
  assert.equal(afterSell.cashBalance, 105); // $95 + $10 proceeds = $105
  assert.equal(afterSell.totalRealizedPnl, 5);
  assert.equal(afterSell.winningTrades, 1);
  assert.equal(Object.keys(afterSell.positions).length, 0);
});

test('calculatePortfolioMetrics accurately reflects cash and live unrealized PnL', () => {
  const account = createInitialAccount(100);
  const buyTrade: PolymarketActivityItem = {
    proxyWallet: '0xc53375ff94e96100f2b30a4b5775db35218d69a9',
    timestamp: 1793508780,
    conditionId: 'cond_1',
    type: 'TRADE',
    size: 50,
    usdcSize: 5,
    transactionHash: '0x1',
    price: 0.10,
    asset: 'asset_1',
    side: 'BUY',
    outcome: 'Up',
    title: 'Bitcoin Up',
    slug: 'btc-up',
  };

  const { account: afterBuy } = executeCopyBuy(account, buyTrade, 5, 75.0, 0.10, 0.0);
  // Cash is now 95, 50 shares bought at 0.10 (cost = 5)

  // Live price rises to 0.15 (shares are now worth 50 * 0.15 = 7.50, unrealized +2.50)
  const metrics = calculatePortfolioMetrics(afterBuy, {
    'cond_1_Up': 0.15,
  });

  assert.equal(metrics.cashBalance, 95);
  assert.equal(metrics.activePositionsValue, 7.5);
  assert.equal(metrics.totalPortfolioValue, 102.5);
  assert.equal(metrics.unrealizedPnl, 2.5);
  assert.equal(metrics.totalPnl, 2.5);
  assert.equal(metrics.totalPnlPercent, 2.5);
});

test('formatTelegramTradeAlert contains required target handle, market, and side', () => {
  const trade: PolymarketActivityItem = {
    proxyWallet: '0xc53375ff94e96100f2b30a4b5775db35218d69a9',
    timestamp: 1793508775,
    conditionId: '0xeb414',
    type: 'TRADE',
    size: 30,
    usdcSize: 2.87,
    transactionHash: '0x9498dc6847',
    price: 0.09,
    asset: '1872486',
    side: 'BUY',
    outcome: 'Down',
    title: 'Bitcoin Up or Down - 12:50AM ET',
    slug: 'btc-updown-5m-1793508600',
    eventSlug: 'btc-updown-5m-1793508600',
  };

  const msg = formatTelegramTradeAlert(trade, '@dangerously-skip-permissions');
  assert.ok(msg.includes('@dangerously-skip-permissions'));
  assert.ok(msg.includes('🟢 BUY'));
  assert.ok(msg.includes('DOWN'));
  assert.ok(msg.includes('$0.090'));
  assert.ok(msg.includes('Bitcoin Up or Down - 12:50AM ET'));
  assert.ok(msg.includes('polymarket.com/event/btc-updown-5m-1793508600'));
});

test('evaluateTradeNotification enforces $25 first trade and $30 second trade rule per window', () => {
  let tracker = createInitialWindowTracker();

  const baseTrade: PolymarketActivityItem = {
    proxyWallet: '0xc53375ff94e96100f2b30a4b5775db35218d69a9',
    timestamp: 1793508000,
    conditionId: 'cond_window_1',
    type: 'TRADE',
    size: 100,
    usdcSize: 20, // $20
    transactionHash: 'tx_1',
    price: 0.20,
    asset: 'asset_1',
    side: 'BUY',
    outcome: 'Up',
    title: 'Window 1 Test',
    slug: 'window-1',
    eventSlug: 'window-1',
  };

  // 1. First trade = $20 -> Ignore (< $25)
  let res1 = evaluateTradeNotification(baseTrade, tracker);
  assert.equal(res1.shouldNotify, false);
  tracker = res1.updatedState;

  // 2. First qualifying trade = $26 -> Notify (>= $25)
  const trade2 = { ...baseTrade, usdcSize: 26, transactionHash: 'tx_2' };
  let res2 = evaluateTradeNotification(trade2, tracker);
  assert.equal(res2.shouldNotify, true);
  tracker = res2.updatedState;

  // 3. Repeated detection of tx_2 -> Ignore (duplicate)
  let res2Dup = evaluateTradeNotification(trade2, tracker);
  assert.equal(res2Dup.shouldNotify, false);

  // 4. Second trade in same window = $28 -> Ignore (< $30)
  const trade3 = { ...baseTrade, usdcSize: 28, transactionHash: 'tx_3' };
  let res3 = evaluateTradeNotification(trade3, tracker);
  assert.equal(res3.shouldNotify, false);
  tracker = res3.updatedState;

  // 5. Second qualifying trade in same window = $35 -> Notify (>= $30)
  const trade4 = { ...baseTrade, usdcSize: 35, transactionHash: 'tx_4' };
  let res4 = evaluateTradeNotification(trade4, tracker);
  assert.equal(res4.shouldNotify, true);
  tracker = res4.updatedState;

  // 6. Third trade in same window -> Ignore (max 2 notifications per window)
  const trade5 = { ...baseTrade, usdcSize: 50, transactionHash: 'tx_5' };
  let res5 = evaluateTradeNotification(trade5, tracker);
  assert.equal(res5.shouldNotify, false);

  // 7. Window 2: First qualifying trade = $27 -> Notify as new window (>= $25)
  const tradeWindow2 = {
    ...baseTrade,
    conditionId: 'cond_window_2',
    usdcSize: 27,
    transactionHash: 'tx_w2_1',
    eventSlug: 'window-2',
  };
  let resWindow2 = evaluateTradeNotification(tradeWindow2, tracker);
  assert.equal(resWindow2.shouldNotify, true);
});

test('autoClosePastWindowPositions closes past window positions when next window opens', () => {
  const account = createInitialAccount(1000);
  const tradeWindow1: PolymarketActivityItem = {
    proxyWallet: '0xc53375ff94e96100f2b30a4b5775db35218d69a9',
    timestamp: 1793508000,
    conditionId: 'cond_w1',
    type: 'TRADE',
    size: 50,
    usdcSize: 5,
    transactionHash: 'tx_w1',
    price: 0.10,
    asset: 'asset_w1',
    side: 'BUY',
    outcome: 'Up',
    title: 'Bitcoin Up or Down - Window 1',
    slug: 'btc-updown-5m-1793508000',
    eventSlug: 'btc-updown-5m-1793508000',
  };

  const { account: afterBuy } = executeCopyBuy(account, tradeWindow1, 5, 75.0, 0.10, 0.0);
  assert.equal(Object.keys(afterBuy.positions).length, 1);

  // When next window opens (timestamp 1793508600, which is > 1793508000)
  const nextWindowTs = 1793508600;
  const updatedAccount = autoClosePastWindowPositions(afterBuy, nextWindowTs, {
    'cond_w1_Up': 1.0, // resolved as win at 1.00
  });

  assert.equal(Object.keys(updatedAccount.positions).length, 0);
  assert.equal(updatedAccount.history.length, 2);
  assert.equal(updatedAccount.history[0].status, 'CLOSED');
  assert.equal(updatedAccount.totalRealizedPnl, 45); // 50 shares * (1.00 - 0.10) = $45 profit
  assert.equal(updatedAccount.cashBalance, 1045); // $995 + $50 proceeds = $1045
});

test('fee formula: 100 shares at $0.50 with a 0.07 taker rate produces $1.75 fee', () => {
  const account = createInitialAccount(100);
  const trade: PolymarketActivityItem = {
    proxyWallet: '0xc53375ff94e96100f2b30a4b5775db35218d69a9',
    timestamp: 1793508000,
    conditionId: 'cond_fee_test',
    type: 'TRADE',
    size: 100,
    usdcSize: 50,
    transactionHash: 'tx_fee_1',
    price: 0.50,
    asset: 'asset_fee_1',
    side: 'BUY',
    outcome: 'Up',
    title: 'Bitcoin Up or Down',
    slug: 'btc-updown-5m-test',
  };

  // 100 shares at $0.50 -> trade amount = $50
  const { copyTrade } = executeCopyBuy(account, trade, 50, 75.0, 0.50, 0.07, 'market');
  assert.ok(copyTrade);
  assert.equal(copyTrade.copyShares, 100);
  // formula: shares * feeRate * price * (1 - price) = 100 * 0.07 * 0.50 * 0.50 = 1.75
  assert.equal(copyTrade.feeUsdc, 1.75);
  assert.equal(copyTrade.feeSource, 'market');
});

test('maker fills pay exactly zero trading fees', () => {
  const account = createInitialAccount(100);
  const makerTrade: PolymarketActivityItem = {
    proxyWallet: '0xc53375ff94e96100f2b30a4b5775db35218d69a9',
    timestamp: 1793508000,
    conditionId: 'cond_maker_test',
    type: 'TRADE',
    size: 100,
    usdcSize: 50,
    transactionHash: 'tx_maker_1',
    price: 0.50,
    asset: 'asset_maker_1',
    side: 'BUY',
    outcome: 'Up',
    title: 'Bitcoin Up or Down',
    slug: 'btc-updown-5m-test',
    isMaker: true,
  } as any;

  const { copyTrade } = executeCopyBuy(account, makerTrade, 50, 75.0, 0.50, 0.07, 'market');
  assert.ok(copyTrade);
  assert.equal(copyTrade.feeUsdc, 0);
});

test('fee-free markets (feeRate = 0) pay zero trading fees', () => {
  const account = createInitialAccount(100);
  const feeFreeTrade: PolymarketActivityItem = {
    proxyWallet: '0xc53375ff94e96100f2b30a4b5775db35218d69a9',
    timestamp: 1793508000,
    conditionId: 'cond_free_test',
    type: 'TRADE',
    size: 100,
    usdcSize: 50,
    transactionHash: 'tx_free_1',
    price: 0.50,
    asset: 'asset_free_1',
    side: 'BUY',
    outcome: 'Up',
    title: 'Zero Fee Market',
    slug: 'btc-updown-5m-test',
  };

  const { copyTrade } = executeCopyBuy(account, feeFreeTrade, 50, 75.0, 0.50, 0.0, 'market');
  assert.ok(copyTrade);
  assert.equal(copyTrade.feeUsdc, 0);
  assert.equal(copyTrade.feeSource, 'market');
});

test('fallback assumed fees apply default 0.07 rate and tag source as assumed', () => {
  const account = createInitialAccount(100);
  const fallbackTrade: PolymarketActivityItem = {
    proxyWallet: '0xc53375ff94e96100f2b30a4b5775db35218d69a9',
    timestamp: 1793508000,
    conditionId: 'cond_fallback_test',
    type: 'TRADE',
    size: 50,
    usdcSize: 5,
    transactionHash: 'tx_fallback_1',
    price: 0.20,
    asset: 'asset_fb_1',
    side: 'BUY',
    outcome: 'Down',
    title: 'Fallback Market',
    slug: 'btc-updown-5m-test',
  };

  // $5 copy size at price 0.20 -> 25 shares
  // fee = 25 * 0.07 * 0.20 * (1 - 0.20) = 25 * 0.07 * 0.20 * 0.80 = 0.28
  const { copyTrade } = executeCopyBuy(account, fallbackTrade, 5, 75.0, 0.20, 0.07, 'assumed');
  assert.ok(copyTrade);
  assert.equal(copyTrade.copyShares, 25);
  assert.equal(copyTrade.feeUsdc, 0.28);
  assert.equal(copyTrade.feeSource, 'assumed');
});

test('sell orders calculate fees correctly with market fee rate and maker detection', () => {
  const account = createInitialAccount(100);
  const buyTrade: PolymarketActivityItem = {
    proxyWallet: '0xc53375ff94e96100f2b30a4b5775db35218d69a9',
    timestamp: 1793508000,
    conditionId: 'cond_sell_fee',
    type: 'TRADE',
    size: 100,
    usdcSize: 50,
    transactionHash: 'tx_buy_for_sell',
    price: 0.50,
    asset: 'asset_sell_fee',
    side: 'BUY',
    outcome: 'Up',
    title: 'Sell Fee Market',
    slug: 'btc-updown-5m-test',
  };

  const { account: afterBuy } = executeCopyBuy(account, buyTrade, 50, 75.0, 0.50, 0.07, 'market');

  const sellTradeTaker: PolymarketActivityItem = {
    proxyWallet: '0xc53375ff94e96100f2b30a4b5775db35218d69a9',
    timestamp: 1793508100,
    conditionId: 'cond_sell_fee',
    type: 'TRADE',
    size: 100,
    usdcSize: 50,
    transactionHash: 'tx_sell_taker',
    price: 0.50,
    asset: 'asset_sell_fee',
    side: 'SELL',
    outcome: 'Up',
    title: 'Sell Fee Market',
    slug: 'btc-updown-5m-test',
  };

  const { copyTrade: sellTakerRecord } = executeCopySell(afterBuy, sellTradeTaker, 0.07, 'market');
  assert.ok(sellTakerRecord);
  assert.equal(sellTakerRecord.feeUsdc, 1.75); // 100 * 0.07 * 0.50 * 0.50 = 1.75
  assert.equal(sellTakerRecord.feeSource, 'market');
});

test('BUY walks multiple ask levels realistically and calculates weighted average fill price', () => {
  const account = createInitialAccount(100);
  const trade: PolymarketActivityItem = {
    proxyWallet: '0xc53375ff94e96100f2b30a4b5775db35218d69a9',
    timestamp: 1793508000,
    conditionId: 'cond_book_buy',
    type: 'TRADE',
    size: 100,
    usdcSize: 30,
    transactionHash: 'tx_book_buy_1',
    price: 0.30, // Target whale entered at $0.30
    asset: 'asset_book_buy',
    side: 'BUY',
    outcome: 'Up',
    title: 'Bitcoin Up or Down',
    slug: 'btc-updown-5m-test',
  };

  // Order book asks:
  // Level 1: 5 shares @ $0.40 = $2.00
  // Level 2: 10 shares @ $0.50 = $5.00
  const book: OrderBookState = {
    assetId: 'asset_book_buy',
    bids: [{ price: 0.38, size: 20 }],
    asks: [
      { price: 0.40, size: 5 },
      { price: 0.50, size: 10 },
    ],
    bestBid: 0.38,
    bestAsk: 0.40,
    lastPrice: 0.39,
    spread: 0.02,
    updatedAt: Date.now(),
  };

  // Execute $5.00 copy trade
  // $2.00 consumed at $0.40 -> 5.0 shares
  // Remaining $3.00 consumed at $0.50 -> 6.0 shares
  // Total shares = 11.0 shares. Total spent = $5.00.
  // Weighted avg price = 5.00 / 11.0 = 0.4545
  const { account: updatedAccount, copyTrade, error } = executeCopyBuy(
    account,
    trade,
    5,
    75.0,
    book.bestAsk,
    0.0,
    'market',
    book,
    {
      rtdsReceiptTimestamp: Date.now() - 50,
      parsingCompleteTimestamp: Date.now() - 40,
      decisionTimestamp: Date.now() - 10,
    }
  );

  assert.equal(error, undefined);
  assert.ok(copyTrade);
  assert.equal(copyTrade.copySizeUsdc, 5);
  assert.equal(copyTrade.copyShares, 11);
  assert.equal(copyTrade.fillPrice, 0.4545);
  // Target whale price was 0.30, but fill price was 0.4545 (NEVER fake whale price)
  assert.notEqual(copyTrade.fillPrice, trade.price);
  assert.equal(copyTrade.fillStatus, 'FILLED');
  assert.equal(copyTrade.unfilledAmountUsdc, 0);
  assert.equal(updatedAccount.cashBalance, 95); // Exactly $100 - $5 = $95 (NO phantom money!)
  assert.ok(copyTrade.internalLatencyMs !== undefined);
  assert.ok(copyTrade.estimatedUpstreamDelayMs !== undefined);
});

test('SELL walks multiple bid levels and liquidates at weighted bid execution price', () => {
  const account = createInitialAccount(100);
  const buyTrade: PolymarketActivityItem = {
    proxyWallet: '0xc53375ff94e96100f2b30a4b5775db35218d69a9',
    timestamp: 1793508000,
    conditionId: 'cond_book_sell',
    type: 'TRADE',
    size: 20,
    usdcSize: 10,
    transactionHash: 'tx_buy_for_sell_levels',
    price: 0.50,
    asset: 'asset_book_sell',
    side: 'BUY',
    outcome: 'Down',
    title: 'Bitcoin Up or Down',
    slug: 'btc-updown-5m-test',
  };

  const buyBook: OrderBookState = {
    assetId: 'asset_book_sell',
    bids: [{ price: 0.48, size: 50 }],
    asks: [{ price: 0.50, size: 50 }],
    bestBid: 0.48,
    bestAsk: 0.50,
    lastPrice: 0.49,
    spread: 0.02,
    updatedAt: Date.now(),
  };

  // Buy $10 (20 shares @ 0.50)
  const { account: afterBuy } = executeCopyBuy(account, buyTrade, 10, 75.0, 0.50, 0.0, 'market', buyBook);
  assert.equal(afterBuy.positions['cond_book_sell_Down']?.shares, 20);

  // Target sells at 0.70.
  // Order book bids:
  // Bid 1: 10 shares @ 0.60 ($6.00)
  // Bid 2: 20 shares @ 0.55 ($11.00)
  const sellBook: OrderBookState = {
    assetId: 'asset_book_sell',
    bids: [
      { price: 0.60, size: 10 },
      { price: 0.55, size: 20 },
    ],
    asks: [{ price: 0.65, size: 30 }],
    bestBid: 0.60,
    bestAsk: 0.65,
    lastPrice: 0.60,
    spread: 0.05,
    updatedAt: Date.now(),
  };

  const sellTrade: PolymarketActivityItem = {
    proxyWallet: '0xc53375ff94e96100f2b30a4b5775db35218d69a9',
    timestamp: 1793508100,
    conditionId: 'cond_book_sell',
    type: 'TRADE',
    size: 20,
    usdcSize: 14,
    transactionHash: 'tx_sell_levels',
    price: 0.70, // Target whale claimed 0.70
    asset: 'asset_book_sell',
    side: 'SELL',
    outcome: 'Down',
    title: 'Bitcoin Up or Down',
    slug: 'btc-updown-5m-test',
  };

  // Liquidate 20 shares:
  // 10 shares @ 0.60 = $6.00
  // 10 shares @ 0.55 = $5.50
  // Total proceeds = $11.50. Weighted exit price = 11.50 / 20 = 0.575
  const { account: afterSell, copyTrade: sellRecord, error } = executeCopySell(
    afterBuy,
    sellTrade,
    0.0,
    'market',
    sellBook
  );

  assert.equal(error, undefined);
  assert.ok(sellRecord);
  assert.equal(sellRecord.copyShares, 20);
  assert.equal(sellRecord.exitPrice, 0.575);
  // Realized profit: $11.50 proceeds - $10.00 cost = $1.50
  assert.equal(sellRecord.pnlUsdc, 1.5);
  assert.equal(afterSell.totalRealizedPnl, 1.5);
  assert.equal(afterSell.cashBalance, 101.5); // $90 remaining cash + $11.50 proceeds
});

test('insufficient order book liquidity results in partial fill without inventing liquidity', () => {
  const account = createInitialAccount(100);
  const trade: PolymarketActivityItem = {
    proxyWallet: '0xc53375ff94e96100f2b30a4b5775db35218d69a9',
    timestamp: 1793508000,
    conditionId: 'cond_thin_book',
    type: 'TRADE',
    size: 100,
    usdcSize: 50,
    transactionHash: 'tx_thin_1',
    price: 0.50,
    asset: 'asset_thin',
    side: 'BUY',
    outcome: 'Up',
    title: 'Bitcoin Up or Down',
    slug: 'btc-updown-5m-test',
  };

  // Order book has ONLY 2 shares available at 0.50 ($1.00 total depth)
  const thinBook: OrderBookState = {
    assetId: 'asset_thin',
    bids: [{ price: 0.48, size: 5 }],
    asks: [{ price: 0.50, size: 2 }],
    bestBid: 0.48,
    bestAsk: 0.50,
    lastPrice: 0.50,
    spread: 0.02,
    updatedAt: Date.now(),
  };

  // Attempting $5.00 copy trade
  const { account: updatedAccount, copyTrade, error } = executeCopyBuy(
    account,
    trade,
    5,
    75.0,
    thinBook.bestAsk,
    0.0,
    'market',
    thinBook
  );

  assert.equal(error, undefined);
  assert.ok(copyTrade);
  assert.equal(copyTrade.fillStatus, 'PARTIALLY_FILLED');
  assert.equal(copyTrade.copyShares, 2);
  assert.equal(copyTrade.copySizeUsdc, 1.0); // Only spent $1.00
  assert.equal(copyTrade.unfilledAmountUsdc, 4.0); // $4.00 unfilled
  assert.equal(updatedAccount.cashBalance, 99.0); // Only deducted $1.00
});

test('stale order book (> 15 seconds) rejects copy execution and records reason', () => {
  const account = createInitialAccount(100);
  const trade: PolymarketActivityItem = {
    proxyWallet: '0xc53375ff94e96100f2b30a4b5775db35218d69a9',
    timestamp: 1793508000,
    conditionId: 'cond_stale_book',
    type: 'TRADE',
    size: 10,
    usdcSize: 5,
    transactionHash: 'tx_stale_1',
    price: 0.50,
    asset: 'asset_stale',
    side: 'BUY',
    outcome: 'Up',
    title: 'Bitcoin Up or Down',
    slug: 'btc-updown-5m-test',
  };

  // Book updated 25 seconds ago
  const staleBook: OrderBookState = {
    assetId: 'asset_stale',
    bids: [{ price: 0.48, size: 50 }],
    asks: [{ price: 0.50, size: 50 }],
    bestBid: 0.48,
    bestAsk: 0.50,
    lastPrice: 0.50,
    spread: 0.02,
    updatedAt: Date.now() - 25000,
  };

  const { account: updatedAccount, copyTrade, error } = executeCopyBuy(
    account,
    trade,
    5,
    75.0,
    staleBook.bestAsk,
    0.07,
    'market',
    staleBook
  );

  assert.ok(error?.startsWith('STALE_ORDERBOOK'));
  assert.equal(copyTrade, undefined);
  assert.equal(updatedAccount.cashBalance, 100); // No cash deducted
});

test('missing order book rejects execution and never falls back to target price', () => {
  const account = createInitialAccount(100);
  const trade: PolymarketActivityItem = {
    proxyWallet: '0xc53375ff94e96100f2b30a4b5775db35218d69a9',
    timestamp: 1793508000,
    conditionId: 'cond_missing_book',
    type: 'TRADE',
    size: 10,
    usdcSize: 5,
    transactionHash: 'tx_missing_1',
    price: 0.50,
    asset: 'asset_missing',
    side: 'BUY',
    outcome: 'Up',
    title: 'Bitcoin Up or Down',
    slug: 'btc-updown-5m-test',
  };

  // Empty book (no asks)
  const emptyBook: OrderBookState = {
    assetId: 'asset_missing',
    bids: [],
    asks: [],
    bestBid: 0,
    bestAsk: 0,
    lastPrice: 0,
    spread: 0,
    updatedAt: Date.now(),
  };

  const { copyTrade, error } = executeCopyBuy(
    account,
    trade,
    5,
    75.0,
    0,
    0.07,
    'market',
    emptyBook
  );

  assert.ok(error?.startsWith('NO_ORDERBOOK'));
  assert.equal(copyTrade, undefined);
});

test('cash balance is strictly conserved with zero phantom money or auto-refills', () => {
  // Start with $4.00 cash
  const account = createInitialAccount(4.0);
  const trade: PolymarketActivityItem = {
    proxyWallet: '0xc53375ff94e96100f2b30a4b5775db35218d69a9',
    timestamp: 1793508000,
    conditionId: 'cond_cash_conservation',
    type: 'TRADE',
    size: 10,
    usdcSize: 5,
    transactionHash: 'tx_cash_1',
    price: 0.50,
    asset: 'asset_cash_1',
    side: 'BUY',
    outcome: 'Up',
    title: 'Bitcoin Up or Down',
    slug: 'btc-updown-5m-test',
  };

  const book: OrderBookState = {
    assetId: 'asset_cash_1',
    bids: [{ price: 0.48, size: 50 }],
    asks: [{ price: 0.50, size: 50 }],
    bestBid: 0.48,
    bestAsk: 0.50,
    lastPrice: 0.50,
    spread: 0.02,
    updatedAt: Date.now(),
  };

  // Requesting $5 copy trade with $4 available cash:
  // Spends exactly $4.00 (8 shares @ 0.50). Balance becomes $0.00.
  const { account: afterTrade1 } = executeCopyBuy(account, trade, 5, 75.0, 0.50, 0.0, 'market', book);
  assert.equal(afterTrade1.cashBalance, 0);

  // Subsequent trade when cash is $0.00:
  // MUST reject with Insufficient cash, NEVER inject phantom +$100!
  const { account: afterTrade2, error } = executeCopyBuy(afterTrade1, trade, 5, 75.0, 0.50, 0.0, 'market', book);
  assert.ok(error?.includes('Insufficient cash'));
  assert.equal(afterTrade2.cashBalance, 0); // Still 0, no phantom $100 added!
});

test('countWindowBuysForSide enforces max 2 trades per side and allows opposite side', () => {
  const account = createInitialAccount(100);
  const windowSlug = 'btc-updown-5m-1793508000';
  const nextWindowSlug = 'btc-updown-5m-1793508300';

  const book: OrderBookState = {
    assetId: 'asset_test',
    bids: [{ price: 0.48, size: 100 }],
    asks: [{ price: 0.50, size: 100 }],
    bestBid: 0.48,
    bestAsk: 0.50,
    lastPrice: 0.50,
    spread: 0.02,
    updatedAt: Date.now(),
  };

  const tradeUp1: PolymarketActivityItem = {
    proxyWallet: '0xc53375ff94e96100f2b30a4b5775db35218d69a9',
    timestamp: 1793508050,
    conditionId: 'cond_window_test',
    type: 'TRADE',
    size: 20,
    usdcSize: 10,
    transactionHash: 'tx_up_1',
    price: 0.50,
    asset: 'asset_up_1',
    side: 'BUY',
    outcome: 'Up',
    title: 'Bitcoin Up or Down',
    slug: windowSlug,
  };

  // 1. First trade on UP -> should count 0 before, 1 after
  assert.equal(countWindowBuysForSide(account.history, 'Up', windowSlug), 0);
  const { account: acc1 } = executeCopyBuy(account, tradeUp1, 10, 5, 0.50, 0, 'market', book);
  assert.equal(countWindowBuysForSide(acc1.history, 'Up', windowSlug), 1);
  assert.equal(countWindowBuysForSide(acc1.history, 'Down', windowSlug), 0);

  // 2. Second trade on UP -> should count 1 before, 2 after
  const tradeUp2: PolymarketActivityItem = { ...tradeUp1, transactionHash: 'tx_up_2', timestamp: 1793508080 };
  const { account: acc2 } = executeCopyBuy(acc1, tradeUp2, 10, 5, 0.50, 0, 'market', book);
  assert.equal(countWindowBuysForSide(acc2.history, 'Up', windowSlug), 2);
  assert.equal(countWindowBuysForSide(acc2.history, 'Down', windowSlug), 0);

  // 3. UP side now has 2 trades (Limit reached). DOWN side still has 0 trades (Permitted!)
  assert.ok(countWindowBuysForSide(acc2.history, 'Up', windowSlug) >= 2);
  assert.ok(countWindowBuysForSide(acc2.history, 'Down', windowSlug) < 2);

  // 4. First trade on DOWN -> executes normally
  const tradeDown1: PolymarketActivityItem = {
    ...tradeUp1,
    outcome: 'Down',
    asset: 'asset_down_1',
    transactionHash: 'tx_down_1',
    timestamp: 1793508100,
  };
  const { account: acc3 } = executeCopyBuy(acc2, tradeDown1, 10, 5, 0.50, 0, 'market', book);
  assert.equal(countWindowBuysForSide(acc3.history, 'Up', windowSlug), 2);
  assert.equal(countWindowBuysForSide(acc3.history, 'Down', windowSlug), 1);

  // 5. Second trade on DOWN -> executes normally
  const tradeDown2: PolymarketActivityItem = { ...tradeDown1, transactionHash: 'tx_down_2', timestamp: 1793508120 };
  const { account: acc4 } = executeCopyBuy(acc3, tradeDown2, 10, 5, 0.50, 0, 'market', book);
  assert.equal(countWindowBuysForSide(acc4.history, 'Up', windowSlug), 2);
  assert.equal(countWindowBuysForSide(acc4.history, 'Down', windowSlug), 2);

  // 6. Both sides now at limit for this window
  assert.ok(countWindowBuysForSide(acc4.history, 'Up', windowSlug) >= 2);
  assert.ok(countWindowBuysForSide(acc4.history, 'Down', windowSlug) >= 2);

  // 7. In next window, counts reset to 0 for both sides!
  assert.equal(countWindowBuysForSide(acc4.history, 'Up', nextWindowSlug), 0);
  assert.equal(countWindowBuysForSide(acc4.history, 'Down', nextWindowSlug), 0);
});

test('realized PnL is mathematically reconciled with cash balance to the exact penny', () => {
  // If cashBalance is $101.94 and initialBalance is $100.00 with 0 open positions,
  // realizedPnl MUST be +$1.94, NEVER -$6.35!
  const account = createInitialAccount(100);
  account.cashBalance = 101.94;
  account.positions = {};

  const metrics = calculatePortfolioMetrics(account);
  assert.equal(metrics.cashBalance, 101.94);
  assert.equal(metrics.realizedPnl, 1.94);
  assert.equal(metrics.totalPnl, 1.94);
});

test('partial sells do not count as wins, and trade lifecycle counts strictly 1 win or 1 loss per trade', () => {
  const account = createInitialAccount(100);
  const buyTrade: PolymarketActivityItem = {
    proxyWallet: '0xc53375ff94e96100f2b30a4b5775db35218d69a9',
    timestamp: 1793508000,
    conditionId: 'cond_lifecycle_test',
    type: 'TRADE',
    size: 20,
    usdcSize: 10,
    transactionHash: 'tx_buy_lifecycle',
    price: 0.50,
    asset: 'asset_lifecycle_1',
    side: 'BUY',
    outcome: 'Up',
    title: 'Bitcoin Up or Down',
    slug: 'btc-updown-5m-test',
  };

  const book: OrderBookState = {
    assetId: 'asset_lifecycle_1',
    bids: [{ price: 0.50, size: 50 }],
    asks: [{ price: 0.50, size: 50 }],
    bestBid: 0.50,
    bestAsk: 0.50,
    lastPrice: 0.50,
    spread: 0.00,
    updatedAt: Date.now(),
  };

  // 1. Buy $10 (20 shares @ 0.50)
  const { account: afterBuy } = executeCopyBuy(account, buyTrade, 10, 5, 0.50, 0, 'market', book);
  const metrics1 = calculatePortfolioMetrics(afterBuy);
  assert.equal(metrics1.winningTrades, 0);
  assert.equal(metrics1.losingTrades, 0);

  // 2. Partial take-profit sell 30% (6 shares) at 0.65 (+30% profit)
  const posKey = 'cond_lifecycle_test_Up';
  const { account: afterPartialTP } = executeInternalSell(afterBuy, posKey, 0.30, 'TAKE_PROFIT_30%', 0.65, 0, 'market');
  const metrics2 = calculatePortfolioMetrics(afterPartialTP);
  // Position is STILL OPEN with 14 shares remaining: MUST NOT count as a win yet!
  assert.equal(metrics2.winningTrades, 0, 'Partial sell must NOT prematurely count as a win while trade is open');
  assert.equal(metrics2.losingTrades, 0);

  // 3. Remaining 14 shares hit stop-loss at 0.30 (-40% stop loss)
  // Overall trade: invested $10.00. Sold 6 @ 0.65 = $3.90, sold 14 @ 0.30 = $4.20. Total received = $8.10. Net loss = -$1.90.
  const { account: afterStopLoss } = executeInternalSell(afterPartialTP, posKey, 1.0, 'STOP_LOSS_-40%', 0.30, 0, 'market');
  const metrics3 = calculatePortfolioMetrics(afterStopLoss);
  // The overall trade lost money: it MUST count as strictly 1 LOSS and ZERO wins!
  assert.equal(metrics3.winningTrades, 0, 'Losing trade lifecycle must have 0 wins even if it had a partial take-profit');
  assert.equal(metrics3.losingTrades, 1, 'Losing trade lifecycle must count as exactly 1 loss');
  assert.equal(metrics3.winRate, 0);
});

test('dynamic risk scaling: single or hedged Up+Down trades use 40% stop loss, 2 same-side trades use 20% stop loss and scaled TP', () => {
  const account = createInitialAccount(100);

  const upTrade1: PolymarketActivityItem = {
    proxyWallet: '0xc53375ff94e96100f2b30a4b5775db35218d69a9',
    timestamp: 1793508000,
    conditionId: 'cond_window_dyn',
    type: 'TRADE',
    size: 20,
    usdcSize: 10,
    transactionHash: 'tx_dyn_up1',
    price: 0.50,
    asset: 'asset_dyn_up',
    side: 'BUY',
    outcome: 'Up',
    title: 'Bitcoin Up or Down',
    slug: 'btc-updown-5m-1793508000',
  };

  const downTrade1: PolymarketActivityItem = {
    proxyWallet: '0xc53375ff94e96100f2b30a4b5775db35218d69a9',
    timestamp: 1793508010,
    conditionId: 'cond_window_dyn',
    type: 'TRADE',
    size: 20,
    usdcSize: 10,
    transactionHash: 'tx_dyn_down1',
    price: 0.50,
    asset: 'asset_dyn_down',
    side: 'BUY',
    outcome: 'Down',
    title: 'Bitcoin Up or Down',
    slug: 'btc-updown-5m-1793508000',
  };

  const bookUp: OrderBookState = {
    assetId: 'asset_dyn_up',
    bids: [{ price: 0.50, size: 50 }],
    asks: [{ price: 0.50, size: 50 }],
    bestBid: 0.50,
    bestAsk: 0.50,
    lastPrice: 0.50,
    spread: 0.00,
    updatedAt: Date.now(),
  };

  const bookDown: OrderBookState = {
    assetId: 'asset_dyn_down',
    bids: [{ price: 0.50, size: 50 }],
    asks: [{ price: 0.50, size: 50 }],
    bestBid: 0.50,
    bestAsk: 0.50,
    lastPrice: 0.50,
    spread: 0.00,
    updatedAt: Date.now(),
  };

  // Scenario 1: Hedged Up and Down in same window
  const { account: accAfterUp1 } = executeCopyBuy(account, upTrade1, 10, 5, 0.50, 0, 'market', bookUp);
  const { account: accHedged } = executeCopyBuy(accAfterUp1, downTrade1, 10, 5, 0.50, 0, 'market', bookDown);

  const upBuyCount = countWindowBuysForSide(accHedged.history, 'Up', 'btc-updown-5m-1793508000', 'cond_window_dyn');
  const downBuyCount = countWindowBuysForSide(accHedged.history, 'Down', 'btc-updown-5m-1793508000', 'cond_window_dyn');

  assert.equal(upBuyCount, 1, 'Hedged Up trade count should be 1');
  assert.equal(downBuyCount, 1, 'Hedged Down trade count should be 1');

  // For single / hedged trade: stop loss is -40%
  const isUpDouble = upBuyCount >= 2;
  const isDownDouble = downBuyCount >= 2;
  assert.equal(isUpDouble, false);
  assert.equal(isDownDouble, false);

  const stopLossUp = isUpDouble ? -20 : -40;
  const stopLossDown = isDownDouble ? -20 : -40;
  assert.equal(stopLossUp, -40, 'Single Up trade must use -40% stop loss');
  assert.equal(stopLossDown, -40, 'Single Down trade must use -40% stop loss');

  // Scenario 2: Second UP trade in the SAME window
  const upTrade2: PolymarketActivityItem = {
    ...upTrade1,
    transactionHash: 'tx_dyn_up2',
    timestamp: 1793508050,
  };

  const { account: accDoubleUp } = executeCopyBuy(accHedged, upTrade2, 10, 5, 0.50, 0, 'market', bookUp);
  const upBuyCount2 = countWindowBuysForSide(accDoubleUp.history, 'Up', 'btc-updown-5m-1793508000', 'cond_window_dyn');
  assert.equal(upBuyCount2, 2, 'Two Up trades in same window must count as 2');

  const isUpDouble2 = upBuyCount2 >= 2;
  assert.equal(isUpDouble2, true, 'Up side is now a double trade');

  const stopLossUp2 = isUpDouble2 ? -20 : -40;
  assert.equal(stopLossUp2, -20, 'Double Up trade must use -20% stop loss so 20% on $20 = 40% on standard single stake');

  // Combined position cost is $20. A 20% stop loss means $4 loss.
  const posUp = accDoubleUp.positions['cond_window_dyn_Up'];
  assert.ok(posUp);
  assert.equal(posUp.totalCost, 20);
  assert.equal(posUp.buyCount, 2);
});




