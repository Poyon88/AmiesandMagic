"use client";

import { Suspense, useMemo, useState, useEffect, Component, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Stage, useGLTF } from "@react-three/drei";

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

function FigurineModel({ url }: { url: string }) {
  const gltf = useGLTF(url);
  return <primitive object={gltf.scene} />;
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
                        <FigurineModel url={glbUrl} />
                      </Stage>
                      <OrbitControls makeDefault enablePan={false} autoRotate autoRotateSpeed={0.6} />
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
