import React, { useState } from 'react';
import {
  X,
  Send,
  Sliders,
  DollarSign,
  Clock,
  Shield,
  Volume2,
  Bell,
  Check,
  Zap,
} from 'lucide-react';
import { BotConfig } from '../types/index.ts';

interface BotSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: BotConfig;
  onSaveConfig: (updated: Partial<BotConfig>) => Promise<void>;
  onSendTestTelegram: () => Promise<void>;
}

export const BotSettingsModal: React.FC<BotSettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
  onSendTestTelegram,
}) => {
  const [formData, setFormData] = useState<BotConfig>({ ...config });
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSaveConfig(formData);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      await onSendTestTelegram();
      setTestResult('Alert delivered to Telegram!');
      setTimeout(() => setTestResult(null), 3500);
    } catch {
      setTestResult('Failed to deliver alert. Check token & chat ID.');
      setTimeout(() => setTestResult(null), 3500);
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full p-6 shadow-2xl relative my-8">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Bot & Copy-Trade Settings</h2>
            <p className="text-xs text-slate-400">
              Configure Telegram notifications, copy trade sizing, and tracker timing.
            </p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-5">
          {/* Section 1: Telegram Alert Settings */}
          <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80 space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-sky-400 flex items-center gap-1.5 uppercase tracking-wider">
                <Send className="w-3.5 h-3.5" />
                Telegram Alert Bot
              </span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isTelegramAlertsEnabled}
                  onChange={(e) =>
                    setFormData({ ...formData, isTelegramAlertsEnabled: e.target.checked })
                  }
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
              </label>
            </div>

            <div className="text-xs text-slate-400">
              {formData.telegramConfigured ? (
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  ✓ Telegram Bot Token & Chat ID configured securely via environment secrets.
                </span>
              ) : (
                <span className="text-amber-400 font-semibold flex items-center gap-1">
                  ⚠ Telegram secrets (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID) not provided in environment. Alerts disabled.
                </span>
              )}
            </div>

            <div className="pt-1 flex items-center gap-3">
              <button
                type="button"
                onClick={handleTest}
                disabled={isTesting || !formData.telegramConfigured}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 border border-sky-500/30 transition-all flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
              >
                <Send className={`w-3 h-3 ${isTesting ? 'animate-bounce' : ''}`} />
                {isTesting ? 'Testing...' : 'Test Alert'}
              </button>
            </div>

            {testResult && (
              <div className="text-xs text-emerald-400 bg-emerald-500/10 px-3 py-2 rounded-xl border border-emerald-500/20">
                {testResult}
              </div>
            )}
          </div>

          {/* Section 2: Copy Trade Sizing */}
          <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80 space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 uppercase tracking-wider">
                <DollarSign className="w-3.5 h-3.5" />
                Demo Copy Trade Sizing
              </span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isAutoCopyEnabled}
                  onChange={(e) =>
                    setFormData({ ...formData, isAutoCopyEnabled: e.target.checked })
                  }
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
              </label>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="text-xs text-slate-400 block mb-1">
                  Trade Size per Target Order ($)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-xs text-slate-500 font-mono">$</span>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    step="1"
                    value={formData.copyTradeAmount}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        copyTradeAmount: Math.max(1, parseFloat(e.target.value) || 5),
                      })
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-6 pr-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="flex-1">
                <label className="text-xs text-slate-400 block mb-1">
                  Polling Speed
                </label>
                <select
                  value={formData.pollingIntervalSeconds}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      pollingIntervalSeconds: parseInt(e.target.value, 10),
                    })
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value={3}>Ultra-fast (3s)</option>
                  <option value={5}>Standard (5s - Recommended)</option>
                  <option value={10}>Conservative (10s)</option>
                  <option value={30}>Eco (30s)</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-slate-400 block">
                Max Slippage Tolerance (%)
              </label>
              <input
                type="number"
                min="0.1"
                max="100"
                step="1"
                value={formData.maxSlippagePercent}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    maxSlippagePercent: Math.max(0.1, parseFloat(e.target.value) || 1.0),
                  })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Section 3: Alerts & Audio */}
          <div className="flex items-center justify-between p-3 bg-slate-950/60 rounded-xl border border-slate-800 text-xs text-slate-300">
            <span className="flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-emerald-400" />
              <span>Chime Audio on Live Trade Detection</span>
            </span>
            <input
              type="checkbox"
              checked={formData.soundAlertsEnabled}
              onChange={(e) =>
                setFormData({ ...formData, soundAlertsEnabled: e.target.checked })
              }
              className="rounded bg-slate-800 border-slate-700 text-emerald-500 focus:ring-0"
            />
          </div>

          {/* Section 4: 24/7 Continuous Mode */}
          <div className="flex items-center justify-between p-3 bg-emerald-950/20 rounded-xl border border-emerald-800/40 text-xs text-emerald-300">
            <span className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-400" />
              <span>24/7 Continuous Execution Active (No Daily Target Stop)</span>
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              UNLIMITED
            </span>
          </div>

          {/* Footer Save Button */}
          <div className="flex items-center justify-end gap-3 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
            >
              {saveSuccess ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  Saved!
                </>
              ) : isSaving ? (
                'Saving...'
              ) : (
                'Save Settings'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
