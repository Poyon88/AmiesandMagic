import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300; // 5 min — Meshy image-to-3D usually finishes in 1-3 min

const MESHY_BASE = "https://api.meshy.ai/openapi/v1";
const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS = 240_000; // 4 min

async function getAuthUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() { /* read-only */ },
      },
    },
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

type MeshyTask = {
  id: string;
  status: "PENDING" | "IN_PROGRESS" | "SUCCEEDED" | "FAILED" | "CANCELED" | "EXPIRED";
  progress?: number;
  model_urls?: { glb?: string; fbx?: string; obj?: string; usdz?: string };
  thumbnail_url?: string;
  task_error?: { message?: string };
};

async function createTask(
  apiKey: string,
  imageUrl: string,
  opts: { artStyle?: string; enablePbr?: boolean; aiModel?: string },
): Promise<string> {
  const res = await fetch(`${MESHY_BASE}/image-to-3d`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      image_url: imageUrl,
      ai_model: opts.aiModel ?? "meshy-4",
      art_style: opts.artStyle ?? "realistic",
      enable_pbr: opts.enablePbr ?? true,
      should_remesh: true,
      symmetry_mode: "auto",
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.message || `Meshy create task failed (${res.status})`);
  }
  const id = (data?.result ?? data?.id ?? data?.task_id) as string | undefined;
  if (!id) throw new Error("Meshy create task: no task id in response");
  return id;
}

async function pollTask(apiKey: string, taskId: string): Promise<MeshyTask> {
  const started = Date.now();
  while (Date.now() - started < POLL_TIMEOUT_MS) {
    const res = await fetch(`${MESHY_BASE}/image-to-3d/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const data = (await res.json()) as MeshyTask;
    if (data.status === "SUCCEEDED") return data;
    if (data.status === "FAILED" || data.status === "CANCELED" || data.status === "EXPIRED") {
      throw new Error(data.task_error?.message || `Meshy task ${data.status.toLowerCase()}`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error("Meshy task timed out");
}

// POST /api/figurines/generate — proxies a card image through Meshy v4
// image-to-3D and returns the finished GLB URL. Blocks until the task
// completes (up to 4 min). Ephemeral: URL is valid on Meshy's CDN, no DB
// persistence for this prototype.
export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const apiKey = process.env.MESHY_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "MESHY_API_KEY non configurée (ajoute-la dans .env.local)" },
      { status: 500 },
    );
  }

  try {
    const body = await request.json();
    const imageUrl = body?.imageUrl as string | undefined;
    const artStyle = body?.artStyle as string | undefined;
    if (!imageUrl) {
      return NextResponse.json({ error: "imageUrl requis" }, { status: 400 });
    }

    const taskId = await createTask(apiKey, imageUrl, { artStyle });
    const task = await pollTask(apiKey, taskId);

    const glb = task.model_urls?.glb;
    if (!glb) {
      return NextResponse.json({ error: "Meshy n'a pas renvoyé de GLB" }, { status: 502 });
    }
    return NextResponse.json({
      taskId,
      glbUrl: glb,
      thumbnailUrl: task.thumbnail_url,
      allFormats: task.model_urls,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur inconnue" },
      { status: 500 },
    );
  }
}
