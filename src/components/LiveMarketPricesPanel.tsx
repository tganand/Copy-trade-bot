import React, { useState, useEffect, useRef } from 'react';
import { Radio, Zap, ShieldAlert, Timer, ArrowUpRight, ArrowDownRight, Clock } from 'lucide-react';

interface ActiveBtcWindow {
  marketId: string;
  conditionId?: string;
  title: string;
  slug: string;
  startDate: number;
  endDate: number;
  upTokenId: string;
  downTokenId: string;
  status: 'CURRENT' | 'EXPIRED';
  timeLeftSeconds: number;
}

interface LiveMarketPricesPanelProps {
  wsStatus: 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED';
  marketBooks: Record<string, any>;
  activeBtcWindow?: ActiveBtcWindow | null;
}

export const LiveMarketPricesPanel: React.FC<LiveMarketPricesPanelProps> = ({
  wsStatus,
  marketBooks,
  activeBtcWindow,
}) => {
  const isConnected = wsStatus === 'CONNECTED';
  const [timeLeft, setTimeLeft] = useState<number>(activeBtcWindow?.timeLeftSeconds || 0);
  const [, setTick] = useState(0);

  // Track previous prices for tick movement flashes
  const prevUpPriceRef = useRef<number | null>(null);
  const prevDownPriceRef = useRef<number | null>(null);
  const [upTick, setUpTick] = useState<'up' | 'down' | null>(null);
  const [downTick, setDownTick] = useState<'up' | 'down' | null>(null);

  // Sync remaining window time
  useEffect(() => {
    if (activeBtcWindow?.timeLeftSeconds !== undefined) {
      setTimeLeft(activeBtcWindow.timeLeftSeconds);
    }
  }, [activeBtcWindow?.timeLeftSeconds]);

  // Exact 0.10-second (100ms) cadence timer for real-time price and clock refreshes
  useEffect(() => {
    const timer = setInterval(() => {
      setTick((t) => t + 1);
      if (activeBtcWindow?.endDate) {
        const nowSec = Math.floor(Date.now() / 1000);
        const remaining = Math.max(0, Math.floor(activeBtcWindow.endDate / 1000) - nowSec);
        setTimeLeft(remaining);
      }
    }, 100);
    return () => clearInterval(timer);
  }, [activeBtcWindow?.endDate]);

  const formatCountdown = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  const formatLatency = (ms: number | undefined) => {
    if (ms === undefined || ms === null || isNaN(ms) || ms <= 0) return 'N/A';
    if (ms >= 1000) {
      return `${(ms / 1000).toFixed(2)}s`;
    }
    return `${Math.round(ms)}ms`;
  };

  const formatEventTime = (timestampMs: number | undefined) => {
    if (!timestampMs || timestampMs <= 0) return 'Awaiting event';
    return new Date(timestampMs).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    });
  };

  const upBook = activeBtcWindow?.upTokenId ? marketBooks[activeBtcWindow.upTokenId] : null;
  const downBook = activeBtcWindow?.downTokenId ? marketBooks[activeBtcWindow.downTokenId] : null;

  // Polymarket buttons display the BEST ASK (buy/taker price).
  // Falling back to lastPrice or bestBid if ask is not available.
  let upPrice: number | null = upBook
    ? (upBook.bestAsk > 0 ? upBook.bestAsk : (upBook.lastPrice > 0 ? upBook.lastPrice : (upBook.bestBid > 0 ? upBook.bestBid : null)))
    : null;

  let downPrice: number | null = downBook
    ? (downBook.bestAsk > 0 ? downBook.bestAsk : (downBook.lastPrice > 0 ? downBook.lastPrice : (downBook.bestBid > 0 ? downBook.bestBid : null)))
    : null;

  // Polymarket BTC 5m binary outcomes are strictly complementary (Up + Down = 1.00)
  if (upPrice !== null && downPrice === null) {
    downPrice = Number(Math.max(0.01, Math.min(0.99, 1.0 - upPrice)).toFixed(3));
  } else if (downPrice !== null && upPrice === null) {
    upPrice = Number(Math.max(0.01, Math.min(0.99, 1.0 - downPrice)).toFixed(3));
  }

  // Trigger price direction ticks
  useEffect(() => {
    if (upPrice !== null) {
      if (prevUpPriceRef.current !== null && prevUpPriceRef.current !== upPrice) {
        setUpTick(upPrice > prevUpPriceRef.current ? 'up' : 'down');
        const t = setTimeout(() => setUpTick(null), 1000);
        return () => clearTimeout(t);
      }
      prevUpPriceRef.current = upPrice;
    }
  }, [upPrice]);

  useEffect(() => {
    if (downPrice !== null) {
      if (prevDownPriceRef.current !== null && prevDownPriceRef.current !== downPrice) {
        setDownTick(downPrice > prevDownPriceRef.current ? 'up' : 'down');
        const t = setTimeout(() => setDownTick(null), 1000);
        return () => clearTimeout(t);
      }
      prevDownPriceRef.current = downPrice;
    }
  }, [downPrice]);

  const latency = upBook?.latencyMs ?? downBook?.latencyMs ?? 0;
  const lastEventTime = upBook?.updatedAt ?? downBook?.updatedAt;
  const isExpired = activeBtcWindow?.status === 'EXPIRED' || timeLeft <= 0;

  const now = Date.now();
  const lastEventAge = lastEventTime ? now - lastEventTime : Infinity;

  let feedStatus: 'DISCOVERING MARKET' | 'CONNECTING' | 'SUBSCRIBING' | 'WAITING FOR MARKET DATA' | 'LIVE' | 'STALE DATA' | 'DISCONNECTED' | 'MARKET EXPIRED';
  if (!activeBtcWindow) {
    feedStatus = 'DISCOVERING MARKET';
  } else if (!isConnected) {
    feedStatus = wsStatus === 'RECONNECTING' ? 'CONNECTING' : 'DISCONNECTED';
  } else if (isExpired) {
    feedStatus = 'MARKET EXPIRED';
  } else if (upPrice === null && downPrice === null) {
    feedStatus = 'WAITING FOR MARKET DATA';
  } else if (wsStatus !== 'CONNECTED' && lastEventAge > 30000) {
    feedStatus = 'STALE DATA';
  } else {
    feedStatus = 'LIVE';
  }

  // Format cents matching Polymarket UI: e.g. "Up 45¢", "Down 56¢"
  const upCents = upPrice !== null ? Math.round(upPrice * 100) : null;
  const downCents = downPrice !== null ? Math.round(downPrice * 100) : null;

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl backdrop-blur-sm space-y-4">
      {/* Header & Status */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`p-2.5 rounded-xl border ${
              feedStatus === 'LIVE'
                ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
                : feedStatus === 'STALE DATA' || feedStatus === 'WAITING FOR MARKET DATA'
                ? 'bg-amber-500/10 border-amber-500/25 text-amber-400'
                : 'bg-rose-500/10 border-rose-500/25 text-rose-400 animate-pulse'
            }`}
          >
            <Radio className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-white">Live Polymarket 5-Min BTC Window Prices</h3>
              
              {/* Comprehensive Feed State Badge */}
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                  feedStatus === 'LIVE'
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    : feedStatus === 'STALE DATA'
                    ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                    : feedStatus === 'WAITING FOR MARKET DATA'
                    ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30 animate-pulse'
                    : feedStatus === 'CONNECTING' || feedStatus === 'DISCOVERING MARKET'
                    ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                    : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    feedStatus === 'LIVE'
                      ? 'bg-emerald-400 animate-ping'
                      : feedStatus === 'STALE DATA' || feedStatus === 'WAITING FOR MARKET DATA'
                      ? 'bg-amber-400'
                      : 'bg-rose-400'
                  }`}
                ></span>
                {feedStatus}
              </span>

              {activeBtcWindow && (
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                    isExpired
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                      : 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                  }`}
                >
                  {isExpired ? 'EXPIRED' : 'CURRENT WINDOW'}
                </span>
              )}

              <span className="px-2 py-0.5 rounded text-[10px] font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-800/40">
                0.10s cadence
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {activeBtcWindow
                ? activeBtcWindow.title
                : 'Discovering active Polymarket 5-minute Bitcoin Up/Down window...'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs flex-wrap">
          {activeBtcWindow && (
            <div className="bg-slate-950/80 px-3 py-2 rounded-xl border border-slate-800 flex items-center gap-1.5 font-mono text-emerald-400">
              <Timer className="w-3.5 h-3.5 animate-pulse" />
              <span>Next Window In: <b>{formatCountdown(timeLeft)}</b></span>
            </div>
          )}
          <div className="bg-slate-950/80 px-3 py-2 rounded-xl border border-slate-800 flex items-center gap-1.5 font-mono text-slate-300">
            <Clock className="w-3.5 h-3.5 text-sky-400" />
            <span>Last Update: <b>{formatEventTime(lastEventTime)}</b></span>
          </div>
          <div className="bg-slate-950/80 px-3 py-2 rounded-xl border border-slate-800 flex items-center gap-1.5 font-mono text-amber-400">
            <Zap className="w-3.5 h-3.5" />
            <span>Event Latency: <b>{formatLatency(latency)}</b></span>
          </div>
        </div>
      </div>

      {/* Market ID & Time Range */}
      {activeBtcWindow && (
        <div className="flex items-center justify-between text-xs text-slate-400 bg-slate-950/50 px-3 py-2 rounded-xl border border-slate-800/60 font-mono flex-wrap gap-2">
          <span>
            Slug: <b className="text-slate-200">{activeBtcWindow.slug}</b>
          </span>
          {activeBtcWindow.conditionId && (
            <span>
              Condition: <b className="text-slate-300">{activeBtcWindow.conditionId.slice(0, 10)}...</b>
            </span>
          )}
          <span>
            Window: {new Date(activeBtcWindow.startDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} — {new Date(activeBtcWindow.endDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      )}

      {!isConnected ? (
        <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-6 text-center text-slate-400 space-y-2">
          <ShieldAlert className="w-8 h-8 text-rose-400 mx-auto animate-bounce" />
          <div className="text-sm font-bold text-white">DISCONNECTED (Reconnecting to CLOB WebSocket...)</div>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Attempting automatic reconnection to Polymarket CLOB Market WebSocket. Prices will resume instantly upon reconnection.
          </p>
        </div>
      ) : !activeBtcWindow ? (
        <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-6 text-center text-slate-400 space-y-2">
          <div className="w-6 h-6 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin mx-auto" />
          <div className="text-sm font-bold text-white">DISCOVERING CURRENT 5-MINUTE BTC MARKET...</div>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Querying Polymarket Gamma API for the active 5m Bitcoin Up/Down window and token IDs.
          </p>
        </div>
      ) : (
        <div className="space-y-3 pt-1">
          {/* Exact Polymarket Live Buttons (Matched directly to screenshot) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* UP Button (Lime Green with 3D bottom bevel & lightning icon) */}
            <div
              className={`w-full py-4 px-6 rounded-2xl font-bold text-center transition-all flex items-center justify-center cursor-default select-none shadow-[0_5px_0_0_#5fa740] bg-[#a3f77b] text-[#0d3408] border border-[#b2fb8d] ${
                upTick === 'up'
                  ? 'brightness-110 scale-[1.01]'
                  : upTick === 'down'
                  ? 'brightness-90'
                  : ''
              }`}
            >
              <div className="flex items-center justify-center gap-2.5">
                <Zap className="w-5 h-5 fill-[#0d3408] text-[#0d3408]" />
                <span className="text-2xl font-black tracking-tight">
                  {upCents !== null ? `Up ${upCents}¢` : 'Up --¢'}
                </span>
                {upTick === 'up' && <ArrowUpRight className="w-5 h-5 text-[#0d3408] animate-bounce" />}
                {upTick === 'down' && <ArrowDownRight className="w-5 h-5 text-[#0d3408] animate-bounce" />}
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
              }`}
            >
              <div className="flex items-center justify-center gap-2.5">
                <Zap className="w-5 h-5 fill-[#00d4ff] text-[#00d4ff]" />
                <span className="text-2xl font-black tracking-tight">
                  {downCents !== null ? `Down ${downCents}¢` : 'Down --¢'}
                </span>
                {downTick === 'up' && <ArrowUpRight className="w-5 h-5 text-[#00d4ff] animate-bounce" />}
                {downTick === 'down' && <ArrowDownRight className="w-5 h-5 text-[#00d4ff] animate-bounce" />}
              </div>
            </div>
          </div>

          {/* Clean Ticker Line Matching Polymarket (Spread & Best Bid/Ask) */}
          <div className="flex items-center justify-between text-xs font-mono text-slate-400 bg-slate-950/40 px-4 py-2 rounded-xl border border-slate-800/40">
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
                  {upBook && upBook.bestBid > 0 ? `${Math.round(upBook.bestBid * 100)}¢` : '-'}
                </b>
              </span>
              <span className="text-slate-600">|</span>
              <span>
                Ask:{' '}
                <b className="text-rose-400">
                  {upPrice !== null ? `${Math.round(upPrice * 100)}¢` : '-'}
                </b>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
