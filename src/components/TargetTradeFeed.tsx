import React, { useState } from 'react';
import {
  ArrowUpRight,
  ArrowDownRight,
  ExternalLink,
  Filter,
  CheckCircle2,
  Clock,
  Coins,
} from 'lucide-react';
import { PolymarketActivityItem } from '../types/index.ts';

interface TargetTradeFeedProps {
  activities: PolymarketActivityItem[];
}

export const TargetTradeFeed: React.FC<TargetTradeFeedProps> = ({ activities }) => {
  const [filter, setFilter] = useState<'ALL' | 'BUY' | 'SELL' | 'REDEEM'>('ALL');

  const filtered = activities.filter((item) => {
    if (filter === 'ALL') return true;
    if (filter === 'BUY') return item.side === 'BUY';
    if (filter === 'SELL') return item.side === 'SELL';
    if (filter === 'REDEEM') return item.type === 'REDEEM';
    return true;
  });

  const formatTime = (ts: number) => {
    if (!ts) return 'Just now';
    const date = new Date(ts * 1000);
    const now = Date.now();
    const diffSec = Math.floor((now - date.getTime()) / 1000);

    if (diffSec < 60) return `${diffSec}s ago`;
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-4">
      {/* Top Filter Bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <span>Filter Trades:</span>
        </div>

        <div className="flex items-center gap-1">
          {(['ALL', 'BUY', 'SELL', 'REDEEM'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setFilter(mode)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                filter === mode
                  ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/80'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Feed List */}
      <div className="space-y-2.5">
        {filtered.length === 0 ? (
          <div className="text-center py-10 text-slate-500 text-sm bg-slate-900/40 rounded-xl border border-slate-800">
            No trades match this filter
          </div>
        ) : (
          filtered.map((item, idx) => {
            const isBuy = item.side === 'BUY';
            const isSell = item.side === 'SELL';
            const isRedeem = item.type === 'REDEEM';
            const outcomeName = item.outcome || (item.outcomeIndex === 0 ? 'Up' : 'Down');
            const eventUrl = item.eventSlug
              ? `https://polymarket.com/event/${item.eventSlug}`
              : item.slug
              ? `https://polymarket.com/event/${item.slug}`
              : 'https://polymarket.com';
            const txUrl = item.transactionHash
              ? `https://polygonscan.com/tx/${item.transactionHash}`
              : null;

            return (
              <div
                key={`${item.transactionHash || idx}_${idx}`}
                className="bg-slate-900/70 border border-slate-800/80 hover:border-slate-700 rounded-xl p-3.5 transition-all shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm"
              >
                {/* Left: Action Icon & Details */}
                <div className="flex items-start sm:items-center gap-3 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 sm:mt-0 ${
                      isBuy
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                        : isSell
                        ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                        : 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                    }`}
                  >
                    {isBuy && <ArrowUpRight className="w-5 h-5" />}
                    {isSell && <ArrowDownRight className="w-5 h-5" />}
                    {isRedeem && <CheckCircle2 className="w-5 h-5" />}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded ${
                          isBuy
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : isSell
                            ? 'bg-rose-500/20 text-rose-300'
                            : 'bg-purple-500/20 text-purple-300'
                        }`}
                      >
                        {isRedeem ? 'REDEEM' : item.side}
                      </span>

                      {outcomeName && (
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            outcomeName.toLowerCase() === 'up'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}
                        >
                          {outcomeName}
                        </span>
                      )}

                      <span className="text-xs text-slate-400 flex items-center gap-1 font-mono">
                        <Clock className="w-3 h-3" />
                        {formatTime(item.timestamp)}
                      </span>
                    </div>

                    <a
                      href={eventUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="group inline-flex items-center gap-1 font-medium text-slate-200 hover:text-emerald-400 mt-1 line-clamp-1 transition-colors"
                    >
                      <span className="truncate">{item.title}</span>
                      <ExternalLink className="w-3 h-3 opacity-50 group-hover:opacity-100 flex-shrink-0" />
                    </a>
                  </div>
                </div>

                {/* Right: Price & Whale Volume */}
                <div className="flex items-center justify-between sm:justify-end gap-5 pl-12 sm:pl-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800/80">
                  <div className="text-left sm:text-right font-mono">
                    <div className="text-xs text-slate-400">Execution Price</div>
                    <div className="font-bold text-white">
                      ${item.price > 0 ? item.price.toFixed(3) : '0.000'}
                      <span className="text-xs text-slate-400 ml-1">
                        ({(item.price * 100).toFixed(1)}¢)
                      </span>
                    </div>
                  </div>

                  <div className="text-right font-mono min-w-[90px]">
                    <div className="text-xs text-slate-400 flex items-center justify-end gap-1">
                      <Coins className="w-3 h-3 text-emerald-400" />
                      <span>Volume</span>
                    </div>
                    <div className="font-bold text-emerald-400">
                      ${(item.usdcSize || item.size * item.price || 0).toFixed(2)}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {item.size ? `${item.size.toFixed(1)} shs` : ''}
                    </div>
                  </div>

                  {txUrl && (
                    <a
                      href={txUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-sky-400 hover:bg-slate-800 transition-colors"
                      title="View Polygonscan Transaction"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
