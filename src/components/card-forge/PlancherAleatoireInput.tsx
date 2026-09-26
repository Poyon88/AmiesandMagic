"use client";

/** Champ « A » d'un coût au hasard : plancher du tirage, qui devient
 *  « entre A et X » au lieu de « entre 1 et X ». Affiché à côté de la case
 *  « ? » quand elle est cochée, dans les trois éditeurs (forge, CardEditor,
 *  effets composés).
 *
 *  Borné à [1, X] à la saisie ; 1 est la valeur neutre et se rend `undefined`,
 *  pour ne rien persister quand l'auteur n'a pas posé de plancher. */
export default function PlancherAleatoireInput({
  value, plafond, onChange, title,
}: {
  value: number | undefined;
  plafond: number;
  onChange: (next: number | undefined) => void;
  title: string;
}) {
  return (
    <label
      title={title}
      style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 9, color: "#b3541e", fontWeight: 700 }}
    >
      A
      <input
        type="number" min={1} max={plafond}
        value={Math.min(Math.max(1, value ?? 1), plafond)}
        onChange={(e) => {
          const n = Math.min(Math.max(1, parseInt(e.target.value) || 1), plafond);
          onChange(n > 1 ? n : undefined);
        }}
        style={{ width: 34, padding: "1px 2px", borderRadius: 4, border: "1px solid #b3541e66", fontSize: 10, textAlign: "center" }}
      />
    </label>
  );
}
