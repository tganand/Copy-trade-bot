import React from 'react';
import { DollarSign, PieChart, Percent, TrendingUp, TrendingDown } from 'lucide-react';
import { PaperAccount, PortfolioMetrics } from '../types/index.ts';

interface SummaryPanelProps {
  momentumAccounts: Record<string, PaperAccount>;
  momentumMetrics: Record<string, PortfolioMetrics>;
}

export const SummaryPanel: React.FC<SummaryPanelProps> = ({ momentumAccounts, momentumMetrics }) => {
  const symbols = ['BTC', 'ETH'];

  const getRealizedPnl = (s: string): number => {
    // 1. Direct from metrics if populated
    if (momentumMetrics[s]?.realizedPnl !== undefined && !isNaN(momentumMetrics[s].realizedPnl) && momentumMetrics[s].realizedPnl !== 0) {
      return momentumMetrics[s].realizedPnl;
    }
    // 2. Direct from account totalRealizedPnl
    if (momentumAccounts[s]?.totalRealizedPnl !== undefined && !isNaN(momentumAccounts[s].totalRealizedPnl) && momentumAccounts[s].totalRealizedPnl !== 0) {
      return momentumAccounts[s].totalRealizedPnl;
    }
    // 3. Summed from trade history
    const history = momentumAccounts[s]?.history || [];
    const sellTrades = history.filter(t => t.side === 'SELL');
    if (sellTrades.length > 0) {
      const sum = sellTrades.reduce((acc, t) => acc + (t.realizedProfitUsdc ?? t.pnlUsdc ?? 0), 0);
      if (Math.abs(sum) > 0.0001) return Number(sum.toFixed(2));
    }
    // 4. Net from cash vs initial balance
    if (momentumAccounts[s]) {
      const netCash = (momentumAccounts[s].cashBalance || 0) - (momentumAccounts[s].initialBalance || 50);
      if (Math.abs(netCash) > 0.001) return Number(netCash.toFixed(2));
    }
    return 0;
  };

  const totalRealizedPnl = symbols.reduce((sum, s) => sum + getRealizedPnl(s), 0);
  const totalFeesPaid = symbols.reduce((sum, s) => sum + (momentumAccounts[s]?.totalFeesPaid || 0), 0);
  const totalTrades = symbols.reduce((sum, s) => sum + (momentumAccounts[s]?.totalTrades || 0), 0);
  const totalCashBalance = symbols.reduce((sum, s) => sum + (momentumAccounts[s]?.cashBalance || 0), 0);

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-slate-100">All-Assets Summary</h2>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg">
          <span className="text-xs font-semibold text-slate-400 uppercase">Total Realized PnL</span>
          <div className={`text-2xl font-bold font-mono mt-2 ${totalRealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {totalRealizedPnl >= 0 ? '+' : ''}${totalRealizedPnl.toFixed(2)}
          </div>
        </div>
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg">
          <span className="text-xs font-semibold text-slate-400 uppercase">Total Fees Paid</span>
          <div className="text-2xl font-bold font-mono text-amber-400 mt-2">
            ${totalFeesPaid.toFixed(2)}
          </div>
        </div>
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg">
          <span className="text-xs font-semibold text-slate-400 uppercase">Total Trades</span>
          <div className="text-2xl font-bold font-mono text-slate-100 mt-2">
            {totalTrades}
          </div>
        </div>
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg">
          <span className="text-xs font-semibold text-slate-400 uppercase">Total Cash Balance</span>
          <div className="text-2xl font-bold font-mono text-slate-100 mt-2">
            ${totalCashBalance.toFixed(2)}
          </div>
        </div>
      </div>

      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <h3 className="text-sm font-bold text-slate-200 mb-4">Asset Performance</h3>
        <table className="w-full text-left text-sm mb-6">
          <thead>
            <tr className="text-slate-400 border-b border-slate-800">
              <th className="py-2">Asset</th>
              <th className="py-2">Cash</th>
              <th className="py-2">Realized PnL</th>
              <th className="py-2">Fees</th>
            </tr>
          </thead>
          <tbody>
            {symbols.map(s => {
              const pnl = getRealizedPnl(s);
              return (
                <tr key={s} className="border-b border-slate-800/50">
                  <td className="py-3 font-bold text-slate-200">{s}</td>
                  <td className="py-3 font-mono">${(momentumAccounts[s]?.cashBalance || 0).toFixed(2)}</td>
                  <td className={`py-3 font-mono ${pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                  </td>
                  <td className="py-3 font-mono text-amber-400">${(momentumAccounts[s]?.totalFeesPaid || 0).toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <h3 className="text-sm font-bold text-slate-200 mb-4">Open Positions</h3>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-slate-400 border-b border-slate-800">
              <th className="py-2">Asset</th>
              <th className="py-2">Outcome</th>
              <th className="py-2">Price</th>
              <th className="py-2">PnL</th>
            </tr>
          </thead>
          <tbody>
            {symbols.flatMap(s => 
              Object.values(momentumAccounts[s]?.positions || {}).map(pos => (
                <tr key={`${s}-${pos.id}`} className="border-b border-slate-800/50">
                  <td className="py-3 font-bold text-slate-200">{s}</td>
                  <td className="py-3 text-slate-300">{pos.outcome}</td>
                  <td className="py-3 font-mono">{(pos.currentPrice * 100).toFixed(1)}¢</td>
                  <td className={`py-3 font-mono ${(pos.unrealizedPnl || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    ${(pos.unrealizedPnl || 0).toFixed(2)}
                  </td>
                </tr>
              ))
            )}
            {symbols.every(s => Object.keys(momentumAccounts[s]?.positions || {}).length === 0) && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-slate-500 text-xs">No active positions across assets.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
