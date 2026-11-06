import React, { useState } from 'react';
import {
  Activity,
  Send,
  RotateCcw,
  RefreshCw,
  ExternalLink,
  Copy,
  Check,
  Settings,
  Bell,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { BotConfig, PaperAccount, PortfolioMetrics } from '../types/index.ts';

interface HeaderProps {
  config: BotConfig;
  lastPolledAt: number;
  isPolling: boolean;
  onRefresh: () => void;
  onReset: () => void;
  onOpenSettings: () => void;
  onSendTestTelegram: () => Promise<void>;
  soundEnabled: boolean;
  onToggleSound: () => void;
  notificationEnabled: boolean;
  onToggleNotification: () => void;
  onTestTrade?: () => Promise<void>;
  btcAccount?: PaperAccount;
  btcMetrics?: PortfolioMetrics;
}

export const Header: React.FC<HeaderProps> = ({
  config,
  lastPolledAt,
  isPolling,
  onRefresh,
  onReset,
  onOpenSettings,
  onSendTestTelegram,
  soundEnabled,
  onToggleSound,
  notificationEnabled,
  onToggleNotification,
  onTestTrade,
  btcAccount,
  btcMetrics,
}) => {
  const [copied, setCopied] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const copyAddress = () => {
    navigator.clipboard.writeText(config.targetWallet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTestAlert = async () => {
    try {
      setSendingTest(true);
      setTestStatus(null);
      await onSendTestTelegram();
      setTestStatus('Sent!');
      setTimeout(() => setTestStatus(null), 3000);
    } catch {
      setTestStatus('Failed');
      setTimeout(() => setTestStatus(null), 3000);
    } finally {
      setSendingTest(false);
    }
  };

  const formatSecondsAgo = (timestamp: number) => {
    if (!timestamp) return 'Connecting...';
    const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
    return `${seconds}s ago`;
  };

  return (
    <header className="bg-slate-900/90 border-b border-slate-800/80 sticky top-0 z-30 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          {/* Left: Branding & Strategy Info */}
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20 ring-1 ring-amber-400/30">
              <span className="text-lg font-black text-slate-950 font-mono">₿</span>
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base font-bold text-white tracking-tight">
                  Bitcoin (BTC) 15m Momentum Bot
                </h1>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                  LIVE 15M FEED
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/25">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                  AI AUDITOR 24/7 AUTO
                </span>
                <span className="text-xs text-slate-400">
                  Updated {formatSecondsAgo(lastPolledAt)}
                </span>
              </div>

              {/* Strategy Rule Invariants & Financial Overview */}
              <div className="flex items-center gap-2 mt-1 text-xs text-slate-300 flex-wrap">
                <span className="text-amber-400 font-semibold">Bankroll: $100.00</span>
                <span className="text-slate-600">·</span>
                <span>Balance: <b className="text-emerald-400 font-mono">${btcAccount?.cashBalance !== undefined ? btcAccount.cashBalance.toFixed(2) : '100.00'}</b></span>
                <span className="text-slate-600">·</span>
                <span>Realized: <b className={`font-mono ${(btcMetrics?.realizedPnl ?? btcAccount?.totalRealizedPnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{((btcMetrics?.realizedPnl ?? btcAccount?.totalRealizedPnl ?? 0) >= 0 ? '+' : '')}${((btcMetrics?.realizedPnl ?? btcAccount?.totalRealizedPnl ?? 0)).toFixed(2)}</b></span>
                <span className="text-slate-600">·</span>
                <span className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/25 text-amber-300 font-semibold">
                  Fees Paid: <b className="font-mono">${(btcAccount?.totalFeesPaid ?? btcMetrics?.totalFeesPaid ?? 0).toFixed(2)}</b>
                </span>
                <span className="text-slate-600">·</span>
                <span>Stake: <b className="text-slate-200">$10/trade</b></span>
                <span className="text-slate-600">·</span>
                <span>Breakout: <b className="text-amber-400">≥75¢</b></span>
                <span className="text-slate-600">·</span>
                <span>Target: <b className="text-emerald-400">100¢</b></span>
                <span className="text-slate-600">·</span>
                <span>Stop: <b className="text-rose-400">55¢</b></span>
              </div>
            </div>
          </div>

          {/* Right: Actions & Tools */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Telegram Test Button */}
            <button
              type="button"
              onClick={handleTestAlert}
              disabled={sendingTest}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 border border-sky-500/25 transition-all shadow-sm active:scale-95 disabled:opacity-50"
              title="Send a live test message to your Telegram chat 7719238333"
            >
              <Send className={`w-3.5 h-3.5 ${sendingTest ? 'animate-bounce' : ''}`} />
              {sendingTest ? 'Sending...' : testStatus ? testStatus : 'Telegram Test'}
            </button>

            {/* Test Trade Button */}
            {onTestTrade && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    await onTestTrade();
                  } catch (e) {
                    console.error(e);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30 transition-all shadow-sm active:scale-95"
                title="Instantly execute a test copy trade to verify paper trading"
              >
                <Activity className="w-3.5 h-3.5" />
                Test Trade
              </button>
            )}

            {/* Refresh Button */}
            <button
              type="button"
              onClick={onRefresh}
              disabled={isPolling}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all active:scale-95 disabled:opacity-50"
              title="Refresh live activity from Polymarket"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isPolling ? 'animate-spin text-emerald-400' : ''}`} />
              Sync
            </button>

            {/* Sound FX Toggle */}
            <button
              type="button"
              onClick={onToggleSound}
              className={`p-2 rounded-lg text-xs border transition-colors ${
                soundEnabled
                  ? 'bg-slate-800 text-emerald-400 border-slate-700 hover:bg-slate-700'
                  : 'bg-slate-900 text-slate-500 border-slate-800 hover:text-slate-400'
              }`}
              title={soundEnabled ? 'Mute alert sounds' : 'Enable alert sounds'}
              aria-label={soundEnabled ? 'Mute alert sounds' : 'Enable alert sounds'}
            >
              {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            </button>

            {/* Browser Push Notification Toggle */}
            <button
              type="button"
              onClick={onToggleNotification}
              className={`p-2 rounded-lg text-xs border transition-colors ${
                notificationEnabled
                  ? 'bg-slate-800 text-emerald-400 border-slate-700 hover:bg-slate-700'
                  : 'bg-slate-900 text-slate-500 border-slate-800 hover:text-slate-400'
              }`}
              title={notificationEnabled ? 'Web notifications active' : 'Enable web notifications'}
              aria-label={notificationEnabled ? 'Web notifications active' : 'Enable web notifications'}
            >
              <Bell className="w-3.5 h-3.5" />
            </button>

            {/* Reset Data Button (Explicit user requirement) */}
            <button
              type="button"
              onClick={() => setShowResetConfirm(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/25 transition-all active:scale-95"
              title="Reset all paper trading data and restore fresh $100 bankroll"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset ($100)
            </button>

            {/* Settings Modal Toggle */}
            <button
              type="button"
              onClick={onOpenSettings}
              className="p-2 rounded-lg text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors"
              title="Open Bot & Sizing Settings"
              aria-label="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20">
                <RotateCcw className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white">Reset Bot Data?</h3>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">
              This will reset your paper copy-trading account back to fresh <b>$100.00</b> starting capital,
              clear all active demo positions, and reset your trade history as requested.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-slate-300 hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onReset();
                  setShowResetConfirm(false);
                }}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30 transition-all"
              >
                Confirm Reset to $100
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
