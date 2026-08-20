// Catalogue des modèles d'image PROPOSABLES À LA MAIN dans la forge.
//
// Module à part, et non exporté depuis `generate-image.ts` : ce dernier appelle
// l'API Google avec la clé du projet, et l'importer depuis un composant client
// embarquerait ce code dans le bundle du navigateur. Ici, il n'y a que des noms.
//
// Relevé le 2026-08-20 sur la clé du projet : ce sont les SEULS modèles d'image
// qu'elle expose. Aucun Imagen n'y figure — c'est la raison pour laquelle le
// chemin haute résolution retombe toujours sur Gemini, en silence. Imagen 4
// Ultra reste proposé ici pour pouvoir le CONSTATER depuis la forge (il
// répondra par une erreur explicite tant que la clé n'y a pas accès).
//
// Noms STABLES (sans `-preview`) : les alias de prévisualisation existent aussi
// mais n'ont pas leur place dans un choix d'auteur.
export const SELECTABLE_IMAGE_MODELS = [
  { id: 'gemini-3-pro-image', label: 'Nano Banana Pro (3 Pro)' },
  { id: 'gemini-3.1-flash-image', label: 'Nano Banana 2 (3.1 Flash)' },
  { id: 'gemini-3.1-flash-lite-image', label: 'Nano Banana 2 Lite' },
  { id: 'gemini-2.5-flash-image', label: 'Nano Banana (2.5 Flash)' },
  { id: 'imagen-4.0-ultra-generate-001', label: 'Imagen 4 Ultra (2K, si accessible)' },
] as const;
