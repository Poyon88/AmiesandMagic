# Modèles d'image — quelle IA dessine réellement les cartes

> **Le drapeau `highRes` ne fait rien.** La clé Gemini du projet n'a accès à
> **aucun modèle Imagen** : les trois `imagen-*` de la cascade répondent 404, et
> la génération retombe sur Gemini. Toutes les illustrations produites à ce jour
> sortent donc de Gemini, **jamais en 2K** — malgré le nom du drapeau et le
> commentaire « up to 2K on Imagen 4 Ultra » qui figure encore en tête du
> module. Tant que l'accès Imagen n'est pas obtenu, ce chemin est décoratif.

---

## Ce que la clé voit vraiment

Relevé le 2026-08-20 via `GET /v1beta/models` (appel de métadonnées, sans
génération). Six modèles d'image, tous Gemini, tous en `generateContent` :

| identifiant | nom commercial | fenêtre d'entrée |
|---|---|---|
| `gemini-3-pro-image` (+ `-preview`) | Nano Banana **Pro** | 131 072 |
| `gemini-3.1-flash-image` (+ `-preview`) | Nano Banana **2** | 65 536 |
| `gemini-3.1-flash-lite-image` | Nano Banana 2 Lite | 65 536 |
| `gemini-2.5-flash-image` | Nano Banana | 32 768 |

Aucun `imagen-*`. Sur l'API Gemini, Imagen demande un palier payant : soit le
projet ne l'a pas, soit ces noms sont périmés. **Question ouverte**, à trancher
dans AI Studio — c'est elle qui rapporte le plus, retrouver le 2K pesant sans
doute davantage que l'arbitrage entre paliers Gemini.

## Les deux chemins

`src/lib/ai/generate-image.ts` est le seul point de génération : les cartes, les
portraits de héros et les images de pouvoir y passent tous.

```
                        image de référence jointe ?
                       ╱                          ╲
                    non                            oui
                     │                              │
        highRes ⇒ IMAGEN d'abord            IMAGEN SAUTÉ
        (2K, pas de référence)         (son :predict n'accepte pas
                     │                  d'image jointe en ligne)
          ┌──────────┴──────────┐               │
          │ 404 sur les trois    │              │
          └──────────┬──────────┘               │
                     └──────────┬───────────────┘
                                ▼
                    GEMINI multimodal, dans l'ordre
```

**L'ordre des listes est l'ordre d'essai, du plus récent au plus ancien.** La
boucle s'arrête au premier modèle qui répond : le premier de la liste est donc
celui qui sert réellement, les suivants ne sont que des filets. La liste Gemini
était rangée à l'envers jusqu'au 2026-08-20 — 2.5 Flash en tête — si bien que
les modèles 3.x n'étaient jamais atteints.

> **En ajouter un : le mettre EN TÊTE, pas à la suite.** C'est l'ajout à la
> suite qui avait produit l'inversion.

## Savoir qui a dessiné

Le modèle retenu remonte dans la réponse et s'affiche dans le message de succès
sous la carte : « Illustration générée (`gemini-3.1-flash-image-preview`) ».
**C'est la seule source fiable** — le code demande une chose et peut en obtenir
une autre, comme l'a montré tout ce document.

Côté serveur, un repli d'Imagen vers Gemini est désormais journalisé
(`[generate-image] Imagen indisponible, repli sur Gemini`). Ces erreurs ne
remontaient auparavant que si Gemini échouait *lui aussi* — or c'est justement
quand le repli réussit que le silence trompe.

## Comparer deux modèles

La forge propose une liste déroulante à côté du bouton *Illustrer* :
« Modèle : auto » (la cascade) ou un modèle nommé.

Deux règles, pour que la comparaison veuille dire quelque chose :

* **un modèle imposé ne se replie sur aucun autre.** Son échec est remonté tel
  quel, sinon le rendu de l'un passerait pour celui de l'autre ;
* **le choix n'est pas mémorisé.** Au rechargement, retour à « auto » : c'est un
  outil de comparaison, pas un réglage, et un modèle resté sélectionné par
  inadvertance deviendrait un défaut silencieux.

Imagen 4 Ultra figure volontairement dans cette liste bien qu'inaccessible : le
choisir renvoie l'erreur exacte de Google, ce qui distingue un défaut d'accès
d'un nom de modèle périmé.

## Décision en attente

Lequel de **Nano Banana Pro** (palier Pro, fenêtre d'entrée doublée — utile pour
les prompts d'illustration très détaillés du projet, plus lent et plus cher) ou
de **Nano Banana 2** (le plus récent, palier Flash, rapide et bon marché) doit
mener la cascade ? Comparaison en cours par l'auteur. En attendant, l'ordre suit
la version : 3.1 Flash, puis 3 Pro, puis 2.5 Flash.

## Où c'est

| quoi | où |
|---|---|
| cascade, appels, classement des erreurs | `src/lib/ai/generate-image.ts` |
| catalogue proposé à la forge | `src/lib/ai/image-models.ts` |
| route (admin uniquement) | `src/app/api/cards/generate-image/route.ts` |
| sélecteur + envoi du prompt | `src/components/card-forge/CardForge.tsx` |

Le catalogue vit dans son propre module parce que `generate-image.ts` appelle
Google avec la clé du projet : l'importer depuis un composant client
embarquerait ce code dans le bundle du navigateur.
