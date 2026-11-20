// Régénère docs/livret-de-regles.md depuis src/lib/regles (source unique).
//
//   npm run livret
//
// Le document est la version LISIBLE du livret : pour l'auteur du jeu, et pour
// Claude Code, qui le lit avant de toucher à une règle. Il décrit toutes les
// variantes de règles, sans dire laquelle est active sur le site (l'agent de
// tri, lui, reçoit le livret du déploiement courant).
import { writeFileSync } from "node:fs";
import { documentLivret } from "@/lib/regles/document";

writeFileSync("docs/livret-de-regles.md", documentLivret());
console.log("docs/livret-de-regles.md régénéré.");
