import React, { useState, useEffect } from 'react';
import { Layers, XCircle, TrendingUp, TrendingDown } from 'lucide-react';
import { PaperPosition } from '../types/index.ts';

interface MyPositionsProps {
  positions: PaperPosition[];
  onClosePosition: (id: string) => Promise<void>;
  priceChanges?: Record<string, 'up' | 'down'>;
  marketBooks?: Record<string, any>;
}

export const MyPositions: React.FC<MyPositionsProps> = ({
  positions,
  onClosePosition,
  marketBooks = {},
}) => {
  const [, setTick] = useState(0);

  // Live timer tick for Window Left countdown
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  const getWindowLeft = (pos: PaperPosition) => {
    const posWindowTs = pos.slug
      ? pos.slug.match(/(\d{10})/)
        ? parseInt(pos.slug.match(/(\d{10})/)![1], 10)
        : 0
      : 0;
    const windowStart = posWindowTs > 0 ? posWindowTs : pos.openedAt;
    const windowEnd = windowStart + 300;
    const nowSec = Math.floor(Date.now() / 1000);
    return Math.max(0, windowEnd - nowSec);
  };

  const formatWindowLeft = (leftSec: number) => {
    const m = Math.floor(leftSec / 60).toString().padStart(2, '0');
    const s = (leftSec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const getMarketAndSide = (title: string, outcome: string) => {
    let coin = 'BTC';
    const t = (title || '').toLowerCase();
    if (t.includes('ethereum') || t.includes('eth')) coin = 'ETH';
    else if (t.includes('solana') || t.includes('sol')) coin = 'SOL';
    else if (t.includes('bitcoin') || t.includes('btc')) coin = 'BTC';
    return `${coin} ${outcome.toUpperCase()}`;
  };

  const calculateActivePnl = (pos: PaperPosition, book?: any) => {
    const sellPrice = book?.bestBid > 0 ? book.bestBid : (pos.currentPrice > 0 ? pos.currentPrice : pos.entryPrice);
    const buyPrice = pos.entryPrice;
    const shares = pos.shares;
    const stake = pos.totalCost - (pos.buyFeePaid || 0);
    const buyFee = pos.buyFeePaid || (shares * 0.07 * buyPrice * (1 - buyPrice));
    const estSellFee = shares * 0.07 * sellPrice * (1 - sellPrice);
    return (shares * sellPrice) - stake - buyFee - estSellFee;
  };

  if (positions.length === 0) {
    return (
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-8 text-center backdrop-blur-sm">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-slate-400 mb-3.5">
          <Layers className="w-6 h-6 text-emerald-400" />
        </div>
        <h3 className="text-base font-semibold text-white">No Active Demo Positions Open</h3>
        <p className="text-sm text-slate-400 max-w-md mx-auto mt-1.5 leading-relaxed">
          The bot is watching the target trader for qualifying 5-minute Bitcoin window trades (&gt;$27 USDC).
        </p>
      </div>
    );
  }

  // Sort positions by Window Left (soonest ending first)
  const sortedPositions = [...positions].sort((a, b) => {
    return getWindowLeft(a) - getWindowLeft(b);
  });

  const totalOurInvested = positions.reduce((acc, p) => acc + (p.myInvestmentUsdc ?? (p.totalCost - (p.buyFeePaid || 0))), 0);
  const totalWhaleInvested = positions.reduce((acc, p) => acc + (p.targetSizeUsdc ?? 0), 0);

  return (
    <div className="space-y-3">
      {/* Quick Summary of Capital Put In */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="bg-slate-900/90 border border-emerald-500/30 rounded-xl p-2.5">
          <div className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">Our Total Put In</div>
          <div className="text-sm font-bold text-emerald-400 font-mono mt-0.5">${totalOurInvested.toFixed(2)}</div>
        </div>
        <div className="bg-slate-900/90 border border-purple-500/30 rounded-xl p-2.5">
          <div className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">Whale Total Put In</div>
          <div className="text-sm font-bold text-purple-400 font-mono mt-0.5">
            {totalWhaleInvested > 0 ? `$${totalWhaleInvested.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'Tracking...'}
          </div>
        </div>
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5">
          <div className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">Active Positions</div>
          <div className="text-sm font-bold text-white font-mono mt-0.5">{positions.length}</div>
        </div>
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5">
          <div className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">Stake Rule</div>
          <div className="text-sm font-bold text-cyan-400 font-mono mt-0.5">$10.00 / trade</div>
        </div>
      </div>

      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl backdrop-blur-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
              <tr>
                <th className="py-3 px-3">Time</th>
                <th className="py-3 px-3">Market & Side</th>
                <th className="py-3 px-3 text-emerald-400 font-bold">Our Put ($)</th>
                <th className="py-3 px-3 text-purple-400 font-bold">Whale Put ($)</th>
                <th className="py-3 px-3">Whale Price</th>
                <th className="py-3 px-3">Our Entry</th>
                <th className="py-3 px-3">Live Price</th>
                <th className="py-3 px-3">Active PnL</th>
                <th className="py-3 px-3">Window Left</th>
                <th className="py-3 px-3">Shares</th>
                <th className="py-3 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {sortedPositions.map((pos) => {
                const book = marketBooks[pos.asset];
                const livePrice = book?.bestAsk > 0 ? book.bestAsk : (pos.currentPrice > 0 ? pos.currentPrice : pos.entryPrice);
                const activePnl = calculateActivePnl(pos, book);
                const isProfit = activePnl >= 0;
                const windowLeftSec = getWindowLeft(pos);
                const isExpiringSoon = windowLeftSec <= 45;
                const whalePriceCents = Math.round((pos.targetPrice ?? pos.entryPrice) * 100);
                const ourPriceCents = Math.round(pos.entryPrice * 100);
                const livePriceCents = Math.round(livePrice * 100);
                const ourStakeUsdc = pos.myInvestmentUsdc ?? (pos.totalCost - (pos.buyFeePaid || 0));
                const whaleStakeUsdc = pos.targetSizeUsdc ?? 0;

                return (
                  <tr key={pos.id} className="hover:bg-slate-800/40 transition-colors">
                    {/* Time */}
                    <td className="py-3 px-3 text-slate-300 font-semibold">{formatTime(pos.openedAt)}</td>

                    {/* Market + Side */}
                    <td className="py-3 px-3">
                      <span
                        className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                          pos.outcome.toLowerCase() === 'up' || pos.outcome.toLowerCase() === 'yes'
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                        }`}
                      >
                        {getMarketAndSide(pos.title, pos.outcome)}
                      </span>
                    </td>

                    {/* Our Put ($) */}
                    <td className="py-3 px-3">
                      <span className="inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                        ${ourStakeUsdc.toFixed(2)}
                      </span>
                    </td>

                    {/* Whale Put ($) */}
                    <td className="py-3 px-3">
                      <span className="inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30">
                        {whaleStakeUsdc > 0 ? `$${whaleStakeUsdc.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'Whale Stake'}
                      </span>
                    </td>

                    {/* Whale Price */}
                    <td className="py-3 px-3 text-slate-300 font-bold">{whalePriceCents}¢</td>

                    {/* Our Price */}
                    <td className="py-3 px-3 text-emerald-400 font-bold">{ourPriceCents}¢</td>

                    {/* Live Price */}
                    <td className="py-3 px-3 text-white font-bold">{livePriceCents}¢</td>

                    {/* Active PnL */}
                    <td className="py-3 px-3">
                      <span
                        className={`inline-flex items-center gap-1 font-bold ${
                          isProfit ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {isProfit ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {isProfit ? '+' : ''}${activePnl.toFixed(2)}
                      </span>
                    </td>

                    {/* Window Left */}
                    <td className="py-3 px-3">
                      <span
                        className={`font-bold px-2 py-0.5 rounded ${
                          isExpiringSoon
                            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {formatWindowLeft(windowLeftSec)}
                      </span>
                    </td>

                    {/* Shares */}
                    <td className="py-3 px-3 text-slate-300">{pos.shares.toFixed(1)} sh</td>

                    {/* Action */}
                    <td className="py-3 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => onClosePosition(pos.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-slate-700/60 transition-all"
                        title="Close position"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
