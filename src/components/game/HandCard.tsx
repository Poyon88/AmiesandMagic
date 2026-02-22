"use client";

import { useState, useRef } from "react";
import { motion } from "framer-motion";
import type { CardInstance } from "@/lib/game/types";
import type { DragEvent } from "react";
import CardPreview from "./CardPreview";
import CardArt from "@/components/cards/CardArt";

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
  const [isHovered, setIsHovered] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  function handleDragStart(e: DragEvent<HTMLDivElement>) {
    if (!canPlay) {
      e.preventDefault();
      return;
    }
    setIsDragging(true);
    setIsHovered(false);
    e.dataTransfer.setData("cardInstanceId", cardInstance.instanceId);
    e.dataTransfer.setData("cardType", card.card_type);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragEnd() {
    setIsDragging(false);
  }

  const showPreview = !isDragging && (isHovered || isSelected);

  return (
    <>
      <motion.div
        initial={{ y: 60, opacity: 0, scale: 0.7 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
      <div
        ref={cardRef}
        data-instance-id={cardInstance.instanceId}
        draggable={canPlay}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={canPlay ? onClick : undefined}
        className={`
          relative w-24 h-36 rounded-lg border-2 flex flex-col overflow-hidden
          transition-all duration-200
          ${showPreview ? "-translate-y-4 z-20" : ""}
          ${isDragging ? "opacity-50" : canPlay ? "cursor-grab active:cursor-grabbing" : "opacity-50 cursor-not-allowed"}
          ${isSelected ? "border-primary shadow-lg shadow-primary/30" : "border-card-border"}
          ${isCreature ? "bg-card-bg" : "bg-purple-900/50"}
        `}
      >
        {/* Mana cost */}
        <div className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-mana-blue flex items-center justify-center text-white font-bold text-[10px] z-10">
          {card.mana_cost}
        </div>

        {/* Art */}
        <CardArt card={card} className="h-[35%]" />

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
      </motion.div>

      {showPreview && (
        <CardPreview
          cardInstance={cardInstance}
          anchorRef={cardRef}
          position="above"
        />
      )}
    </>
  );
}
