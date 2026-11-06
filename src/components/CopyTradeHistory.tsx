import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  History,
  Clock,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Layers,
  ArrowRight,
  ShieldAlert,
  Percent,
  CheckCircle2,
  Receipt,
  Scale,
  Sparkles,
} from 'lucide-react';
import { CopyTradeRecord, PaperPosition } from '../types/index.ts';

interface CopyTradeHistoryProps {
  history: CopyTradeRecord[];
  activePositions?: PaperPosition[];
  marketBooks?: Record<string, any>;
}

interface GroupedPosition {
  id: string; // conditionId_outcome or slug_outcome
  title: string;
  slug: string;
  outcome: string;
  asset: string;
  isOpen: boolean;
  firstTimestamp: number;
  lastTimestamp: number;
  trades: CopyTradeRecord[];
  
  // Aggregate Accounting
  totalInvestedUsdc: number;
  grossPurchasesUsdc: number;
  totalSharesPurchased: number;
  totalSharesSold: number;
  sharesRemaining: number;
  
  capitalRecoveredUsdc: number;
  remainingCapitalUsdc: number;
  
  grossProceedsUsdc: number;
  netProceedsUsdc: number;
  realizedProfitUsdc: number;
  
  currentPrice: number;
  unrealizedProfitUsdc: number;
  totalNetProfitUsdc: number;
  roiPercent: number;
  
  totalBuyFeesUsdc: number;
  totalSellFeesUsdc: number;
  totalFeesUsdc: number;
  feeSources: Set<'market' | 'assumed'>;
}

export const CopyTradeHistory: React.FC<CopyTradeHistoryProps> = ({
  history,
  activePositions = [],
  marketBooks = {},
}) => {
  const [viewMode, setViewMode] = useState<'grouped' | 'flat'>('grouped');
  const [filter, setFilter] = useState<'all' | 'profitable' | 'loss' | 'open' | 'closed'>('all');
  const [expandedPositionIds, setExpandedPositionIds] = useState<Record<string, boolean>>({});

  const formatTime = (ts: number) => {
    return new Date(ts * 1000).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  const toggleExpand = (id: string) => {
    setExpandedPositionIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Group transactions by market & outcome into complete position lifecycles
  const groupedPositions = useMemo(() => {
    const groups: Record<string, GroupedPosition> = {};

    // History is usually sorted newest first. Let's process oldest-first for chronological position tracking
    const chronologicalHistory = [...history].sort((a, b) => a.timestamp - b.timestamp);

    for (const trade of chronologicalHistory) {
      const groupKey = trade.positionId || `${trade.conditionId || trade.slug || trade.asset}_${trade.outcome}`;
      if (!groups[groupKey]) {
        groups[groupKey] = {
          id: groupKey,
          title: trade.title || 'Polymarket Position',
          slug: trade.slug,
          outcome: trade.outcome,
          asset: trade.asset,
          isOpen: false,
          firstTimestamp: trade.timestamp,
          lastTimestamp: trade.timestamp,
          trades: [],
          totalInvestedUsdc: 0,
          grossPurchasesUsdc: 0,
          totalSharesPurchased: 0,
          totalSharesSold: 0,
          sharesRemaining: 0,
          capitalRecoveredUsdc: 0,
          remainingCapitalUsdc: 0,
          grossProceedsUsdc: 0,
          netProceedsUsdc: 0,
          realizedProfitUsdc: 0,
          currentPrice: 0,
          unrealizedProfitUsdc: 0,
          totalNetProfitUsdc: 0,
          roiPercent: 0,
          totalBuyFeesUsdc: 0,
          totalSellFeesUsdc: 0,
          totalFeesUsdc: 0,
          feeSources: new Set(),
        };
      }

      const g = groups[groupKey];
      g.lastTimestamp = Math.max(g.lastTimestamp, trade.timestamp);
      g.trades.push(trade);

      if (trade.feeSource) {
        g.feeSources.add(trade.feeSource);
      }

      if (trade.side === 'BUY') {
        const grossCost = trade.copySizeUsdc;
        const buyFee = trade.buyFeeUsdc ?? trade.feeUsdc ?? 0;
        g.grossPurchasesUsdc += grossCost;
        g.totalInvestedUsdc += (grossCost + buyFee);
        g.totalSharesPurchased += trade.copyShares;
        g.totalBuyFeesUsdc += buyFee;
        g.totalFeesUsdc += buyFee;
      } else if (trade.side === 'SELL') {
        const sharesSold = trade.copyShares;
        const sellFee = trade.sellFeeUsdc ?? trade.feeUsdc ?? 0;
        const grossProc = trade.grossProceedsUsdc ?? trade.copySizeUsdc;
        const netProc = trade.netProceedsUsdc ?? (grossProc - sellFee);
        const capRecovered = trade.capitalRecoveredUsdc ?? (grossProc - (trade.pnlUsdc ?? 0));
        const profit = trade.realizedProfitUsdc ?? trade.pnlUsdc ?? (netProc - capRecovered);

        g.totalSharesSold += sharesSold;
        g.grossProceedsUsdc += grossProc;
        g.netProceedsUsdc += netProc;
        g.capitalRecoveredUsdc += capRecovered;
        g.realizedProfitUsdc += profit;
        g.totalSellFeesUsdc += sellFee;
        g.totalFeesUsdc += sellFee;
      }
    }

    // Match with current active positions for live unrealized mark-to-market
    const activeMap: Record<string, PaperPosition> = {};
    for (const pos of activePositions) {
      activeMap[pos.id] = pos;
    }

    for (const g of Object.values(groups)) {
      const active = activeMap[g.id];
      const sharesLeft = Math.max(0, g.totalSharesPurchased - g.totalSharesSold);
      g.sharesRemaining = sharesLeft;

      if (active && active.shares > 0.001) {
        g.isOpen = true;
        g.remainingCapitalUsdc = active.totalCost - (active.buyFeePaid || 0);
        const book = marketBooks[active.asset];
        const liveP = book?.bestBid > 0 ? book.bestBid : (active.currentPrice > 0 ? active.currentPrice : active.entryPrice);
        g.currentPrice = liveP;
        const estSellFee = active.shares * 0.07 * liveP * (1 - liveP);
        g.unrealizedProfitUsdc = (active.shares * liveP) - g.remainingCapitalUsdc - (active.buyFeePaid || 0) - estSellFee;
      } else if (sharesLeft > 0.001) {
        g.isOpen = true;
        g.remainingCapitalUsdc = Math.max(0, g.grossPurchasesUsdc - g.capitalRecoveredUsdc);
      } else {
        g.isOpen = false;
        g.remainingCapitalUsdc = 0;
        g.sharesRemaining = 0;
      }

      g.totalNetProfitUsdc = g.realizedProfitUsdc + (g.isOpen ? g.unrealizedProfitUsdc : 0);
      const baseForRoi = g.totalInvestedUsdc > 0 ? g.totalInvestedUsdc : 1;
      g.roiPercent = Number(((g.totalNetProfitUsdc / baseForRoi) * 100).toFixed(2));
    }

    // Sort newest positions first
    return Object.values(groups).sort((a, b) => b.lastTimestamp - a.lastTimestamp);
  }, [history, activePositions, marketBooks]);

  // Overall Aggregate Lifetime Stats
  const lifetimeStats = useMemo(() => {
    let totalInvested = 0;
    let capitalRecovered = 0;
    let realizedProfit = 0;
    let netProceeds = 0;
    let totalFees = 0;
    let totalBuyFees = 0;
    let totalSellFees = 0;
    let totalWins = 0;
    let totalLosses = 0;

    for (const g of groupedPositions) {
      totalInvested += g.totalInvestedUsdc;
      capitalRecovered += g.capitalRecoveredUsdc;
      realizedProfit += g.realizedProfitUsdc;
      netProceeds += g.netProceedsUsdc;
      totalFees += g.totalFeesUsdc;
      totalBuyFees += g.totalBuyFeesUsdc;
      totalSellFees += g.totalSellFeesUsdc;

      if (!g.isOpen) {
        if (g.realizedProfitUsdc > 0.001) totalWins++;
        else if (g.realizedProfitUsdc < -0.001) totalLosses++;
      }
    }

    const overallRoi = totalInvested > 0 ? ((realizedProfit / totalInvested) * 100) : 0;
    const closedCount = totalWins + totalLosses;
    const winRate = closedCount > 0 ? Math.round((totalWins / closedCount) * 100) : 0;

    return {
      totalInvested,
      capitalRecovered,
      realizedProfit,
      netProceeds,
      totalFees,
      totalBuyFees,
      totalSellFees,
      overallRoi,
      totalWins,
      totalLosses,
      winRate,
    };
  }, [groupedPositions]);

  // Filtered positions
  const filteredPositions = useMemo(() => {
    return groupedPositions.filter((g) => {
      if (filter === 'profitable') return g.realizedProfitUsdc > 0;
      if (filter === 'loss') return g.realizedProfitUsdc < 0;
      if (filter === 'open') return g.isOpen;
      if (filter === 'closed') return !g.isOpen;
      return true;
    });
  }, [groupedPositions, filter]);

  if (history.length === 0) {
    return (
      <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-8 text-center backdrop-blur-sm">
        <div className="w-12 h-12 mx-auto rounded-xl bg-slate-800 flex items-center justify-center text-slate-500 mb-3">
          <History className="w-6 h-6 text-emerald-400" />
        </div>
        <h4 className="text-sm font-semibold text-white">No Copy Trade Transactions Yet</h4>
        <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
          When qualifying trades occur, every purchase, partial take-profit, stop-loss, and resolution will be tracked here with full capital recovery and fee transparency.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 1. Master Accounting Dashboard Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 font-mono">
        {/* Invested Capital */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 shadow-sm">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1">
            <DollarSign className="w-3 h-3 text-cyan-400" />
            Invested Capital
          </div>
          <div className="text-base font-bold text-slate-100 mt-1">
            ${lifetimeStats.totalInvested.toFixed(2)}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Total bot outlay</div>
        </div>

        {/* Capital Recovered */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 shadow-sm">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1">
            <Scale className="w-3 h-3 text-emerald-400" />
            Capital Recovered
          </div>
          <div className="text-base font-bold text-emerald-400 mt-1">
            ${lifetimeStats.capitalRecovered.toFixed(2)}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Principal returned</div>
        </div>

        {/* Realized Profit */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 shadow-sm">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1">
            <TrendingUp className="w-3 h-3 text-emerald-400" />
            Realized Profit
          </div>
          <div
            className={`text-base font-bold mt-1 ${
              lifetimeStats.realizedProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {lifetimeStats.realizedProfit >= 0 ? '+' : ''}${lifetimeStats.realizedProfit.toFixed(2)}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Net of all fees</div>
        </div>

        {/* Total Money Received */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 shadow-sm">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1">
            <Receipt className="w-3 h-3 text-purple-400" />
            Total Received
          </div>
          <div className="text-base font-bold text-purple-300 mt-1">
            ${lifetimeStats.netProceeds.toFixed(2)}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Capital + Net Profit</div>
        </div>

        {/* Trading Fees Paid */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 shadow-sm">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1">
            <Percent className="w-3 h-3 text-amber-400" />
            Total Fees Paid
          </div>
          <div className="text-base font-bold text-amber-400 mt-1">
            ${lifetimeStats.totalFees.toFixed(2)}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Buy & Sell fees</div>
        </div>

        {/* Overall ROI & Win Rate */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 shadow-sm">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-cyan-400" />
            ROI & Win Rate
          </div>
          <div
            className={`text-base font-bold mt-1 ${
              lifetimeStats.overallRoi >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {lifetimeStats.overallRoi >= 0 ? '+' : ''}${lifetimeStats.overallRoi.toFixed(1)}%
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            Win Rate: <span className="text-white font-bold">{lifetimeStats.winRate}%</span> ({lifetimeStats.totalWins}W / {lifetimeStats.totalLosses}L)
          </div>
        </div>
      </div>

      {/* 2. Controls & Filter Bar */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
        <div className="flex items-center gap-2">
          <span className="text-slate-400 font-bold text-[11px] uppercase">View:</span>
          <div className="inline-flex rounded-lg bg-slate-950 p-0.5 border border-slate-800">
            <button
              type="button"
              onClick={() => setViewMode('grouped')}
              className={`px-3 py-1 rounded-md transition-all font-bold ${
                viewMode === 'grouped'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              📁 Grouped by Position ({groupedPositions.length})
            </button>
            <button
              type="button"
              onClick={() => setViewMode('flat')}
              className={`px-3 py-1 rounded-md transition-all font-bold ${
                viewMode === 'flat'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              📋 All Transactions ({history.length})
            </button>
          </div>
        </div>

        {/* Filter Dropdown */}
        <div className="flex items-center gap-2">
          <span className="text-slate-400 font-bold text-[11px] uppercase">Filter:</span>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200 focus:outline-none focus:border-emerald-500 font-mono text-xs"
          >
            <option value="all">All Positions ({groupedPositions.length})</option>
            <option value="open">Active / Open Only</option>
            <option value="closed">Closed / Settled Only</option>
            <option value="profitable">Profitable (+PnL)</option>
            <option value="loss">Losses (-PnL)</option>
          </select>
        </div>
      </div>

      {/* 3. GROUPED BY POSITION VIEW */}
      {viewMode === 'grouped' && (
        <div className="space-y-3.5">
          {filteredPositions.map((group) => {
            const isExpanded = expandedPositionIds[group.id] ?? false;
            const isProfitable = group.totalNetProfitUsdc >= 0;

            return (
              <div
                key={group.id}
                className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-lg backdrop-blur-sm transition-all"
              >
                {/* Position Header / Summary Banner */}
                <div
                  onClick={() => toggleExpand(group.id)}
                  className="p-3.5 sm:p-4 cursor-pointer hover:bg-slate-800/40 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800/60"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <button
                      type="button"
                      className="p-1 rounded-md bg-slate-800 text-slate-400 hover:text-white"
                      title={isExpanded ? 'Collapse' : 'Expand'}
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>

                    <span
                      className={`font-bold px-2 py-0.5 rounded text-[11px] font-mono uppercase tracking-wider ${
                        group.outcome.toLowerCase() === 'up' || group.outcome.toLowerCase() === 'yes'
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                      }`}
                    >
                      {group.outcome.toUpperCase()}
                    </span>

                    <div className="min-w-0">
                      <div className="text-sm font-bold text-white truncate font-sans">
                        {group.title}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono flex items-center gap-2 mt-0.5">
                        <Clock className="w-3 h-3 text-slate-500" />
                        <span>{formatTime(group.firstTimestamp)}</span>
                        <span>•</span>
                        <span>{group.trades.length} fill{group.trades.length > 1 ? 's' : ''}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right Header Status & Realized Figures */}
                  <div className="flex items-center flex-wrap gap-2.5 md:gap-4 font-mono text-xs">
                    {/* Status Badge */}
                    <span
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${
                        group.isOpen
                          ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30 animate-pulse'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {group.isOpen ? 'ACTIVE / OPEN' : 'SETTLED / CLOSED'}
                    </span>

                    {/* Invested */}
                    <div className="text-right">
                      <div className="text-[10px] text-slate-400 uppercase">Invested</div>
                      <div className="font-bold text-slate-200">${group.totalInvestedUsdc.toFixed(2)}</div>
                    </div>

                    {/* Recovered */}
                    <div className="text-right">
                      <div className="text-[10px] text-slate-400 uppercase">Recovered</div>
                      <div className="font-bold text-emerald-400">${group.capitalRecoveredUsdc.toFixed(2)}</div>
                    </div>

                    {/* Realized Profit */}
                    <div className="text-right">
                      <div className="text-[10px] text-slate-400 uppercase">Net Realized PnL</div>
                      <div
                        className={`font-bold flex items-center gap-1 ${
                          isProfitable ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {isProfitable ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {isProfitable ? '+' : ''}${group.realizedProfitUsdc.toFixed(2)} ({group.roiPercent >= 0 ? '+' : ''}{group.roiPercent.toFixed(1)}%)
                      </div>
                    </div>
                  </div>
                </div>

                {/* Expanded Details: Institutional Position Accounting Breakdown */}
                {isExpanded && (
                  <div className="p-4 bg-slate-950/60 space-y-4">
                    {/* Comprehensive Position Metrics Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 font-mono text-xs">
                      {/* Total Invested */}
                      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5">
                        <div className="text-[10px] text-slate-400 uppercase">1. Invested Capital</div>
                        <div className="text-sm font-bold text-white mt-0.5">${group.totalInvestedUsdc.toFixed(2)}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">({group.totalSharesPurchased.toFixed(1)} shares)</div>
                      </div>

                      {/* Capital Recovered */}
                      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5">
                        <div className="text-[10px] text-slate-400 uppercase">2. Capital Recovered</div>
                        <div className="text-sm font-bold text-emerald-400 mt-0.5">${group.capitalRecoveredUsdc.toFixed(2)}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">({group.totalSharesSold.toFixed(1)} shares sold)</div>
                      </div>

                      {/* Remaining Capital */}
                      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5">
                        <div className="text-[10px] text-slate-400 uppercase">3. Remaining Invested</div>
                        <div className="text-sm font-bold text-slate-200 mt-0.5">${group.remainingCapitalUsdc.toFixed(2)}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">({group.sharesRemaining.toFixed(1)} sh left)</div>
                      </div>

                      {/* Realized Profit */}
                      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5">
                        <div className="text-[10px] text-slate-400 uppercase">4. Realized Net Profit</div>
                        <div className={`text-sm font-bold mt-0.5 ${group.realizedProfitUsdc >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {group.realizedProfitUsdc >= 0 ? '+' : ''}${group.realizedProfitUsdc.toFixed(2)}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">After all trading fees</div>
                      </div>

                      {/* Total Amount Received */}
                      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5">
                        <div className="text-[10px] text-slate-400 uppercase">5. Total Received</div>
                        <div className="text-sm font-bold text-purple-300 mt-0.5">${group.netProceedsUsdc.toFixed(2)}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">Capital + Profit</div>
                      </div>

                      {/* Final ROI */}
                      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5">
                        <div className="text-[10px] text-slate-400 uppercase">6. Final ROI %</div>
                        <div className={`text-sm font-bold mt-0.5 ${group.roiPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {group.roiPercent >= 0 ? '+' : ''}{group.roiPercent.toFixed(1)}%
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">On invested capital</div>
                      </div>
                    </div>

                    {/* Fees Transparency Callout */}
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
                      <div className="flex items-center gap-2 text-slate-300">
                        <Receipt className="w-4 h-4 text-amber-400" />
                        <span className="font-bold text-white">Trading Fees Breakdown:</span>
                        <span>Buy Fees: <b className="text-amber-400">${group.totalBuyFeesUsdc.toFixed(3)}</b></span>
                        <span>•</span>
                        <span>Sell Fees: <b className="text-amber-400">${group.totalSellFeesUsdc.toFixed(3)}</b></span>
                        <span>•</span>
                        <span>Total Fees: <b className="text-amber-300">${group.totalFeesUsdc.toFixed(3)}</b></span>
                      </div>
                      <div className="text-[10px] text-slate-400 flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 font-bold">
                          {group.feeSources.has('market') ? 'Verified Market Fees' : 'Estimated Taker Rates (0.07)'}
                        </span>
                      </div>
                    </div>

                    {/* Chronological Transaction Lifecycle Log */}
                    <div className="space-y-2">
                      <div className="text-[11px] font-bold text-slate-300 uppercase tracking-wider font-mono flex items-center gap-1.5">
                        <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />
                        Position Transaction Timeline (BUY → SELL / SETTLEMENT)
                      </div>

                      <div className="space-y-2 font-mono text-xs">
                        {group.trades.map((trade, idx) => {
                          const isBuy = trade.side === 'BUY';
                          const targetPriceCents = Math.round((trade.targetPrice || 0) * 100);
                          const copyPriceCents = Math.round((trade.copyPrice || 0) * 100);

                          return (
                            <div
                              key={trade.id || idx}
                              className={`p-3 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                                isBuy
                                  ? 'bg-emerald-950/20 border-emerald-500/20'
                                  : (trade.realizedProfitUsdc || trade.pnlUsdc || 0) >= 0
                                  ? 'bg-purple-950/20 border-purple-500/20'
                                  : 'bg-rose-950/20 border-rose-500/20'
                              }`}
                            >
                              {/* Left: Action Badge, Reason, Time */}
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span
                                  className={`font-bold px-2 py-0.5 rounded text-[10px] uppercase tracking-wider ${
                                    isBuy
                                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                      : 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                                  }`}
                                >
                                  {isBuy ? 'BUY' : 'SELL'}
                                </span>

                                <div>
                                  <div className="font-bold text-white flex items-center gap-2">
                                    <span>
                                      {isBuy
                                        ? `Bought ${(trade.copyShares || 0).toFixed(1)} shares @ ${copyPriceCents}¢`
                                        : `${trade.sellReason || 'Sold'} ${(trade.copyShares || 0).toFixed(1)} shares @ ${copyPriceCents}¢`}
                                    </span>
                                  </div>
                                  <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                                    <span>{formatTime(trade.timestamp)}</span>
                                    <span>•</span>
                                    <span>Tx: <code>{(trade.targetTxHash || '').slice(0, 10)}...</code></span>
                                  </div>
                                </div>
                              </div>

                              {/* Center: Target Whale vs Our Execution */}
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                                <div>
                                  <div className="text-[9px] text-slate-400 uppercase">Target Price</div>
                                  <div className="font-bold text-slate-300">{targetPriceCents}¢</div>
                                </div>
                                <div>
                                  <div className="text-[9px] text-slate-400 uppercase">Our Price</div>
                                  <div className="font-bold text-emerald-400">{copyPriceCents}¢</div>
                                </div>
                                <div>
                                  <div className="text-[9px] text-slate-400 uppercase">Target Stake</div>
                                  <div className="font-bold text-purple-300">${(trade.targetSizeUsdc || 0).toFixed(2)}</div>
                                </div>
                                <div>
                                  <div className="text-[9px] text-slate-400 uppercase">{isBuy ? 'Our Cost' : 'Gross Proceeds'}</div>
                                  <div className="font-bold text-cyan-300">${(trade.copySizeUsdc || 0).toFixed(2)}</div>
                                </div>
                              </div>

                              {/* Right: Capital Recovery & Profit Outcome */}
                              <div className="text-right text-[11px] min-w-[140px]">
                                {isBuy ? (
                                  <div>
                                    <div className="text-[9px] text-slate-400 uppercase">Fee Deducted</div>
                                    <div className="font-bold text-amber-400">
                                      ${(trade.feeUsdc || trade.buyFeeUsdc || 0).toFixed(3)}
                                    </div>
                                    <div className="text-[9px] text-slate-400 mt-0.5">
                                      Total Outlay: ${(trade.netDeductionUsdc || (trade.copySizeUsdc + (trade.buyFeeUsdc || 0))).toFixed(2)}
                                    </div>
                                  </div>
                                ) : (
                                  <div>
                                    <div className="text-[9px] text-slate-400 uppercase">Capital Recovered</div>
                                    <div className="font-bold text-emerald-400">
                                      ${(trade.capitalRecoveredUsdc || 0).toFixed(2)}
                                    </div>
                                    <div className={`text-[10px] font-bold mt-0.5 ${(trade.realizedProfitUsdc || trade.pnlUsdc || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                      Profit: {(trade.realizedProfitUsdc || trade.pnlUsdc || 0) >= 0 ? '+' : ''}${(trade.realizedProfitUsdc || trade.pnlUsdc || 0).toFixed(2)}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 4. FLAT ALL-TRANSACTIONS VIEW */}
      {viewMode === 'flat' && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl backdrop-blur-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
                <tr>
                  <th className="py-3 px-3">Time</th>
                  <th className="py-3 px-3">Action</th>
                  <th className="py-3 px-3">Market & Outcome</th>
                  <th className="py-3 px-3">Whale Price / Stake</th>
                  <th className="py-3 px-3">Our Price / Stake</th>
                  <th className="py-3 px-3">Shares</th>
                  <th className="py-3 px-3 text-emerald-400">Capital Recovered</th>
                  <th className="py-3 px-3 text-amber-400">Fee Paid</th>
                  <th className="py-3 px-3 text-right">Realized Net PnL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {history.map((record) => {
                  const isBuy = record.side === 'BUY';
                  const isClosed = record.status === 'CLOSED';
                  const feePaid = record.feeUsdc ?? (isBuy ? record.buyFeeUsdc : record.sellFeeUsdc) ?? 0;
                  const profit = record.realizedProfitUsdc ?? record.pnlUsdc ?? 0;
                  const isProfit = profit >= 0;
                  const whaleCents = Math.round((record.targetPrice || 0) * 100);
                  const ourCents = Math.round((record.copyPrice || 0) * 100);

                  return (
                    <tr key={record.id} className="hover:bg-slate-800/40 transition-colors">
                      {/* Time */}
                      <td className="py-3 px-3 text-slate-300 font-semibold">{formatTime(record.timestamp)}</td>

                      {/* Action */}
                      <td className="py-3 px-3">
                        <span
                          className={`font-bold px-2 py-0.5 rounded text-[10px] uppercase tracking-wider ${
                            isBuy
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                          }`}
                        >
                          {record.side}
                        </span>
                      </td>

                      {/* Market & Outcome */}
                      <td className="py-3 px-3">
                        <div className="font-bold text-white flex items-center gap-1.5">
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] ${
                              record.outcome.toLowerCase() === 'up' || record.outcome.toLowerCase() === 'yes'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-rose-500/20 text-rose-300'
                            }`}
                          >
                            {record.outcome}
                          </span>
                          <span className="truncate max-w-[140px] text-slate-300">{record.title}</span>
                        </div>
                      </td>

                      {/* Whale Price / Stake */}
                      <td className="py-3 px-3 text-slate-300">
                        <div>{whaleCents}¢</div>
                        <div className="text-[10px] text-purple-400">${(record.targetSizeUsdc || 0).toFixed(2)}</div>
                      </td>

                      {/* Our Price / Stake */}
                      <td className="py-3 px-3">
                        <div className="text-emerald-400 font-bold">{ourCents}¢</div>
                        <div className="text-[10px] text-cyan-300">${(record.copySizeUsdc || 0).toFixed(2)}</div>
                      </td>

                      {/* Shares */}
                      <td className="py-3 px-3 text-slate-300">{(record.copyShares || 0).toFixed(1)} sh</td>

                      {/* Capital Recovered */}
                      <td className="py-3 px-3 text-emerald-400 font-bold">
                        {isBuy ? '—' : `$${(record.capitalRecoveredUsdc || 0).toFixed(2)}`}
                      </td>

                      {/* Fee Paid */}
                      <td className="py-3 px-3 text-amber-400">
                        ${feePaid.toFixed(3)}
                        <span className="text-[9px] text-slate-500 ml-1">({record.feeSource || 'assumed'})</span>
                      </td>

                      {/* Realized Net PnL */}
                      <td className="py-3 px-3 text-right">
                        {isBuy ? (
                          <span className="text-slate-500 text-[10px] uppercase font-bold">Open Position</span>
                        ) : (
                          <span
                            className={`inline-flex items-center gap-1 font-bold ${
                              isProfit ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {isProfit ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {isProfit ? '+' : ''}${profit.toFixed(2)}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
