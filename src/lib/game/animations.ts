// Pure DOM animation helpers. Fire-and-forget — no callbacks, the caller
// schedules follow-up state transitions independently via the animation queue.

function findEl(id: string): HTMLElement | null {
  if (id === "enemy_hero" || id === "friendly_hero") {
    return document.querySelector(`[data-target-id="${id}"]`) as HTMLElement | null;
  }
  return document.querySelector(`[data-instance-id="${id}"]`) as HTMLElement | null;
}

/**
 * Lunge animation: the attacker briefly moves toward the target and springs
 * back. Runs for ~650ms. Safe to call on both the active and passive client
 * — nothing happens if either element is missing from the DOM.
 */
export function playAttackLunge(attackerInstanceId: string, targetId: string) {
  if (typeof window === "undefined") return;
  const attackerEl = findEl(attackerInstanceId);
  const targetEl = findEl(targetId);
  if (!attackerEl || !targetEl) return;

  const attackerRect = attackerEl.getBoundingClientRect();
  const targetRect = targetEl.getBoundingClientRect();
  const dx = (targetRect.left + targetRect.width / 2) - (attackerRect.left + attackerRect.width / 2);
  const dy = (targetRect.top + targetRect.height / 2) - (attackerRect.top + attackerRect.height / 2);

  const lungeX = dx * 0.6;
  const lungeY = dy * 0.6;

  const origZ = attackerEl.style.zIndex;
  attackerEl.style.zIndex = "50";

  const lunge = attackerEl.animate(
    [
      { transform: "translate(0, 0) scale(1)" },
      { transform: `translate(${lungeX}px, ${lungeY}px) scale(1.1)` },
    ],
    { duration: 300, easing: "cubic-bezier(0.2, 0, 0.6, 1)", fill: "forwards" }
  );

  lunge.onfinish = () => {
    const ret = attackerEl.animate(
      [
        { transform: `translate(${lungeX}px, ${lungeY}px) scale(1.1)` },
        { transform: "translate(0, 0) scale(1)" },
      ],
      { duration: 350, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "forwards" }
    );
    ret.onfinish = () => {
      lunge.cancel();
      ret.cancel();
      attackerEl.style.zIndex = origZ;
    };
  };
}
