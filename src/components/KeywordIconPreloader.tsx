"use client";

import { useEffect } from "react";
import { useKeywordIconStore } from "@/lib/store/keywordIconStore";

/**
 * Loads the forge keyword-icon overrides ONCE at app root so every view has
 * them before its first KeywordIcon mounts. Without this, the store was only
 * fetched lazily by the first KeywordIcon to render — leaving a window where
 * icons paint their hard-coded base symbol instead of the forge override (and
 * some views never triggered the fetch at all). Idempotent: the store guards
 * against a second fetch via its `loaded` flag.
 */
export default function KeywordIconPreloader() {
  const fetchOverrides = useKeywordIconStore((s) => s.fetchOverrides);
  useEffect(() => {
    fetchOverrides();
  }, [fetchOverrides]);
  return null;
}
