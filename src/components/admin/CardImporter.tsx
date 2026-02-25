"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { CardType, Keyword, SpellEffect } from "@/lib/game/types";

// ---------- Types ----------

interface ParsedCard {
  name: string;
  mana_cost: number;
  card_type: CardType;
  attack: number | null;
  health: number | null;
  effect_text: string;
  keywords: Keyword[];
  spell_effect: SpellEffect | null;
  imageFile: File | null;
  errors: string[];
}

type ImportStatus = "idle" | "importing" | "done";

interface ImportResult {
  success: number;
  errors: { name: string; error: string }[];
}

// ---------- Helpers ----------

const VALID_KEYWORDS: Keyword[] = ["charge", "taunt", "divine_shield", "ranged"];

function normalizeFileName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
  }
  fields.push(current.trim());
  return fields;
}

function validateCard(card: ParsedCard): string[] {
  const errors: string[] = [];
  if (!card.name) errors.push("Name is required");
  if (card.mana_cost < 0 || card.mana_cost > 10 || isNaN(card.mana_cost))
    errors.push("Mana cost must be 0-10");
  if (card.card_type !== "creature" && card.card_type !== "spell")
    errors.push("Type must be creature or spell");
  if (card.card_type === "creature") {
    if (card.attack === null || card.attack < 0) errors.push("Creatures need valid attack");
    if (card.health === null || card.health < 1) errors.push("Creatures need valid health");
  }
  for (const kw of card.keywords) {
    if (!VALID_KEYWORDS.includes(kw)) errors.push(`Invalid keyword: ${kw}`);
  }
  return errors;
}

function parseCsv(text: string, imageFiles: Map<string, File>): ParsedCard[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  // Skip header
  return lines.slice(1).map((line) => {
    const cols = parseCsvLine(line);
    const name = cols[0] ?? "";
    const mana_cost = parseInt(cols[1] ?? "0", 10);
    const card_type = (cols[2] ?? "creature") as CardType;
    const attack = cols[3] ? parseInt(cols[3], 10) : null;
    const health = cols[4] ? parseInt(cols[4], 10) : null;
    const effect_text = cols[5] ?? "";
    const keywordsRaw = cols[6] ?? "";
    const keywords = keywordsRaw
      ? (keywordsRaw.split("|").map((k) => k.trim()).filter(Boolean) as Keyword[])
      : [];
    let spell_effect: SpellEffect | null = null;
    const spellRaw = cols[7] ?? "";
    if (spellRaw) {
      try {
        spell_effect = JSON.parse(spellRaw);
      } catch {
        // will be caught by validation
      }
    }

    const normalized = normalizeFileName(name);
    const imageFile = imageFiles.get(normalized) ?? null;

    const card: ParsedCard = {
      name,
      mana_cost,
      card_type,
      attack,
      health,
      effect_text,
      keywords,
      spell_effect,
      imageFile,
      errors: [],
    };
    card.errors = validateCard(card);
    return card;
  });
}

// ---------- Sub-components ----------

function DropZone({
  label,
  accept,
  multiple,
  onFiles,
  fileCount,
}: {
  label: string;
  accept: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  fileCount?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const files = Array.from(e.dataTransfer.files);
      onFiles(files);
    },
    [onFiles]
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
        dragOver
          ? "border-primary bg-primary/10"
          : "border-card-border hover:border-primary/50"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          if (e.target.files) onFiles(Array.from(e.target.files));
          e.target.value = "";
        }}
      />
      <p className="text-foreground/60 text-sm">{label}</p>
      {fileCount !== undefined && fileCount > 0 && (
        <p className="text-primary text-xs mt-2">{fileCount} file(s) selected</p>
      )}
    </div>
  );
}

// ---------- Main Component ----------

export default function CardImporter() {
  const router = useRouter();
  const supabase = createClient();

  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [imageFiles, setImageFiles] = useState<Map<string, File>>(new Map());
  const [cards, setCards] = useState<ParsedCard[]>([]);
  const [status, setStatus] = useState<ImportStatus>("idle");
  const [result, setResult] = useState<ImportResult | null>(null);

  // Parse CSV whenever it's loaded
  const handleCsvFiles = useCallback(
    (files: File[]) => {
      const file = files[0];
      if (!file) return;
      setCsvFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        setCards(parseCsv(text, imageFiles));
      };
      reader.readAsText(file);
    },
    [imageFiles]
  );

  const handleImageFiles = useCallback(
    (files: File[]) => {
      setImageFiles((prev) => {
        const next = new Map(prev);
        for (const f of files) {
          const nameWithoutExt = f.name.replace(/\.[^.]+$/, "");
          next.set(normalizeFileName(nameWithoutExt), f);
        }
        return next;
      });
    },
    []
  );

  // Re-match images when images change
  useMemo(() => {
    if (cards.length === 0) return;
    setCards((prev) =>
      prev.map((c) => ({
        ...c,
        imageFile: imageFiles.get(normalizeFileName(c.name)) ?? null,
      }))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageFiles]);

  const hasErrors = cards.some((c) => c.errors.length > 0);
  const validCount = cards.filter((c) => c.errors.length === 0).length;

  // Manual image match
  const handleManualMatch = useCallback(
    (cardIndex: number, file: File | null) => {
      setCards((prev) => {
        const next = [...prev];
        next[cardIndex] = { ...next[cardIndex], imageFile: file };
        return next;
      });
    },
    []
  );

  // Import logic
  const handleImport = useCallback(async () => {
    setStatus("importing");
    const successes: string[] = [];
    const errors: { name: string; error: string }[] = [];

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setResult({ success: 0, errors: [{ name: "", error: "Not authenticated" }] });
      setStatus("done");
      return;
    }

    for (const card of cards) {
      if (card.errors.length > 0) {
        errors.push({ name: card.name, error: card.errors.join(", ") });
        continue;
      }

      try {
        let image_url: string | null = null;

        // Upload image if present
        if (card.imageFile) {
          const filePath = `${normalizeFileName(card.name)}.webp`;
          const { error: uploadError } = await supabase.storage
            .from("card-images")
            .upload(filePath, card.imageFile, {
              upsert: true,
              contentType: card.imageFile.type,
            });
          if (uploadError) throw new Error(`Image upload: ${uploadError.message}`);

          const { data: urlData } = supabase.storage
            .from("card-images")
            .getPublicUrl(filePath);
          image_url = urlData.publicUrl;
        }

        // Insert card
        const { error: insertError } = await supabase.from("cards").insert({
          name: card.name,
          mana_cost: card.mana_cost,
          card_type: card.card_type,
          attack: card.attack,
          health: card.health,
          effect_text: card.effect_text,
          keywords: card.keywords,
          spell_effect: card.spell_effect,
          image_url,
        });

        if (insertError) throw new Error(insertError.message);
        successes.push(card.name);
      } catch (err) {
        errors.push({
          name: card.name,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    setResult({ success: successes.length, errors });
    setStatus("done");
  }, [cards, supabase]);

  return (
    <div className="min-h-screen bg-background p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-primary">Card Import</h1>
          <p className="text-foreground/50 text-sm mt-1">
            Bulk import cards via CSV + images
          </p>
        </div>
        <button
          onClick={() => router.push("/")}
          className="px-4 py-2 bg-secondary border border-card-border rounded-lg text-foreground/60 hover:text-foreground hover:border-primary/40 transition-colors"
        >
          Back to Menu
        </button>
      </div>

      {/* Upload zones */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <DropZone
          label={csvFile ? csvFile.name : "Drop CSV file here or click to select"}
          accept=".csv"
          onFiles={handleCsvFiles}
        />
        <DropZone
          label="Drop image files here or click to select (png/jpg/webp)"
          accept=".png,.jpg,.jpeg,.webp"
          multiple
          onFiles={handleImageFiles}
          fileCount={imageFiles.size}
        />
      </div>

      {/* Preview table */}
      {cards.length > 0 && (
        <div className="bg-secondary rounded-xl border border-card-border p-4 mb-6 overflow-x-auto">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-foreground">
              Preview ({validCount}/{cards.length} valid)
            </h2>
            {hasErrors && (
              <span className="text-accent text-sm">Fix errors before importing</span>
            )}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-card-border text-foreground/50">
                <th className="text-left py-2 px-2">Name</th>
                <th className="text-center py-2 px-2">Mana</th>
                <th className="text-center py-2 px-2">Type</th>
                <th className="text-center py-2 px-2">ATK</th>
                <th className="text-center py-2 px-2">HP</th>
                <th className="text-left py-2 px-2">Effect</th>
                <th className="text-left py-2 px-2">Keywords</th>
                <th className="text-center py-2 px-2">Image</th>
                <th className="text-left py-2 px-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {cards.map((card, i) => (
                <tr
                  key={i}
                  className={`border-b border-card-border/50 ${
                    card.errors.length > 0 ? "bg-accent/10" : ""
                  }`}
                >
                  <td className="py-2 px-2 text-foreground font-medium">
                    {card.name}
                  </td>
                  <td className="py-2 px-2 text-center text-mana-blue font-bold">
                    {card.mana_cost}
                  </td>
                  <td className="py-2 px-2 text-center">
                    <span
                      className={`px-2 py-0.5 rounded text-xs ${
                        card.card_type === "creature"
                          ? "bg-primary/20 text-primary"
                          : "bg-purple-600/20 text-purple-400"
                      }`}
                    >
                      {card.card_type}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-center text-attack-yellow">
                    {card.attack ?? "-"}
                  </td>
                  <td className="py-2 px-2 text-center text-health-red">
                    {card.health ?? "-"}
                  </td>
                  <td className="py-2 px-2 text-foreground/70 max-w-48 truncate">
                    {card.effect_text}
                  </td>
                  <td className="py-2 px-2">
                    <div className="flex gap-1 flex-wrap">
                      {card.keywords.map((kw) => (
                        <span
                          key={kw}
                          className="px-1.5 py-0.5 rounded bg-card-bg text-foreground/60 text-xs"
                        >
                          {kw}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="py-2 px-2 text-center">
                    {card.imageFile ? (
                      <span className="text-success text-xs">Matched</span>
                    ) : (
                      <label className="text-foreground/40 text-xs cursor-pointer hover:text-primary transition-colors">
                        <input
                          type="file"
                          accept=".png,.jpg,.jpeg,.webp"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0] ?? null;
                            handleManualMatch(i, f);
                            e.target.value = "";
                          }}
                        />
                        Select...
                      </label>
                    )}
                  </td>
                  <td className="py-2 px-2">
                    {card.errors.length > 0 ? (
                      <span className="text-accent text-xs" title={card.errors.join(", ")}>
                        {card.errors[0]}
                      </span>
                    ) : (
                      <span className="text-success text-xs">OK</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Import button */}
      {cards.length > 0 && status === "idle" && (
        <button
          onClick={handleImport}
          disabled={validCount === 0}
          className="px-6 py-3 bg-primary hover:bg-primary-dark disabled:opacity-40 disabled:cursor-not-allowed text-background font-semibold rounded-lg transition-colors"
        >
          Import {validCount} card{validCount !== 1 ? "s" : ""}
        </button>
      )}

      {/* Importing spinner */}
      {status === "importing" && (
        <div className="flex items-center gap-3 text-foreground/60">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Importing cards...
        </div>
      )}

      {/* Results */}
      {status === "done" && result && (
        <div className="bg-secondary rounded-xl border border-card-border p-4">
          <h2 className="text-lg font-semibold text-foreground mb-3">Import Results</h2>
          {result.success > 0 && (
            <p className="text-success mb-2">
              {result.success} card{result.success !== 1 ? "s" : ""} imported successfully
            </p>
          )}
          {result.errors.length > 0 && (
            <div>
              <p className="text-accent mb-2">{result.errors.length} error(s):</p>
              <ul className="text-sm text-foreground/60 space-y-1">
                {result.errors.map((e, i) => (
                  <li key={i}>
                    <span className="text-foreground">{e.name || "General"}</span>: {e.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex gap-3 mt-4">
            <button
              onClick={() => {
                setCards([]);
                setCsvFile(null);
                setImageFiles(new Map());
                setStatus("idle");
                setResult(null);
              }}
              className="px-4 py-2 bg-secondary border border-card-border rounded-lg text-foreground/60 hover:text-foreground hover:border-primary/40 transition-colors"
            >
              Import More
            </button>
            <button
              onClick={() => router.push("/collection")}
              className="px-4 py-2 bg-primary hover:bg-primary-dark text-background font-semibold rounded-lg transition-colors"
            >
              View Collection
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
