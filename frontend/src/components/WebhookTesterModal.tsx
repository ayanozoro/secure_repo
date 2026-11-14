'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Radio,
  Send,
  CheckCircle2,
  AlertOctagon,
  Copy,
  ExternalLink,
  ShieldCheck,
  Terminal,
  Zap,
  Globe,
  RefreshCw,
  GitCommit,
  Check,
} from 'lucide-react';

export interface WebhookSimulationResult {
  success: boolean;
  event: string;
  target: string;
  targetUrl: string;
  deliveryId: string;
  signatureVerified: boolean;
  statusCode: number;
  data: any;
  timestamp: string;
  error?: any;
}

interface WebhookTesterModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultOwner?: string;
  defaultRepo?: string;
  defaultRef?: string;
  onApplyPushResults?: (projects: any[]) => void;
}

export const WebhookTesterModal: React.FC<WebhookTesterModalProps> = ({
  isOpen,
  onClose,
  defaultOwner = 'ayanozoro',
  defaultRepo = 'auth_service',
  defaultRef = 'main',
  onApplyPushResults,
}) => {
  const [owner, setOwner] = useState(defaultOwner);
  const [repo, setRepo] = useState(defaultRepo);
  const [ref, setRef] = useState(defaultRef);
  const [event, setEvent] = useState<'push' | 'ping'>('push');
  const [target, setTarget] = useState<'local' | 'smee'>('local');

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<WebhookSimulationResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [info, setInfo] = useState<{
    smeeUrl: string;
    localWebhookUrl: string;
    hasWebhookSecret: boolean;
  } | null>(null);

  // Fetch webhook configuration info
  useEffect(() => {
    if (isOpen) {
      fetch('http://localhost:4000/api/webhooks/info')
        .then((r) => r.json())
        .then((data) => setInfo(data))
        .catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopySmee = () => {
    if (info?.smeeUrl) {
      navigator.clipboard.writeText(info.smeeUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSend = async () => {
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch('http://localhost:4000/api/webhooks/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: owner.trim(),
          repo: repo.trim(),
          ref: ref.trim(),
          event,
          target,
        }),
      });

      const data = await res.json();
      setResult(data);
    } catch (err: any) {
      setResult({
        success: false,
        event,
        target,
        targetUrl: 'error',
        deliveryId: 'err-' + Date.now(),
        signatureVerified: false,
        statusCode: 500,
        data: null,
        error: err.message,
        timestamp: new Date().toISOString(),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (result?.data?.scans && onApplyPushResults) {
      // Map webhook scans to project result format
      const formatted = result.data.scans.map((s: any) => ({
        scannedPath: s.path,
        filesFound: { packageJson: true, packageLock: true },
        scanResult: s.result,
      }));
      onApplyPushResults(formatted);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-2xl max-h-[92vh] glass-panel bg-[#0d131f] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-lg shadow-indigo-600/20">
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">
                GitHub Webhook & Smee Tunnel Hub
              </h2>
              <p className="text-xs text-gray-400">
                Test webhook reception, HMAC SHA-256 verification, and live push scanning
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs text-gray-300">
          {/* Smee Tunnel Info Banner */}
          <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-indigo-400" />
                Active Smee Webhook Relay URL
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Tunnel Active
              </span>
            </div>

            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-indigo-300 font-mono text-[11px] truncate">
                {info?.smeeUrl || 'https://smee.io/4Dskqsw7XjXJssg7'}
              </code>
              <button
                onClick={handleCopySmee}
                className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white transition flex items-center gap-1.5 font-medium shrink-0"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>

            <div className="text-[11px] text-gray-400 flex items-center justify-between pt-1">
              <span>Local Target: <code className="text-gray-300">http://localhost:4000/api/webhooks/github</code></span>
              <span className="flex items-center gap-1 text-emerald-400">
                <ShieldCheck className="w-3.5 h-3.5" />
                HMAC SHA-256 Enforced
              </span>
            </div>
          </div>

          {/* Configuration Form */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Delivery Route */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                Delivery Route
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTarget('local')}
                  className={`p-3 rounded-xl border text-left transition ${
                    target === 'local'
                      ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-lg shadow-indigo-600/10'
                      : 'bg-white/[0.02] border-white/10 text-gray-400 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-semibold text-white mb-0.5">
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    Local Direct
                  </div>
                  <p className="text-[10px] text-gray-400">Fast local simulation</p>
                </button>

                <button
                  type="button"
                  onClick={() => setTarget('smee')}
                  className={`p-3 rounded-xl border text-left transition ${
                    target === 'smee'
                      ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-lg shadow-indigo-600/10'
                      : 'bg-white/[0.02] border-white/10 text-gray-400 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-semibold text-white mb-0.5">
                    <Globe className="w-3.5 h-3.5 text-indigo-400" />
                    Smee Cloud
                  </div>
                  <p className="text-[10px] text-gray-400">Tests full tunnel relay</p>
                </button>
              </div>
            </div>

            {/* Event Type */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                Event Type
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setEvent('push')}
                  className={`p-3 rounded-xl border text-left transition ${
                    event === 'push'
                      ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-lg shadow-indigo-600/10'
                      : 'bg-white/[0.02] border-white/10 text-gray-400 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-semibold text-white mb-0.5">
                    <GitCommit className="w-3.5 h-3.5 text-indigo-400" />
                    push
                  </div>
                  <p className="text-[10px] text-gray-400">Fetch deps & scan OSV</p>
                </button>

                <button
                  type="button"
                  onClick={() => setEvent('ping')}
                  className={`p-3 rounded-xl border text-left transition ${
                    event === 'ping'
                      ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-lg shadow-indigo-600/10'
                      : 'bg-white/[0.02] border-white/10 text-gray-400 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-semibold text-white mb-0.5">
                    <Radio className="w-3.5 h-3.5 text-emerald-400" />
                    ping
                  </div>
                  <p className="text-[10px] text-gray-400">Handshake test</p>
                </button>
              </div>
            </div>
          </div>

          {/* Target Repo Inputs */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-gray-400">Owner</label>
              <input
                type="text"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-gray-400">Repository</label>
              <input
                type="text"
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-gray-400">Ref / Branch</label>
              <input
                type="text"
                value={ref}
                onChange={(e) => setRef(e.target.value)}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Action Button */}
          <button
            onClick={handleSend}
            disabled={loading}
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition shadow-lg shadow-indigo-600/30 disabled:opacity-50"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Dispatching & Processing Webhook...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Dispatch Signed [{event.toUpperCase()}] Webhook
              </>
            )}
          </button>

          {/* Live Result Display */}
          {result && (
            <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-3 animate-fadeIn">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {result.success ? (
                    <span className="p-1 rounded-full bg-emerald-500/20 text-emerald-400">
                      <CheckCircle2 className="w-4 h-4" />
                    </span>
                  ) : (
                    <span className="p-1 rounded-full bg-rose-500/20 text-rose-400">
                      <AlertOctagon className="w-4 h-4" />
                    </span>
                  )}
                  <span className="font-bold text-white text-sm">
                    {result.success ? 'Delivery Succeeded (HTTP 200)' : 'Delivery Failed'}
                  </span>
                </div>
                <span className="font-mono text-[10px] text-gray-400">
                  {result.deliveryId}
                </span>
              </div>

              {/* Push Scan Results Summary */}
              {result.event === 'push' && result.data?.scans && (
                <div className="p-3 rounded-lg bg-white/[0.03] border border-white/5 space-y-2">
                  <div className="flex items-center justify-between text-gray-300 font-semibold">
                    <span>
                      Scanned {result.data.scannedProjectsCount} Projects in {result.data.repository}
                    </span>
                    {onApplyPushResults && (
                      <button
                        onClick={handleApply}
                        className="px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[10px] transition shadow"
                      >
                        Apply to Dashboard
                      </button>
                    )}
                  </div>
                  <div className="space-y-1">
                    {result.data.scans.map((s: any) => (
                      <div
                        key={s.path}
                        className="flex items-center justify-between text-[11px] text-gray-400 py-1 border-t border-white/5"
                      >
                        <span className="font-mono text-indigo-300">/{s.path}</span>
                        <span>
                          {s.result.metrics.totalDependencies} dependencies •{' '}
                          <span
                            className={
                              s.result.metrics.totalFindings > 0
                                ? 'text-rose-400 font-bold'
                                : 'text-emerald-400'
                            }
                          >
                            {s.result.metrics.totalFindings} vulnerabilities
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Ping Result */}
              {result.event === 'ping' && result.data && (
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
                  <span className="font-bold block mb-1">Ping Handshake Verified:</span>
                  <p className="text-xs italic font-serif">"{result.data.zen}"</p>
                </div>
              )}

              {/* Technical Details JSON */}
              <details className="text-[10px] text-gray-500 pt-1">
                <summary className="cursor-pointer hover:text-gray-300 font-semibold">
                  View Raw Webhook Payload & Headers
                </summary>
                <pre className="mt-2 p-2 rounded bg-black/60 overflow-x-auto text-gray-400 font-mono text-[10px]">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
