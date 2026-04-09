"use client";

interface GoldBalanceProps {
  amount: number;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'text-xs gap-1',
  md: 'text-sm gap-1.5',
  lg: 'text-lg gap-2',
};

const iconSizes = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-xl',
};

export default function GoldBalance({ amount, size = 'md' }: GoldBalanceProps) {
  return (
    <div className={`flex items-center ${sizeClasses[size]}`}>
      <span className={iconSizes[size]}>🪙</span>
      <span className="font-bold text-yellow-400">{amount.toLocaleString('fr-FR')}</span>
    </div>
  );
}
