"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

interface Board {
  id: number;
  name: string;
  image_url: string;
  rarity: string | null;
  max_prints: number | null;
  is_default: boolean;
  is_active: boolean;
}

interface OwnedPrint {
  id: number;
  board_id: number;
  print_number: number;
  max_prints: number;
  is_tradeable: boolean;
}

interface Props {
  boards: Board[];
  ownedPrints: OwnedPrint[];
}

const RARITIES = ["Commune", "Peu Commune", "Rare", "Épique", "Légendaire"];
const RARITY_COLORS: Record<string, string> = {
  "Commune": "#aaaaaa",
  "Peu Commune": "#4caf50",
  "Rare": "#4fc3f7",
  "Épique": "#ce93d8",
  "Légendaire": "#ffd54f",
};

export default function BoardCollectionView({ boards, ownedPrints }: Props) {
  const router = useRouter();
  const [rarityFilter, setRarityFilter] = useState<string | null>(null);
  const [ownedOnly, setOwnedOnly] = useState(false);

  const printsByBoard = useMemo(() => {
    const map = new Map<number, OwnedPrint[]>();
    for (const p of ownedPrints) {
      const list = map.get(p.board_id) ?? [];
      list.push(p);
      map.set(p.board_id, list);
    }
    return map;
  }, [ownedPrints]);

  const displayItems = useMemo(() => {
    const items: { board: Board; print?: OwnedPrint; key: string }[] = [];
    for (const board of boards) {
      if (rarityFilter && (board.rarity ?? "Commune") !== rarityFilter) continue;
      const isCommon = (board.rarity ?? "Commune") === "Commune";
      const prints = printsByBoard.get(board.id) ?? [];

      if (isCommon) {
        if (ownedOnly) continue;
        items.push({ board, key: `board-${board.id}` });
      } else {
        if (prints.length === 0) {
          if (ownedOnly) continue;
          items.push({ board, key: `board-${board.id}` });
        } else {
          for (const p of prints) {
            items.push({ board, print: p, key: `print-${p.id}` });
          }
        }
      }
    }
    return items;
  }, [boards, rarityFilter, ownedOnly, printsByBoard]);

  const ownedCount = ownedPrints.length;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-primary">Mes Plateaux</h1>
          <p className="text-foreground/50 text-sm mt-1">
            {displayItems.length} visible{displayItems.length > 1 ? "s" : ""} · {ownedCount} print{ownedCount > 1 ? "s" : ""} possédé{ownedCount > 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => router.push("/")}
          className="px-4 py-2 bg-secondary border border-card-border rounded-lg text-foreground/60 hover:text-foreground hover:border-primary/40 transition-colors"
        >
          Back to Menu
        </button>
      </div>

      <div className="bg-secondary rounded-xl border border-card-border p-4 mb-6">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-1">
            <span className="text-foreground/50 text-sm mr-1">Rareté :</span>
            <div className="flex gap-1">
              {RARITIES.map((r) => (
                <button
                  key={r}
                  onClick={() => setRarityFilter(rarityFilter === r ? null : r)}
                  style={{
                    borderColor: rarityFilter === r ? RARITY_COLORS[r] : undefined,
                    color: rarityFilter === r ? RARITY_COLORS[r] : undefined,
                    backgroundColor: rarityFilter === r ? `${RARITY_COLORS[r]}15` : undefined,
                  }}
                  className={`px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
                    rarityFilter === r ? "border" : "bg-background border border-card-border text-foreground/50 hover:border-primary/50"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-foreground/70 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={ownedOnly}
              onChange={(e) => setOwnedOnly(e.target.checked)}
            />
            Uniquement possédés
          </label>
        </div>
      </div>

      {displayItems.length === 0 ? (
        <div className="text-center py-20 text-foreground/40">
          Aucun plateau à afficher.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {displayItems.map(({ board, print, key }) => {
            const rarity = board.rarity ?? "Commune";
            const color = RARITY_COLORS[rarity];
            const isCommon = rarity === "Commune";
            const owned = isCommon || !!print;
            return (
              <div
                key={key}
                className="relative rounded-xl overflow-hidden border-2"
                style={{ borderColor: owned ? color : "#444" }}
              >
                <div
                  className="w-full h-48"
                  style={{
                    backgroundImage: `url('${board.image_url}')`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    filter: owned ? "none" : "grayscale(0.8) brightness(0.5)",
                  }}
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background via-background/80 to-transparent p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-bold text-foreground drop-shadow">{board.name}</div>
                      <div className="text-[10px]" style={{ color }}>
                        {rarity}
                        {board.is_default && <span className="ml-2 text-primary">· Par défaut</span>}
                      </div>
                    </div>
                    {print && (
                      <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ background: `${color}33`, color }}>
                        {print.print_number}/{print.max_prints}
                      </span>
                    )}
                    {!isCommon && !print && (
                      <span className="text-[9px] text-foreground/40 italic">non possédé</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
