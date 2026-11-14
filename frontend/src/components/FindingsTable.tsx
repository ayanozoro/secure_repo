'use client';

import React, { useState, useMemo } from 'react';
import { Search, Filter, AlertTriangle, CheckCircle2, ChevronRight, ShieldCheck, ArrowUpDown } from 'lucide-react';
import { SeverityBadge } from './SeverityBadge';
import { FindingDetail } from './FindingModal';

interface FindingsTableProps {
  findings: FindingDetail[];
  onSelectFinding: (finding: FindingDetail) => void;
}

export const FindingsTable: React.FC<FindingsTableProps> = ({ findings, onSelectFinding }) => {
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');

  // Filter findings
  const filteredFindings = useMemo(() => {
    return findings.filter((f) => {
      // Search term
      const matchesSearch =
        !search ||
        f.packageName.toLowerCase().includes(search.toLowerCase()) ||
        f.osvId.toLowerCase().includes(search.toLowerCase()) ||
        f.aliases.some((a) => a.toLowerCase().includes(search.toLowerCase())) ||
        f.summary.toLowerCase().includes(search.toLowerCase());

      // Severity filter
      const matchesSeverity =
        severityFilter === 'ALL' || f.severity.toUpperCase() === severityFilter;

      // Type filter
      let matchesType = true;
      if (typeFilter === 'DIRECT') matchesType = f.dependencyType === 'direct';
      else if (typeFilter === 'TRANSITIVE') matchesType = f.dependencyType === 'transitive';
      else if (typeFilter === 'PROD') matchesType = !f.isDev;
      else if (typeFilter === 'DEV') matchesType = f.isDev;

      return matchesSearch && matchesSeverity && matchesType;
    });
  }, [findings, search, severityFilter, typeFilter]);

  return (
    <div className="glass-panel rounded-2xl border border-white/10 overflow-hidden shadow-xl">
      {/* Table Header Controls */}
      <div className="p-5 border-b border-white/10 bg-white/[0.01] flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search package, CVE, or advisory..."
            className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* Severity Filter */}
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-gray-300 focus:outline-none focus:border-indigo-500 transition cursor-pointer"
          >
            <option value="ALL" className="bg-gray-900">All Severities</option>
            <option value="CRITICAL" className="bg-gray-900">Critical Only</option>
            <option value="HIGH" className="bg-gray-900">High Only</option>
            <option value="MEDIUM" className="bg-gray-900">Medium Only</option>
            <option value="LOW" className="bg-gray-900">Low Only</option>
          </select>

          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-gray-300 focus:outline-none focus:border-indigo-500 transition cursor-pointer"
          >
            <option value="ALL" className="bg-gray-900">All Dependencies</option>
            <option value="DIRECT" className="bg-gray-900">Direct Only</option>
            <option value="TRANSITIVE" className="bg-gray-900">Transitive Only</option>
            <option value="PROD" className="bg-gray-900">Production Only</option>
            <option value="DEV" className="bg-gray-900">Dev Only</option>
          </select>
        </div>
      </div>

      {/* Table Element */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-white/[0.02] border-b border-white/10 text-gray-400 uppercase tracking-wider font-semibold">
            <tr>
              <th className="py-3.5 px-6">Package</th>
              <th className="py-3.5 px-4">Dependency Type</th>
              <th className="py-3.5 px-4">Vulnerability / CVE</th>
              <th className="py-3.5 px-4">Severity</th>
              <th className="py-3.5 px-4">Fixed Version</th>
              <th className="py-3.5 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 text-gray-300">
            {filteredFindings.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-gray-400">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <ShieldCheck className="w-10 h-10 text-emerald-400 opacity-60" />
                    <p className="font-semibold text-sm text-gray-200">No vulnerabilities found matching filters</p>
                    <p className="text-xs text-gray-500">
                      {findings.length === 0
                        ? 'All scanned dependencies are secure and free of known CVEs!'
                        : 'Try adjusting your search query or filter options.'}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredFindings.map((finding, idx) => (
                <tr
                  key={`${finding.osvId}-${finding.packageName}-${idx}`}
                  onClick={() => onSelectFinding(finding)}
                  className="hover:bg-white/[0.04] transition-colors cursor-pointer group"
                >
                  {/* Package */}
                  <td className="py-4 px-6 font-medium text-white">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{finding.packageName}</span>
                      <span className="px-1.5 py-0.5 rounded bg-white/10 text-[11px] text-gray-300 font-mono">
                        v{finding.installedVersion}
                      </span>
                    </div>
                  </td>

                  {/* Dependency Type */}
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`capitalize px-2 py-0.5 rounded text-[11px] font-medium ${
                          finding.dependencyType === 'direct'
                            ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                            : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                        }`}
                      >
                        {finding.dependencyType}
                      </span>
                      <span className="text-[11px] text-gray-500">
                        {finding.isDev ? '• dev' : '• prod'}
                      </span>
                    </div>
                  </td>

                  {/* Advisory / CVE */}
                  <td className="py-4 px-4 font-mono text-[11px]">
                    <div className="space-y-0.5">
                      <span className="text-indigo-400 font-semibold block">{finding.osvId}</span>
                      {finding.aliases.length > 0 && (
                        <span className="text-gray-400 text-[10px] block truncate max-w-[150px]">
                          {finding.aliases.join(', ')}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Severity */}
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-2">
                      <SeverityBadge severity={finding.severity} />
                      {finding.cvssScore !== null && (
                        <span className="text-[11px] text-gray-400 font-mono">
                          {finding.cvssScore}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Fixed Version */}
                  <td className="py-4 px-4">
                    {finding.fixedVersion ? (
                      <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono font-medium text-[11px]">
                        {finding.fixedVersion}
                      </span>
                    ) : (
                      <span className="text-gray-500 text-[11px] italic">Unpatched</span>
                    )}
                  </td>

                  {/* Action */}
                  <td className="py-4 px-4 text-right">
                    <span className="inline-flex items-center gap-1 text-xs text-indigo-400 group-hover:text-indigo-300 transition">
                      View
                      <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition" />
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Table Footer */}
      <div className="p-4 bg-white/[0.01] border-t border-white/10 flex items-center justify-between text-xs text-gray-400">
        <span>Showing {filteredFindings.length} of {findings.length} findings</span>
        <span className="text-[11px] text-gray-500">Click any row to view full advisory details & remediation</span>
      </div>
    </div>
  );
};
