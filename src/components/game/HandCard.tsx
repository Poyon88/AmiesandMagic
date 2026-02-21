"use client";

import { useState } from "react";
import type { CardInstance } from "@/lib/game/types";
import type { DragEvent } from "react";

interface HandCardProps {
  cardInstance: CardInstance;
  canPlay: boolean;
  isSelected?: boolean;
  onClick?: () => void;
}

export default function HandCard({
  cardInstance,
  canPlay,
  isSelected = false,
  onClick,
}: HandCardProps) {
  const card = cardInstance.card;
  const isCreature = card.card_type === "creature";
  const [isDragging, setIsDragging] = useState(false);

  function handleDragStart(e: DragEvent<HTMLDivElement>) {
    if (!canPlay) {
      e.preventDefault();
      return;
    }
    setIsDragging(true);
    e.dataTransfer.setData("cardInstanceId", cardInstance.instanceId);
    e.dataTransfer.setData("cardType", card.card_type);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragEnd() {
    setIsDragging(false);
  }

  return (
    <div
      data-instance-id={cardInstance.instanceId}
      draggable={canPlay}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={canPlay ? onClick : undefined}
      className={`
        relative w-24 h-36 rounded-lg border-2 flex flex-col overflow-hidden
        transition-all origin-bottom
        hover:-translate-y-8 hover:scale-[3] hover:z-50
        ${isDragging ? "opacity-50 !scale-100 !translate-y-0 !z-auto" : canPlay ? "cursor-grab active:cursor-grabbing" : "opacity-50 cursor-not-allowed"}
        ${!isDragging && isSelected ? "border-primary -translate-y-8 scale-[3] z-50 shadow-lg shadow-primary/30" : "border-card-border"}
        ${isCreature ? "bg-card-bg" : "bg-purple-900/50"}
      `}
    >
      {/* Mana cost */}
      <div className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-mana-blue flex items-center justify-center text-white font-bold text-[10px] z-10">
        {card.mana_cost}
      </div>

      {/* Art placeholder */}
      <div
        className={`h-[35%] flex items-center justify-center text-lg ${
          isCreature ? "bg-card-border/40" : "bg-purple-800/30"
        }`}
      >
        {isCreature ? "⚔️" : "✨"}
      </div>

      {/* Name */}
      <div className="px-1 py-0.5 text-center">
        <h3 className="text-[8px] font-bold text-foreground leading-tight">
          {card.name}
        </h3>
      </div>

      {/* Effect */}
      <div className="flex-1 px-1 overflow-hidden">
        <p className="text-[7px] text-foreground/60 leading-tight">
          {card.effect_text}
        </p>
      </div>

      {/* Stats */}
      {isCreature ? (
        <div className="flex justify-between px-1 pb-0.5">
          <span className="w-4 h-4 rounded bg-attack-yellow flex items-center justify-center text-background font-bold text-[9px]">
            {card.attack}
          </span>
          <span className="w-4 h-4 rounded bg-health-red flex items-center justify-center text-white font-bold text-[9px]">
            {card.health}
          </span>
        </div>
      ) : (
        <div className="text-center pb-0.5">
          <span className="text-[7px] text-purple-300/60 uppercase">
            Spell
          </span>
        </div>
      )}
    </div>
  );
}
