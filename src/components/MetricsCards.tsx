import React from 'react';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Wallet,
  PieChart,
  Radio,
  Send,
  RotateCcw,
} from 'lucide-react';
import { PortfolioMetrics, BotConfig } from '../types/index.ts';

interface MetricsCardsProps {
  metrics: PortfolioMetrics;
  config: BotConfig;
  recentTradesCount: number;
  onSaveConfig?: (updated: Partial<BotConfig>) => Promise<void>;
  onReset?: () => void;
}

export const MetricsCards: React.FC<MetricsCardsProps> = ({
  metrics,
  config,
  recentTradesCount,
  onSaveConfig,
  onReset,
}) => {
  const isProfitable = metrics.totalPnl >= 0;
  const isUnrealizedProfitable = metrics.unrealizedPnl >= 0;
  const isRealizedProfitable = metrics.realizedPnl >= 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 1. Paper Bankroll Cash Balance */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 relative overflow-hidden backdrop-blur-sm group hover:border-slate-700/80 transition-all shadow-lg">
        <div className="absolute top-0 right-0 w-28 h-28 bg-emerald-500/5 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none" />
        
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Bankroll Cash Balance
          </span>
          <div className="flex items-center gap-2">
            {onReset && (
              <button
                type="button"
                onClick={onReset}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/25 transition-all shadow-sm active:scale-95"
                title="Reset paper account balance to fresh $100.00"
              >
                <RotateCcw className="w-3 h-3" />
                Reset ($100)
              </button>
            )}
            <div className="p-2 rounded-xl bg-slate-800/80 border border-slate-700/60 text-emerald-400">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-3xl font-extrabold text-white tracking-tight">
            ${metrics.cashBalance.toFixed(2)}
          </span>
          <span className="text-xs text-slate-400">
            (Initial: ${metrics.initialBalance.toFixed(2)})
          </span>
        </div>

        <div className="mt-2.5 flex items-center justify-between text-xs">
          <span
            className={`inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded-full ${
              isRealizedProfitable
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
            }`}
          >
            {isRealizedProfitable ? (
              <TrendingUp className="w-3 h-3" />
            ) : (
              <TrendingDown className="w-3 h-3" />
            )}
            {isRealizedProfitable ? '+' : ''}${metrics.realizedPnl.toFixed(2)} Realized PnL
          </span>
          <span className="text-slate-400 text-[11px]">
            Portfolio: <b className="text-white">${metrics.totalPortfolioValue.toFixed(2)}</b>
          </span>
        </div>
      </div>

      {/* 2. Available Cash & Active Risk */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 relative overflow-hidden backdrop-blur-sm group hover:border-slate-700/80 transition-all shadow-lg">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            In-Play Market Exposure
          </span>
          <div className="p-2 rounded-xl bg-slate-800/80 border border-slate-700/60 text-sky-400">
            <Wallet className="w-4 h-4" />
          </div>
        </div>

        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-3xl font-extrabold text-white tracking-tight">
            ${metrics.activePositionsValue.toFixed(2)}
          </span>
          <span className="text-xs font-medium text-slate-400">
            {metrics.activePositionsValue > 0 ? 'Live In-Play' : 'No Open Positions'}
          </span>
        </div>

        <div className="mt-2.5 flex items-center justify-between text-xs text-slate-300">
          <span>
            Floating: <b className={isUnrealizedProfitable ? 'text-emerald-400' : 'text-rose-400'}>
              {isUnrealizedProfitable ? '+' : ''}${metrics.unrealizedPnl.toFixed(2)}
            </b>
          </span>
          <span className="text-slate-400">
            Stake: <b className="text-white">${config.copyTradeAmount}</b>/trade
          </span>
        </div>
      </div>

      {/* 3. PnL Breakdown (Unrealized vs Realized) */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 relative overflow-hidden backdrop-blur-sm group hover:border-slate-700/80 transition-all shadow-lg">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Unrealized / Realized
          </span>
          <div className="p-2 rounded-xl bg-slate-800/80 border border-slate-700/60 text-amber-400">
            <PieChart className="w-4 h-4" />
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400">Floating PnL</div>
            <div
              className={`text-lg font-bold ${
                isUnrealizedProfitable ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {isUnrealizedProfitable ? '+' : ''}${metrics.unrealizedPnl.toFixed(2)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-400">Realized PnL</div>
            <div
              className={`text-lg font-bold ${
                isRealizedProfitable ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {isRealizedProfitable ? '+' : ''}${metrics.realizedPnl.toFixed(2)}
            </div>
          </div>
        </div>

        <div className="mt-3 pt-2.5 border-t border-slate-800/80 grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Total Trades:</span>
            <b className="text-white font-mono">{metrics.totalTradesCount}</b>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Win Rate:</span>
            <b className="text-emerald-400 font-mono">{metrics.winRate}%</b>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Wins:</span>
            <b className="text-emerald-400 font-mono">{(metrics as any).winningTrades ?? 0}</b>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Losses:</span>
            <b className="text-rose-400 font-mono">{(metrics as any).losingTrades ?? 0}</b>
          </div>
        </div>
      </div>

      {/* 4. 24/7 Continuous Copy Engine (No Daily Limits) */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 relative overflow-hidden backdrop-blur-sm group hover:border-slate-700/80 transition-all shadow-lg">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Copy Engine Status
          </span>
          <div className="p-2 rounded-xl bg-slate-800/80 border border-slate-700/60 text-emerald-400">
            <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
          </div>
        </div>

        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-2xl font-extrabold tracking-tight text-emerald-400">
            24/7 Active
          </span>
          <span className="text-xs font-mono text-slate-400">
            (No limits)
          </span>
        </div>

        <div className="mt-2.5 flex items-center justify-between text-xs text-slate-300">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            <span className="text-emerald-400 font-bold">
              Continuous Mode
            </span>
          </span>
          <span className="text-slate-400 text-[11px] font-mono">
            {config.targetHandle}
          </span>
        </div>
      </div>
    </div>
  );
};
