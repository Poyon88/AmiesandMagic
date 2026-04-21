"use client";

import { Suspense, useMemo, useRef, useState, useEffect, Component, type ReactNode } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Sparkles, Stage, useGLTF } from "@react-three/drei";
import { Color, Group, Mesh, MeshStandardMaterial } from "three";

// ─── Effect types ─────────────────────────────────────────────────────────

type Effect = "idle" | "attack" | "damage" | "death" | "heal" | "buff";

const EFFECT_LABELS: Record<Effect, { label: string; emoji: string; tone: string }> = {
  idle: { label: "Idle", emoji: "🧍", tone: "border-card-border text-foreground/60" },
  attack: { label: "Attaque", emoji: "⚔️", tone: "border-amber-500/50 text-amber-300 hover:bg-amber-500/10" },
  damage: { label: "Dégâts", emoji: "💥", tone: "border-red-500/50 text-red-300 hover:bg-red-500/10" },
  death: { label: "Mort", emoji: "💀", tone: "border-zinc-500/50 text-zinc-300 hover:bg-zinc-500/10" },
  heal: { label: "Soin", emoji: "✨", tone: "border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/10" },
  buff: { label: "Buff", emoji: "👑", tone: "border-yellow-400/60 text-yellow-300 hover:bg-yellow-400/10" },
};

const EFFECT_DURATION: Record<Effect, number> = {
  idle: 0,
  attack: 0.55,
  damage: 0.45,
  death: 1.2,
  heal: 1.4,
  buff: Infinity,
};

class ModelErrorBoundary extends Component<
  { onReset: () => void; children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidUpdate(prev: { onReset: () => void; children: ReactNode }) {
    if (prev.children !== this.props.children && this.state.error) {
      this.setState({ error: null });
    }
  }
  render() {
    if (this.state.error) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-red-300 text-sm text-center px-8">
          <div className="text-base font-bold">Impossible de charger le modèle</div>
          <div className="text-xs text-red-300/80 max-w-md">{this.state.error.message}</div>
          <button
            onClick={() => { this.setState({ error: null }); this.props.onReset(); }}
            className="px-3 py-1 rounded border border-red-400/60 text-red-300 text-xs hover:bg-red-500/10"
          >
            Réinitialiser
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

type CardRow = {
  id: number;
  name: string;
  image_url: string | null;
  card_type: string;
  faction: string | null;
  race: string | null;
  rarity: string | null;
};

interface FigurineModelProps {
  url: string;
  effect: Effect;
  effectKey: number;
  onEffectEnd: () => void;
}

const TINT_RED = new Color(1.0, 0.2, 0.2);
const TINT_GREEN = new Color(0.2, 1.0, 0.4);
const TINT_GOLD = new Color(1.0, 0.85, 0.3);

function FigurineModel({ url, effect, effectKey, onEffectEnd }: FigurineModelProps) {
  const gltf = useGLTF(url);
  const groupRef = useRef<Group>(null);
  const startRef = useRef<number>(0);
  const endNotified = useRef(false);
  const cachedMats = useRef<{ mat: MeshStandardMaterial; orig: Color }[]>([]);

  // Cache materials on load
  useEffect(() => {
    const cache: { mat: MeshStandardMaterial; orig: Color }[] = [];
    gltf.scene.traverse((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (m && "emissive" in m) {
          const sm = m as MeshStandardMaterial;
          cache.push({ mat: sm, orig: sm.emissive.clone() });
        }
      }
    });
    cachedMats.current = cache;
    return () => {
      for (const c of cache) c.mat.emissive.copy(c.orig);
    };
  }, [gltf.scene]);

  // Reset timer on each effect trigger
  useEffect(() => {
    startRef.current = performance.now();
    endNotified.current = false;
  }, [effectKey]);

  // Helpers
  function resetTint() {
    for (const c of cachedMats.current) c.mat.emissive.copy(c.orig);
  }
  function setTint(color: Color, k: number) {
    for (const c of cachedMats.current) {
      c.mat.emissive.copy(c.orig).lerp(color, Math.min(1, Math.max(0, k)));
    }
  }

  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;
    const t = (performance.now() - startRef.current) / 1000;

    // Reset baseline each frame (except death, which is absorbing)
    if (effect !== "death") {
      g.position.set(0, 0, 0);
      g.rotation.set(0, 0, 0);
      g.scale.set(1, 1, 1);
    }

    switch (effect) {
      case "attack": {
        const d = EFFECT_DURATION.attack;
        if (t < d) {
          const p = t / d;
          const lunge = Math.sin(p * Math.PI);
          g.position.z = lunge * 0.45;
          g.rotation.x = -lunge * 0.18;
        } else if (!endNotified.current) {
          endNotified.current = true;
          onEffectEnd();
        }
        resetTint();
        break;
      }
      case "damage": {
        const d = EFFECT_DURATION.damage;
        if (t < d) {
          const decay = 1 - t / d;
          g.position.x = Math.sin(t * 50) * 0.08 * decay;
          setTint(TINT_RED, 0.8 * decay);
        } else {
          resetTint();
          if (!endNotified.current) { endNotified.current = true; onEffectEnd(); }
        }
        break;
      }
      case "death": {
        const d = EFFECT_DURATION.death;
        const p = Math.min(1, t / d);
        g.rotation.z = p * Math.PI * 0.5;
        g.position.y = -p * 0.6;
        const s = 1 - p * 0.6;
        g.scale.set(s, s, s);
        setTint(new Color(0.1, 0.1, 0.15), p * 0.5);
        // Stay in dead pose — user must pick another effect to revive.
        break;
      }
      case "heal": {
        const d = EFFECT_DURATION.heal;
        if (t < d) {
          const p = t / d;
          const pulse = 1 + Math.sin(p * Math.PI * 3) * 0.04 * (1 - p);
          g.scale.set(pulse, pulse, pulse);
          setTint(TINT_GREEN, 0.5 * (1 - p));
        } else {
          resetTint();
          if (!endNotified.current) { endNotified.current = true; onEffectEnd(); }
        }
        break;
      }
      case "buff": {
        const pulse = 1 + Math.sin(t * 3) * 0.03;
        g.scale.set(pulse, pulse, pulse);
        setTint(TINT_GOLD, 0.25 + Math.sin(t * 3) * 0.12);
        break;
      }
      case "idle":
      default:
        resetTint();
        break;
    }
  });

  return (
    <group ref={groupRef}>
      <primitive object={gltf.scene} />
      {effect === "heal" && (
        <Sparkles count={40} size={3} scale={[2, 2.5, 2]} speed={0.6} color="#4ade80" />
      )}
      {effect === "buff" && (
        <Sparkles count={30} size={2.5} scale={[2, 2.5, 2]} speed={0.4} color="#fbbf24" />
      )}
    </group>
  );
}

interface FigurineTestViewProps {
  cards: CardRow[];
}

export default function FigurineTestView({ cards }: FigurineTestViewProps) {
  const [selectedId, setSelectedId] = useState<number | null>(cards[0]?.id ?? null);
  const [search, setSearch] = useState("");
  const [glbUrl, setGlbUrl] = useState<string | null>(null);
  const [glbSourceLabel, setGlbSourceLabel] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [effect, setEffect] = useState<Effect>("idle");
  const [effectKey, setEffectKey] = useState(0);
  const [autoRotate, setAutoRotate] = useState(true);

  function triggerEffect(next: Effect) {
    setEffect(next);
    setEffectKey((k) => k + 1);
    // For persistent effects (buff), stay. For timed effects, auto-return to idle
    // is handled via onEffectEnd inside FigurineModel.
  }

  // Revoke blob URLs on unmount or when replaced to avoid memory leaks.
  useEffect(() => {
    return () => {
      if (glbUrl?.startsWith("blob:")) URL.revokeObjectURL(glbUrl);
    };
  }, [glbUrl]);

  const filtered = useMemo(() => {
    if (!search.trim()) return cards;
    const q = search.toLowerCase();
    return cards.filter((c) => c.name.toLowerCase().includes(q));
  }, [cards, search]);

  const selected = cards.find((c) => c.id === selectedId) ?? null;

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".glb") && !lower.endsWith(".gltf")) {
      setError("Format non supporté — utilise un .glb ou .gltf");
      return;
    }
    // Clean up the previous blob URL if any.
    if (glbUrl?.startsWith("blob:")) URL.revokeObjectURL(glbUrl);
    setError(null);
    setGlbUrl(URL.createObjectURL(file));
    setGlbSourceLabel(file.name);
  }

  function loadFromUrl() {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    // Guard against share pages / non-GLB URLs that would fail in the viewer
    // with an opaque "Failed to fetch". The URL must point to a raw .glb/.gltf
    // file — Meshy share links (meshy.ai/s/...) are HTML pages, not assets.
    const lower = trimmed.toLowerCase();
    const looksLikeModel = lower.includes(".glb") || lower.includes(".gltf");
    if (!looksLikeModel) {
      setError(
        "Cette URL ne pointe pas vers un fichier .glb/.gltf. Une page de partage Meshy (meshy.ai/s/…) n'est pas un modèle — télécharge le GLB et utilise « Charger un GLB ».",
      );
      return;
    }
    if (glbUrl?.startsWith("blob:")) URL.revokeObjectURL(glbUrl);
    setError(null);
    setGlbUrl(trimmed);
    setGlbSourceLabel(trimmed);
  }

  return (
    <div className="min-h-screen bg-background p-6 text-foreground">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-baseline justify-between mb-4">
          <h1 className="text-2xl font-bold text-primary">Prototype figurine 3D</h1>
          <span className="text-xs text-foreground/50">Meshy v4 · image-to-3D · ephemeral preview</span>
        </div>

        <div className="grid grid-cols-[320px_1fr] gap-6">
          {/* Left: card picker */}
          <div className="flex flex-col gap-3">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Chercher une créature…"
              className="px-3 py-2 rounded-lg bg-secondary border border-card-border text-sm"
            />
            <div className="flex flex-col gap-1 max-h-[560px] overflow-y-auto border border-card-border rounded-lg bg-secondary/40">
              {filtered.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={`flex items-center gap-3 p-2 text-left hover:bg-primary/10 transition-colors border-b border-card-border/40 ${
                    selectedId === c.id ? "bg-primary/15" : ""
                  }`}
                >
                  {c.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.image_url} alt="" className="w-10 h-14 object-cover rounded flex-shrink-0" />
                  ) : (
                    <div className="w-10 h-14 bg-secondary rounded flex-shrink-0" />
                  )}
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-medium truncate">{c.name}</span>
                    <span className="text-[10px] text-foreground/50 truncate">
                      {c.faction ?? "—"} · {c.race ?? "—"} · {c.rarity ?? "Commune"}
                    </span>
                  </div>
                </button>
              ))}
              {filtered.length === 0 && (
                <div className="p-4 text-center text-xs text-foreground/50">Aucune créature</div>
              )}
            </div>
          </div>

          {/* Right: card preview + viewer */}
          <div className="flex flex-col gap-4">
            {selected && (
              <div className="flex gap-4 items-start">
                {selected.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selected.image_url}
                    alt={selected.name}
                    className="w-40 h-56 object-cover rounded-lg border border-card-border"
                  />
                )}
                <div className="flex flex-col gap-3 flex-1">
                  <div>
                    <h2 className="text-lg font-bold">{selected.name}</h2>
                    <p className="text-xs text-foreground/60">
                      {selected.faction ?? "—"} · {selected.race ?? "—"} · {selected.rarity ?? "Commune"}
                    </p>
                  </div>
                  <div className="text-xs text-foreground/60 leading-relaxed bg-secondary/40 border border-card-border rounded p-3">
                    <div className="font-bold text-foreground/80 mb-1">Workflow (free tier, sans API)</div>
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Copie l&apos;URL de l&apos;illustration ci-dessous.</li>
                      <li>Va sur <a href="https://www.meshy.ai/workspace/image-to-3d" target="_blank" rel="noreferrer" className="text-primary underline">meshy.ai image-to-3D</a>, colle l&apos;URL, lance la génération.</li>
                      <li>Attends ~2 min, télécharge le <code>.glb</code>.</li>
                      <li>Charge-le ici via &laquo;&nbsp;Charger un GLB&nbsp;&raquo;.</li>
                    </ol>
                  </div>
                  {selected.image_url && (
                    <button
                      onClick={() => navigator.clipboard.writeText(selected.image_url!)}
                      className="px-3 py-1.5 text-xs rounded border border-card-border text-foreground/70 hover:border-primary/50 self-start"
                    >
                      📋 Copier l&apos;URL de l&apos;illustration
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Load controls */}
            <div className="flex flex-wrap items-center gap-2">
              <label className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-500 text-white text-sm font-bold cursor-pointer">
                Charger un GLB
                <input type="file" accept=".glb,.gltf" onChange={handleFile} className="hidden" />
              </label>
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="ou colle une URL .glb publique"
                className="flex-1 px-3 py-2 rounded bg-secondary border border-card-border text-xs"
              />
              <button
                onClick={loadFromUrl}
                disabled={!urlInput.trim()}
                className={`px-3 py-2 rounded text-xs font-bold ${
                  urlInput.trim()
                    ? "border border-primary text-primary bg-primary/10"
                    : "border border-card-border text-foreground/40 cursor-not-allowed"
                }`}
              >
                Charger l&apos;URL
              </button>
              {glbUrl && (
                <button
                  onClick={() => {
                    if (glbUrl.startsWith("blob:")) URL.revokeObjectURL(glbUrl);
                    setGlbUrl(null);
                    setGlbSourceLabel(null);
                  }}
                  className="px-3 py-2 text-xs rounded border border-red-500/40 text-red-400 hover:bg-red-500/10"
                >
                  Vider
                </button>
              )}
            </div>
            {error && (
              <div className="text-xs text-red-400 bg-red-900/30 border border-red-500/30 rounded px-3 py-2">
                {error}
              </div>
            )}
            {glbSourceLabel && (
              <div className="text-[10px] text-foreground/50 truncate">
                Source : <span className="font-mono">{glbSourceLabel}</span>
              </div>
            )}

            {/* Effects toolbar (visible once a model is loaded) */}
            {glbUrl && (
              <div className="flex flex-wrap items-center gap-2 border border-card-border rounded-lg p-3 bg-secondary/30">
                <span className="text-[11px] uppercase tracking-wider text-foreground/50 mr-1">
                  Situations de jeu
                </span>
                {(["idle", "attack", "damage", "heal", "buff", "death"] as Effect[]).map((fx) => {
                  const meta = EFFECT_LABELS[fx];
                  const active = effect === fx;
                  return (
                    <button
                      key={fx}
                      onClick={() => triggerEffect(fx)}
                      className={`px-3 py-1.5 rounded text-xs font-semibold border transition-colors ${
                        active
                          ? "border-primary bg-primary/15 text-primary"
                          : meta.tone + " bg-transparent"
                      }`}
                    >
                      {meta.emoji} {meta.label}
                    </button>
                  );
                })}
                <label className="ml-auto flex items-center gap-1.5 text-[11px] text-foreground/60 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoRotate}
                    onChange={(e) => setAutoRotate(e.target.checked)}
                    className="accent-primary"
                  />
                  Auto-rotate
                </label>
              </div>
            )}

            {/* 3D viewer */}
            <div className="w-full h-[560px] rounded-xl overflow-hidden border border-card-border bg-[#101018]">
              {glbUrl ? (
                <ModelErrorBoundary
                  key={glbUrl}
                  onReset={() => {
                    if (glbUrl.startsWith("blob:")) URL.revokeObjectURL(glbUrl);
                    setGlbUrl(null);
                    setGlbSourceLabel(null);
                  }}
                >
                  <Canvas
                    camera={{ position: [0, 0, 4], fov: 40 }}
                    style={{ width: "100%", height: "100%" }}
                  >
                    <Suspense fallback={null}>
                      <Stage environment="studio" intensity={0.6} shadows="contact">
                        <FigurineModel
                          url={glbUrl}
                          effect={effect}
                          effectKey={effectKey}
                          onEffectEnd={() => setEffect("idle")}
                        />
                      </Stage>
                      <OrbitControls
                        makeDefault
                        enablePan={false}
                        autoRotate={autoRotate}
                        autoRotateSpeed={0.6}
                      />
                    </Suspense>
                  </Canvas>
                </ModelErrorBoundary>
              ) : (
                <div className="w-full h-full flex items-center justify-center flex-col gap-3 text-foreground/40 text-sm text-center px-8">
                  Sélectionne une créature, copie l&apos;URL de son illustration, génère sur meshy.ai, puis charge le <code>.glb</code> ici.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
