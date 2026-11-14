import React from 'react';

interface SeverityBadgeProps {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN' | string;
  size?: 'sm' | 'md';
}

export const SeverityBadge: React.FC<SeverityBadgeProps> = ({ severity, size = 'sm' }) => {
  const norm = (severity || 'UNKNOWN').toUpperCase();

  const styles: Record<string, { bg: string; text: string; border: string; dot: string }> = {
    CRITICAL: {
      bg: 'bg-rose-500/10',
      text: 'text-rose-400',
      border: 'border-rose-500/30',
      dot: 'bg-rose-500',
    },
    HIGH: {
      bg: 'bg-orange-500/10',
      text: 'text-orange-400',
      border: 'border-orange-500/30',
      dot: 'bg-orange-500',
    },
    MEDIUM: {
      bg: 'bg-amber-500/10',
      text: 'text-amber-400',
      border: 'border-amber-500/30',
      dot: 'bg-amber-500',
    },
    LOW: {
      bg: 'bg-emerald-500/10',
      text: 'text-emerald-400',
      border: 'border-emerald-500/30',
      dot: 'bg-emerald-500',
    },
    UNKNOWN: {
      bg: 'bg-gray-500/10',
      text: 'text-gray-400',
      border: 'border-gray-500/30',
      dot: 'bg-gray-500',
    },
  };

  const current = styles[norm] || styles.UNKNOWN;
  const padding = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm';

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-full border ${current.bg} ${current.text} ${current.border} ${padding}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${current.dot} animate-pulse`} />
      {norm}
    </span>
  );
};
