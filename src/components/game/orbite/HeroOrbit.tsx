"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import GameCard from "@/components/cards/GameCard";
import { EXPLORATION_PALIER, MAX_CONQUETE, MAX_EPARGNE, MAX_FOI, MAX_INVENTIONS_MACHINE } from "@/lib/game/constants";
import { buildMachineCard } from "@/lib/game/machine";
import { useGameStore } from "@/lib/store/gameStore";
import type { Emblem, MachineState } from "@/lib/game/types";
import CounterIcon from "./counter-icons";
import CounterMedallion, { MachineGear } from "./CounterMedallion";
import EmblemDiamond, { EmblemBulle } from "./EmblemDiamond";
import OrbitTooltip, { BulleTexte, useBulleHandlers, useOrbitBulle } from "./OrbitTooltip";
import { compteurVisible, orbitLayout, type OrbitGroupLayout, type OrbitSide } from "./orbit-geometry";

/** ORBITE du héros : emblèmes et compteurs rangés sur un arc autour du
 *  portrait, côté plateau (cf. orbit-geometry). Remplace la bande d'emblèmes
 *  sous le portrait et les losanges de la barre de mana.
 *
 *  Le portrait (2D ou 3D) est passé en `children` et n'est pas modifié : on
 *  mesure sa boîte, l'orbite se centre dessus. */

const TAILLE = 42; // diamètre d'un élément d'orbite, px CSS
const ECART_PORTRAIT = 2; // jour entre le bord du portrait et les éléments
const TAILLE_MINI = 34; // charges (Contresort, Exclusion, Singulier)

export interface HeroOrbitProps {
  side: OrbitSide;
  /** À QUI appartiennent ces emblèmes : sert au possessif de la cadence
   *  (« vos créatures » / « ses créatures »). Explicite plutôt que déduit de
   *  `side` — cf. le test de câblage. */
  porteur: "self" | "opponent";
  emblems: Emblem[] | undefined;
  /** Indices des emblèmes qui viennent d'agir, et l'horodatage qui relance le pulse. */
  firedEmblems?: number[];
  fireKey?: number | null;
  epargne?: number | null;
  foi?: number | null;
  conquete?: number | null;
  exploration?: number | null;
  machine?: MachineState | null;
  machineFaction?: string | null;
  contresort?: number | null;
  exclusion?: number | null;
  /** SINGULIER : vrai = deck singulier actif (le mien, ou celui révélé d'en face). */
  singleton?: boolean | null;
  canSpendEpargne?: boolean;
  onSpendEpargne?: () => void;
  canSpendFoi?: boolean;
  onSpendFoi?: () => void;
  canSpendConquete?: boolean;
  onSpendConquete?: () => void;
  canTakeMachine?: boolean;
  onTakeMachine?: () => void;
  children: React.ReactNode;
}

type Item = { key: string; size: number; render: (bulle: ReturnType<typeof useBulleHandlers>) => React.ReactNode; bulle: () => React.ReactNode };

export default function HeroOrbit(props: HeroOrbitProps) {
  const { side, porteur, emblems = [], firedEmblems, fireKey, children } = props;
  const mine = side === "mine";
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const api = useOrbitBulle();

  // offsetWidth et non getBoundingClientRect : l'orbite se positionne dans le
  // repère LOCAL du portrait, que le zoom CSS du plateau ne doit pas fausser.
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const mesurer = () => setBox({ w: el.offsetWidth, h: el.offsetHeight });
    mesurer();
    const ro = new ResizeObserver(mesurer);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const machineTemplates = useGameStore((s) => s.machineTemplates);
  const machineCard = useMemo(
    () => (props.machine ? buildMachineCard(props.machine, props.machineFaction ?? null, machineTemplates) : null),
    [props.machine, props.machineFaction, machineTemplates],
  );

  // ── Emblèmes ──────────────────────────────────────────────────────────────
  const emblemItems: Item[] = emblems.map((e, i) => ({
    key: `e${i}_${e.abilityId ?? "cx"}`,
    size: TAILLE,
    bulle: () => <EmblemBulle e={e} porteur={porteur} />,
    render: (b) => <EmblemDiamond e={e} size={TAILLE} bulle={b} fireKey={firedEmblems?.includes(i) ? fireKey : null} />,
  }));

  // ── Compteurs (le premier est le plus proche de l'horizontale) ───────────
  const counterItems: Item[] = [];
  const dataBadge = (kind: string) => ({ [`data-${kind}-badge`]: side });
  const { epargne, foi, conquete, exploration, machine } = props;
  if (compteurVisible(epargne)) counterItems.push({
    key: "epargne", size: TAILLE,
    bulle: () => <BulleTexte titre="Épargne" lignes={[`${epargne} sur ${MAX_EPARGNE}`, mine && `Clic : révéler 3 cartes de coût ${epargne}`]} />,
    render: (b) => (
      <CounterMedallion size={TAILLE} teinte="var(--orbit-epargne)" total={MAX_EPARGNE} valeur={epargne!} ecu={epargne!}
        actif={props.canSpendEpargne} onClick={props.onSpendEpargne} ariaLabel={`Épargne : ${epargne}`} dataAttrs={dataBadge("epargne")} bulle={b}>
        <CounterIcon kind="epargne" />
      </CounterMedallion>
    ),
  });
  if (compteurVisible(foi)) counterItems.push({
    key: "foi", size: TAILLE,
    bulle: () => <BulleTexte titre="Foi" lignes={[`${foi} sur ${MAX_FOI}`, mine && `Clic : découvrir 1 carte parmi 3 de votre deck (coût ≤ ${foi})`]} />,
    render: (b) => (
      <CounterMedallion size={TAILLE} teinte="var(--orbit-foi)" total={MAX_FOI} valeur={foi!} ecu={foi!}
        actif={props.canSpendFoi} onClick={props.onSpendFoi} ariaLabel={`Foi : ${foi}`} dataAttrs={dataBadge("foi")} bulle={b}>
        <CounterIcon kind="foi" />
      </CounterMedallion>
    ),
  });
  if (compteurVisible(conquete)) counterItems.push({
    key: "conquete", size: TAILLE,
    bulle: () => <BulleTexte titre="Conquête" lignes={[
      `${conquete} sur ${MAX_CONQUETE}`,
      mine && ((conquete ?? 0) >= MAX_CONQUETE
        ? "Clic : prendre 1 carte parmi 3 du deck adverse"
        : `Cliquable au palier (${MAX_CONQUETE})`),
    ]} />,
    render: (b) => (
      <CounterMedallion size={TAILLE} teinte="var(--orbit-conquete)" total={MAX_CONQUETE} valeur={conquete!} ecu={conquete!}
        actif={props.canSpendConquete} onClick={props.onSpendConquete} ariaLabel={`Conquête : ${conquete}`} dataAttrs={dataBadge("conquete")} bulle={b}>
        <CounterIcon kind="conquete" />
      </CounterMedallion>
    ),
  });
  if (compteurVisible(exploration)) counterItems.push({
    key: "exploration", size: TAILLE,
    bulle: () => <BulleTexte titre="Exploration" lignes={[`${exploration} sur ${EXPLORATION_PALIER} · automatique`, `À ${EXPLORATION_PALIER} : pioche une carte`]} />,
    render: (b) => (
      <CounterMedallion size={TAILLE} teinte="var(--orbit-exploration)" total={EXPLORATION_PALIER} valeur={exploration!} ecu={exploration!}
        ariaLabel={`Exploration : ${exploration} sur ${EXPLORATION_PALIER}`} dataAttrs={dataBadge("exploration")} bulle={b}>
        <CounterIcon kind="exploration" />
      </CounterMedallion>
    ),
  });
  if (machine && compteurVisible(machine.inventions)) counterItems.push({
    key: "machine", size: TAILLE,
    bulle: () => (
      <>
        <BulleTexte titre="Machine" lignes={[
          `${machine.attack}/${machine.health}, coût ${machine.inventions} · ${machine.inventions} invention${machine.inventions > 1 ? "s" : ""} sur ${MAX_INVENTIONS_MACHINE}`,
          mine && "Clic : prendre la machine en main",
        ]} />
        {/* La MÊME carte que le moteur mettra en main (buildMachineCard est pur). */}
        {machineCard && <div style={{ marginTop: 8 }}><GameCard card={machineCard} size="sm" showDetails disableHoverZoom forceRarityFrame /></div>}
      </>
    ),
    render: (b) => (
      <MachineGear size={TAILLE} total={MAX_INVENTIONS_MACHINE} inventions={machine.inventions}
        actif={props.canTakeMachine} onClick={props.onTakeMachine}
        ariaLabel={`Machine : ${machine.attack}/${machine.health}, ${machine.inventions} Invention(s)`} dataAttrs={dataBadge("invention")} bulle={b} />
    ),
  });
  // Charges : petits médaillons sans jauge, un chiffre au-delà d'une charge.
  const charge = (key: string, n: number, teinte: string, glyphe: string, titre: string, ligne: string) => counterItems.push({
    key, size: TAILLE_MINI,
    bulle: () => <BulleTexte titre={titre} lignes={[ligne]} />,
    render: (b) => (
      <CounterMedallion size={TAILLE_MINI} teinte={teinte} total={0} valeur={0} ecu={n > 1 ? n : undefined}
        ariaLabel={`${titre} : ${n}`} dataAttrs={dataBadge(key)} bulle={b}>
        <span style={{ fontSize: 14, lineHeight: 1 }}>{glyphe}</span>
      </CounterMedallion>
    ),
  });
  const cs = props.contresort ?? 0;
  if (cs > 0) charge("contresort", cs, "var(--orbit-contresort)", "🚫", "Contresort armé",
    cs > 1 ? `Les ${cs} prochaines actions adverses sont annulées` : "La prochaine action adverse est annulée");
  const ex = props.exclusion ?? 0;
  if (ex > 0) charge("exclusion", ex, "var(--orbit-exclusion)", "⛔", "Exclusion armée",
    ex > 1 ? `Les ${ex} prochaines invocations d'unités adverses sont annulées` : "La prochaine invocation d'unité adverse est annulée");
  if (props.singleton) counterItems.push({
    key: "singulier", size: TAILLE_MINI,
    bulle: () => <BulleTexte titre="Deck singulier" lignes={[mine ? "Vos capacités Singulier sont actives" : "Révélé : les capacités Singulier adverses sont actives"]} />,
    render: (b) => (
      <CounterMedallion size={TAILLE_MINI} teinte="var(--orbit-singulier)" total={0} valeur={0} ariaLabel="Deck singulier" dataAttrs={dataBadge("singulier")} bulle={b}>
        <span style={{ fontFamily: "var(--font-cinzel), serif", fontWeight: 900, fontSize: 15, lineHeight: 1, color: "#ccfbf1" }}>S</span>
      </CounterMedallion>
    ),
  });

  const rayon = box.w > 0 ? Math.min(box.w, box.h) / 2 + TAILLE / 2 + ECART_PORTRAIT : 0;
  const layout = orbitLayout(emblemItems.length, counterItems.length, { side, radius: rayon, itemSize: TAILLE });

  return (
    <div ref={boxRef} className="relative" data-hero-orbit={side}>
      {children}
      {rayon > 0 && (
        <>
          <OrbitGroupe items={emblemItems} group="emblems" layout={layout.emblems} box={box} api={api} />
          <OrbitGroupe items={counterItems} group="counters" layout={layout.counters} box={box} api={api} />
        </>
      )}
      <OrbitTooltip bulle={api.bulle} side={side} />
    </div>
  );
}

function OrbitGroupe({ items, group, layout, box, api }: {
  items: Item[]; group: "emblems" | "counters"; layout: OrbitGroupLayout;
  box: { w: number; h: number }; api: ReturnType<typeof useOrbitBulle>;
}) {
  const { slots, overflow } = layout;
  const visibles = overflow > 0 ? items.slice(0, slots.length - 1) : items;
  const caches = overflow > 0 ? items.slice(slots.length - 1) : [];
  return (
    <>
      {visibles.map((it, i) => (
        <Slot key={it.key} x={box.w / 2 + slots[i].x} y={box.h / 2 + slots[i].y} size={it.size}>
          <OrbitItem item={it} api={api} />
        </Slot>
      ))}
      {overflow > 0 && (
        <Slot x={box.w / 2 + slots[slots.length - 1].x} y={box.h / 2 + slots[slots.length - 1].y} size={TAILLE}>
          <Surplus n={overflow} group={group} api={api} caches={caches} />
        </Slot>
      )}
    </>
  );
}

function Slot({ x, y, size, children }: { x: number; y: number; size: number; children: React.ReactNode }) {
  return (
    <div className="absolute" style={{ left: x - size / 2, top: y - size / 2, width: size, height: size, zIndex: 25 }}>
      {children}
    </div>
  );
}

function OrbitItem({ item, api }: { item: Item; api: ReturnType<typeof useOrbitBulle> }) {
  const b = useBulleHandlers(item.key, item.bulle, api);
  return <>{item.render(b)}</>;
}

/** « +N » : ouvre la liste de ce qui n'a pas trouvé place sur l'arc. */
function Surplus({ n, group, api, caches }: {
  n: number; group: "emblems" | "counters"; api: ReturnType<typeof useOrbitBulle>; caches: Item[];
}) {
  const b = useBulleHandlers(`surplus_${group}`, () => (
    <BulleTexte
      titre={group === "emblems" ? `${n} autres emblèmes` : `${n} autres compteurs`}
      lignes={caches.map((it) => <div key={it.key} style={{ marginTop: 6 }}>{it.bulle()}</div>)}
    />
  ), api);
  const { attacher, handlers: poignees } = b;
  return (
    <div ref={attacher} {...poignees} className="flex items-center justify-center rounded-full"
      style={{
        width: TAILLE, height: TAILLE, background: "#14100a", border: "2px dashed var(--am-gold)",
        fontFamily: "var(--font-cinzel), serif", fontWeight: 900, fontSize: 14, color: "var(--am-gold-bright)",
        touchAction: "manipulation",
      }}
    >
      +{n}
    </div>
  );
}
