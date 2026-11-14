'use client';

import React, { useState, useEffect } from 'react';
import { Navbar } from '@/components/Navbar';
import { StatsCard } from '@/components/StatsCard';
import { FindingsTable } from '@/components/FindingsTable';
import { FindingModal, FindingDetail } from '@/components/FindingModal';
import { WebhookTesterModal } from '@/components/WebhookTesterModal';
import { VercelRepoCard } from '@/components/VercelRepoCard';
import { WebhookActivityFeed, WebhookActivityItem } from '@/components/WebhookActivityFeed';
import {
  ShieldAlert,
  ShieldCheck,
  Package,
  AlertOctagon,
  AlertTriangle,
  Info,
  RefreshCw,
  Search,
  ExternalLink,
  FolderGit2,
  Clock,
  CheckCircle,
  Radio,
  Zap,
  Activity,
  Layers,
} from 'lucide-react';

interface ProjectResult {
  scannedPath: string;
  filesFound: { packageJson: boolean; packageLock: boolean };
  scanResult: {
    success: boolean;
    metrics: {
      totalDependencies: number;
      directDependencies: number;
      transitiveDependencies: number;
      productionDependencies: number;
      developmentDependencies: number;
      vulnerableDependencies: number;
      totalFindings: number;
      severityCounts: {
        critical: number;
        high: number;
        medium: number;
        low: number;
        unknown: number;
      };
    };
    findings: FindingDetail[];
    durationMs: number;
  } | null;
}

export default function DashboardPage() {
  const [owner, setOwner] = useState('ayanozoro');
  const [repo, setRepo] = useState('auth_service');
  const [ref, setRef] = useState('main');
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<ProjectResult[]>([]);
  const [selectedPath, setSelectedPath] = useState<string>('ALL');
  const [selectedFinding, setSelectedFinding] = useState<FindingDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastScanTime, setLastScanTime] = useState<string | null>(null);
  const [isWebhookTesterOpen, setIsWebhookTesterOpen] = useState(false);
  const [webhookNotice, setWebhookNotice] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [activities, setActivities] = useState<WebhookActivityItem[]>([]);
  const [activeTab, setActiveTab] = useState<'findings' | 'activity'>('findings');

  const fetchScan = async (targetOwner = owner, targetRepo = repo, targetRef = ref) => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('http://localhost:4000/api/webhooks/test-fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: targetOwner.trim(),
          repo: targetRepo.trim(),
          ref: targetRef.trim(),
        }),
      });

      if (!res.ok) {
        throw new Error(`Server returned status ${res.status}`);
      }

      const data = await res.json();
      setProjects(data.projects || []);
      setLastScanTime(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch scan results.');
    } finally {
      setLoading(false);
    }
  };

  const fetchActivity = async () => {
    try {
      const res = await fetch('http://localhost:4000/api/webhooks/activity');
      if (res.ok) {
        const data = await res.json();
        setActivities(data.activity || []);
      }
    } catch {}
  };

  const handleQuickSimulatePush = async () => {
    setIsSimulating(true);
    try {
      const res = await fetch('http://localhost:4000/api/webhooks/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner,
          repo,
          ref,
          event: 'push',
          target: 'local',
        }),
      });
      if (!res.ok) throw new Error('Simulation failed');
    } catch (err) {
      setError('Failed to dispatch simulated push webhook.');
    } finally {
      setIsSimulating(false);
    }
  };

  // Run on initial load & establish Server-Sent Events (SSE) live push listener
  useEffect(() => {
    fetchScan('ayanozoro', 'auth_service', 'main');
    fetchActivity();

    let es: EventSource | null = null;
    try {
      es = new EventSource('http://localhost:4000/api/webhooks/events');
      es.onopen = () => setIsListening(true);
      es.onerror = () => setIsListening(false);
      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'push_scan_completed') {
            if (data.scans) {
              const newProjects = data.scans.map((s: any) => ({
                scannedPath: s.path,
                filesFound: { packageJson: true, packageLock: true },
                scanResult: s.result,
              }));
              setProjects(newProjects);
              setSelectedPath('ALL');
            }
            setLastScanTime(new Date().toLocaleTimeString());
            setWebhookNotice(
              `🚀 Real-time Git Push received for ${data.repository} (commit ${data.commitSha})! Scanned ${data.scannedProjectsCount} projects with ${data.findingsCount} findings.`,
            );
            fetchActivity();
          } else if (data.type === 'ping_received') {
            setWebhookNotice(
              `🟢 Webhook ping received from ${data.repository}! "${data.message}"`,
            );
            fetchActivity();
          }
        } catch (e) {
          console.error('Error parsing SSE event:', e);
        }
      };
    } catch (err) {
      console.error('SSE initialization error:', err);
    }

    return () => {
      if (es) es.close();
    };
  }, []);

  // Compute aggregated stats
  const activeProjects =
    selectedPath === 'ALL'
      ? projects
      : projects.filter((p) => p.scannedPath === selectedPath);

  const totalDeps = activeProjects.reduce(
    (sum, p) => sum + (p.scanResult?.metrics.totalDependencies || 0),
    0,
  );
  const vulnerableDeps = activeProjects.reduce(
    (sum, p) => sum + (p.scanResult?.metrics.vulnerableDependencies || 0),
    0,
  );
  const totalFindingsCount = activeProjects.reduce(
    (sum, p) => sum + (p.scanResult?.metrics.totalFindings || 0),
    0,
  );

  const severityCounts = activeProjects.reduce(
    (acc, p) => {
      const s = p.scanResult?.metrics.severityCounts;
      if (s) {
        acc.critical += s.critical || 0;
        acc.high += s.high || 0;
        acc.medium += s.medium || 0;
        acc.low += s.low || 0;
        acc.unknown += s.unknown || 0;
      }
      return acc;
    },
    { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 },
  );

  const combinedFindings: FindingDetail[] = activeProjects.flatMap(
    (p) => p.scanResult?.findings || [],
  );

  return (
    <div className="min-h-screen bg-[#0B0F17] pb-16">
      <Navbar onOpenWebhookTester={() => setIsWebhookTesterOpen(true)} />

      <main className="max-w-7xl mx-auto px-6 space-y-8">
        {/* Webhook Notice Banner */}
        {webhookNotice && (
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center justify-between shadow-lg shadow-emerald-500/5 animate-fadeIn">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{webhookNotice}</span>
            </div>
            <button
              onClick={() => setWebhookNotice(null)}
              className="text-emerald-400 hover:text-white font-medium ml-4 transition"
            >
              ✕
            </button>
          </div>
        )}

        {/* Vercel-style Connected Repository Header */}
        <VercelRepoCard
          owner={owner}
          repo={repo}
          refName={ref}
          lastScanTime={lastScanTime}
          isListening={isListening}
          onOpenTester={() => setIsWebhookTesterOpen(true)}
          onQuickSimulatePush={handleQuickSimulatePush}
          isSimulating={isSimulating}
        />

        {/* Error notification */}
        {error && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
            <AlertOctagon className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Monorepo Subproject Tabs */}
        {projects.length > 1 && (
          <div className="flex items-center gap-2 border-b border-white/10 pb-2">
            <span className="text-xs text-gray-400 mr-2 font-semibold">Subprojects:</span>
            <button
              onClick={() => setSelectedPath('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                selectedPath === 'ALL'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'bg-white/5 text-gray-400 hover:text-white'
              }`}
            >
              All Subprojects ({projects.length})
            </button>
            {projects.map((p) => (
              <button
                key={p.scannedPath}
                onClick={() => setSelectedPath(p.scannedPath)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  selectedPath === p.scannedPath
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : 'bg-white/5 text-gray-400 hover:text-white'
                }`}
              >
                /{p.scannedPath} ({p.scanResult?.metrics.totalDependencies || 0} deps)
              </button>
            ))}
          </div>
        )}

        {/* Metric Summary Cards */}
        <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatsCard
            title="Total Dependencies"
            value={totalDeps}
            icon={Package}
            variant="default"
          />
          <StatsCard
            title="Vulnerable"
            value={vulnerableDeps}
            icon={ShieldAlert}
            variant={vulnerableDeps > 0 ? 'critical' : 'low'}
          />
          <StatsCard
            title="Critical"
            value={severityCounts.critical}
            icon={AlertOctagon}
            variant={severityCounts.critical > 0 ? 'critical' : 'default'}
          />
          <StatsCard
            title="High"
            value={severityCounts.high}
            icon={AlertTriangle}
            variant={severityCounts.high > 0 ? 'high' : 'default'}
          />
          <StatsCard
            title="Medium"
            value={severityCounts.medium}
            icon={Info}
            variant={severityCounts.medium > 0 ? 'medium' : 'default'}
          />
          <StatsCard
            title="Low"
            value={severityCounts.low}
            icon={CheckCircle}
            variant={severityCounts.low > 0 ? 'low' : 'default'}
          />
        </section>

        {/* Tab Navigation (Findings vs Webhook Activity) */}
        <div className="flex items-center gap-2 border-b border-white/10 pb-3">
          <button
            onClick={() => setActiveTab('findings')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeTab === 'findings'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'bg-white/5 text-gray-400 hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Vulnerability Findings ({combinedFindings.length})
          </button>

          <button
            onClick={() => setActiveTab('activity')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeTab === 'activity'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'bg-white/5 text-gray-400 hover:text-white'
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-indigo-400" />
            Webhook Push Activity ({activities.length})
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'findings' ? (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white tracking-tight">Vulnerability Findings</h2>
                <p className="text-xs text-gray-400">
                  Detailed CVE and advisory records extracted from the Google OSV database
                </p>
              </div>
              <span className="text-xs font-mono px-3 py-1 rounded-full bg-white/5 border border-white/10 text-gray-300">
                {combinedFindings.length} Total Vulnerabilities Detected
              </span>
            </div>

            <FindingsTable
              findings={combinedFindings}
              onSelectFinding={(f) => setSelectedFinding(f)}
            />
          </section>
        ) : (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white tracking-tight">Webhook Push History</h2>
                <p className="text-xs text-gray-400">
                  Chronological log of push events received via GitHub Webhook & Smee tunnel
                </p>
              </div>
            </div>

            <WebhookActivityFeed
              activities={activities}
              onSelectActivity={(act) => {
                if (act.scans) {
                  const newProjects = act.scans.map((s: any) => ({
                    scannedPath: s.path,
                    filesFound: { packageJson: true, packageLock: true },
                    scanResult: s.result,
                  }));
                  setProjects(newProjects);
                  setActiveTab('findings');
                }
              }}
            />
          </section>
        )}
      </main>

      {/* Detail Modal */}
      <FindingModal
        finding={selectedFinding}
        onClose={() => setSelectedFinding(null)}
      />

      {/* Webhook & Smee Hub Modal */}
      <WebhookTesterModal
        isOpen={isWebhookTesterOpen}
        onClose={() => setIsWebhookTesterOpen(false)}
        defaultOwner={owner}
        defaultRepo={repo}
        defaultRef={ref}
        onApplyPushResults={(newProjects) => {
          setProjects(newProjects);
          setSelectedPath('ALL');
          setLastScanTime(new Date().toLocaleTimeString());
          setWebhookNotice(
            `Live GitHub push webhook simulated and verified! Processed ${newProjects.length} projects and updated findings.`,
          );
        }}
      />
    </div>
  );
}
