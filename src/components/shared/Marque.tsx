import { useTranslations } from "next-intl";

/**
 * Le nom du jeu, tel qu'il s'écrit dans la langue du visiteur : « Armies of
 * Legends » partout où l'on écrit en alphabet latin, sa traduction en japonais
 * et en chinois. La valeur vit dans `common.brand` de messages/*.json.
 */
export default function Marque() {
  const t = useTranslations("common");
  return <>{t("brand")}</>;
}
