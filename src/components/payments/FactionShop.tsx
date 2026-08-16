"use client";

// Boutique de FACTIONS — la seule section de cette page qui se paie en or et
// non en euros.
//
// Le composant n'énonce aucun prix de lui-même : tarifs, factions possédées et
// solde viennent tous de `/api/faction-shop`. Un tarif codé ici deviendrait faux
// le jour où l'administrateur relève le prix du forfait — ce qui est prévu, le
// prix de lancement étant temporaire.
import { useCallback, useEffect, useState } from "react";
import AmPanel from "@/components/ui/AmPanel";
import AmHeading from "@/components/ui/AmHeading";
import GoldCoin from "@/components/shared/GoldCoin";
import { AmButton } from "@/components/ui/AmButton";

interface FactionRow {
  id: string;
  commonCount: number;
  owned: boolean;
  isStarter: boolean;
}

interface ShopState {
  factionPrice: number | null;
  bundlePrice: number | null;
  balance: number;
  goldDebt: number;
  ownsBundle: boolean;
  starterFaction: string | null;
  factions: FactionRow[];
}

export default function FactionShop() {
  const [state, setState] = useState<ShopState | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      const res = await fetch("/api/faction-shop");
      if (res.ok) setState(await res.json());
    } catch {
      /* la section reste simplement absente */
    }
  }, []);

  useEffect(() => { void charger(); }, [charger]);

  async function acheter(cible: { faction: string } | { bundle: true }, cle: string) {
    setPending(cle);
    setError(null);
    setFlash(null);
    try {
      const res = await fetch("/api/faction-shop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cible),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? "L'achat n'a pas pu aboutir.");
        return;
      }
      setFlash(
        data.unlocked === "*"
          ? "Toutes les factions sont désormais à vous."
          : `${data.unlocked} rejoint votre collection.`,
      );
      // On relit l'état plutôt que de le rafistoler localement : le solde, la
      // dette et les droits changent tous en même temps côté serveur, et une
      // mise à jour partielle afficherait un solde faux jusqu'au rechargement.
      await charger();
    } catch {
      setError("L'achat n'a pas pu aboutir.");
    } finally {
      setPending(null);
    }
  }

  // Tant que la migration n'est pas appliquée, la route ne renvoie aucun tarif :
  // afficher une boutique sans prix ne servirait qu'à produire des refus.
  if (!state || state.factionPrice == null) return null;

  const { factionPrice, bundlePrice, balance, goldDebt, ownsBundle } = state;
  const manquantes = state.factions.filter((f) => !f.owned);
  const tout = manquantes.length === 0;

  return (
    <section className="mx-auto max-w-5xl px-4 py-12">
      <AmHeading
        eyebrow="Factions"
        subtitle="Chaque faction débloquée vous donne toutes ses cartes communes. Les cartes rares et au-delà restent l'affaire des enchères."
      >
        Étendre votre armée
      </AmHeading>

      <p className="mt-6 text-center text-sm text-am-ink-2">
        Votre solde : <strong className="text-am-gold">{balance}</strong> <GoldCoin size={14} />
      </p>

      {goldDebt > 0 && (
        <AmPanel className="mt-6 p-5 border border-red-500/40">
          <p className="text-sm text-red-300">
            Une dette de <strong>{goldDebt}</strong> <GoldCoin size={14} /> vous empêche d&apos;acheter une
            faction. Elle s&apos;épongera sur vos prochains gains ou achats d&apos;or.
          </p>
        </AmPanel>
      )}

      {error && <p className="mt-6 text-center text-sm text-red-300" role="alert">{error}</p>}
      {flash && <p className="mt-6 text-center text-sm text-am-gold" role="status">{flash}</p>}

      {/* Le forfait d'abord : c'est l'offre à comparer, et le joueur doit voir
          qu'elle vaut moins que deux factions AVANT d'en acheter une seule. */}
      {!ownsBundle && bundlePrice != null && manquantes.length > 1 && (
        <AmPanel corners className="mt-10 flex flex-col items-center gap-3 p-8 text-center">
          <span className="font-display text-sm uppercase tracking-[0.24em] text-am-arcane-bright/80">
            Toutes les factions
          </span>
          <span className="flex items-center gap-2 text-4xl font-bold text-am-gold">
            {bundlePrice}
            <GoldCoin size={30} />
          </span>
          <span className="text-sm text-am-ink-2">
            Les {manquantes.length} factions qu&apos;il vous manque, et toutes celles à venir.
          </span>
          <span className="text-xs text-am-ink-3">
            Prix de lancement — moins que deux factions achetées séparément.
          </span>
          <AmButton
            onClick={() => acheter({ bundle: true }, "*")}
            disabled={pending !== null || goldDebt > 0 || balance < bundlePrice}
            className="mt-2 w-full max-w-xs"
          >
            {pending === "*" ? "Achat…" : balance < bundlePrice ? "Or insuffisant" : "Prendre le forfait"}
          </AmButton>
        </AmPanel>
      )}

      {ownsBundle && (
        <p className="mt-10 text-center text-sm text-am-gold">
          Vous possédez le forfait : toutes les factions, présentes et à venir, sont à vous.
        </p>
      )}

      {tout && !ownsBundle && (
        <p className="mt-10 text-center text-sm text-am-gold">
          Vous possédez déjà toutes les factions.
        </p>
      )}

      {!ownsBundle && manquantes.length > 0 && (
        <div className="mt-10 grid gap-6 sm:grid-cols-2 md:grid-cols-3">
          {manquantes.map((f) => (
            <AmPanel key={f.id} corners className="flex h-full flex-col items-center gap-3 p-6 text-center">
              <span className="font-display text-base text-am-ink-1">{f.id}</span>
              <span className="text-xs text-am-ink-3">
                {f.commonCount} carte{f.commonCount > 1 ? "s" : ""} commune
                {f.commonCount > 1 ? "s" : ""}
              </span>
              <span className="mt-auto flex items-center gap-2 text-2xl font-bold text-am-gold">
                {factionPrice}
                <GoldCoin size={20} />
              </span>
              <AmButton
                onClick={() => acheter({ faction: f.id }, f.id)}
                disabled={pending !== null || goldDebt > 0 || balance < factionPrice}
                className="mt-2 w-full"
              >
                {pending === f.id ? "Achat…" : balance < factionPrice ? "Or insuffisant" : "Débloquer"}
              </AmButton>
            </AmPanel>
          ))}
        </div>
      )}

      <p className="mt-10 text-center text-xs text-am-ink-3">
        Le déblocage est définitif et rattaché à votre compte. Les factions débloquées avec de l&apos;or
        issu d&apos;un paiement remboursé peuvent être reprises.
      </p>
    </section>
  );
}
