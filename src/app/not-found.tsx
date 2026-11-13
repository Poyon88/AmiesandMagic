import { getTranslations } from "next-intl/server";
import AmPanel from "@/components/ui/AmPanel";
import AmHeading from "@/components/ui/AmHeading";
import { AmLinkButton } from "@/components/ui/AmButton";

export default async function NotFound() {
  const t = await getTranslations("errors");
  return (
    <div className="min-h-screen bg-am-bg-0">
      <div className="mx-auto max-w-2xl px-4 py-20">
        <AmPanel corners className="p-10 text-center">
          <AmHeading eyebrow="404">{t("not_found_title")}</AmHeading>
          <p className="mt-4 text-sm text-am-ink-soft">{t("not_found_body")}</p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <AmLinkButton href="/">{t("home")}</AmLinkButton>
          </div>
        </AmPanel>
      </div>
    </div>
  );
}
