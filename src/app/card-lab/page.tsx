import { notFound } from "next/navigation";
import CardLab from "./CardLab";

/** Page de CONTRÔLE des compteurs de carte (brief §10.3) — développement
 *  seulement : en production la route n'existe pas. */
export default function CardLabPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <CardLab />;
}
