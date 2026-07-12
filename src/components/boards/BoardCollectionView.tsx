"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useVocab } from "@/i18n/useVocab";
import { useBoardText } from "@/i18n/useBoardText";
import AmAtmosphere from "@/components/ui/AmAtmosphere";
import AmHeading from "@/components/ui/AmHeading";
import { AmButton } from "@/components/ui/AmButton";

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
  const t = useTranslations("boards");
  const vocab = useVocab();
  const boardText = useBoardText();
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
    <div className="relative min-h-screen bg-am-bg-0 text-am-ink">
      <AmAtmosphere />

      <main className="relative px-4 md:px-10 pt-12 md:pt-16 pb-20 md:pb-24">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="am-animate-rise flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between mb-10 md:mb-12">
            <AmHeading
              as="h1"
              align="left"
              eyebrow={t("eyebrow")}
              subtitle={t("subtitle", { visible: displayItems.length, prints: ownedCount })}
            >
              {t("title")}
            </AmHeading>
            <AmButton
              variant="ghost"
              size="sm"
              onClick={() => router.push("/")}
              className="self-start sm:self-auto shrink-0"
            >
              {t("back_to_menu")}
            </AmButton>
          </div>

          {/* Filter bar */}
          <div className="am-animate-fade am-glass am-gild-border rounded-2xl p-5 mb-10" style={{ animationDelay: "0.1s" }}>
            <div className="flex flex-wrap gap-5 items-center">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-[family-name:var(--font-cinzel),serif] text-am-ink-soft text-xs uppercase tracking-[0.18em] mr-1">
                  {t("rarity_label")}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {RARITIES.map((r) => (
                    <button
                      key={r}
                      onClick={() => setRarityFilter(rarityFilter === r ? null : r)}
                      style={{
                        borderColor: rarityFilter === r ? RARITY_COLORS[r] : undefined,
                        color: rarityFilter === r ? RARITY_COLORS[r] : undefined,
                        backgroundColor: rarityFilter === r ? `${RARITY_COLORS[r]}1f` : undefined,
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-am-gold focus-visible:ring-offset-2 focus-visible:ring-offset-am-bg-0 ${
                        rarityFilter === r
                          ? "border"
                          : "bg-am-bg-2 border border-am-gold/20 text-am-ink-soft hover:border-am-gold/50 hover:text-am-ink"
                      }`}
                    >
                      {vocab.rarityLabel(r)}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-am-ink-soft hover:text-am-ink cursor-pointer select-none transition-colors">
                <input
                  type="checkbox"
                  checked={ownedOnly}
                  onChange={(e) => setOwnedOnly(e.target.checked)}
                  className="accent-am-gold"
                />
                {t("owned_only")}
              </label>
            </div>
          </div>

          <div className="am-rule-diamond w-full mb-10" aria-hidden />

          {displayItems.length === 0 ? (
            <div className="text-center py-24 font-[family-name:var(--font-crimson),serif] italic text-am-ink-faint text-lg">
              {t("empty")}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 md:gap-6">
              {displayItems.map(({ board, print, key }, i) => {
                const rarity = board.rarity ?? "Commune";
                const color = RARITY_COLORS[rarity];
                const isCommon = rarity === "Commune";
                const owned = isCommon || !!print;
                const selected = board.is_default;
                return (
                  <div
                    key={key}
                    className={`am-animate-rise group relative rounded-2xl overflow-hidden transition-transform duration-300 hover:-translate-y-1 ${
                      selected
                        ? "am-gild-border ring-2 ring-am-arcane-bright/70 shadow-[0_0_34px_-6px_rgba(154,107,255,0.55)]"
                        : "border border-am-gold/15"
                    }`}
                    style={{
                      animationDelay: `${Math.min(i, 12) * 0.04}s`,
                      boxShadow: owned && !selected ? `0 0 0 1px ${color}55, var(--am-shadow-sm)` : undefined,
                    }}
                  >
                    <div
                      className="w-full h-48 transition-transform duration-500 group-hover:scale-105"
                      style={{
                        backgroundImage: `url('${board.image_url}')`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                        filter: owned ? "none" : "grayscale(0.8) brightness(0.5)",
                      }}
                    />

                    {/* Equipped / selected badge */}
                    {selected && (
                      <span className="absolute top-2.5 left-2.5 z-10 flex items-center gap-1 rounded-full bg-am-bg-0/80 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-am-jade backdrop-blur-sm ring-1 ring-am-jade/40">
                        ✦ {t("equipped")}
                      </span>
                    )}

                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-am-bg-0 via-am-bg-0/80 to-transparent p-3 pt-8">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-[family-name:var(--font-cinzel),serif] text-sm font-bold text-am-ink truncate drop-shadow">
                            {boardText.name(board)}
                          </div>
                          <div className="text-[10px] uppercase tracking-wide" style={{ color }}>
                            {vocab.rarityLabel(rarity)}
                            {board.is_default && <span className="ml-2 text-am-jade">· {t("default_badge")}</span>}
                          </div>
                        </div>
                        {print && (
                          <span
                            className="text-xs font-bold px-2 py-0.5 rounded-md shrink-0"
                            style={{ background: `${color}33`, color }}
                          >
                            {print.print_number}/{print.max_prints}
                          </span>
                        )}
                        {!isCommon && !print && (
                          <span className="text-[9px] text-am-ink-faint italic shrink-0">{t("not_owned")}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
