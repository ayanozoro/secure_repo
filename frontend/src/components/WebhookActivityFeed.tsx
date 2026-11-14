'use client';

import React from 'react';
import {
  GitCommit,
  Radio,
  Clock,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  FolderGit2,
} from 'lucide-react';

export interface WebhookActivityItem {
  id: string;
  event: 'push' | 'ping';
  repository: string;
  commitSha: string | null;
  fullCommitSha?: string;
  ref: string | null;
  timestamp: string;
  status: string;
  findingsCount?: number;
  totalDependencies?: number;
  vulnerabilities?: string[];
  message?: string;
  scannedProjectsCount?: number;
  scans?: any[];
}

interface WebhookActivityFeedProps {
  activities: WebhookActivityItem[];
  onSelectActivity?: (activity: WebhookActivityItem) => void;
}

export const WebhookActivityFeed: React.FC<WebhookActivityFeedProps> = ({
  activities,
  onSelectActivity,
}) => {
  if (activities.length === 0) {
    return (
      <div className="glass-panel rounded-2xl p-6 border border-white/10 text-center text-xs text-gray-400">
        <Radio className="w-6 h-6 text-indigo-400 mx-auto mb-2 opacity-50 animate-pulse" />
        <p className="font-semibold text-gray-300">Listening for GitHub Webhook Push Events</p>
        <p className="text-[11px] text-gray-500 mt-1">
          When code is pushed to your connected repository, events will appear here in real time.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-2xl border border-white/10 overflow-hidden shadow-xl">
      <div className="p-4 border-b border-white/10 bg-white/[0.02] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-indigo-400" />
          <h3 className="font-bold text-white text-xs tracking-tight">
            Webhook Push & Scan Activity (Vercel-style Feed)
          </h3>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 text-gray-400">
          {activities.length} Recorded Deliveries
        </span>
      </div>

      <div className="divide-y divide-white/5">
        {activities.map((item) => {
          const time = new Date(item.timestamp).toLocaleTimeString();
          const isPush = item.event === 'push';

          return (
            <div
              key={item.id}
              onClick={() => onSelectActivity && onSelectActivity(item)}
              className="p-4 hover:bg-white/[0.02] transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    isPush
                      ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
                      : 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
                  }`}
                >
                  {isPush ? <GitCommit className="w-4 h-4" /> : <Radio className="w-4 h-4" />}
                </div>

                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 rounded ${
                        isPush
                          ? 'bg-indigo-500/15 text-indigo-300'
                          : 'bg-emerald-500/15 text-emerald-300'
                      }`}
                    >
                      {item.event}
                    </span>
                    <span className="font-bold text-xs text-white">
                      {item.repository}
                    </span>
                    {item.commitSha && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-gray-300">
                        {item.commitSha}
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] text-gray-400 flex items-center gap-2">
                    {isPush ? (
                      <span>
                        Scanned {item.scannedProjectsCount || 0} subprojects ({item.totalDependencies || 0} dependencies)
                      </span>
                    ) : (
                      <span>{item.message || 'Ping handshake verified'}</span>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4 self-end sm:self-center">
                {isPush && item.findingsCount !== undefined && (
                  <div>
                    {item.findingsCount > 0 ? (
                      <span className="text-[11px] font-semibold text-rose-400 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {item.findingsCount} Vulnerabilities
                      </span>
                    ) : (
                      <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        All Clear
                      </span>
                    )}
                  </div>
                )}

                <span className="text-[10px] text-gray-500 font-mono">
                  {time}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
