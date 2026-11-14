'use client';

import React from 'react';
import {
  FolderGit2,
  GitBranch,
  Radio,
  ShieldCheck,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  ExternalLink,
  Zap,
  Globe,
  AlertTriangle,
} from 'lucide-react';

interface VercelRepoCardProps {
  owner: string;
  repo: string;
  refName: string;
  lastScanTime: string | null;
  isListening: boolean;
  onOpenTester: () => void;
  onQuickSimulatePush: () => void;
  isSimulating: boolean;
}

export const VercelRepoCard: React.FC<VercelRepoCardProps> = ({
  owner,
  repo,
  refName,
  lastScanTime,
  isListening,
  onOpenTester,
  onQuickSimulatePush,
  isSimulating,
}) => {
  return (
    <div className="glass-panel rounded-2xl p-6 border border-white/10 shadow-xl bg-gradient-to-r from-gray-900/90 via-[#0e1626]/90 to-gray-900/90 relative overflow-hidden">
      {/* Background ambient glow */}
      <div className="absolute -right-20 -top-20 w-64 h-64 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
        {/* Repository Identity & Vercel-style Git Status */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/10 border border-white/10 flex items-center justify-center text-white">
              <FolderGit2 className="w-4 h-4 text-indigo-400" />
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <span>{owner}/{repo}</span>
              <a
                href={`https://github.com/${owner}/${repo}`}
                target="_blank"
                rel="noreferrer"
                className="text-gray-400 hover:text-white transition"
              >
                <ArrowUpRight className="w-4 h-4" />
              </a>
            </h1>
            <span className="flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-gray-300 font-mono">
              <GitBranch className="w-3 h-3 text-indigo-400" />
              {refName}
            </span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-medium flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Auto-Scan on Git Push
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs text-gray-400">
            <span className="flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-indigo-400" />
              Webhook Relay: <code className="text-gray-300 font-mono">Smee Tunnel</code>
            </span>
            <span>•</span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              HMAC SHA-256 Verified
            </span>
            <span>•</span>
            <span className="flex items-center gap-1.5">
              {isListening ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  <span className="w-2 h-2 rounded-full bg-emerald-400 -ml-3.5" />
                  <span className="text-emerald-400 font-medium">Live Push Stream Connected</span>
                </>
              ) : (
                <span className="text-gray-500">Connecting Push Stream...</span>
              )}
            </span>
            {lastScanTime && (
              <>
                <span>•</span>
                <span className="flex items-center gap-1 text-gray-400">
                  <Clock className="w-3.5 h-3.5" />
                  Last scanned at {lastScanTime}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={onQuickSimulatePush}
            disabled={isSimulating}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition shadow-lg shadow-indigo-600/30 disabled:opacity-50 cursor-pointer"
          >
            <Zap className={`w-3.5 h-3.5 ${isSimulating ? 'animate-spin' : 'text-amber-300'}`} />
            {isSimulating ? 'Processing Git Push...' : 'Simulate Git Push'}
          </button>

          <button
            onClick={onOpenTester}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white font-semibold text-xs transition border border-white/10 cursor-pointer"
          >
            <Radio className="w-3.5 h-3.5 text-indigo-400" />
            Webhook & Smee Hub
          </button>
        </div>
      </div>
    </div>
  );
};
