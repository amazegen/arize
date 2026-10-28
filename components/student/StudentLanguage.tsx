"use client";

import {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
} from "react";
import type { Bilingual, StudentLanguage } from "@/lib/student/learning";

const key = "arize-student-language";
const event = "arize-student-language-change";
let memoryLanguage: StudentLanguage = "en";
function subscribe(listener: () => void) {
  window.addEventListener(event, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(event, listener);
    window.removeEventListener("storage", listener);
  };
}
function getLanguage(): StudentLanguage {
  try {
    const stored = localStorage.getItem(key);
    return stored === "es" ? "es" : stored === "en" ? "en" : memoryLanguage;
  } catch {
    return memoryLanguage;
  }
}
const Language = createContext({
  language: "en" as StudentLanguage,
  setLanguage: (language: StudentLanguage) => {
    void language;
  },
  t: (english: string, spanish: string) => {
    void spanish;
    return english;
  },
  text: (value: Bilingual) => value.en,
});
export function StudentLanguageProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const language = useSyncExternalStore(
    subscribe,
    getLanguage,
    () => "en" as StudentLanguage,
  );
  const setLanguage = useCallback((next: StudentLanguage) => {
    memoryLanguage = next;
    try {
      localStorage.setItem(key, next);
    } catch {
      /* Private/school browsers may block storage. */
    }
    window.dispatchEvent(new Event(event));
  }, []);
  const t = useCallback(
    (english: string, spanish: string) =>
      language === "es" ? spanish : english,
    [language],
  );
  const text = useCallback((value: Bilingual) => value[language], [language]);
  return (
    <Language.Provider value={{ language, setLanguage, t, text }}>
      {children}
    </Language.Provider>
  );
}
export const useStudentLanguage = () => useContext(Language);
export function StudentLanguageSwitch() {
  const { language, setLanguage, t } = useStudentLanguage();
  return (
    <label className="student-language-switch">
      <span>{t("Language", "Idioma")}</span>
      <select
        aria-label={t("Language", "Idioma")}
        value={language}
        onChange={(e) => setLanguage(e.target.value === "es" ? "es" : "en")}
      >
        <option value="en">English</option>
        <option value="es">Español</option>
      </select>
    </label>
  );
}
