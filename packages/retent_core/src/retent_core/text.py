"""Text handling for English, Hindi (Devanagari) and Hinglish (romanized, code-mixed).

Covers language detection, tokenization, sentence segmentation for scripts and for unpunctuated
ASR captions, speaking-rate timing estimates, and the cue lexicons the detectors use.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

from retent_core.contract import Language

DEVANAGARI = re.compile(r"[ऀ-ॿ]")
TOKEN = re.compile(r"[ऀ-ॿ]+|[A-Za-z]+(?:'[A-Za-z]+)?|\d+(?:[.,]\d+)?")
SENT_END = re.compile(r"(?<=[.!?।॥])\s+|\n+")

# Frequent romanized-Hindi function words; their density separates Hinglish from English.
HINGLISH_MARKERS = {
    "hai", "hain", "ho", "kya", "nahi", "nahin", "aur", "toh", "to", "ki", "ka", "ke", "mein", "main",
    "yeh", "ye", "woh", "wo", "bhai", "acha", "accha", "kaise", "kyun", "kyunki", "lekin", "matlab",
    "dekho", "yaar", "bhi", "hum", "aap", "apna", "apne", "isme", "iska", "uska", "kar", "karo", "karna",
    "raha", "rahe", "rahi", "gaya", "gayi", "tha", "thi", "the", "chahiye", "wala", "wali", "abhi",
    "bahut", "sabse", "hoon", "hun", "kuch", "sab", "bhaiya", "doston", "dosto", "aaj", "phir", "baat",
    "lagta", "lagti", "milta", "milti", "thoda", "thodi", "zyada", "achhi", "achha", "theek", "hai,",
}
# Markers that are also common English words. They stay stopwords but don't count as Hinglish
# evidence, otherwise ordinary English ("the", "to") crosses the threshold on its own.
AMBIGUOUS_MARKERS = {"the", "to", "main", "ho", "hun", "sab", "wo", "ye", "ka", "kar"}

# Speaking rates in words per second. Defaults only; retent_ml calibrates them per language and
# category from caption timings and writes models/speaking_rates.json, which overrides these.
DEFAULT_WPS = {Language.en: 2.6, Language.hi: 2.4, Language.hinglish: 2.6}

FILLERS = {
    "um", "uh", "erm", "hmm", "basically", "actually", "literally", "like", "obviously", "honestly",
    "matlab", "toh", "acha", "accha", "dekho", "yaar", "haan", "na", "bas",
    "मतलब", "तो", "अच्छा", "देखो", "यार", "हां", "हाँ", "ना", "बस",
}
FILLER_PHRASES = ("you know", "i mean", "sort of", "kind of", "so yeah", "and stuff", "aisa hai ki")

CTA_CUES = (
    "subscribe", "bell icon", "hit the like", "like this video", "like button", "comment below",
    "link in the description", "links in the description", "check out my", "follow me on",
    "subscribe kar", "channel ko subscribe", "like kar", "सब्सक्राइब", "बेल आइकन", "लाइक कर",
)
SPONSOR_CUES = (
    "sponsored by", "sponsor of", "thanks to", "brought to you by", "use code", "promo code", "discount code",
    "partnered with", "is sponsored", "special offer", "affiliate link", "स्पॉन्सर",
)
OUTRO_CUES = (
    "that's it for", "that's all for", "that's about it", "thanks for watching", "thank you for watching",
    "see you in the next", "see you next time", "in conclusion", "to wrap up", "to sum up", "wrapping up",
    "that's basically it", "so that's it", "milte hain", "agle video", "aaj ke liye bas", "itna hi tha",
    "आज के लिए इतना", "अगले वीडियो", "मिलते हैं",
    "that's basically the", "that's all i have", "hope you found this useful", "hope you enjoyed this video",
    "hope you liked this video", "bas itna hi", "umeed hai aapko video", "बस इतना ही", "इतना ही था",
    "उम्मीद है आपको वीडियो", "उम्मीद है आपको ये वीडियो",
)
GREETING_CUES = (
    "hey guys", "hi guys", "hello guys", "what's up guys", "welcome back", "welcome to my channel",
    "namaste doston", "namaskar doston", "kaise ho", "kya haal", "नमस्ते", "नमस्कार", "दोस्तों",
    "hello doston", "hey everyone", "hi everyone", "hello everyone",
)
HOOK_CUES = (
    "in this video", "by the end of this video", "today", "i'm going to show", "i'll show you", "you won't believe",
    "the truth", "the real reason", "here's why", "the problem is", "what if", "nobody tells you", "secret",
    "mistake", "is video mein", "aaj hum", "aaj main", "is video me", "इस वीडियो में", "आज हम",
)
LOOP_OPEN_CUES = (
    "later in this video", "stay till the end", "watch till the end", "at the end of this video",
    "i'll show you in a", "we'll get to that", "more on that later", "i'll come back to", "in a minute",
    "end tak", "aage bataunga", "baad mein bataunga", "aage batata", "आगे बताऊंगा", "अंत तक",
)
LOOP_CLOSE_CUES = (
    "as i promised", "as promised", "like i said", "remember when i said", "here it is", "finally",
    "jaisa maine kaha", "jaisa promise", "जैसा मैंने कहा",
)

PAYOFF_CUES = (
    "final verdict", "verdict", "my pick", "my personal pick", "the winner", "winner is", "in conclusion", "overall",
    "the answer is", "so which one", "bottom line", "should you buy", "mera pick", "mera personal pick",
    "final faisla", "jeet", "निष्कर्ष", "मेरा पिक", "फाइनल वर्डिक्ट",
)

# Rules-only fallback lines, used when no LLM is available to write a fix in the creator's voice.
TEMPLATES = {
    "tease": {
        "en": "Stick around: by the end you'll know exactly which one wins, and the answer surprised me.",
        "hinglish": "Video ke end tak aapko clear ho jayega kaunsa jeetta hai, aur result ne mujhe bhi surprise kiya.",
        "hi": "वीडियो के अंत तक आपको साफ़ पता चल जाएगा कि कौन जीतता है, और नतीजे ने मुझे भी चौंकाया।",
    },
    "bridge": {
        "en": "But we're not done: the part that actually decides this is still coming.",
        "hinglish": "Par abhi khatam nahi hua, jo cheez actually decide karegi woh abhi baaki hai.",
        "hi": "लेकिन अभी खत्म नहीं हुआ, जो चीज़ असल में फ़ैसला करेगी वो अभी बाकी है।",
    },
}

STOPWORDS = {
    "the", "a", "an", "and", "or", "but", "so", "to", "of", "in", "on", "for", "with", "is", "are", "was",
    "were", "be", "been", "it", "this", "that", "these", "those", "i", "you", "we", "they", "he", "she",
    "my", "your", "our", "their", "me", "us", "them", "at", "by", "from", "as", "if", "then", "than",
    "do", "does", "did", "have", "has", "had", "not", "no", "yes", "can", "will", "just", "about", "what",
    "how", "why", "when", "where", "which", "who", "all", "very", "really", "also", "there", "here",
    "its", "it's", "i'm", "don't", "now", "get", "got", "go", "going", "one", "out", "up", "more",
} | HINGLISH_MARKERS | FILLERS | {"है", "हैं", "का", "की", "के", "में", "और", "को", "से", "पर", "यह", "ये", "वो", "भी"}


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFC", text)
    text = re.sub(r"\[(?:music|applause|laughter|संगीत)\]", " ", text, flags=re.I)
    return re.sub(r"\s+", " ", text).strip()


def tokens(text: str) -> list[str]:
    return [t.lower() for t in TOKEN.findall(text)]


def content_tokens(text: str) -> list[str]:
    return [t for t in tokens(text) if t not in STOPWORDS and len(t) > 1 and not t.isdigit()]


def detect_language(text: str) -> Language:
    letters = [c for c in text if c.isalpha()]
    if not letters:
        return Language.en
    deva = sum(1 for c in letters if DEVANAGARI.match(c)) / len(letters)
    if deva > 0.3:
        return Language.hi
    toks = [t for t in tokens(text) if not DEVANAGARI.match(t)]
    if toks and sum(t in HINGLISH_MARKERS and t not in AMBIGUOUS_MARKERS for t in toks) / len(toks) > 0.08:
        return Language.hinglish
    return Language.en


def has_cue(text: str, cues: tuple[str, ...]) -> bool:
    low = text.lower()
    return any(c in low for c in cues)


@dataclass
class RawSentence:
    text: str
    start: float | None = None
    end: float | None = None


def split_script(script: str) -> list[RawSentence]:
    """Split a written script into sentences (punctuation, danda, or line breaks)."""
    parts = [normalize(p) for p in SENT_END.split(script)]
    out: list[RawSentence] = []
    for p in parts:
        if not p:
            continue
        # Very long unpunctuated runs (pasted transcripts) are chunked by word count.
        words = p.split()
        for i in range(0, len(words), 28):
            out.append(RawSentence(" ".join(words[i : i + 28])))
    return out


def merge_caption_segments(
    segments: list[dict], max_words: int = 22, max_seconds: float = 9.0, pause: float = 0.7
) -> list[RawSentence]:
    """Group unpunctuated ASR caption events into sentence-like units using pauses and length."""
    out: list[RawSentence] = []
    buf: list[str] = []
    start = end = None
    for seg in segments:
        text = normalize(seg["text"])
        if not text:
            continue
        s, e = float(seg["start"]), float(seg["end"])
        gap = s - end if end is not None else 0.0
        n_words = sum(len(b.split()) for b in buf)
        if buf and (gap > pause or n_words >= max_words or (start is not None and s - start > max_seconds)
                    or re.search(r"[.!?।]$", buf[-1])):
            out.append(RawSentence(" ".join(buf), start, end))
            buf, start = [], None
        buf.append(text)
        start = s if start is None else start
        end = max(e, s)
    if buf:
        out.append(RawSentence(" ".join(buf), start, end))
    return out


def estimate_seconds(text: str, lang: Language, wps: dict[Language, float] | None = None) -> float:
    rate = (wps or DEFAULT_WPS).get(lang, 2.5)
    n = max(1, len(tokens(text)))
    pause = 0.35 if re.search(r"[.!?।]$", text.strip()) else 0.15
    return n / rate + pause


def fmt_time(seconds: float) -> str:
    seconds = max(0, int(round(seconds)))
    return f"{seconds // 60}:{seconds % 60:02d}"
