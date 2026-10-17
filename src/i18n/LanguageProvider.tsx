import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  LanguageContext,
  type Language,
} from "./LanguageContext";

type Translations = Record<Language, Record<string, string>>;

type LanguageProviderProps = {
  children: ReactNode;
};

export function LanguageProvider({ children }: LanguageProviderProps) {
  const [language, setLanguage] = useState<Language>("nl");
  const [translations, setTranslations] = useState<Translations | null>(null);

  useEffect(() => {
    const translationsUrl = `${import.meta.env.BASE_URL}translations/translations.json`;

    fetch(translationsUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Could not load translations (${response.status}).`);
        }

        return response.json() as Promise<Translations>;
      })
      .then(setTranslations)
      .catch((error: unknown) => {
        console.error("Could not load translations.", error);
      });
  }, []);

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      t: (key: string) => translations?.[language][key] ?? key,
    }),
    [language, translations],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}
