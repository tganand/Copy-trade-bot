import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Clock,
  Zap,
  RotateCcw,
  ArrowUpRight,
  ArrowDownRight,
  DollarSign,
  PieChart,
  Percent,
  Receipt,
  Layers,
  Scale,
  CheckCircle2,
} from 'lucide-react';
import {
  ActiveBtcWindow,
  PairStrategyConfig,
  PaperAccount,
  PortfolioMetrics,
} from '../types/index.ts';

interface PairStrategyPanelProps {
  symbol: string;
  activeWindow: ActiveBtcWindow | null;
  marketBooks: Record<string, any>;
  account: PaperAccount;
  metrics: PortfolioMetrics;
  config: PairStrategyConfig;
  onResetAccount: () => void;
  onClosePosition: (positionId: string) => void;
  onToggleStrategy?: () => void;
}

export const PairStrategyPanel: React.FC<PairStrategyPanelProps> = ({
  symbol,
  activeWindow,
  marketBooks,
  account,
  metrics,
  config,
  onResetAccount,
  onClosePosition,
  onToggleStrategy,
}) => {
  const [timeLeft, setTimeLeft] = useState<number>(activeWindow?.timeLeftSeconds || 0);

  useEffect(() => {
    if (activeWindow?.timeLeftSeconds !== undefined) {
      setTimeLeft(activeWindow.timeLeftSeconds);
    }
  }, [activeWindow?.timeLeftSeconds]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (activeWindow?.endDate) {
        const nowSec = Math.floor(Date.now() / 1000);
        const remaining = Math.max(0, Math.floor(activeWindow.endDate / 1000) - nowSec);
        setTimeLeft(remaining);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [activeWindow?.endDate]);

  const upBook = activeWindow?.upTokenId ? marketBooks[activeWindow.upTokenId] : null;
  const downBook = activeWindow?.downTokenId ? marketBooks[activeWindow.downTokenId] : null;

  let upPrice: number | null = null;
  if (upBook && upBook.bestAsk > 0) {
    upPrice = upBook.bestAsk;
  } else if (upBook && upBook.lastPrice > 0) {
    upPrice = upBook.lastPrice;
  } else if (upBook && upBook.bestBid > 0) {
    upPrice = upBook.bestBid;
  } else if (activeWindow?.outcomePrices?.[0] !== undefined && activeWindow.outcomePrices[0] !== null && activeWindow.outcomePrices[0] > 0) {
    upPrice = activeWindow.outcomePrices[0];
  }

  let downPrice: number | null = null;
  if (downBook && downBook.bestAsk > 0) {
    downPrice = downBook.bestAsk;
  } else if (downBook && downBook.lastPrice > 0) {
    downPrice = downBook.lastPrice;
  } else if (downBook && downBook.bestBid > 0) {
    downPrice = downBook.bestBid;
  } else if (activeWindow?.outcomePrices?.[1] !== undefined && activeWindow.outcomePrices[1] !== null && activeWindow.outcomePrices[1] > 0) {
    downPrice = activeWindow.outcomePrices[1];
  }

  const upCents = upPrice !== null ? Math.round(upPrice * 100) : null;
  const downCents = downPrice !== null ? Math.round(downPrice * 100) : null;

  const prevPricesRef = React.useRef<{ up: number | null; down: number | null }>({ up: null, down: null });
  const [upTick, setUpTick] = useState<'up' | 'down' | null>(null);
  const [downTick, setDownTick] = useState<'up' | 'down' | null>(null);

  useEffect(() => {
    if (upPrice !== null && prevPricesRef.current.up !== null && prevPricesRef.current.up !== upPrice) {
      setUpTick(upPrice > prevPricesRef.current.up ? 'up' : 'down');
      const timer = setTimeout(() => setUpTick(null), 1500);
      prevPricesRef.current.up = upPrice;
      return () => clearTimeout(timer);
    }
    prevPricesRef.current.up = upPrice;
  }, [upPrice]);

  useEffect(() => {
    if (downPrice !== null && prevPricesRef.current.down !== null && prevPricesRef.current.down !== downPrice) {
      setDownTick(downPrice > prevPricesRef.current.down ? 'up' : 'down');
      const timer = setTimeout(() => setDownTick(null), 1500);
      prevPricesRef.current.down = downPrice;
      return () => clearTimeout(timer);
    }
    prevPricesRef.current.down = downPrice;
  }, [downPrice]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const minutesRemaining = Math.floor(timeLeft / 60);
  const progressPercent = Math.max(0, Math.min(100, (timeLeft / 900) * 100));

  // Determine pair arbitrage condition
  const highThreshold = config.highThreshold || 0.75;
  const lowThreshold = config.lowThreshold || 0.20;
  const isUpHighPair = upPrice !== null && upPrice >= highThreshold && upPrice <= 0.82 && downPrice !== null && downPrice <= (lowThreshold + 0.06);
  const isDownHighPair = downPrice !== null && downPrice >= highThreshold && downPrice <= 0.82 && upPrice !== null && upPrice <= (lowThreshold + 0.06);

  const openPositions = Object.values(account.positions || {});
  const feesPaid = account.totalFeesPaid !== undefined && !isNaN(account.totalFeesPaid) && account.totalFeesPaid > 0
    ? account.totalFeesPaid
    : (account.history || []).reduce((sum: number, t: any) => sum + (t.feeUsdc !== undefined ? t.feeUsdc : ((t.buyFeeUsdc || 0) + (t.sellFeeUsdc || 0))), 0);

  const realizedPnl = (metrics.realizedPnl !== undefined && !isNaN(metrics.realizedPnl) && metrics.realizedPnl !== 0)
    ? metrics.realizedPnl
    : (account.totalRealizedPnl !== undefined && !isNaN(account.totalRealizedPnl))
    ? account.totalRealizedPnl
    : (account.history || []).reduce((acc, t) => t.side === 'SELL' ? acc + (t.realizedProfitUsdc ?? t.pnlUsdc ?? 0) : acc, 0);

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl backdrop-blur-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="px-2.5 py-1 text-[11px] font-black uppercase tracking-wider bg-purple-500/10 border border-purple-500/30 text-purple-400 rounded-md flex items-center gap-1.5">
              <Scale className="w-3.5 h-3.5" />
              15m Pair Arbitrage
            </span>
            <span className="px-2.5 py-1 text-[11px] font-mono font-bold bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-md">
              Separate $100.00 Bankroll
            </span>
            <span className={`px-2.5 py-1 text-[11px] font-black uppercase tracking-wider rounded-md border ${
              config.isEnabled
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
            }`}>
              {config.isEnabled ? '● Active' : '○ Paused'}
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-100 mt-2 tracking-tight flex items-center gap-2">
            BTC 15m 75¢ / 20¢ Pair Strategy
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Buys 10 shares @ 75¢ ($7.50) + 10 shares @ 20¢ ($2.00) = $9.50 cost. 1 side wins $10.00 at resolution (+40¢ net profit after fees).
          </p>
        </div>

        <div className="flex items-center gap-2 self-start md:self-center">
          {onToggleStrategy && (
            <button
              onClick={onToggleStrategy}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                config.isEnabled
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500'
              }`}
            >
              {config.isEnabled ? 'Pause Bot' : 'Start Bot'}
            </button>
          )}
          <button
            onClick={onResetAccount}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white transition-all shadow-sm"
            title="Reset pair trading bankroll to $100.00"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset $100
          </button>
        </div>
      </div>

      {/* Live Market Window Card */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl relative overflow-hidden backdrop-blur-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800/80 gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 mb-1">
              <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>LIVE BTC 15-MINUTE MARKET</span>
              <span className="text-slate-600">·</span>
              <span className="font-mono text-purple-400">{activeWindow?.slug || 'Loading...'}</span>
            </div>
            <h3 className="text-xl font-bold text-slate-100">
              {activeWindow?.title || `${symbol} Up or Down - 15m Window`}
            </h3>
          </div>

          <div className="flex items-center gap-4 bg-slate-950/60 border border-slate-800/80 px-4 py-3 rounded-xl">
            <div className="relative w-11 h-11 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90">
                <circle cx="22" cy="22" r="18" className="stroke-slate-800" strokeWidth="3" fill="transparent" />
                <circle
                  cx="22"
                  cy="22"
                  r="18"
                  className={minutesRemaining < 3 ? 'stroke-rose-500 transition-all duration-1000' : 'stroke-purple-400 transition-all duration-1000'}
                  strokeWidth="3"
                  strokeDasharray={113}
                  strokeDashoffset={113 - (113 * progressPercent) / 100}
                  strokeLinecap="round"
                  fill="transparent"
                />
              </svg>
              <Clock className="w-4 h-4 text-slate-300 absolute" />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-slate-400 uppercase">Window Timer</div>
              <div className={`font-mono text-xl font-bold tracking-tight ${minutesRemaining < 3 ? 'text-rose-400 animate-pulse' : 'text-slate-100'}`}>
                {formatTime(timeLeft)}
              </div>
            </div>
          </div>
        </div>

        {/* Live Contract Price Boxes */}
        <div className="space-y-4 pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* UP Contract */}
            <div
              className={`w-full py-5 px-6 rounded-2xl font-bold text-center transition-all duration-200 flex items-center justify-center cursor-default select-none bg-gradient-to-br from-[#072418] to-[#04170f] text-[#34d399] border border-[#10b981]/40 shadow-[0_4px_20px_rgba(16,185,129,0.15)] ${
                upTick === 'up'
                  ? 'brightness-125 scale-[1.01] border-[#34d399]'
                  : upTick === 'down'
                  ? 'brightness-90'
                  : ''
              } ${isUpHighPair ? 'ring-4 ring-emerald-400 shadow-[0_0_35px_rgba(52,211,153,0.45)] scale-[1.01]' : 'hover:border-[#10b981]/70'}`}
            >
              <div className="flex items-center justify-center gap-3">
                <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <Zap className="w-6 h-6 fill-[#34d399] text-[#34d399]" />
                </div>
                <div className="text-left">
                  <div className="text-[11px] font-bold tracking-wider uppercase text-emerald-400/80">
                    Up Contract
                  </div>
                  <div className="text-3xl font-black font-mono tracking-tight text-white flex items-center gap-2">
                    {upCents !== null ? `${upCents}¢` : '--¢'}
                    {upTick === 'up' && <ArrowUpRight className="w-5 h-5 text-emerald-400 animate-bounce" />}
                    {upTick === 'down' && <ArrowDownRight className="w-5 h-5 text-rose-400 animate-bounce" />}
                  </div>
                </div>
                {isUpHighPair && (
                  <span className="ml-2 text-[10px] font-black uppercase bg-emerald-400 text-slate-950 px-2.5 py-1 rounded-full animate-pulse shadow-lg shadow-emerald-400/50">
                    PAIR TRIGGER: UP ≥ 75¢
                  </span>
                )}
              </div>
            </div>

            {/* DOWN Contract */}
            <div
              className={`w-full py-5 px-6 rounded-2xl font-bold text-center transition-all duration-200 flex items-center justify-center cursor-default select-none bg-gradient-to-br from-[#061e2b] to-[#031119] text-[#38bdf8] border border-[#06b6d4]/40 shadow-[0_4px_20px_rgba(6,182,212,0.15)] ${
                downTick === 'up'
                  ? 'brightness-125 scale-[1.01] border-[#38bdf8]'
                  : downTick === 'down'
                  ? 'brightness-90'
                  : ''
              } ${isDownHighPair ? 'ring-4 ring-cyan-400 shadow-[0_0_35px_rgba(56,189,248,0.45)] scale-[1.01]' : 'hover:border-[#06b6d4]/70'}`}
            >
              <div className="flex items-center justify-center gap-3">
                <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
                  <Zap className="w-6 h-6 fill-[#38bdf8] text-[#38bdf8]" />
                </div>
                <div className="text-left">
                  <div className="text-[11px] font-bold tracking-wider uppercase text-cyan-400/80">
                    Down Contract
                  </div>
                  <div className="text-3xl font-black font-mono tracking-tight text-white flex items-center gap-2">
                    {downCents !== null ? `${downCents}¢` : '--¢'}
                    {downTick === 'up' && <ArrowUpRight className="w-5 h-5 text-cyan-400 animate-bounce" />}
                    {downTick === 'down' && <ArrowDownRight className="w-5 h-5 text-rose-400 animate-bounce" />}
                  </div>
                </div>
                {isDownHighPair && (
                  <span className="ml-2 text-[10px] font-black uppercase bg-cyan-400 text-slate-950 px-2.5 py-1 rounded-full animate-pulse shadow-lg shadow-cyan-400/50">
                    PAIR TRIGGER: DOWN ≥ 75¢
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Strategy Status Banner */}
          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono">
            <div className="flex items-center gap-2 text-slate-300">
              <Scale className="w-4 h-4 text-purple-400" />
              <span>
                Target Pair Sizing:{' '}
                <b className="text-white font-bold">{config.shares || 10} shares</b> per leg (High: ≥{Math.round(highThreshold * 100)}¢, Low: ≤{Math.round(lowThreshold * 100)}¢)
              </span>
            </div>
            <div>
              {isUpHighPair ? (
                <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  ARBITRAGE OPPORTUNITY: UP @ {upCents}¢ + DOWN @ {downCents}¢
                </span>
              ) : isDownHighPair ? (
                <span className="text-cyan-400 font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  ARBITRAGE OPPORTUNITY: DOWN @ {downCents}¢ + UP @ {upCents}¢
                </span>
              ) : (
                <span className="text-slate-400">
                  Current Sum: <b className="text-slate-200">{(upPrice !== null && downPrice !== null) ? `${Math.round((upPrice + downPrice) * 100)}¢` : '--'}</b> / 100¢
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* $100 Bankroll Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5 sm:gap-4">
        {/* Card 1: Cash Balance */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 sm:p-5 relative overflow-hidden backdrop-blur-sm shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider">Pair Cash</span>
            <div className="p-2 rounded-xl bg-slate-800/80 border border-slate-700/60 text-purple-400">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-bold font-mono text-slate-100">
              ${account.cashBalance !== undefined ? account.cashBalance.toFixed(2) : '100.00'}
            </span>
          </div>
          <div className="mt-1 text-[11px] sm:text-xs text-slate-500 font-mono">
            Bankroll: $100.00
          </div>
        </div>

        {/* Card 2: Realized PnL (Net of Fees) */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 sm:p-5 relative overflow-hidden backdrop-blur-sm shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider">Realized Net PnL</span>
            <div className={`p-2 rounded-xl border ${realizedPnl >= 0 ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border-rose-500/30 text-rose-400'}`}>
              {realizedPnl >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className={`text-xl sm:text-2xl font-bold font-mono ${realizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {realizedPnl >= 0 ? '+' : ''}${realizedPnl.toFixed(2)}
            </span>
          </div>
          <div className="mt-1 text-[11px] sm:text-xs text-slate-500 font-mono">
            Net profit after all fees
          </div>
        </div>

        {/* Card 3: Total Fees Paid */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 sm:p-5 relative overflow-hidden backdrop-blur-sm shadow-lg ring-1 ring-amber-500/20">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-semibold text-amber-400 uppercase tracking-wider">Fees Paid</span>
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-bold font-mono text-amber-300">
              ${feesPaid.toFixed(2)}
            </span>
          </div>
          <div className="mt-1 text-[11px] sm:text-xs text-slate-500 font-mono">
            Exact taker fees
          </div>
        </div>

        {/* Card 4: Open Positions */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 sm:p-5 relative overflow-hidden backdrop-blur-sm shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider">Open Positions</span>
            <div className="p-2 rounded-xl bg-slate-800/80 border border-slate-700/60 text-purple-400">
              <PieChart className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-bold font-mono text-slate-100">
              {openPositions.length}
            </span>
          </div>
          <div className="mt-1 text-[11px] sm:text-xs text-slate-500 font-mono">
            Active pair legs
          </div>
        </div>

        {/* Card 5: Win Rate */}
        <div className="col-span-2 sm:col-span-1 bg-slate-900/80 border border-slate-800 rounded-2xl p-4 sm:p-5 relative overflow-hidden backdrop-blur-sm shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider">Win Rate</span>
            <div className="p-2 rounded-xl bg-slate-800/80 border border-slate-700/60 text-amber-400">
              <Percent className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-bold font-mono text-slate-100">
              {metrics.winRate !== undefined ? `${metrics.winRate}%` : '0%'}
            </span>
          </div>
          <div className="mt-1 text-[11px] sm:text-xs text-slate-500 font-mono">
            {metrics.winningTrades || 0}W - {metrics.losingTrades || 0}L
          </div>
        </div>
      </div>

      {/* Active Positions */}
      {openPositions.length > 0 && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl backdrop-blur-sm">
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Layers className="w-4 h-4 text-purple-400" />
            Active Pair Positions ({openPositions.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {openPositions.map((pos) => {
              const isUp = pos.outcome.toUpperCase() === 'UP';
              const isProfitable = (pos.unrealizedPnl || 0) >= 0;
              return (
                <div
                  key={pos.id}
                  className={`p-4 rounded-xl border ${
                    isUp ? 'bg-emerald-950/20 border-emerald-500/30' : 'bg-cyan-950/20 border-cyan-500/30'
                  } flex flex-col justify-between gap-3`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-1 rounded-md text-xs font-black uppercase ${
                        isUp ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                      }`}>
                        {pos.outcome}
                      </span>
                      <span className="font-mono text-xs text-slate-300 font-bold">{pos.shares.toFixed(1)} Shares</span>
                    </div>
                    <button
                      onClick={() => onClosePosition(pos.id)}
                      className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 transition-all"
                    >
                      Close Leg
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs font-mono pt-2 border-t border-slate-800/80">
                    <div>
                      <span className="text-slate-500 block text-[10px]">Entry Price</span>
                      <span className="text-slate-200 font-bold">{Math.round(pos.entryPrice * 100)}¢</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Live Price</span>
                      <span className="text-slate-200 font-bold">{Math.round((pos.currentPrice || pos.entryPrice) * 100)}¢</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Total Cost</span>
                      <span className="text-slate-200 font-bold">${pos.totalCost.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs font-mono pt-2 border-t border-slate-800/60">
                    <span className="text-slate-400">Unrealized PnL:</span>
                    <span className={`font-bold ${isProfitable ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {isProfitable ? '+' : ''}${pos.unrealizedPnl ? pos.unrealizedPnl.toFixed(2) : '0.00'} ({pos.unrealizedPnlPercent ? pos.unrealizedPnlPercent.toFixed(1) : '0.0'}%)
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Trade History Ledger */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl backdrop-blur-sm overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <Clock className="w-4 h-4 text-purple-400" />
            Pair Strategy Trade Ledger ({account.history?.length || 0})
          </h3>
          <span className="text-xs text-slate-400 font-mono">
            Every profit strictly shown net of fees
          </span>
        </div>

        {(!account.history || account.history.length === 0) ? (
          <div className="text-center py-10 text-slate-500 text-xs font-mono">
            No trades taken yet in this 75¢/20¢ Pair Strategy session. Trades will trigger when UP or DOWN crosses 75¢.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider">
                  <th className="py-2.5 px-3">Time</th>
                  <th className="py-2.5 px-3">Side</th>
                  <th className="py-2.5 px-3">Outcome</th>
                  <th className="py-2.5 px-3">Entry / Copy</th>
                  <th className="py-2.5 px-3">Exit Price</th>
                  <th className="py-2.5 px-3">Proceeds</th>
                  <th className="py-2.5 px-3">Realized PnL (Net)</th>
                  <th className="py-2.5 px-3">Fees</th>
                  <th className="py-2.5 px-3">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {account.history.slice(0, 30).map((trade: any) => {
                  const isSell = trade.side === 'SELL';
                  const isWin = isSell && ((trade.realizedProfitUsdc ?? trade.pnlUsdc ?? 0) > 0 || trade.exitPrice >= 0.99 || trade.copyPrice >= 0.99);
                  const isLoss = isSell && !isWin;
                  const netProfit = trade.realizedProfitUsdc ?? trade.pnlUsdc ?? 0;
                  const fee = trade.feeUsdc !== undefined ? trade.feeUsdc : ((trade.buyFeeUsdc || 0) + (trade.sellFeeUsdc || 0));

                  return (
                    <tr key={trade.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 px-3 text-slate-400">
                        {new Date((trade.timestamp || Date.now() / 1000) * 1000).toLocaleTimeString()}
                      </td>
                      <td className="py-3 px-3 font-bold">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                          trade.side === 'BUY'
                            ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                        }`}>
                          {trade.side}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                          trade.outcome?.toUpperCase() === 'UP'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                            : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                        }`}>
                          {trade.outcome}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        ${(trade.copySizeUsdc || trade.usdcSize || 0).toFixed(2)} @ {Math.round((trade.copyPrice || trade.targetPrice || 0) * 100)}¢
                      </td>
                      <td className="py-3 px-3">
                        {isSell ? `${Math.round((trade.exitPrice ?? trade.copyPrice ?? 0) * 100)}¢` : '--'}
                      </td>
                      <td className="py-3 px-3">
                        {isSell ? `$${(trade.grossProceedsUsdc ?? trade.netProceedsUsdc ?? trade.copySizeUsdc ?? 0).toFixed(2)}` : '--'}
                      </td>
                      <td className="py-3 px-3 font-bold">
                        {isSell ? (
                          <span className={netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                            {netProfit >= 0 ? '+' : ''}${netProfit.toFixed(2)} ({trade.pnlPercent ? `${trade.pnlPercent.toFixed(1)}%` : '--'})
                          </span>
                        ) : (
                          <span className="text-slate-500">Filled</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-amber-300">
                        ${fee.toFixed(2)}
                      </td>
                      <td className="py-3 px-3 text-[10px] text-slate-400">
                        {trade.sellReason || trade.fillReason || (isWin ? 'RESOLUTION_WIN_$1.00' : isLoss ? 'RESOLUTION_LOSS_$0.00' : 'FILLED')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
