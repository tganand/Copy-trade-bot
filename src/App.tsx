import React, { useState, useEffect, useRef } from 'react';
import {
  TrendingUp,
  CheckCircle,
  AlertCircle,
  Zap,
  Scale,
  Sparkles,
} from 'lucide-react';
import { Header } from './components/Header.tsx';
import { BotSettingsModal } from './components/BotSettingsModal.tsx';
import { MomentumPanel } from './components/MomentumPanel.tsx';
import { PairStrategyPanel } from './components/PairStrategyPanel.tsx';
import { soundFX } from './utils/audio.ts';
import {
  BotConfig,
  PortfolioMetrics,
  PaperPosition,
  ActiveBtcWindow,
  Btc15mBotConfig,
  PairStrategyConfig,
  PaperAccount,
} from './types/index.ts';

const DEFAULT_CONFIG: BotConfig = {
  targetWallet: '0xc53375ff94e96100f2b30a4b5775db35218d69a9',
  targetHandle: '@dangerously-skip-permissions',
  telegramConfigured: false,
  isTelegramAlertsEnabled: true,
  copyTradeAmount: 5.0,
  isAutoCopyEnabled: true,
  pollingIntervalSeconds: 5,
  soundAlertsEnabled: true,
  browserNotificationsEnabled: true,
  maxSlippagePercent: 75.0,
};

const DEFAULT_15M_CONFIG: Btc15mBotConfig = {
  isEnabled: true,
  stakeSize: 10.0,
  entryThreshold: 0.75,
  stopLossPrice: 0.60,
  takeProfitPrice: 0.97,
};

const DEFAULT_15M_ACCOUNT: PaperAccount = {
  initialBalance: 100.0,
  cashBalance: 100.0,
  positions: {},
  history: [],
  totalTrades: 0,
  winningTrades: 0,
  losingTrades: 0,
  totalRealizedPnl: 0,
  totalFeesPaid: 0,
  currentStakeSize: 10.0,
};

const DEFAULT_METRICS: PortfolioMetrics = {
  initialBalance: 100.0,
  cashBalance: 100.0,
  activePositionsValue: 0.0,
  totalPortfolioValue: 100.0,
  unrealizedPnl: 0.0,
  realizedPnl: 0.0,
  todayRealizedPnl: 0.0,
  dailyTarget: 20.0,
  isDailyTargetReached: false,
  totalPnl: 0.0,
  totalPnlPercent: 0.0,
  totalFeesPaid: 0.0,
  openPositionsCount: 0,
  totalTradesCount: 0,
  winningTrades: 0,
  losingTrades: 0,
  winRate: 0.0,
};

export default function App() {
  const [config, setConfig] = useState<BotConfig>(DEFAULT_CONFIG);
  const [metrics, setMetrics] = useState<PortfolioMetrics>(DEFAULT_METRICS);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [notificationEnabled, setNotificationEnabled] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bannerAlert, setBannerAlert] = useState<{ msg: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [wsStatus, setWsStatus] = useState<'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED'>('DISCONNECTED');
  const [marketBooks, setMarketBooks] = useState<Record<string, any>>({});
  const [maxLatencyMs, setMaxLatencyMs] = useState(0);
  const [lastPolledAt, setLastPolledAt] = useState<number>(Date.now());
  const [isPolling, setIsPolling] = useState(false);

  const [momentumAccounts, setMomentumAccounts] = useState<Record<string, PaperAccount>>({});
  const [momentumMetrics, setMomentumMetrics] = useState<Record<string, PortfolioMetrics>>({});
  const [momentumConfigs, setMomentumConfigs] = useState<Record<string, Btc15mBotConfig>>({});
  const [activeMomentumWindows, setActiveMomentumWindows] = useState<Record<string, ActiveBtcWindow | null>>({});

  // 75¢ / 20¢ Pair Arbitrage Strategy ($100 Separate Bankroll)
  const [pairAccounts, setPairAccounts] = useState<Record<string, PaperAccount>>({});
  const [pairMetrics, setPairMetrics] = useState<Record<string, PortfolioMetrics>>({});
  const [pairConfigs, setPairConfigs] = useState<Record<string, PairStrategyConfig>>({});
  const [activeStrategyTab, setActiveStrategyTab] = useState<'momentum' | 'pair'>('momentum');

  useEffect(() => {
    const eventSource = new EventSource('/api/stream');
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.wsConnectionStatus) {
          setWsStatus(data.wsConnectionStatus);
        }
        if (data.marketBooks) {
          setMarketBooks(data.marketBooks);
          let highestLat = 0;
          for (const book of Object.values(data.marketBooks) as any[]) {
            if (book.latencyMs > highestLat) highestLat = book.latencyMs;
          }
          setMaxLatencyMs(highestLat);
        }
        if (data.metrics) {
          setMetrics(data.metrics);
        }
        if (data.activeMomentumWindows) {
          setActiveMomentumWindows(data.activeMomentumWindows);
        }
        if (data.momentumAccounts) {
          setMomentumAccounts(data.momentumAccounts);
        }
        if (data.momentumConfigs) {
          setMomentumConfigs(data.momentumConfigs);
        }
        if (data.momentumMetrics) {
          setMomentumMetrics(data.momentumMetrics);
        }
        if (data.pairAccounts) {
          setPairAccounts(data.pairAccounts);
        }
        if (data.pairConfigs) {
          setPairConfigs(data.pairConfigs);
        }
        if (data.pairMetrics) {
          setPairMetrics(data.pairMetrics);
        }
      } catch (e) {
        console.warn('SSE parse error:', e);
      }
    };

    eventSource.onerror = () => {
      setWsStatus('DISCONNECTED');
    };

    return () => {
      eventSource.close();
    };
  }, []);

  // Check notification permission on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        setNotificationEnabled(true);
      }
    }
  }, []);

  // Poll all data from the local full-stack server
  const fetchData = async () => {
    try {
      setIsPolling(true);

      const [statusRes, momRes, pairRes] = await Promise.all([
        fetch('/api/status'),
        fetch('/api/momentum'),
        fetch('/api/pair-strategy'),
      ]);

      if (statusRes.ok) {
        const sData = await statusRes.json();
        if (sData.config) setConfig(sData.config);
        if (sData.metrics) setMetrics(sData.metrics);
        if (sData.lastPolledAt) setLastPolledAt(sData.lastPolledAt);
      }

      if (momRes && momRes.ok) {
        const momData = await momRes.json();
        if (momData.momentumAccounts) setMomentumAccounts(momData.momentumAccounts);
        if (momData.momentumConfigs) setMomentumConfigs(momData.momentumConfigs);
        if (momData.activeMomentumWindows !== undefined) setActiveMomentumWindows(momData.activeMomentumWindows);
        if (momData.momentumMetrics) setMomentumMetrics(momData.momentumMetrics);
        if (momData.marketBooks) setMarketBooks((prev) => ({ ...prev, ...momData.marketBooks }));
      }

      if (pairRes && pairRes.ok) {
        const pData = await pairRes.json();
        if (pData.pairAccounts) setPairAccounts(pData.pairAccounts);
        if (pData.pairConfigs) setPairConfigs(pData.pairConfigs);
        if (pData.pairMetrics) setPairMetrics(pData.pairMetrics);
        if (pData.marketBooks) setMarketBooks((prev) => ({ ...prev, ...pData.marketBooks }));
      }
    } catch (err: any) {
      console.warn('Sync cycle warning:', err.message);
    } finally {
      setIsPolling(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, [soundEnabled, notificationEnabled]);

  const handleRefresh = async () => {
    try {
      await fetch('/api/poll-now', { method: 'POST' });
      await fetchData();
      setBannerAlert({ msg: 'Polymarket real-time feed synced successfully!', type: 'success' });
      setTimeout(() => setBannerAlert(null), 3000);
    } catch {
      setBannerAlert({ msg: 'Failed to sync feed.', type: 'error' });
      setTimeout(() => setBannerAlert(null), 3000);
    }
  };

  const handleReset = async () => {
    try {
      const res = await fetch('/api/paper/reset', { method: 'POST' });
      if (res.ok) {
        setMetrics({
          initialBalance: 100,
          cashBalance: 100,
          activePositionsValue: 0,
          totalPortfolioValue: 100,
          unrealizedPnl: 0,
          realizedPnl: 0,
          todayRealizedPnl: 0,
          dailyTarget: 20,
          isDailyTargetReached: false,
          totalPnl: 0,
          totalPnlPercent: 0,
          totalFeesPaid: 0,
          openPositionsCount: 0,
          totalTradesCount: 0,
          winningTrades: 0,
          losingTrades: 0,
          winRate: 0,
        });
        await fetchData();
        setBannerAlert({
          msg: 'Data totally reset: Paper bankroll restored to $100.00 and positions cleared.',
          type: 'success',
        });
        setTimeout(() => setBannerAlert(null), 4000);
      }
    } catch {
      setBannerAlert({ msg: 'Failed to reset account.', type: 'error' });
      setTimeout(() => setBannerAlert(null), 3000);
    }
  };

  const handleClosePosition = async (id: string) => {
    try {
      const res = await fetch('/api/paper/close-position', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positionId: id }),
      });
      if (res.ok) {
        await fetchData();
        setBannerAlert({ msg: 'Position closed and proceeds credited to paper cash balance.', type: 'success' });
        setTimeout(() => setBannerAlert(null), 3000);
      }
    } catch {
      setBannerAlert({ msg: 'Failed to close position.', type: 'error' });
      setTimeout(() => setBannerAlert(null), 3000);
    }
  };

  const handleResetMomentum = async (symbol: string) => {
    try {
      const res = await fetch(`/api/momentum/${symbol}/reset`, { method: 'POST' });
      if (res.ok) {
        const d = await res.json();
        setMomentumAccounts(prev => ({ ...prev, [symbol]: d.account }));
        setBannerAlert({
          msg: `${symbol} Momentum paper balance restored to $100.00 and positions cleared.`,
          type: 'success',
        });
        setTimeout(() => setBannerAlert(null), 3000);
      }
    } catch {
      setBannerAlert({ msg: `Failed to reset ${symbol} account`, type: 'error' });
      setTimeout(() => setBannerAlert(null), 3000);
    }
  };

  const handleCloseMomentumPosition = async (symbol: string, positionId: string) => {
    try {
      const res = await fetch(`/api/momentum/${symbol}/close-position`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positionId }),
      });
      if (res.ok) {
        setBannerAlert({ msg: `${symbol} Position closed and proceeds credited to cash balance.`, type: 'success' });
        setTimeout(() => setBannerAlert(null), 3000);
        await fetchData();
      }
    } catch {
      setBannerAlert({ msg: `Failed to close ${symbol} position`, type: 'error' });
      setTimeout(() => setBannerAlert(null), 3000);
    }
  };

  const handleResetPair = async (symbol: string) => {
    try {
      const res = await fetch(`/api/pair-strategy/${symbol}/reset`, { method: 'POST' });
      if (res.ok) {
        const d = await res.json();
        setPairAccounts(prev => ({ ...prev, [symbol]: d.account }));
        setBannerAlert({
          msg: `${symbol} Pair Arbitrage bankroll restored to $100.00 and positions cleared.`,
          type: 'success',
        });
        setTimeout(() => setBannerAlert(null), 3000);
      }
    } catch {
      setBannerAlert({ msg: `Failed to reset ${symbol} pair account`, type: 'error' });
      setTimeout(() => setBannerAlert(null), 3000);
    }
  };

  const handleClosePairPosition = async (symbol: string, positionId: string) => {
    try {
      const res = await fetch(`/api/pair-strategy/${symbol}/close-position`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positionId }),
      });
      if (res.ok) {
        setBannerAlert({ msg: `Pair position closed and proceeds credited to pair balance.`, type: 'success' });
        setTimeout(() => setBannerAlert(null), 3000);
        await fetchData();
      }
    } catch {
      setBannerAlert({ msg: `Failed to close pair position`, type: 'error' });
      setTimeout(() => setBannerAlert(null), 3000);
    }
  };

  const handleTogglePairStrategy = async (symbol: string) => {
    try {
      const res = await fetch(`/api/pair-strategy/${symbol}/toggle`, { method: 'POST' });
      if (res.ok) {
        const d = await res.json();
        setPairConfigs(prev => ({ ...prev, [symbol]: d.config }));
        setBannerAlert({
          msg: `Pair strategy is now ${d.isEnabled ? 'active' : 'paused'}.`,
          type: 'info',
        });
        setTimeout(() => setBannerAlert(null), 3000);
      }
    } catch {
      setBannerAlert({ msg: `Failed to toggle pair strategy`, type: 'error' });
      setTimeout(() => setBannerAlert(null), 3000);
    }
  };

  const handleSaveConfig = async (updated: Partial<BotConfig>) => {
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      if (res.ok) {
        const d = await res.json();
        setConfig(d.config);
        setBannerAlert({ msg: 'Configuration updated successfully!', type: 'success' });
        setTimeout(() => setBannerAlert(null), 3000);
      }
    } catch {
      setBannerAlert({ msg: 'Failed to save configuration.', type: 'error' });
      setTimeout(() => setBannerAlert(null), 3000);
    }
  };

  const handleSendTestTelegram = async () => {
    const res = await fetch('/api/telegram/test', { method: 'POST' });
    const data = await res.json();
    if (!data.ok) {
      throw new Error(data.description || 'Failed to send alert');
    }
    setBannerAlert({
      msg: 'Telegram test alert successfully delivered to user ID 7719238333!',
      type: 'success',
    });
    setTimeout(() => setBannerAlert(null), 4000);
  };

  const handleTestTrade = async () => {
    try {
      const res = await fetch('/api/paper/test-trade', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        setBannerAlert({ msg: 'Test copy trade executed successfully!', type: 'success' });
        await fetchData();
      } else {
        setBannerAlert({ msg: data.error || 'Failed to execute test trade', type: 'error' });
      }
    } catch {
      setBannerAlert({ msg: 'Network error executing test trade', type: 'error' });
    }
    setTimeout(() => setBannerAlert(null), 4000);
  };

  const [isSwitchingTarget, setIsSwitchingTarget] = useState(false);

  const handleSwitchTarget = async (wallet: string, handle: string) => {
    try {
      setIsSwitchingTarget(true);
      const res = await fetch('/api/target/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet, handle }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.config) setConfig(data.config);
        if (soundEnabled) soundFX.playTradeAlert(true);
        setBannerAlert({
          msg: `Copy trading switched to ${handle}! Automatically mirroring trades now.`,
          type: 'success',
        });
        await fetchData();
      } else {
        setBannerAlert({ msg: 'Failed to switch copy target', type: 'error' });
      }
    } catch {
      setBannerAlert({ msg: 'Network error switching target', type: 'error' });
    } finally {
      setIsSwitchingTarget(false);
      setTimeout(() => setBannerAlert(null), 4000);
    }
  };

  const handleToggleNotification = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setBannerAlert({ msg: 'Push notifications not supported in this browser.', type: 'error' });
      setTimeout(() => setBannerAlert(null), 3000);
      return;
    }

    if (Notification.permission === 'granted') {
      setNotificationEnabled(!notificationEnabled);
    } else {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        setNotificationEnabled(true);
        new Notification('Polymarket Whale Tracker', {
          body: 'Push notifications enabled! You will be alerted on live trades.',
        });
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Header */}
      <Header
        config={config}
        lastPolledAt={lastPolledAt}
        isPolling={isPolling}
        onRefresh={handleRefresh}
        onReset={handleReset}
        onOpenSettings={() => setSettingsOpen(true)}
        onSendTestTelegram={handleSendTestTelegram}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled(!soundEnabled)}
        notificationEnabled={notificationEnabled}
        onToggleNotification={handleToggleNotification}
        onTestTrade={handleTestTrade}
        btcAccount={momentumAccounts['BTC']}
        btcMetrics={momentumMetrics['BTC']}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Banner Alert if triggered */}
        {bannerAlert && (
          <div
            className={`px-4 py-3 rounded-2xl flex items-center justify-between text-xs sm:text-sm font-semibold transition-all border ${
              bannerAlert.type === 'success'
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : bannerAlert.type === 'error'
                ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                : 'bg-sky-500/10 text-sky-400 border-sky-500/30'
            }`}
          >
            <div className="flex items-center gap-2">
              {bannerAlert.type === 'success' ? (
                <CheckCircle className="w-4 h-4 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
              )}
              <span>{bannerAlert.msg}</span>
            </div>
            <button
              type="button"
              onClick={() => setBannerAlert(null)}
              className="text-xs opacity-75 hover:opacity-100 font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {/* Strategy Switcher Tab Navigation */}
        <div className="bg-slate-900/90 border border-slate-800 p-2 sm:p-2.5 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => setActiveStrategyTab('momentum')}
              className={`flex-1 sm:flex-initial px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 ${
                activeStrategyTab === 'momentum'
                  ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/25 ring-2 ring-amber-400'
                  : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white'
              }`}
            >
              <Zap className="w-4 h-4" />
              <span>Strategy 1: Momentum (75¢ Breakout + $1 Hedge)</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/20">
                ${momentumAccounts['BTC']?.cashBalance?.toFixed(2) || '100.00'}
              </span>
            </button>

            <button
              onClick={() => setActiveStrategyTab('pair')}
              className={`flex-1 sm:flex-initial px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 ${
                activeStrategyTab === 'pair'
                  ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/25 ring-2 ring-purple-400'
                  : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white'
              }`}
            >
              <Scale className="w-4 h-4" />
              <span>Strategy 2: Pair Arbitrage (10 Shares @ 75¢ / 20¢)</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/20">
                ${pairAccounts['BTC']?.cashBalance?.toFixed(2) || '100.00'}
              </span>
            </button>
          </div>

          <div className="text-[11px] font-mono text-slate-400 flex items-center gap-2 self-end sm:self-center">
            <span>Window: <b className="text-white">15m BTC</b></span>
            <span className="text-slate-600">·</span>
            <span>Independent Balances: <b className="text-emerald-400">$100 each</b></span>
          </div>
        </div>

        {/* Strategy 1: Bitcoin 15m Momentum Terminal Cockpit */}
        {activeStrategyTab === 'momentum' && (
          <MomentumPanel
            symbol="BTC"
            activeWindow={activeMomentumWindows['BTC'] || null}
            marketBooks={marketBooks}
            account={momentumAccounts['BTC'] || { initialBalance: 100, cashBalance: 100, positions: {}, history: [] } as any}
            metrics={momentumMetrics['BTC'] || {
              initialBalance: 100, cashBalance: 100, unrealizedPnl: 0, realizedPnl: 0, winRate: 0, winningTrades: 0, losingTrades: 0,
              totalTradesCount: 0, totalPnl: 0, totalPnlPercent: 0, openPositionsCount: 0, dailyTarget: 20, isDailyTargetReached: false,
              activePositionsValue: 0, totalPortfolioValue: 100, totalFeesPaid: 0, todayRealizedPnl: 0,
            }}
            config={momentumConfigs['BTC'] || { isEnabled: true, stakeSize: 10, entryThreshold: 0.75, stopLossPrice: 0.60, takeProfitPrice: 0.97 }}
            onResetAccount={() => handleResetMomentum('BTC')}
            onClosePosition={(posId) => handleCloseMomentumPosition('BTC', posId)}
          />
        )}

        {/* Strategy 2: 75¢ / 20¢ Pair Arbitrage Strategy */}
        {activeStrategyTab === 'pair' && (
          <PairStrategyPanel
            symbol="BTC"
            activeWindow={activeMomentumWindows['BTC'] || null}
            marketBooks={marketBooks}
            account={pairAccounts['BTC'] || { initialBalance: 100, cashBalance: 100, positions: {}, history: [] } as any}
            metrics={pairMetrics['BTC'] || {
              initialBalance: 100, cashBalance: 100, unrealizedPnl: 0, realizedPnl: 0, winRate: 0, winningTrades: 0, losingTrades: 0,
              totalTradesCount: 0, totalPnl: 0, totalPnlPercent: 0, openPositionsCount: 0, dailyTarget: 20, isDailyTargetReached: false,
              activePositionsValue: 0, totalPortfolioValue: 100, totalFeesPaid: 0, todayRealizedPnl: 0,
            }}
            config={pairConfigs['BTC'] || { isEnabled: true, shares: 10, highThreshold: 0.75, lowThreshold: 0.20 }}
            onResetAccount={() => handleResetPair('BTC')}
            onClosePosition={(posId) => handleClosePairPosition('BTC', posId)}
            onToggleStrategy={() => handleTogglePairStrategy('BTC')}
          />
        )}

        {/* Live Changelog & Strategy Updates Card */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl backdrop-blur-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                Recent Bot Updates & Changelog
              </h3>
            </div>
            <span className="text-[11px] font-mono text-slate-400">
              Auto-Tracked Real-Time Engine Updates
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs">
            <div className="p-3.5 rounded-xl bg-purple-950/20 border border-purple-500/30 space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-purple-300">
                <span className="flex h-2 w-2 rounded-full bg-purple-400" />
                <span>NEW: 75¢ / 20¢ Pair Arbitrage Strategy Section</span>
              </div>
              <p className="text-slate-400 leading-relaxed font-mono text-[11px]">
                Added dedicated section with an independent <b>$100.00 bankroll</b>. When UP or DOWN hits 75¢, bot buys 10 shares of the 75¢ leg ($7.50) and 10 shares of the 20¢ leg ($2.00) for a $9.50 total cost. Exactly 1 side resolves to $1.00 ($10 payout) yielding a guaranteed profit net of fees.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-500/30 space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-emerald-300">
                <span className="flex h-2 w-2 rounded-full bg-emerald-400" />
                <span>FIXED: Strict Mutual Exclusion Resolution</span>
              </div>
              <p className="text-slate-400 leading-relaxed font-mono text-[11px]">
                Eliminated the double-profit glitch on expiring windows. Positions are grouped per window; the winning outcome settles strictly at $1.00 ($10.00 payout) and the losing outcome settles strictly at $0.00 (0 proceeds, -100% loss).
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-500/30 space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-amber-300">
                <span className="flex h-2 w-2 rounded-full bg-amber-400" />
                <span>FIXED: 82¢ Upper Execution Ceiling</span>
              </div>
              <p className="text-slate-400 leading-relaxed font-mono text-[11px]">
                Enforced a strict hard cap preventing buys when contracts are priced at 85¢ or above. Trades strictly execute inside the 75¢–82¢ entry corridor with book depth checks.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-sky-950/20 border border-sky-500/30 space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-sky-300">
                <span className="flex h-2 w-2 rounded-full bg-sky-400" />
                <span>ENHANCED: 100% Net Profit & Fee Transparency</span>
              </div>
              <p className="text-slate-400 leading-relaxed font-mono text-[11px]">
                All profit counters, bankroll balances, and trade ledgers reflect returns strictly after all Polymarket taker fees are deducted.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 text-center text-xs text-slate-500 mt-auto">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>Bitcoin (BTC) 15m Momentum Trading Strategy</span>
          </div>
          <div>
            Bankroll: <b>$100.00</b> · Stake: <b>$10.00/trade</b> · Breakout Rule: <b>≥75¢ Entry + $1 Hedge</b> · Target: <b>100¢ ($1.00)</b> · Stop-Loss: <b>60¢</b>
          </div>
        </div>
      </footer>

      {/* Settings Modal */}
      <BotSettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        config={config}
        onSaveConfig={handleSaveConfig}
        onSendTestTelegram={handleSendTestTelegram}
      />
    </div>
  );
}
