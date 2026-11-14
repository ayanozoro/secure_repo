'use client';

import React from 'react';
import { ShieldCheck, GitBranch, Github, Bell, CheckCircle2 } from 'lucide-react';

interface NavbarProps {
  onOpenWebhookTester?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenWebhookTester }) => {
  return (
    <header className="sticky top-0 z-40 glass-panel border-b border-white/10 px-6 py-4 mb-8">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/25">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg tracking-tight text-white">SecureDevOps</span>
              <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                OSV Scanner
              </span>
            </div>
            <p className="text-xs text-gray-400">Automated Dependency Vulnerability Intelligence</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {onOpenWebhookTester && (
            <button
              onClick={onOpenWebhookTester}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-xs font-semibold transition shadow-sm cursor-pointer"
            >
              <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
              Webhook & Smee Hub
            </button>
          )}

          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Engine Online
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-gray-300">
            <Github className="w-4 h-4 text-white" />
            <span>Connected:</span>
            <span className="font-semibold text-white">ayanozoro</span>
          </div>
        </div>
      </div>
    </header>
  );
};
