// Pure DOM animation helpers. Fire-and-forget — no callbacks, the caller
// schedules follow-up state transitions independently via the animation queue.

import { findInstanceEl } from "@/lib/fx/overlayMotion";

function findEl(id: string): HTMLElement | null {
  if (id === "enemy_hero" || id === "friendly_hero") {
    return document.querySelector(`[data-target-id="${id}"]`) as HTMLElement | null;
  }
  // Prefer the on-board creature over any hand copy sharing this instanceId
  // (the lunge must animate the fighter on the board, not a card in hand).
  return findInstanceEl(id) as HTMLElement | null;
}

/**
 * Lunge animation with anticipation (wind-up) and follow-through (overshoot).
 * Three phases: pull back away from target → accelerate forward into the strike
 * (ease-IN, so it explodes into contact) → a brief freeze at the point of impact
 * (hit-stop) then recoil past home and settle. Total ~720ms. Safe to call on
 * both clients — no-op if either element is missing.
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
  const anticX = -dx * 0.08;
  const anticY = -dy * 0.08;
  const overshootX = -dx * 0.05;
  const overshootY = -dy * 0.05;
  // Tilt direction follows the horizontal of the strike — creatures lean into
  // the swing rather than yawing arbitrarily.
  const tilt = dx >= 0 ? 1 : -1;

  const origZ = attackerEl.style.zIndex;
  attackerEl.style.zIndex = "50";

  // Safety net: if the chain is interrupted before its final phase settles
  // (target removed mid-strike, element reconciled), the onfinish callbacks may
  // never run — restore the raised zIndex anyway so it can't stay stuck at 50.
  // Cleared as soon as finishAll runs on the normal path.
  let settled = false;
  const fallbackTimer = window.setTimeout(() => {
    if (settled) return;
    settled = true;
    attackerEl.style.zIndex = origZ;
  }, 900);

  const finishAll = (...anims: Animation[]) => {
    clearTimeout(fallbackTimer);
    if (settled) return;
    settled = true;
    for (const a of anims) a.cancel();
    attackerEl.style.zIndex = origZ;
  };

  // Phase 1: Anticipation — pull back, slight squat, lean away from target
  const antic = attackerEl.animate(
    [
      { transform: "translate(0, 0) scale(1) rotate(0deg)" },
      { transform: `translate(${anticX}px, ${anticY}px) scale(0.94) rotate(${tilt * -3}deg)` },
    ],
    { duration: 130, easing: "cubic-bezier(0.3, 0, 0.7, 0.5)", fill: "forwards" }
  );

  antic.onfinish = () => {
    // Phase 2: Lunge — explosive forward strike. Ease-IN dominant so the creature
    // ACCELERATES into the target (the old ease-out decelerated right at the
    // moment it should be hitting hardest, softening the impact).
    const lunge = attackerEl.animate(
      [
        { transform: `translate(${anticX}px, ${anticY}px) scale(0.94) rotate(${tilt * -3}deg)` },
        { transform: `translate(${lungeX}px, ${lungeY}px) scale(1.12) rotate(${tilt * 5}deg)` },
      ],
      { duration: 230, easing: "cubic-bezier(0.55, 0, 0.9, 0.35)", fill: "forwards" }
    );

    lunge.onfinish = () => {
      // Phase 3: Hit-stop then follow-through. The first ~12% holds the peak
      // pose (a ~45ms freeze at contact — even a few frames of stillness read as
      // real force), then it recoils past home and settles.
      const ret = attackerEl.animate(
        [
          { transform: `translate(${lungeX}px, ${lungeY}px) scale(1.12) rotate(${tilt * 5}deg)`, offset: 0 },
          { transform: `translate(${lungeX}px, ${lungeY}px) scale(1.12) rotate(${tilt * 5}deg)`, offset: 0.12 },
          { transform: `translate(${overshootX}px, ${overshootY}px) scale(0.97) rotate(${tilt * -1.5}deg)`, offset: 0.68 },
          { transform: "translate(0, 0) scale(1) rotate(0deg)", offset: 1 },
        ],
        { duration: 360, easing: "cubic-bezier(0.34, 1.2, 0.4, 1)", fill: "forwards" }
      );

      ret.onfinish = () => finishAll(antic, lunge, ret);
    };
  };
}
