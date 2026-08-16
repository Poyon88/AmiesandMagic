"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import type { AuctionWithDetails, AuctionFilters, AuctionSettings } from "@/lib/auction/types";
import AuctionCard from "./AuctionCard";
import CreateAuctionModal from "./CreateAuctionModal";
import MyAuctions from "./MyAuctions";
import AmAtmosphere from "@/components/ui/AmAtmosphere";
import { AmButton, AmLinkButton } from "@/components/ui/AmButton";
import { isPlayerSellingEnabled } from "@/lib/auction/flags";

import { AUCTIONABLE_RARITIES } from "@/lib/auction/pricing";
interface AuctionHouseProps {
  userId: string;
}

const SORT_OPTIONS = [
  { value: "ending_soon", labelKey: "sort_ending_soon" },
  { value: "price_asc", labelKey: "sort_price_asc" },
  { value: "price_desc", labelKey: "sort_price_desc" },
  { value: "newest", labelKey: "sort_newest" },
];

const SELECT_CLASS =
  "am-gild-border bg-am-bg-2 text-am-ink rounded-[var(--am-r-sm)] px-3 min-w-[130px] min-h-[44px] text-base outline-none focus-visible:shadow-[0_0_0_2px_var(--am-bg-0),0_0_0_4px_var(--am-gold)]";

export default function AuctionHouse({ userId }: AuctionHouseProps) {
  const t = useTranslations("auction");
  const [auctions, setAuctions] = useState<AuctionWithDetails[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<AuctionSettings | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [activeTab, setActiveTab] = useState<"browse" | "my">("browse");
  const sellingEnabled = isPlayerSellingEnabled();

  const [filters, setFilters] = useState<AuctionFilters>({
    sort: "ending_soon",
    page: 1,
    limit: 20,
  });

  const [search, setSearch] = useState("");
  const [faction, setFaction] = useState("");
  const [rarity, setRarity] = useState("");
  const [cardType, setCardType] = useState("");
  const [clan, setClan] = useState("");
  const [ability, setAbility] = useState("");
  const [printNumber, setPrintNumber] = useState("");

  // Valeurs RÉELLEMENT présentes dans les enchères actives : les menus ne
  // proposent que ce qui peut rendre un résultat (cf. /api/auctions/filters).
  const [options, setOptions] = useState<{
    clans: string[];
    abilities: { id: string; label: string }[];
    printNumbers: number[];
  }>({ clans: [], abilities: [], printNumbers: [] });

  const fetchAuctions = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("status", "active");
    if (filters.sort) params.set("sort", filters.sort);
    if (filters.page) params.set("page", String(filters.page));
    if (filters.limit) params.set("limit", String(filters.limit));
    if (search) params.set("search", search);
    if (faction) params.set("faction", faction);
    if (rarity) params.set("rarity", rarity);
    if (cardType) params.set("cardType", cardType);
    if (clan) params.set("clan", clan);
    if (ability) params.set("ability", ability);
    if (printNumber) params.set("printNumber", printNumber);

    const res = await fetch(`/api/auctions?${params}`);
    const data = await res.json();
    if (data.auctions) {
      setAuctions(data.auctions);
      setTotal(data.total);
    }
    setLoading(false);
  }, [filters, search, faction, rarity, cardType, clan, ability, printNumber]);

  useEffect(() => {
    fetch("/api/auctions/filters")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setOptions(d))
      .catch(() => { /* menus vides : les filtres restent simplement inactifs */ });
  }, []);

  useEffect(() => {
    fetch("/api/auctions/settings")
      .then((r) => r.json())
      .then((d) => setSettings(d.settings));
  }, []);

  useEffect(() => {
    fetchAuctions();
  }, [fetchAuctions]);

  const totalPages = Math.ceil(total / (filters.limit ?? 20));

  return (
    <div className="relative mx-auto max-w-[1200px] px-4 py-8">
      <AmAtmosphere />

      {/* Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between am-animate-rise">
        <div>
          <span className="font-display text-[10px] md:text-xs tracking-[0.32em] uppercase text-am-arcane-bright/80">
            {t("header_kicker")}
          </span>
          <h1 className="am-foil-text font-[family-name:var(--font-cinzel),serif] font-bold leading-tight text-3xl mt-1">
            {t("title")}
          </h1>
          <p className="font-[family-name:var(--font-crimson),serif] italic text-am-ink-soft text-sm mt-1">
            {sellingEnabled ? t("subtitle_sell") : t("subtitle_buy")}
          </p>
        </div>
        <div className="flex gap-3">
          <AmLinkButton href="/" variant="ghost" size="sm">
            {t("menu")}
          </AmLinkButton>
          {sellingEnabled && (
            <AmButton onClick={() => setShowCreateModal(true)} variant="gold" size="sm">
              {t("sell_card")}
            </AmButton>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-0 border-b border-am-gold/30 am-animate-rise" style={{ animationDelay: "60ms" }}>
        {[
          { key: "browse" as const, label: t("tab_browse") },
          { key: "my" as const, label: t("tab_my") },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-6 py-2.5 text-sm font-[family-name:var(--font-cinzel),serif] tracking-wide transition-colors -mb-px border-b-2 ${
              activeTab === tab.key
                ? "border-am-gold text-am-gold font-bold"
                : "border-transparent text-am-ink-soft hover:text-am-ink"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "my" ? (
        <MyAuctions userId={userId} />
      ) : (
        <>
          {/* Filters */}
          <div className="am-glass mb-6 flex flex-wrap gap-3 p-4 am-animate-rise" style={{ animationDelay: "120ms" }}>
            <input
              type="text"
              placeholder={t("search_placeholder")}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setFilters((f) => ({ ...f, page: 1 }));
              }}
              className="am-gild-border bg-am-bg-2 text-am-ink rounded-[var(--am-r-sm)] px-3 min-h-[44px] text-base outline-none placeholder:text-am-ink-faint flex-[1_1_200px] min-w-[150px] focus-visible:shadow-[0_0_0_2px_var(--am-bg-0),0_0_0_4px_var(--am-gold)]"
            />
            <select
              value={faction}
              onChange={(e) => {
                setFaction(e.target.value);
                setFilters((f) => ({ ...f, page: 1 }));
              }}
              className={SELECT_CLASS}
            >
              <option value="">{t("all_factions")}</option>
              {["Lumière", "Ténèbres", "Nature", "Feu", "Eau", "Terre", "Air", "Neutre"].map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
            <select
              value={rarity}
              onChange={(e) => {
                setRarity(e.target.value);
                setFilters((f) => ({ ...f, page: 1 }));
              }}
              className={SELECT_CLASS}
            >
              <option value="">{t("all_rarities")}</option>
              {/* Les communes ne sont jamais mises en vente : les proposer au
                  filtre ne rendrait jamais aucun résultat. */}
              {AUCTIONABLE_RARITIES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <select
              value={cardType}
              onChange={(e) => {
                setCardType(e.target.value);
                setFilters((f) => ({ ...f, page: 1 }));
              }}
              className={SELECT_CLASS}
            >
              <option value="">{t("all_types")}</option>
              <option value="creature">{t("type_creature")}</option>
              <option value="spell">{t("type_spell")}</option>
            </select>

            {/* Clan — n'apparaît que si au moins une enchère en porte un.
                Un menu de 36 clans dont 35 ne rendent rien ferait perdre du
                temps à chaque essai. */}
            {options.clans.length > 0 && (
              <select
                value={clan}
                onChange={(e) => {
                  setClan(e.target.value);
                  setFilters((f) => ({ ...f, page: 1 }));
                }}
                className={SELECT_CLASS}
                aria-label="Filtrer par clan"
              >
                <option value="">Tous clans</option>
                {options.clans.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            )}

            {/* Capacité — même principe. Le libellé est résolu côté serveur :
                le navigateur n'a pas à embarquer le registre des capacités. */}
            {options.abilities.length > 0 && (
              <select
                value={ability}
                onChange={(e) => {
                  setAbility(e.target.value);
                  setFilters((f) => ({ ...f, page: 1 }));
                }}
                className={SELECT_CLASS}
                aria-label="Filtrer par capacité"
              >
                <option value="">Toutes capacités</option>
                {options.abilities.map((a) => (
                  <option key={a.id} value={a.id}>{a.label}</option>
                ))}
              </select>
            )}

            {/* Numéro d'exemplaire dans la série. Une SAISIE et non un menu :
                les numéros sont dispersés (un #7/100 ici, un #1/1 là) et une
                liste n'en dirait rien d'utile. Poser ce filtre écarte les
                enchères système, qui n'ont pas de tirage numéroté. */}
            {options.printNumbers.length > 0 && (
              <input
                type="number"
                min={1}
                value={printNumber}
                onChange={(e) => {
                  setPrintNumber(e.target.value);
                  setFilters((f) => ({ ...f, page: 1 }));
                }}
                placeholder="N° d'exemplaire"
                className={SELECT_CLASS}
                aria-label="Filtrer par numéro d'exemplaire dans la série"
              />
            )}
            <select
              value={filters.sort}
              onChange={(e) =>
                setFilters((f) => ({ ...f, sort: e.target.value as AuctionFilters["sort"], page: 1 }))
              }
              className={SELECT_CLASS}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
              ))}
            </select>
          </div>

          {/* Auction grid */}
          {loading ? (
            <div className="py-16 text-center font-[family-name:var(--font-crimson),serif] italic text-am-ink-soft">
              {t("loading")}
            </div>
          ) : auctions.length === 0 ? (
            <div className="am-glass py-16 text-center font-[family-name:var(--font-crimson),serif] italic text-am-ink-soft">
              {t("no_auctions")}
            </div>
          ) : (
            <div
              className="grid gap-4"
              style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}
            >
              {auctions.map((auction, i) => (
                <div
                  key={auction.id}
                  className="am-animate-rise am-hover-lift"
                  style={{ animationDelay: `${Math.min(i * 40, 400)}ms` }}
                >
                  <AuctionCard auction={auction} />
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-3">
              <AmButton
                variant="ghost"
                size="sm"
                disabled={filters.page === 1}
                onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}
                className="disabled:opacity-40 disabled:cursor-default"
              >
                {t("previous")}
              </AmButton>
              <span className="font-[family-name:var(--font-cinzel),serif] text-sm text-am-ink-soft leading-9">
                {t("page_of", { page: filters.page ?? 1, total: totalPages })}
              </span>
              <AmButton
                variant="ghost"
                size="sm"
                disabled={filters.page === totalPages}
                onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
                className="disabled:opacity-40 disabled:cursor-default"
              >
                {t("next")}
              </AmButton>
            </div>
          )}
        </>
      )}

      {sellingEnabled && showCreateModal && settings && (
        <CreateAuctionModal
          userId={userId}
          settings={settings}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            fetchAuctions();
          }}
        />
      )}
    </div>
  );
}
