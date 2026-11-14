'use client';

import React from 'react';
import { X, ExternalLink, ShieldAlert, CheckCircle, Bug, Tag, GitCommit, FileText } from 'lucide-react';
import { SeverityBadge } from './SeverityBadge';

export interface FindingDetail {
  packageName: string;
  installedVersion: string;
  ecosystem: string;
  dependencyType: 'direct' | 'transitive';
  isDev: boolean;
  osvId: string;
  summary: string;
  details: string;
  aliases: string[];
  severity: string;
  cvssScore: number | null;
  cvssVector: string | null;
  affectedVersions: string;
  fixedVersion: string | null;
  references: string[];
  cwes: string[];
  publishedAt: string | null;
  modifiedAt: string | null;
}

interface FindingModalProps {
  finding: FindingDetail | null;
  onClose: () => void;
}

export const FindingModal: React.FC<FindingModalProps> = ({ finding, onClose }) => {
  if (!finding) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-2xl max-h-[90vh] glass-panel bg-gray-900 border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-white/10 bg-white/[0.02]">
          <div className="space-y-1 pr-6">
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold text-white tracking-tight">
                {finding.packageName}
              </span>
              <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-gray-300 font-mono">
                v{finding.installedVersion}
              </span>
              <SeverityBadge severity={finding.severity} size="md" />
            </div>
            <p className="text-sm font-semibold text-gray-200 mt-2">{finding.summary}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-sm text-gray-300">
          {/* Metadata badges */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
              <span className="text-xs text-gray-400 block mb-1">Advisory ID</span>
              <span className="font-mono text-xs text-indigo-400 font-semibold">{finding.osvId}</span>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
              <span className="text-xs text-gray-400 block mb-1">CVSS Score</span>
              <span className="text-xs font-semibold text-white">
                {finding.cvssScore !== null ? `${finding.cvssScore} / 10` : 'Not Rated'}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
              <span className="text-xs text-gray-400 block mb-1">Scope</span>
              <span className="text-xs font-medium text-white capitalize">
                {finding.dependencyType} ({finding.isDev ? 'Dev' : 'Prod'})
              </span>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
              <span className="text-xs text-gray-400 block mb-1">Remediation</span>
              {finding.fixedVersion ? (
                <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" />
                  Fixed in {finding.fixedVersion}
                </span>
              ) : (
                <span className="text-xs text-rose-400">No fix available</span>
              )}
            </div>
          </div>

          {/* Aliases & CVEs */}
          {finding.aliases.length > 0 && (
            <div>
              <span className="text-xs uppercase tracking-wider font-semibold text-gray-400 block mb-2">
                Aliases & CVE IDs
              </span>
              <div className="flex flex-wrap gap-2">
                {finding.aliases.map((alias) => (
                  <span
                    key={alias}
                    className="px-2.5 py-1 rounded-md bg-white/5 border border-white/10 font-mono text-xs text-white"
                  >
                    {alias}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Affected Range */}
          <div>
            <span className="text-xs uppercase tracking-wider font-semibold text-gray-400 block mb-1">
              Affected Version Range
            </span>
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 font-mono text-xs text-amber-300">
              {finding.affectedVersions}
            </div>
          </div>

          {/* Details / Description */}
          <div>
            <span className="text-xs uppercase tracking-wider font-semibold text-gray-400 block mb-2">
              Vulnerability Description
            </span>
            <div className="p-4 rounded-xl bg-black/40 border border-white/5 text-xs text-gray-300 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
              {finding.details}
            </div>
          </div>

          {/* References */}
          {finding.references.length > 0 && (
            <div>
              <span className="text-xs uppercase tracking-wider font-semibold text-gray-400 block mb-2">
                Security Advisories & References
              </span>
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {finding.references.map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-xs text-indigo-400 hover:text-indigo-300 hover:underline truncate"
                  >
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{url}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 bg-white/[0.02] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white transition"
          >
            Close Details
          </button>
        </div>
      </div>
    </div>
  );
};
