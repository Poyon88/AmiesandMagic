// Pure DOM animation helpers. Fire-and-forget — no callbacks, the caller
// schedules follow-up state transitions independently via the animation queue.

function findEl(id: string): HTMLElement | null {
  if (id === "enemy_hero" || id === "friendly_hero") {
    return document.querySelector(`[data-target-id="${id}"]`) as HTMLElement | null;
  }
  return document.querySelector(`[data-instance-id="${id}"]`) as HTMLElement | null;
}

/**
 * Lunge animation with anticipation (wind-up) and follow-through (overshoot).
 * Three phases: pull back away from target → lunge forward + tilt → return with
 * a slight backwards overshoot then settle. Total ~660ms. Safe to call on both
 * clients — no-op if either element is missing.
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

  const finishAll = (...anims: Animation[]) => {
    for (const a of anims) a.cancel();
    attackerEl.style.zIndex = origZ;
  };

  // Phase 1: Anticipation — pull back, slight squat, lean away from target
  const antic = attackerEl.animate(
    [
      { transform: "translate(0, 0) scale(1) rotate(0deg)" },
      { transform: `translate(${anticX}px, ${anticY}px) scale(0.94) rotate(${tilt * -3}deg)` },
    ],
    { duration: 110, easing: "cubic-bezier(0.4, 0, 0.6, 1)", fill: "forwards" }
  );

  antic.onfinish = () => {
    // Phase 2: Lunge — explosive forward strike with scale-up and forward lean
    const lunge = attackerEl.animate(
      [
        { transform: `translate(${anticX}px, ${anticY}px) scale(0.94) rotate(${tilt * -3}deg)` },
        { transform: `translate(${lungeX}px, ${lungeY}px) scale(1.12) rotate(${tilt * 5}deg)` },
      ],
      { duration: 230, easing: "cubic-bezier(0.2, 0, 0.4, 1)", fill: "forwards" }
    );

    lunge.onfinish = () => {
      // Phase 3: Follow-through — recoil past the home position, then settle
      const ret = attackerEl.animate(
        [
          { transform: `translate(${lungeX}px, ${lungeY}px) scale(1.12) rotate(${tilt * 5}deg)`, offset: 0 },
          { transform: `translate(${overshootX}px, ${overshootY}px) scale(0.97) rotate(${tilt * -1.5}deg)`, offset: 0.65 },
          { transform: "translate(0, 0) scale(1) rotate(0deg)", offset: 1 },
        ],
        { duration: 320, easing: "cubic-bezier(0.34, 1.2, 0.4, 1)", fill: "forwards" }
      );

      ret.onfinish = () => finishAll(antic, lunge, ret);
    };
  };
}
