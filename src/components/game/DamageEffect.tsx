"use client";

import { motion, AnimatePresence } from "framer-motion";

interface DamageEffectProps {
  amount: number | null;
}

export default function DamageEffect({ amount }: DamageEffectProps) {
  return (
    <AnimatePresence>
      {amount !== null && amount > 0 && (
        <motion.div
          key={amount + Math.random()}
          className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none"
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.9, ease: "easeOut" }}
        >
          {/* Flash overlay */}
          <motion.div
            className="absolute inset-0 rounded-lg bg-red-500/40"
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          />

          {/* Burst particles */}
          {[...Array(6)].map((_, i) => {
            const angle = (i / 6) * Math.PI * 2;
            const dx = Math.cos(angle) * 20;
            const dy = Math.sin(angle) * 20;
            return (
              <motion.div
                key={i}
                className="absolute w-1.5 h-1.5 rounded-full bg-orange-400"
                initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                animate={{ x: dx, y: dy, opacity: 0, scale: 0 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              />
            );
          })}

          {/* Damage number */}
          <motion.span
            className="text-2xl font-black text-red-500 drop-shadow-[0_0_6px_rgba(239,68,68,0.8)]"
            style={{ textShadow: "0 0 8px #ef4444, 0 1px 2px #000" }}
            initial={{ y: 0, scale: 1.5, opacity: 1 }}
            animate={{ y: -28, scale: 1, opacity: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            -{amount}
          </motion.span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
