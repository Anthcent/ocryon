/** Idiomas soportados (códigos de 3 letras, compatibles con OCR.space y Tesseract). */
export const LANGUAGES: Record<string, string> = {
  spa: 'español',
  eng: 'inglés',
  por: 'portugués',
  fre: 'francés',
  ger: 'alemán',
  ita: 'italiano',
};

export const languageCodes = Object.keys(LANGUAGES) as [string, ...string[]];
