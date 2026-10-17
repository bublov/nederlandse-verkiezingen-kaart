export type Language = "nl" | "en";

export type TranslationKey =
  | "election"
  | "electionType"
  | "electionSelection"
  | "language"
  | "dutch"
  | "english"
  | "general"
  | "loadingElections"
  | "loadElectionsError";

export type Translations = Record<
  Language,
  Record<TranslationKey, string>
>;

const translationsUrl = `${import.meta.env.BASE_URL}translation/translations.json`;

export async function loadTranslations(): Promise<Translations> {
  const response = await fetch(translationsUrl);

  if (!response.ok) {
    throw new Error(`Could not load translations (${response.status}).`);
  }

  return (await response.json()) as Translations;
}
