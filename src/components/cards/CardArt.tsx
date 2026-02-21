import Image from "next/image";
import type { Card } from "@/lib/game/types";

interface CardArtProps {
  card: Card;
  className?: string;
}

export default function CardArt({ card, className = "" }: CardArtProps) {
  const isCreature = card.card_type === "creature";

  if (card.image_url) {
    return (
      <div className={`relative overflow-hidden ${className}`}>
        <Image
          src={card.image_url}
          alt={card.name}
          fill
          className="object-cover"
          sizes="220px"
        />
      </div>
    );
  }

  // Fallback: gradient + emoji
  return (
    <div
      className={`flex items-center justify-center ${className} ${
        isCreature ? "bg-card-border/40" : "bg-purple-800/30"
      }`}
    >
      <span className="text-2xl">{isCreature ? "⚔️" : "✨"}</span>
    </div>
  );
}
