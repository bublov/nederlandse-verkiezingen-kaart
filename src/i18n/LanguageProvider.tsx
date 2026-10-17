import { useEffect, useMemo, useState, type ReactNode } from "react";
import { LanguageContext } from "./LanguageContext";
import {
  loadTranslations,
  type Language,
  type TranslationKey,
  type Translations,
} from "./translations";

type LanguageProviderProps = {
  children: ReactNode;
};

export function LanguageProvider({ children }: LanguageProviderProps) {
  const [language, setLanguage] = useState<Language>("nl");
  const [translations, setTranslations] = useState<Translations | null>(null);

  useEffect(() => {
    loadTranslations()
      .then(setTranslations)
      .catch((error: unknown) => {
        console.error("Could not load translations.", error);
      });
  }, []);

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      t: (key: TranslationKey) => translations?.[language][key] ?? key,
    }),
    [language, translations],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}
