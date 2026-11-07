import React, { useState } from 'react';
import { Bot, Sparkles, RefreshCw, AlertCircle, CheckCircle2, TrendingUp, ShieldAlert } from 'lucide-react';
import { PaperAccount, Btc15mBotConfig } from '../types/index.ts';

interface AiAuditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  account: PaperAccount;
  config: Btc15mBotConfig;
}

export const AiAuditorModal: React.FC<AiAuditorModalProps> = ({
  isOpen,
  onClose,
  account,
  config,
}) => {
  const [loading, setLoading] = useState(false);
  const [auditResult, setAuditResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const runAudit = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ai-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account, config }),
      });
      const data = await res.json();
      if (data.ok) {
        setAuditResult(data.auditReport);
      } else {
        setError(data.error || 'Failed to generate AI audit report.');
      }
    } catch (err: any) {
      setError(err.message || 'Network error while contacting AI auditor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-100">AI 24h Performance & Reversal Auditor</h3>
              <p className="text-xs text-slate-400">Deep-dive quantitative analysis powered by Google Gemini</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-100 transition-colors p-2 rounded-xl hover:bg-slate-800"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          <div className="bg-slate-950/50 border border-slate-800/80 p-4 rounded-2xl flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Current Bot Setup</div>
              <div className="text-sm font-bold text-slate-200 mt-0.5">
                Entry: <span className="text-amber-400">≥{Math.round(config.entryThreshold * 100)}¢</span> · Spot Exit: <span className="text-emerald-400">{Math.round((config.takeProfitPrice || 0.85) * 100)}¢</span> · Stop: <span className="text-rose-400">-${config.stopLossDollars || 3}</span> · Stake: <span className="text-emerald-400">${config.stakeSize}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={runAudit}
              disabled={loading}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50 active:scale-95"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Analyzing Trades...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Run AI Audit
                </>
              )}
            </button>
          </div>

          {error && (
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-start gap-3">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block mb-0.5">Audit Notice</span>
                {error}
              </div>
            </div>
          )}

          {auditResult ? (
            <div className="space-y-4">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">AI Strategic Report</div>
              <div className="bg-slate-950/80 border border-slate-800 p-5 rounded-2xl font-mono text-xs text-slate-300 whitespace-pre-wrap leading-relaxed shadow-inner">
                {auditResult}
              </div>
            </div>
          ) : !loading && !error && (
            <div className="text-center py-12 border border-dashed border-slate-800 rounded-2xl">
              <Bot className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <h4 className="text-sm font-bold text-slate-300">Ready to audit your 24h performance</h4>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Click "Run AI Audit" above to inspect breakout win rates, reversal risks, and stop-loss optimizations.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/60 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
