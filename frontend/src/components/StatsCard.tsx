import React from 'react';
import { LucideIcon } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: number | string;
  subtitle?: string;
  icon: LucideIcon;
  variant?: 'default' | 'critical' | 'high' | 'medium' | 'low' | 'primary';
}

export const StatsCard: React.FC<StatsCardProps> = ({
  title,
  value,
  subtitle,
  icon: Icon,
  variant = 'default',
}) => {
  const variantStyles = {
    default: {
      border: 'border-white/10 hover:border-white/20',
      iconBg: 'bg-gray-800 text-gray-300',
      glow: '',
    },
    primary: {
      border: 'border-indigo-500/30 hover:border-indigo-500/50',
      iconBg: 'bg-indigo-500/10 text-indigo-400',
      glow: 'shadow-[0_0_20px_-5px_rgba(99,102,241,0.2)]',
    },
    critical: {
      border: 'border-rose-500/30 hover:border-rose-500/50',
      iconBg: 'bg-rose-500/10 text-rose-400',
      glow: 'shadow-[0_0_20px_-5px_rgba(244,63,94,0.2)]',
    },
    high: {
      border: 'border-orange-500/30 hover:border-orange-500/50',
      iconBg: 'bg-orange-500/10 text-orange-400',
      glow: 'shadow-[0_0_20px_-5px_rgba(249,115,22,0.2)]',
    },
    medium: {
      border: 'border-amber-500/30 hover:border-amber-500/50',
      iconBg: 'bg-amber-500/10 text-amber-400',
      glow: 'shadow-[0_0_20px_-5px_rgba(245,158,11,0.2)]',
    },
    low: {
      border: 'border-emerald-500/30 hover:border-emerald-500/50',
      iconBg: 'bg-emerald-500/10 text-emerald-400',
      glow: 'shadow-[0_0_20px_-5px_rgba(16,185,129,0.2)]',
    },
  };

  const style = variantStyles[variant];

  return (
    <div
      className={`glass-card rounded-xl p-5 border transition-all duration-200 relative overflow-hidden ${style.border} ${style.glow}`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider font-semibold text-gray-400 mb-1">
            {title}
          </p>
          <p className="text-3xl font-bold tracking-tight text-white">{value}</p>
          {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
        </div>
        <div className={`p-3 rounded-xl ${style.iconBg}`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
};
