"use client";

import GoldCoin from "./GoldCoin";

interface GoldBalanceProps {
  amount: number;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'text-xs gap-1',
  md: 'text-sm gap-1.5',
  lg: 'text-lg gap-2',
};

// Taille de la pièce en pixels, accordée à celle du nombre qu'elle accompagne.
// En pixels et non en `text-*` : la pièce est un SVG, elle ne suit pas la
// taille de police.
const coinSizes = { sm: 14, md: 16, lg: 22 };

export default function GoldBalance({ amount, size = 'md' }: GoldBalanceProps) {
  return (
    <div className={`flex items-center ${sizeClasses[size]}`}>
      <GoldCoin size={coinSizes[size]} />
      <span className="font-bold text-yellow-400">{amount.toLocaleString('fr-FR')}</span>
    </div>
  );
}
