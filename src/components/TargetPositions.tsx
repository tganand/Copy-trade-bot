import React from 'react';
import { ExternalLink, TrendingUp, TrendingDown, Target } from 'lucide-react';
import { PolymarketPositionItem } from '../types/index.ts';

interface TargetPositionsProps {
  positions: PolymarketPositionItem[];
}

export const TargetPositions: React.FC<TargetPositionsProps> = ({ positions }) => {
  if (positions.length === 0) {
    return (
      <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-8 text-center">
        <Target className="w-8 h-8 text-slate-500 mx-auto mb-2" />
        <h4 className="text-sm font-semibold text-white">No Positions Found</h4>
        <p className="text-xs text-slate-400 mt-1">
          No positions currently returned by the Polymarket API for this wallet.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {positions.map((pos, idx) => {
        const isUp = (pos.cashPnl || 0) >= 0;
        const outcome = pos.outcome || (pos.outcomeIndex === 0 ? 'Up' : 'Down');
        const eventUrl = pos.eventSlug
          ? `https://polymarket.com/event/${pos.eventSlug}`
          : pos.slug
          ? `https://polymarket.com/event/${pos.slug}`
          : 'https://polymarket.com';

        return (
          <div
            key={`${pos.conditionId || idx}_${pos.outcome}`}
            className="bg-slate-900/70 border border-slate-800/80 hover:border-slate-700/80 rounded-xl p-4 transition-all flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span
                  className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider ${
                    outcome.toLowerCase() === 'up'
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                      : 'bg-rose-500/15 text-rose-400 border border-rose-500/20'
                  }`}
                >
                  {outcome}
                </span>

                <div className="text-xs font-mono text-slate-400">
                  Cur Price: <b className="text-white">${pos.curPrice?.toFixed(3) ?? '0.000'}</b>
                </div>
              </div>

              <a
                href={eventUrl}
                target="_blank"
                rel="noreferrer"
                className="group inline-flex items-center gap-1.5 text-xs font-semibold text-slate-200 hover:text-emerald-400 transition-colors line-clamp-2"
              >
                <span>{pos.title}</span>
                <ExternalLink className="w-3 h-3 opacity-50 group-hover:opacity-100 flex-shrink-0" />
              </a>
            </div>

            <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono">
              <div>
                <span className="text-slate-400">Shares:</span>{' '}
                <b className="text-slate-200">{pos.size?.toFixed(1) || '0'}</b>
                <span className="text-slate-500 text-[11px] ml-1">
                  (@${pos.avgPrice?.toFixed(3) || '0'})
                </span>
              </div>

              <div
                className={`flex items-center gap-1 font-bold ${
                  isUp ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {isUp ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                <span>
                  {isUp ? '+' : ''}${pos.cashPnl?.toFixed(2) || '0.00'} ({isUp ? '+' : ''}
                  {pos.percentPnl?.toFixed(1) || '0'}%)
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
