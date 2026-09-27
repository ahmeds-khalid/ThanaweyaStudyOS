"use client";

import { useCallback } from "react";
import { useDataStore } from "../store/data";
import { ar } from "./ar";
import { en, type TranslationKey } from "./en";

export type Language = "en" | "ar";
export type { TranslationKey };

const dictionaries: Record<Language, Partial<Record<TranslationKey, string>>> = { en, ar };

export function translate(lang: Language, key: TranslationKey): string {
  return dictionaries[lang][key] ?? en[key] ?? key;
}

export const isRtl = (lang: Language) => lang === "ar";

export function useLanguage(): Language {
  return useDataStore((s) => s.settings.general.language);
}

/** Translation hook. Unknown/missing Arabic keys fall back to English. */
export function useT() {
  const lang = useLanguage();
  return useCallback((key: TranslationKey) => translate(lang, key), [lang]);
}
