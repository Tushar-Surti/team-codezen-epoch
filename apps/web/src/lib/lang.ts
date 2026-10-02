/** Client-side mirror of retent_core.text.detect_language, for live feedback while typing.
 *  Markers that are also English words ("to", "main", …) are left out, as in AMBIGUOUS_MARKERS. */
const HINGLISH = new Set(
  "hai hain kya nahi nahin aur toh ki ke mein yeh woh bhai acha accha kaise kyun kyunki lekin matlab dekho yaar bhi hum aap apna apne isme iska uska karo karna raha rahe rahi gaya gayi tha thi chahiye wala wali abhi".split(" "),
);

export type Lang = "en" | "hi" | "hinglish";

export function detectLanguage(text: string): Lang {
  const letters = [...text].filter((c) => /\p{L}/u.test(c));
  if (!letters.length) return "en";
  const deva = letters.filter((c) => /[ऀ-ॿ]/.test(c)).length / letters.length;
  if (deva > 0.3) return "hi";
  const toks = text.toLowerCase().match(/[a-z]+/g) ?? [];
  if (toks.length && toks.filter((t) => HINGLISH.has(t)).length / toks.length > 0.08) return "hinglish";
  return "en";
}

const WPS: Record<Lang, number> = { en: 2.6, hi: 2.4, hinglish: 2.6 };

export function wordCount(text: string): number {
  return (text.match(/[ऀ-ॿ]+|[A-Za-z]+(?:'[A-Za-z]+)?|\d+/g) ?? []).length;
}

export function estimateSeconds(text: string, lang: Lang): number {
  return wordCount(text) / WPS[lang];
}
