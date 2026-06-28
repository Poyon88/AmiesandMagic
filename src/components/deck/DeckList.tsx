"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { DECK_SIZE } from "@/lib/game/constants";
import AmAtmosphere from "@/components/ui/AmAtmosphere";
import { AmButton } from "@/components/ui/AmButton";

interface DeckWithCount {
  id: number;
  name: string;
  cardCount: number;
  updated_at: string;
  heroThumbnail?: string | null;
  formatId?: number | null;
  formatName?: string | null;
}

const ALL = "__all__";
const NONE = "__none__";

export default function DeckList({ decks }: { decks: DeckWithCount[] }) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<string>(ALL);

  // Distinct format buckets present among the user's decks, in format-id order,
  // with a "Sans format" bucket last when some deck has no format set.
  const formatOptions = (() => {
    const byId = new Map<number, string>();
    let hasNone = false;
    for (const d of decks) {
      if (d.formatId != null) byId.set(d.formatId, d.formatName ?? `Format ${d.formatId}`);
      else hasNone = true;
    }
    const opts = [...byId.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([id, name]) => ({ value: String(id), label: name }));
    if (hasNone) opts.push({ value: NONE, label: "Sans format" });
    return opts;
  })();

  const filteredDecks =
    selectedFormat === ALL
      ? decks
      : selectedFormat === NONE
        ? decks.filter((d) => d.formatId == null)
        : decks.filter((d) => String(d.formatId) === selectedFormat);

  async function handleDelete(deckId: number) {
    setDeletingId(deckId);
    try {
      const res = await fetch("/api/decks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deckId }),
      });
      if (!res.ok) {
        const data = await res.json();
        console.error("Delete failed:", data.error);
      }
    } catch (err) {
      console.error("Delete error:", err);
    }
    setConfirmDeleteId(null);
    setDeletingId(null);
    router.refresh();
  }

  return (
    <div className="relative min-h-screen bg-am-bg-0 px-5 py-8 sm:px-8 sm:py-10">
      <AmAtmosphere />

      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="am-animate-rise flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-[family-name:var(--font-cinzel),serif] text-xs font-bold uppercase tracking-[0.32em] text-am-arcane-bright">
              Compose ton armée
            </p>
            <h1 className="am-foil-text mt-2 font-[family-name:var(--font-cinzel),serif] text-4xl font-bold sm:text-5xl">
              My Decks
            </h1>
            <p className="mt-2 font-[family-name:var(--font-crimson),serif] text-sm italic text-am-ink-soft">
              {filteredDecks.length} deck{filteredDecks.length !== 1 ? "s" : ""}
              {selectedFormat === ALL ? " in your armory" : " in this format"}
            </p>
          </div>
          <div className="flex gap-3">
            <AmButton
              variant="gold"
              size="sm"
              onClick={() => router.push("/decks/builder")}
            >
              + New Deck
            </AmButton>
            <AmButton
              variant="ghost"
              size="sm"
              onClick={() => router.push("/")}
            >
              Back to Menu
            </AmButton>
          </div>
        </div>

        <div className="am-rule-diamond am-animate-fade my-8" style={{ animationDelay: "0.1s" }} />

        {/* Format filter — only when decks span more than one format bucket */}
        {formatOptions.length > 1 && (
          <div className="am-animate-fade mb-8 flex flex-wrap items-center justify-center gap-2" style={{ animationDelay: "0.12s" }}>
            <span className="font-[family-name:var(--font-cinzel),serif] mr-1 text-xs uppercase tracking-[0.18em] text-am-ink-soft">
              Format
            </span>
            {[{ value: ALL, label: "All" }, ...formatOptions].map((opt) => {
              const active = selectedFormat === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSelectedFormat(opt.value)}
                  aria-pressed={active}
                  className={`font-[family-name:var(--font-cinzel),serif] rounded-full border px-4 py-1.5 text-sm tracking-wide transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-am-gold focus-visible:ring-offset-2 focus-visible:ring-offset-am-bg-0 ${
                    active
                      ? "border-am-gold bg-am-gold/20 text-am-gold-bright shadow-[0_0_18px_-4px_rgba(216,178,90,0.5)]"
                      : "border-am-gold/25 bg-am-gold/5 text-am-ink-soft hover:border-am-gold/60 hover:text-am-gold"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Deck Grid */}
        {decks.length === 0 ? (
          <div className="am-glass am-animate-rise flex flex-col items-center gap-6 px-6 py-20 text-center">
            <p className="font-[family-name:var(--font-crimson),serif] text-xl italic text-am-ink-soft">
              You don&apos;t have any decks yet
            </p>
            <AmButton
              variant="gold"
              size="md"
              onClick={() => router.push("/decks/builder")}
            >
              Create Your First Deck
            </AmButton>
          </div>
        ) : filteredDecks.length === 0 ? (
          <div className="am-glass am-animate-rise flex flex-col items-center gap-6 px-6 py-20 text-center">
            <p className="font-[family-name:var(--font-crimson),serif] text-xl italic text-am-ink-soft">
              No decks in this format
            </p>
            <AmButton variant="ghost" size="md" onClick={() => setSelectedFormat(ALL)}>
              Show all decks
            </AmButton>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredDecks.map((deck, i) => {
              const isValid = deck.cardCount === DECK_SIZE;
              return (
                <div
                  key={deck.id}
                  className="am-glass am-animate-rise group flex flex-col p-5 transition-all duration-300 hover:-translate-y-1 hover:border-am-gold/40"
                  style={{ animationDelay: `${0.06 * i + 0.12}s` }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="am-foil-text font-[family-name:var(--font-cinzel),serif] text-xl font-bold leading-tight min-w-0 flex-1">
                      {deck.name}
                    </h3>
                    {deck.heroThumbnail && (
                      <Image
                        src={deck.heroThumbnail}
                        alt=""
                        width={72}
                        height={72}
                        unoptimized
                        aria-hidden="true"
                        className="h-[72px] w-[72px] shrink-0 rounded-full border border-am-gold/40 object-cover bg-am-bg-2 shadow-[0_4px_14px_rgba(0,0,0,0.5)]"
                      />
                    )}
                  </div>

                  <div className="mt-3 mb-5 flex flex-wrap items-center gap-2">
                    <span
                      className={`am-gild-border inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                        isValid ? "text-am-jade" : "text-am-gold"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          isValid ? "bg-am-jade" : "bg-am-gold"
                        }`}
                      />
                      {deck.cardCount}/{DECK_SIZE} cards
                      {isValid && " (Valid)"}
                    </span>
                    {deck.formatName && (
                      <span className="inline-flex items-center rounded-full border border-am-arcane/40 bg-am-arcane/10 px-3 py-1 text-xs font-medium text-am-arcane-bright">
                        {deck.formatName}
                      </span>
                    )}
                  </div>

                  <div className="am-rule mb-4 opacity-60" />

                  <div className="mt-auto flex gap-2">
                    <button
                      onClick={() =>
                        router.push(`/decks/builder?id=${deck.id}`)
                      }
                      className="flex-1 rounded-lg bg-am-azure/15 py-2 text-sm font-medium text-am-azure transition-colors hover:bg-am-azure/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-am-azure focus-visible:ring-offset-2 focus-visible:ring-offset-am-bg-0"
                    >
                      Edit
                    </button>

                    {confirmDeleteId === deck.id ? (
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleDelete(deck.id)}
                          disabled={deletingId === deck.id}
                          className="rounded-lg bg-am-ember px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-am-ember/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-am-ember focus-visible:ring-offset-2 focus-visible:ring-offset-am-bg-0 disabled:opacity-50"
                        >
                          {deletingId === deck.id ? "..." : "Confirm"}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="rounded-lg border border-am-gold/30 bg-am-bg-2 px-3 py-2 text-sm text-am-ink-soft transition-colors hover:text-am-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-am-gold focus-visible:ring-offset-2 focus-visible:ring-offset-am-bg-0"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(deck.id)}
                        className="rounded-lg bg-am-ember/15 px-3 py-2 text-sm font-medium text-am-ember transition-colors hover:bg-am-ember/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-am-ember focus-visible:ring-offset-2 focus-visible:ring-offset-am-bg-0"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
