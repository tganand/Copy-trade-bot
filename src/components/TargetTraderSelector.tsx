import React, { useState } from 'react';
import { UserCheck, ExternalLink, Zap, CheckCircle2, ShieldAlert, ArrowRightLeft, Sparkles } from 'lucide-react';
import { TraderTarget } from '../types/index.ts';

interface TargetTraderSelectorProps {
  currentTargetWallet: string;
  currentTargetHandle: string;
  onSwitchTarget: (wallet: string, handle: string) => Promise<void>;
  isSwitching?: boolean;
}

export const PRESET_TRADERS: TraderTarget[] = [
  {
    handle: '@dangerously-skip-permissions',
    wallet: '0xc53375ff94e96100f2b30a4b5775db35218d69a9',
    description: 'Designated Target Trader (5m BTC Markets & High Volume)',
    polymarketUrl: 'https://polymarket.com/@dangerously-skip-permissions',
    badge: 'ACTIVE TRADING TARGET',
  },
];

export const TargetTraderSelector: React.FC<TargetTraderSelectorProps> = ({
  currentTargetWallet,
  currentTargetHandle,
  onSwitchTarget,
  isSwitching = false,
}) => {
  const [customWallet, setCustomWallet] = useState('');
  const [customHandle, setCustomHandle] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  const normalizedCurrent = currentTargetWallet.toLowerCase();

  const handleCustomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customWallet.trim()) return;
    await onSwitchTarget(customWallet.trim(), customHandle.trim() || undefined as any);
    setCustomWallet('');
    setCustomHandle('');
    setShowCustom(false);
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl backdrop-blur-sm space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400">
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span>Select Copy Trading Target</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                1-CLICK SWITCH
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Click any trader to instantly mirror their trades with your paper bankroll
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowCustom(!showCustom)}
          className="text-xs font-mono text-slate-400 hover:text-white flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-800 hover:border-slate-700 bg-slate-950/60 transition-all"
        >
          <ArrowRightLeft className="w-3.5 h-3.5" />
          <span>{showCustom ? 'Hide Custom' : 'Custom Wallet'}</span>
        </button>
      </div>

      {/* Preset Trader Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {PRESET_TRADERS.map((trader) => {
          const isActive = normalizedCurrent === trader.wallet.toLowerCase();

          return (
            <div
              key={trader.wallet}
              className={`rounded-xl p-4 transition-all relative overflow-hidden flex flex-col justify-between border ${
                isActive
                  ? 'border-emerald-500 bg-gradient-to-br from-emerald-950/30 to-slate-950/90 shadow-lg shadow-emerald-950/40 ring-1 ring-emerald-500/30'
                  : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
              }`}
            >
              {isActive && (
                <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-400" />
              )}

              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-white text-base">
                      {trader.handle}
                    </span>
                    {isActive ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                        <CheckCircle2 className="w-3 h-3" />
                        ACTIVE COPYING
                      </span>
                    ) : (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        trader.badge?.includes('ACTIVE')
                          ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                          : 'bg-slate-800/60 text-slate-400 border-slate-700/60'
                      }`}>
                        {trader.badge}
                      </span>
                    )}
                  </div>

                  <a
                    href={trader.polymarketUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-slate-400 hover:text-sky-400 text-xs flex items-center gap-1 transition-colors"
                    title="View on Polymarket"
                  >
                    <span>Profile</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <p className="text-xs text-slate-400 mb-3 leading-relaxed">
                  {trader.description}
                </p>

                <div className="text-[11px] font-mono text-slate-500 truncate mb-4 bg-slate-900/60 px-2.5 py-1.5 rounded-lg border border-slate-800/80">
                  <span className="text-slate-400">Wallet:</span> {trader.wallet}
                </div>
              </div>

              <div>
                {isActive ? (
                  <div className="w-full py-2.5 px-4 rounded-xl text-xs font-bold font-mono text-center bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center justify-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-400 animate-spin" />
                    <span>CURRENTLY MIRRORING ALL TRADES</span>
                  </div>
                ) : (
                  <button
                    onClick={() => onSwitchTarget(trader.wallet, trader.handle)}
                    disabled={isSwitching}
                    className="w-full py-2.5 px-4 rounded-xl text-xs font-bold font-mono text-center bg-sky-500 hover:bg-sky-400 active:scale-[0.98] text-slate-950 transition-all flex items-center justify-center gap-2 shadow-lg shadow-sky-500/20 disabled:opacity-50 cursor-pointer"
                  >
                    <Zap className="w-3.5 h-3.5 fill-current" />
                    <span>SWITCH & COPY {trader.handle.toUpperCase()}</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Optional Custom Wallet Input */}
      {showCustom && (
        <form onSubmit={handleCustomSubmit} className="pt-2 border-t border-slate-800/80 space-y-3">
          <div className="text-xs font-bold text-slate-300">Copy Any Custom Polymarket Wallet</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              type="text"
              placeholder="0x... wallet address"
              value={customWallet}
              onChange={(e) => setCustomWallet(e.target.value)}
              className="sm:col-span-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-sky-500"
              required
            />
            <input
              type="text"
              placeholder="@handle (optional)"
              value={customHandle}
              onChange={(e) => setCustomHandle(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-sky-500"
            />
          </div>
          <button
            type="submit"
            disabled={!customWallet.trim() || isSwitching}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-all disabled:opacity-50 cursor-pointer font-mono"
          >
            Start Copying Custom Wallet
          </button>
        </form>
      )}
    </div>
  );
};
