"use client";

import type { CardInstance } from "@/lib/game/types";

interface BoardCreatureProps {
  creature: CardInstance;
  isOwn: boolean;
  canAttack?: boolean;
  isSelected?: boolean;
  isValidTarget?: boolean;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export default function BoardCreature({
  creature,
  isOwn,
  canAttack = false,
  isSelected = false,
  isValidTarget = false,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: BoardCreatureProps) {
  const hasCharge = creature.card.keywords.includes("charge");
  const hasTaunt = creature.card.keywords.includes("taunt");
  const hasRanged = creature.card.keywords.includes("ranged");
  const isDamaged = creature.currentHealth < creature.maxHealth;

  return (
    <div
      data-instance-id={creature.instanceId}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`
        relative w-16 h-20 rounded-lg border-2 flex flex-col items-center justify-between p-1
        transition-all cursor-pointer
        ${isSelected ? "border-attack-yellow scale-110 shadow-lg shadow-attack-yellow/30 z-10" : ""}
        ${isValidTarget ? "border-accent ring-2 ring-accent/50 animate-pulse" : ""}
        ${canAttack && !isSelected ? "border-success/60 hover:border-success" : ""}
        ${!isSelected && !isValidTarget && !canAttack ? "border-card-border" : ""}
        ${hasTaunt ? "ring-1 ring-blue-400/50" : ""}
        ${isOwn ? "bg-card-bg hover:scale-105" : "bg-card-bg/80 hover:scale-105"}
      `}
      title={`${creature.card.name} (${creature.currentAttack}/${creature.currentHealth})`}
    >
      {/* Divine Shield indicator */}
      {creature.hasDivineShield && (
        <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-yellow-400 flex items-center justify-center text-[8px]">
          🛡
        </div>
      )}

      {/* Summoning sickness indicator */}
      {creature.hasSummoningSickness && isOwn && (
        <div className="absolute -top-1 -left-1 w-3 h-3 rounded-full bg-foreground/30" title="Summoning sickness" />
      )}

      {/* Name */}
      <div className="text-[8px] text-foreground/80 text-center leading-tight truncate w-full">
        {creature.card.name}
      </div>

      {/* Keyword icons */}
      <div className="flex gap-0.5 text-[8px]">
        {hasTaunt && <span title="Taunt">🏰</span>}
        {hasRanged && <span title="Ranged">🏹</span>}
        {hasCharge && <span title="Charge">⚡</span>}
      </div>

      {/* Attack / Health */}
      <div className="flex justify-between w-full">
        <span
          className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center ${
            creature.currentAttack > (creature.card.attack ?? 0)
              ? "bg-green-500 text-white"
              : "bg-attack-yellow text-background"
          }`}
        >
          {creature.currentAttack}
        </span>
        <span
          className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center ${
            isDamaged
              ? "bg-accent text-white"
              : creature.currentHealth > (creature.card.health ?? 0)
              ? "bg-green-500 text-white"
              : "bg-health-red text-white"
          }`}
        >
          {creature.currentHealth}
        </span>
      </div>
    </div>
  );
}
