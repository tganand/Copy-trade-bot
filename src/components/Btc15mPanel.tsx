import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Clock,
  Zap,
  Target,
  ShieldAlert,
  RotateCcw,
  Play,
  Pause,
  ArrowUpRight,
  ArrowDownRight,
  DollarSign,
  PieChart,
  CheckCircle2,
  XCircle,
  Percent,
} from 'lucide-react';
import {
  ActiveBtcWindow,
  Btc15mBotConfig,
  PaperAccount,
  PortfolioMetrics,
} from '../types/index.ts';

interface Btc15mPanelProps {
  activeWindow: ActiveBtcWindow | null;
  marketBooks: Record<string, any>;
  account: PaperAccount;
  metrics: PortfolioMetrics;
  config: Btc15mBotConfig;
  onResetAccount: () => void;
  onClosePosition: (positionId: string) => void;
}

export const Btc15mPanel: React.FC<Btc15mPanelProps> = ({
  activeWindow,
  marketBooks,
  account,
  metrics,
  config,
  onResetAccount,
  onClosePosition,
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

  let upPrice: number | null = upBook
    ? (upBook.bestAsk > 0 ? upBook.bestAsk : (upBook.lastPrice > 0 ? upBook.lastPrice : (upBook.bestBid > 0 ? upBook.bestBid : null)))
    : (activeWindow?.outcomePrices?.[0] ?? null);

  let downPrice: number | null = downBook
    ? (downBook.bestAsk > 0 ? downBook.bestAsk : (downBook.lastPrice > 0 ? downBook.lastPrice : (downBook.bestBid > 0 ? downBook.bestBid : null)))
    : (activeWindow?.outcomePrices?.[1] ?? null);

  // Complementary prices
  if (upPrice !== null && (downPrice === null || Math.abs(upPrice + downPrice - 1.0) > 0.05)) {
    downPrice = Number(Math.max(0.01, Math.min(0.99, 1.0 - upPrice)).toFixed(3));
  } else if (downPrice !== null && upPrice === null) {
    upPrice = Number(Math.max(0.01, Math.min(0.99, 1.0 - downPrice)).toFixed(3));
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
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const minutesRemaining = Math.floor(timeLeft / 60);
  const totalWindowDuration = 900; // 15 mins
  const progressPercent = Math.max(0, Math.min(100, ((totalWindowDuration - timeLeft) / totalWindowDuration) * 100));

  const isUpTriggered = upPrice !== null && upPrice >= (config.entryThreshold || 0.75);
  const isDownTriggered = downPrice !== null && downPrice >= (config.entryThreshold || 0.75);

  const openPositions = Object.values(account.positions || {});

  return (
    <div className="space-y-6">
      {/* 1. Header Banner & Strategy Rule Control */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 backdrop-blur-md shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                15m BTC Momentum Strategy
                <span className="text-xs px-2.5 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/25 font-mono">
                  75¢ Breakout
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Automatically buys $10 when Up or Down crosses ≥ 75¢. Target: $1.00 (100¢) · Stop-Loss: $0.40 (40¢)
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 self-stretch md:self-auto justify-end">
          <button
            type="button"
            onClick={onResetAccount}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800/80 hover:bg-slate-800 text-slate-300 border border-slate-700/80 transition-all shadow-sm active:scale-95"
            title="Reset 15m paper account balance to $100"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset ($100)
          </button>
        </div>
      </div>

      {/* 2. Live 15m Market Window Price Card (Styled exactly to Polymarket screenshot) */}
      <div className="bg-gradient-to-br from-slate-900/90 via-slate-900/80 to-slate-950 border border-slate-800 rounded-2xl p-6 backdrop-blur-md shadow-2xl relative overflow-hidden space-y-4">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 pb-4 border-b border-slate-800/80">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
              <span>Active 15-Minute Polymarket Market</span>
              <span className="text-slate-600">·</span>
              <span className="font-mono text-amber-400">{activeWindow?.slug || 'Loading...'}</span>
            </div>
            <h3 className="text-xl font-bold text-slate-100">
              {activeWindow?.title || 'Bitcoin Up or Down - 15m Window'}
            </h3>
          </div>

          {/* 15m Timer */}
          <div className="flex items-center gap-4 bg-slate-950/60 border border-slate-800/80 px-4 py-3 rounded-xl">
            <div className="relative w-11 h-11 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90">
                <circle cx="22" cy="22" r="18" className="stroke-slate-800" strokeWidth="3" fill="transparent" />
                <circle
                  cx="22"
                  cy="22"
                  r="18"
                  className={minutesRemaining < 3 ? 'stroke-rose-500 transition-all duration-1000' : 'stroke-amber-400 transition-all duration-1000'}
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
              <div className="text-[11px] font-semibold text-slate-400 uppercase">Time Remaining</div>
              <div className={`font-mono text-xl font-bold tracking-tight ${minutesRemaining < 3 ? 'text-rose-400 animate-pulse' : 'text-slate-100'}`}>
                {formatTime(timeLeft)}
              </div>
            </div>
          </div>
        </div>

        {/* Polymarket 3D Up/Down Buttons (Exact Match to User Attachment) */}
        <div className="space-y-3 pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* UP Button (Lime Green with 3D bottom bevel & lightning icon) */}
            <div
              className={`w-full py-4 px-6 rounded-2xl font-bold text-center transition-all flex items-center justify-center cursor-default select-none shadow-[0_5px_0_0_#5fa740] bg-[#a3f77b] text-[#0d3408] border border-[#b2fb8d] ${
                upTick === 'up'
                  ? 'brightness-110 scale-[1.01]'
                  : upTick === 'down'
                  ? 'brightness-90'
                  : ''
              } ${isUpTriggered ? 'ring-4 ring-emerald-400/50' : ''}`}
            >
              <div className="flex items-center justify-center gap-2.5">
                <Zap className="w-6 h-6 fill-[#0d3408] text-[#0d3408]" />
                <span className="text-2xl sm:text-3xl font-black tracking-tight">
                  {upCents !== null ? `Up ${upCents}¢` : 'Up --¢'}
                </span>
                {upTick === 'up' && <ArrowUpRight className="w-5 h-5 text-[#0d3408] animate-bounce" />}
                {upTick === 'down' && <ArrowDownRight className="w-5 h-5 text-[#0d3408] animate-bounce" />}
                {isUpTriggered && (
                  <span className="ml-1 text-[11px] font-extrabold uppercase bg-[#0d3408] text-[#a3f77b] px-2 py-0.5 rounded-full animate-pulse">
                    ≥75¢ HIT
                  </span>
                )}
              </div>
            </div>

            {/* DOWN Button (Dark Navy/Cyan with 3D bottom bevel & Electric Cyan lightning icon and text) */}
            <div
              className={`w-full py-4 px-6 rounded-2xl font-bold text-center transition-all flex items-center justify-center cursor-default select-none shadow-[0_5px_0_0_#041217] bg-[#071f28] text-[#00d4ff] border border-[#0d303d] ${
                downTick === 'up'
                  ? 'brightness-125 scale-[1.01]'
                  : downTick === 'down'
                  ? 'brightness-85'
                  : ''
              } ${isDownTriggered ? 'ring-4 ring-cyan-400/50' : ''}`}
            >
              <div className="flex items-center justify-center gap-2.5">
                <Zap className="w-6 h-6 fill-[#00d4ff] text-[#00d4ff]" />
                <span className="text-2xl sm:text-3xl font-black tracking-tight">
                  {downCents !== null ? `Down ${downCents}¢` : 'Down --¢'}
                </span>
                {downTick === 'up' && <ArrowUpRight className="w-5 h-5 text-[#00d4ff] animate-bounce" />}
                {downTick === 'down' && <ArrowDownRight className="w-5 h-5 text-[#00d4ff] animate-bounce" />}
                {isDownTriggered && (
                  <span className="ml-1 text-[11px] font-extrabold uppercase bg-[#00d4ff] text-[#071f28] px-2 py-0.5 rounded-full animate-pulse">
                    ≥75¢ HIT
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Clean Ticker Line Matching Polymarket (Spread & Best Bid/Ask) */}
          <div className="flex items-center justify-between text-xs font-mono text-slate-400 bg-slate-950/60 px-4 py-2.5 rounded-xl border border-slate-800/60">
            <div>
              Spread:{' '}
              <b className="text-slate-200">
                {upBook && upBook.spread > 0 ? `${Math.round(upBook.spread * 100)}¢` : '1¢'}
              </b>
            </div>
            <div className="flex items-center gap-3">
              <span>
                Bid:{' '}
                <b className="text-emerald-400">
                  {upBook && upBook.bestBid > 0 ? `${Math.round(upBook.bestBid * 100)}¢` : (upCents !== null ? `${Math.max(1, upCents - 1)}¢` : '-')}
                </b>
              </span>
              <span className="text-slate-600">|</span>
              <span>
                Ask:{' '}
                <b className="text-rose-400">
                  {upBook && upBook.bestAsk > 0 ? `${Math.round(upBook.bestAsk * 100)}¢` : (upCents !== null ? `${upCents}¢` : '-')}
                </b>
              </span>
            </div>
          </div>

          {/* 75¢ Entry Trigger Progress Indicator */}
          <div className="bg-slate-950/40 p-3.5 rounded-xl border border-slate-800/60 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-semibold">
                Momentum Breakout Trigger: <b className="text-amber-400 font-mono">≥ 75.0¢</b> ($10 Trade Stake)
              </span>
              <span className="font-mono text-xs">
                {isUpTriggered ? (
                  <span className="text-emerald-400 font-bold">UP TRIGGER MET ({upCents}¢)</span>
                ) : isDownTriggered ? (
                  <span className="text-cyan-400 font-bold">DOWN TRIGGER MET ({downCents}¢)</span>
                ) : (
                  <span className="text-slate-400">
                    Highest: {Math.max(upCents || 0, downCents || 0)}¢ / 75¢ ({Math.round((Math.max(upCents || 0, downCents || 0) / 75) * 100)}%)
                  </span>
                )}
              </span>
            </div>
            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden flex">
              <div
                className={`h-full transition-all duration-300 ${
                  isUpTriggered
                    ? 'bg-emerald-400'
                    : isDownTriggered
                    ? 'bg-cyan-400'
                    : 'bg-amber-400/70'
                }`}
                style={{
                  width: `${Math.min(100, (Math.max(upCents || 0, downCents || 0) / 75) * 100)}%`,
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 3. 15m Portfolio Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Bankroll Cash */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 relative overflow-hidden backdrop-blur-sm shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">15m Cash Balance</span>
            <div className="p-2 rounded-xl bg-slate-800/80 border border-slate-700/60 text-emerald-400">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-slate-100">
              ${account.cashBalance.toFixed(2)}
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-500 font-mono">
            Initial: ${account.initialBalance.toFixed(2)}
          </div>
        </div>

        {/* Card 2: Floating Unrealized PnL */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 relative overflow-hidden backdrop-blur-sm shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Floating Unrealized PnL</span>
            <div className={`p-2 rounded-xl border ${metrics.unrealizedPnl >= 0 ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border-rose-500/30 text-rose-400'}`}>
              <PieChart className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className={`text-2xl font-bold font-mono ${metrics.unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {metrics.unrealizedPnl >= 0 ? '+' : ''}${metrics.unrealizedPnl.toFixed(2)}
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-500 font-mono">
            Open Positions: {openPositions.length}
          </div>
        </div>

        {/* Card 3: Win Rate */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 relative overflow-hidden backdrop-blur-sm shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">15m Win Rate</span>
            <div className="p-2 rounded-xl bg-slate-800/80 border border-slate-700/60 text-amber-400">
              <Percent className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-slate-100">
              {metrics.winRate.toFixed(1)}%
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-500 font-mono">
            {metrics.winningTrades}W · {metrics.losingTrades}L ({account.totalTrades} closed)
          </div>
        </div>

        {/* Card 4: Net Realized Profit */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 relative overflow-hidden backdrop-blur-sm shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Realized Net Profit</span>
            <div className={`p-2 rounded-xl border ${metrics.realizedPnl >= 0 ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border-rose-500/30 text-rose-400'}`}>
              {metrics.realizedPnl >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className={`text-2xl font-bold font-mono ${metrics.realizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {metrics.realizedPnl >= 0 ? '+' : ''}${metrics.realizedPnl.toFixed(2)}
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-500 font-mono">
            Total Return: {metrics.totalPnlPercent >= 0 ? '+' : ''}{metrics.totalPnlPercent.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* 4. Active Open 15m Positions */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
            Active 15m Positions
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
              {openPositions.length}
            </span>
          </h3>
        </div>

        {openPositions.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-slate-800 rounded-xl">
            <Target className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-400">No active 15m positions</p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              The bot is monitoring live prices. When Up or Down crosses ≥ 75.0¢, an automated $10 trade will trigger here.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {openPositions.map((pos) => {
              const book = marketBooks[pos.asset];
              const livePrice = book?.bestBid || book?.lastPrice || pos.currentPrice;
              const pnl = Number((pos.shares * livePrice - pos.totalCost).toFixed(2));
              const pnlPercent = Number((((livePrice - pos.entryPrice) / pos.entryPrice) * 100).toFixed(1));
              const isWin = pnl >= 0;

              return (
                <div
                  key={pos.id}
                  className="p-5 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${pos.outcome.toUpperCase() === 'UP' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'}`}>
                        {pos.outcome}
                      </span>
                      <span className="font-semibold text-slate-200 text-sm">{pos.title}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-400 font-mono">
                      <span>Invested: <b className="text-slate-200">${pos.totalCost.toFixed(2)}</b></span>
                      <span>·</span>
                      <span>Entry: <b className="text-slate-200">{(pos.entryPrice * 100).toFixed(1)}¢</b></span>
                      <span>·</span>
                      <span>Live Price: <b className={isWin ? 'text-emerald-400' : 'text-rose-400'}>{(livePrice * 100).toFixed(1)}¢</b></span>
                      <span>·</span>
                      <span>Shares: {pos.shares.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
                    {/* Live PnL */}
                    <div className="text-right">
                      <div className={`text-base font-bold font-mono ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isWin ? '+' : ''}${pnl.toFixed(2)} ({isWin ? '+' : ''}{pnlPercent}%)
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        Target: 100.0¢ · Stop: 40.0¢
                      </div>
                    </div>

                    {/* Manual Close Button */}
                    <button
                      type="button"
                      onClick={() => onClosePosition(pos.id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition-all active:scale-95"
                    >
                      Exit Market
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. 15m Trade History Ledger */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm shadow-xl overflow-hidden">
        <h3 className="text-base font-bold text-slate-100 mb-4 flex items-center gap-2">
          15m Trade History Ledger
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
            {account.history.length}
          </span>
        </h3>

        {account.history.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-500">
            No closed 15m trades recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2.5 px-3">Time</th>
                  <th className="py-2.5 px-3">Side</th>
                  <th className="py-2.5 px-3">Outcome</th>
                  <th className="py-2.5 px-3">Entry / Copy</th>
                  <th className="py-2.5 px-3">Exit Price</th>
                  <th className="py-2.5 px-3">Gross / Net Proceeds</th>
                  <th className="py-2.5 px-3">Realized PnL</th>
                  <th className="py-2.5 px-3">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {account.history.map((tx) => {
                  const isProfit = (tx.pnlUsdc ?? 0) >= 0;
                  const isBuy = tx.side === 'BUY';
                  return (
                    <tr key={tx.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 px-3 text-slate-400">
                        {new Date(tx.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </td>
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isBuy ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
                          {tx.side}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-semibold text-slate-200">
                        {tx.outcome}
                      </td>
                      <td className="py-3 px-3 text-slate-300">
                        ${tx.copySizeUsdc.toFixed(2)} @ {(tx.copyPrice * 100).toFixed(1)}¢
                      </td>
                      <td className="py-3 px-3 text-slate-300">
                        {tx.exitPrice ? `${(tx.exitPrice * 100).toFixed(1)}¢` : '--'}
                      </td>
                      <td className="py-3 px-3 text-slate-300">
                        {tx.netProceedsUsdc !== undefined ? `$${tx.netProceedsUsdc.toFixed(2)}` : '--'}
                      </td>
                      <td className="py-3 px-3 font-bold">
                        {tx.side === 'SELL' ? (
                          <span className={isProfit ? 'text-emerald-400' : 'text-rose-400'}>
                            {isProfit ? '+' : ''}${tx.pnlUsdc?.toFixed(2)} ({isProfit ? '+' : ''}{tx.pnlPercent}%)
                          </span>
                        ) : (
                          <span className="text-slate-500">Filled</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-slate-400">
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-[11px] text-slate-300 font-mono">
                          {tx.sellReason || tx.fillStatus || 'EXECUTED'}
                        </span>
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
