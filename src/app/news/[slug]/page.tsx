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
import { findGameSection } from "@/lib/game-sections";
import { renderMarkdown } from "@/lib/markdown/renderMarkdown";
import { bricolage } from "@/components/vitrine/font";
import "@/components/vitrine/vitrine.css";
import Marque from "@/components/shared/Marque";

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
  if (!news) return { title: "Armies of Legends" };
  const locale = normalizeLocale(await getLocale());
  const { title, teaser } = resolveNewsLocale(news, locale);
  return {
    title: `${title} — Armies of Legends`,
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
  const ctaSection = findGameSection(news.cta_section);
  const dateLabel = new Date(news.created_at).toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className={`vt ${bricolage.variable}`}>
      <header className="vt-entete">
        <Link href="/landing" className="vt-brand" translate="no"><Marque /></Link>
      </header>
      <main>
        <article className="vt-lecture">
          {/* Visuel du bandeau en tête. Sans image, rien : un dégradé de
              remplissage ne dit rien de l'article. */}
          {news.image_url && (
            <div className="vt-lecture-image">
              <Image src={news.image_url} alt="" fill sizes="(max-width: 768px) 100vw, 736px" priority />
            </div>
          )}

          <h1 className="vt-lecture-titre">{title}</h1>
          <p className="vt-lecture-date">{dateLabel}</p>
          {teaser && <p className="vt-lecture-chapo">{teaser}</p>}

          <div className="am-news-prose vt-prose">{renderMarkdown(bodyMd)}</div>

          {/* Bouton d'action vers une section du jeu. Le libellé est celui du
              menu (labelKey), donc déjà traduit : on affiche le nom de la
              section seule, sans phrase porteuse — « Voir le/la <section> » se
              serait cassé sur les genres et les articles des 8 langues. Une clé
              devenue orpheline rend `undefined` et le bouton disparaît. */}
          {ctaSection && (
            <div className="vt-actions">
              <Link href={ctaSection.href} className="vt-btn vt-btn--lg">{t(ctaSection.labelKey)}</Link>
            </div>
          )}

          <div className="vt-lecture-pied">
            <Link href="/" className="vt-link">{t("news_back_home")}</Link>
          </div>
        </article>
      </main>
    </div>
  );
}
