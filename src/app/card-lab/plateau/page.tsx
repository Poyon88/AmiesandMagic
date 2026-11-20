import { notFound } from "next/navigation";
import BoardLab from "./BoardLab";

/** Banc d'essai de la MISE EN PAGE du plateau — développement seulement : en
 *  production la route n'existe pas. */
export default function BoardLabPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <BoardLab />;
}
