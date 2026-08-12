// Page de détail d'une news — PUBLIQUE (le préfixe /news figure dans
// PUBLIC_PATH_PREFIXES de src/proxy.ts) : le lien se partage hors du jeu.
// RSC : lecture Supabase directe (RLS « Public read news »), contenu résolu
// dans la locale du cookie am-locale avec repli français champ par champ.
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { normalizeLocale } from "@/i18n/config";
import { resolveNewsLocale, type NewsItem } from "@/lib/news/types";
import { renderMarkdown } from "@/lib/markdown/renderMarkdown";
import AmAtmosphere from "@/components/ui/AmAtmosphere";

async function fetchNews(slug: string): Promise<NewsItem | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("news").select("*").eq("slug", slug).maybeSingle();
  return (data as NewsItem | null) ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const news = await fetchNews(slug);
  if (!news) return { title: "Armies & Magic" };
  const locale = normalizeLocale(await getLocale());
  const { title, teaser } = resolveNewsLocale(news, locale);
  return {
    title: `${title} — Armies & Magic`,
    description: teaser || undefined,
    openGraph: {
      title,
      description: teaser || undefined,
      // Le visuel du bandeau sert d'image OG (aperçu Discord/réseaux).
      images: news.image_url ? [news.image_url] : undefined,
    },
  };
}

export default async function NewsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const news = await fetchNews(slug);
  if (!news) notFound();

  const locale = normalizeLocale(await getLocale());
  const t = await getTranslations("home");
  const { title, teaser, bodyMd } = resolveNewsLocale(news, locale);
  const dateLabel = new Date(news.created_at).toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="min-h-screen text-am-ink">
      <AmAtmosphere />
      <main className="relative px-5 py-10 md:py-16">
        <article className="mx-auto w-full max-w-3xl">
          {/* Visuel du bandeau en tête (ou dégradé de repli). */}
          <div className="relative overflow-hidden rounded-[var(--am-r-lg)] am-glass h-44 md:h-60 mb-8">
            {news.image_url ? (
              <Image
                src={news.image_url}
                alt=""
                fill
                sizes="(max-width: 768px) 100vw, 768px"
                className="object-cover"
                priority
              />
            ) : (
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(120deg, var(--am-bg-3), var(--am-arcane-deep) 55%, var(--am-bg-2))",
                }}
              />
            )}
            <div
              className="absolute inset-0"
              style={{ background: "linear-gradient(180deg, transparent 45%, rgba(8,7,15,0.7))" }}
            />
          </div>

          <h1 className="am-foil-text font-[family-name:var(--font-cinzel),serif] text-2xl md:text-4xl font-bold leading-tight mb-2">
            {title}
          </h1>
          <p className="text-xs text-am-ink-faint mb-2 font-[family-name:var(--font-crimson),serif]">
            {dateLabel}
          </p>
          {teaser && (
            <p className="font-[family-name:var(--font-crimson),serif] italic text-am-ink-soft text-lg mb-8">
              {teaser}
            </p>
          )}
          <div className="am-rule-diamond w-40 mb-8" aria-hidden="true" />

          <div className="am-news-prose text-am-ink-soft font-[family-name:var(--font-crimson),serif] leading-relaxed text-[17px]">
            {renderMarkdown(bodyMd)}
          </div>

          <div className="mt-14 pt-6 border-t" style={{ borderColor: "var(--am-line-strong)" }}>
            <Link href="/" className="text-sm text-am-ink-faint hover:text-am-gold transition-colors">
              ← {t("news_back_home")}
            </Link>
          </div>
        </article>
      </main>
    </div>
  );
}
