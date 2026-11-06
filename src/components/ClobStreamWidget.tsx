import React from 'react';
import { Radio, Zap, Activity } from 'lucide-react';

interface ClobStreamWidgetProps {
  wsStatus: 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED';
  marketBooks: Record<string, any>;
  maxLatencyMs: number;
}

export const ClobStreamWidget: React.FC<ClobStreamWidgetProps> = ({
  wsStatus,
  marketBooks,
  maxLatencyMs,
}) => {
  const booksList = Object.values(marketBooks);
  const isConnected = wsStatus === 'CONNECTED';

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl backdrop-blur-sm flex flex-col md:flex-row items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className={`p-2.5 rounded-xl border ${
          isConnected
            ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
            : 'bg-rose-500/10 border-rose-500/25 text-rose-400 animate-pulse'
        }`}>
          <Radio className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-bold text-white">Polymarket CLOB Market WebSocket</h4>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
              isConnected
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-400 animate-ping' : 'bg-rose-400'}`}></span>
              {wsStatus}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            wss://ws-subscriptions-clob.polymarket.com/ws/market (Subscribed to {booksList.length} active assets)
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4 flex-wrap text-xs">
        <div className="bg-slate-950/80 px-3 py-2 rounded-xl border border-slate-800 flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-400" />
          <span className="text-slate-400">Event Latency:</span>
          <span className="font-mono font-bold text-amber-400">{maxLatencyMs}ms</span>
        </div>

        <div className="bg-slate-950/80 px-3 py-2 rounded-xl border border-slate-800 flex items-center gap-2">
          <Activity className="w-4 h-4 text-sky-400" />
          <span className="text-slate-400">Active Order Books:</span>
          <span className="font-mono font-bold text-white">{booksList.length}</span>
        </div>
      </div>
    </div>
  );
};
