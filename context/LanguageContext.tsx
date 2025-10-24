import React, { createContext, useState, useEffect, ReactNode, useCallback } from 'react';

type Language = 'en' | 'es';
type Translations = Record<string, string>;

interface LanguageContextType {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: string, replacements?: Record<string, string | number>) => string;
}

export const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>('en');
  const [translations, setTranslations] = useState<Record<Language, Translations> | null>(null);

  useEffect(() => {
    const fetchTranslations = async () => {
      try {
        const [enResponse, esResponse] = await Promise.all([
          fetch('/locales/en.json'),
          fetch('/locales/es.json'),
        ]);

        if (!enResponse.ok || !esResponse.ok) {
          throw new Error(`HTTP error! status: ${enResponse.status} & ${esResponse.status}`);
        }

        const enData = await enResponse.json();
        const esData = await esResponse.json();

        setTranslations({ en: enData, es: esData });
      } catch (error) {
        console.error("Failed to load translation files:", error);
        // Fallback to empty translations to prevent app crash
        setTranslations({ en: {}, es: {} });
      }
    };

    fetchTranslations();
  }, []);

  useEffect(() => {
    const browserLang = navigator.language.split('-')[0];
    if (browserLang === 'es') {
      setLanguage('es');
    }
  }, []);

  const t = useCallback((key: string, replacements: Record<string, string | number> = {}): string => {
    if (!translations) {
      return key; // Return key as a fallback if translations are not loaded
    }
    let translation = translations[language]?.[key] || key;
    Object.keys(replacements).forEach(placeholder => {
      const regex = new RegExp(`{${placeholder}}`, 'g');
      translation = translation.replace(regex, String(replacements[placeholder]));
    });
    return translation;
  }, [language, translations]);
  
  // Render children immediately, without waiting for translations to load.
  // This prevents unmounting/remounting the app, which can cause loading issues.
  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};
