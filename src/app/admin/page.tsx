import { redirect } from "next/navigation";

// L'administration n'a pas de page d'accueil propre : la forge en tient lieu.
// Sans cette redirection, /admin répondait 404 (et le lien « Admin » de la
// barre latérale la préchargeait à chaque rendu).
export default function AdminIndexPage() {
  redirect("/admin/card-forge");
}
