"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";

export interface FireBreathEvent {
  attackerInstanceId: string;
  timestamp: number;
}

interface FireBreathOverlayProps {
  event: FireBreathEvent | null;
  onComplete: () => void;
}

export default function FireBreathOverlay({ event, onComplete }: FireBreathOverlayProps) {
  const [mounted, setMounted] = useState(false);
  const [sourcePos, setSourcePos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!event) return;

    // Get attacker position
    const attackerEl = document.querySelector(
      `[data-instance-id="${event.attackerInstanceId}"]`
    );
    if (attackerEl) {
      const rect = attackerEl.getBoundingClientRect();
      setSourcePos({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    } else {
      setSourcePos({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    }

    const timer = setTimeout(onComplete, 2200);
    return () => clearTimeout(timer);
  }, [event, onComplete]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {event && sourcePos && (
        <motion.div
          key={event.timestamp}
          style={{
            position: "fixed",
            inset: 0,
            pointerEvents: "none",
            zIndex: 95,
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Full-screen fire tint flash */}
          <motion.div
            style={{
              position: "absolute",
              inset: 0,
              background: "radial-gradient(ellipse at center 30%, rgba(255, 100, 0, 0.3) 0%, rgba(255, 50, 0, 0.1) 40%, transparent 70%)",
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.8, 0.4, 0] }}
            transition={{ duration: 1.8, times: [0, 0.15, 0.5, 1] }}
          />

          {/* Fire cone expanding from attacker toward opponent board */}
          <motion.div
            style={{
              position: "absolute",
              left: sourcePos.x,
              top: sourcePos.y,
              width: 0,
              height: 0,
              transformOrigin: "center center",
            }}
          >
            {/* Central fire burst */}
            <motion.div
              style={{
                position: "absolute",
                left: -60,
                top: -60,
                width: 120,
                height: 120,
                borderRadius: "50%",
                background: "radial-gradient(circle, rgba(255, 200, 50, 0.9) 0%, rgba(255, 100, 0, 0.6) 40%, rgba(255, 50, 0, 0.3) 70%, transparent 100%)",
                boxShadow: "0 0 40px 20px rgba(255, 100, 0, 0.4)",
              }}
              initial={{ scale: 0.3, opacity: 0 }}
              animate={{ scale: [0.3, 1.5, 2.5], opacity: [0, 1, 0] }}
              transition={{ duration: 1.2, times: [0, 0.3, 1], ease: "easeOut" }}
            />

            {/* Dragon emoji label */}
            <motion.div
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                transform: "translate(-50%, -50%)",
                textAlign: "center",
              }}
              initial={{ scale: 0.5, opacity: 0, y: 10 }}
              animate={{ scale: [0.5, 1.2, 1], opacity: [0, 1, 1, 0], y: [10, -20, -30, -60] }}
              transition={{ duration: 2, times: [0, 0.15, 0.5, 1], ease: "easeOut" }}
            >
              <div
                style={{
                  fontSize: "2.5rem",
                  filter: "drop-shadow(0 0 12px rgba(255, 100, 0, 0.9))",
                }}
              >
                🐲
              </div>
              <div
                style={{
                  fontSize: "1rem",
                  fontWeight: 800,
                  color: "#ffd700",
                  textShadow: "0 0 12px rgba(255, 100, 0, 0.9), 0 0 24px rgba(255, 50, 0, 0.6), 0 2px 4px rgba(0,0,0,0.8)",
                  whiteSpace: "nowrap",
                  letterSpacing: "0.05em",
                }}
              >
                Souffle de Feu
              </div>
            </motion.div>

            {/* Fire wave particles spreading horizontally across opponent board */}
            {[...Array(20)].map((_, i) => {
              const spread = (i / 20) * Math.PI - Math.PI / 2; // -90° to +90° spread
              const radius = 100 + Math.random() * 200;
              const dx = Math.cos(spread) * radius * 1.5;
              // Fire goes upward (toward opponent board which is above)
              const dy = -Math.abs(Math.sin(spread) * radius) - 40 - Math.random() * 80;
              const size = 8 + Math.random() * 12;
              const hue = Math.random() * 40; // 0-40 = red to orange-yellow
              return (
                <motion.div
                  key={`fire-${i}`}
                  style={{
                    position: "absolute",
                    width: size,
                    height: size,
                    borderRadius: "50%",
                    background: `hsl(${hue}, 100%, ${55 + Math.random() * 20}%)`,
                    left: -size / 2,
                    top: -size / 2,
                    boxShadow: `0 0 ${size}px hsl(${hue}, 100%, 50%), 0 0 ${size * 2}px rgba(255, 100, 0, 0.3)`,
                    filter: "blur(1px)",
                  }}
                  initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
                  animate={{
                    x: dx,
                    y: dy,
                    opacity: [0, 1, 0.8, 0],
                    scale: [0, 1.5, 1, 0],
                  }}
                  transition={{
                    duration: 0.8 + Math.random() * 0.6,
                    ease: "easeOut",
                    delay: 0.05 + i * 0.03,
                  }}
                />
              );
            })}

            {/* Ember / ash particles rising */}
            {[...Array(12)].map((_, i) => {
              const xSpread = (Math.random() - 0.5) * 300;
              const yEnd = -(60 + Math.random() * 200);
              const size = 3 + Math.random() * 5;
              return (
                <motion.div
                  key={`ember-${i}`}
                  style={{
                    position: "absolute",
                    width: size,
                    height: size,
                    borderRadius: "50%",
                    background: `hsl(${Math.random() * 30 + 10}, 100%, ${60 + Math.random() * 20}%)`,
                    left: -size / 2,
                    top: -size / 2,
                    boxShadow: "0 0 6px rgba(255, 150, 0, 0.6)",
                  }}
                  initial={{ x: 0, y: 0, opacity: 0, scale: 1 }}
                  animate={{
                    x: xSpread,
                    y: yEnd,
                    opacity: [0, 1, 0.6, 0],
                    scale: [0.5, 1, 0.5],
                  }}
                  transition={{
                    duration: 1.2 + Math.random() * 0.6,
                    ease: "easeOut",
                    delay: 0.2 + Math.random() * 0.3,
                  }}
                />
              );
            })}

            {/* Expanding fire ring */}
            <motion.div
              style={{
                position: "absolute",
                left: -50,
                top: -50,
                width: 100,
                height: 100,
                borderRadius: "50%",
                border: "3px solid rgba(255, 150, 0, 0.8)",
                boxShadow: "0 0 20px rgba(255, 100, 0, 0.5), inset 0 0 20px rgba(255, 100, 0, 0.2)",
              }}
              initial={{ scale: 0.3, opacity: 1 }}
              animate={{ scale: 4, opacity: 0 }}
              transition={{ duration: 1.2, ease: "easeOut", delay: 0.1 }}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
