#!/usr/bin/env python3
"""Build data/words-tr.txt and data/common-tr.json from openly licensed sources.

Sources (see data/LICENSES.md):
  * zemberek-nlp master-dictionary.dict + non-tdk.dict   (Apache-2.0)  -> lemmas, stems, attributes
  * hermitdave/FrequencyWords tr_full.txt + tr_50k.txt    (CC BY-SA 4.0) -> frequencies, inflected forms
  * hermitdave/FrequencyWords en_50k.txt                  (CC BY-SA 4.0) -> only used to drop English
                                                                           tokens that leak from subtitles

words-tr.txt = every lemma/stem + corpus forms that (a) occur often enough, (b) reduce to a
known stem by stripping Turkish suffixes with vowel harmony, (c) are not English words,
elongations or vowel-less strings.

Usage:  python3 tools/build-words.py            (downloads sources into tools/cache/)
        python3 tools/build-words.py --min-count 20 --min-count-simple 8 --common 600,900,900
"""
import argparse
import itertools
import json
import os
import re
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CACHE = os.path.join(HERE, 'cache')

ZEMBEREK = 'https://raw.githubusercontent.com/ahmetaa/zemberek-nlp/037202c7e18b977c95181a76db05cb1e95846554/morphology/src/main/resources/tr/'
HERMIT = 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/'
SOURCES = {
    'master-dictionary.dict': ZEMBEREK + 'master-dictionary.dict',
    'non-tdk.dict': ZEMBEREK + 'non-tdk.dict',
    'tr_full.txt': HERMIT + 'tr/tr_full.txt',
    'tr_50k.txt': HERMIT + 'tr/tr_50k.txt',
    'en_50k.txt': HERMIT + 'en/en_50k.txt',
}

LETTERS_RE = re.compile(r'^[abcçdefgğhıijklmnoöprsştuüvyz]+$')
ELONGATION_RE = re.compile(r'(.)\1\1')
VOWELS = 'aeıioöuü'
BACK = 'aıou'
ROUNDED = 'oöuü'


def fetch(name):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        print(f'indiriliyor: {SOURCES[name]}', file=sys.stderr)
        with urllib.request.urlopen(SOURCES[name]) as r, open(path, 'wb') as f:
            f.write(r.read())
    return path


def fold(word):
    return word.replace('â', 'a').replace('î', 'i').replace('û', 'u').lower()


ASCII_TWINS = {'c': 'cç', 'g': 'gğ', 'i': 'iı', 'o': 'oö', 's': 'sş', 'u': 'uü'}


def turkish_twin(word, freq):
    """The most frequent spelling of `word` with Turkish letters put back (degil -> değil), or None."""
    if any(ch in 'çğıöşü' for ch in word):
        return None
    slots = [ASCII_TWINS.get(ch, ch) for ch in word]
    n = 1
    for s in slots:
        n *= len(s)
    if n > 4096:
        return None
    best = None
    for combo in itertools.product(*slots):
        cand = ''.join(combo)
        if cand != word and cand in freq and (best is None or freq[cand] > freq[best]):
            best = cand
    return best


def tr_lower(s):
    return s.replace('I', 'ı').replace('İ', 'i').lower()


def has_vowel(w):
    return any(ch in VOWELS for ch in w)


def last_vowel(w):
    for ch in reversed(w):
        if ch in VOWELS:
            return ch
    return None


def parse_dict(path):
    """Yield (lemma, pos, attrs:set) from a zemberek .dict file."""
    with open(path, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            lemma, _, rest = line.partition('[')
            lemma = fold(tr_lower(lemma.strip()))
            pos = None  # no P: tag means Noun, except -mak/-mek infinitives which are verbs
            attrs = set()
            if rest:
                for group in rest.rstrip(']').split(';'):
                    key, _, value = group.strip().partition(':')
                    if key == 'P':
                        pos = value.strip()
                    elif key == 'A':
                        attrs = {a.strip() for a in value.split(',')}
            if pos is None:
                pos = 'Verb' if lemma.endswith(('mak', 'mek')) else 'Noun'
            yield lemma, pos, attrs


# ---------------------------------------------------------------- suffix stripping
NOMINAL = [
    'lar', 'ler', 'ı', 'i', 'u', 'ü', 'yı', 'yi', 'yu', 'yü', 'ın', 'in', 'un', 'ün', 'nın', 'nin', 'nun', 'nün',
    'a', 'e', 'ya', 'ye', 'na', 'ne', 'da', 'de', 'ta', 'te', 'nda', 'nde', 'dan', 'den', 'tan', 'ten', 'ndan', 'nden',
    'la', 'le', 'yla', 'yle', 'm', 'ım', 'im', 'um', 'üm', 'mız', 'miz', 'muz', 'müz', 'ımız', 'imiz', 'umuz', 'ümüz',
    'n', 'nız', 'niz', 'nuz', 'nüz', 'ınız', 'iniz', 'unuz', 'ünüz', 'sı', 'si', 'su', 'sü', 'ki', 'ndaki', 'daki', 'deki', 'taki', 'teki',
    'lık', 'lik', 'luk', 'lük', 'lığ', 'liğ', 'luğ', 'lüğ', 'cı', 'ci', 'cu', 'cü', 'çı', 'çi', 'çu', 'çü', 'lı', 'li', 'lu', 'lü',
    'sız', 'siz', 'suz', 'süz', 'ca', 'ce', 'ça', 'çe', 'daş', 'deş', 'taş', 'teş', 'dır', 'dir', 'dur', 'dür', 'tır', 'tir', 'tur', 'tür',
    'ken', 'yken', 'yım', 'yim', 'yum', 'yüm', 'sın', 'sin', 'sun', 'sün', 'yız', 'yiz', 'yuz', 'yüz', 'ız', 'iz', 'uz', 'üz',
    'sınız', 'siniz', 'sunuz', 'sünüz', 'ydı', 'ydi', 'ydu', 'ydü', 'dı', 'di', 'du', 'dü', 'tı', 'ti', 'tu', 'tü',
    'ymış', 'ymiş', 'ymuş', 'ymüş', 'mış', 'miş', 'muş', 'müş', 'ysa', 'yse', 'sa', 'se', 'msı', 'msi', 'msu', 'msü', 'cık', 'cik', 'cuk', 'cük',
    'cağız', 'ceğiz', 'cığ', 'ciğ', 'cuğ', 'cüğ', 'leyin', 'layın',
]
VERBAL = [
    'mak', 'mek', 'ma', 'me', 'mayı', 'meyi', 'maya', 'meye', 'makta', 'mekte', 'maktan', 'mekten', 'yor', 'ıyor', 'iyor', 'uyor', 'üyor',
    'dı', 'di', 'du', 'dü', 'tı', 'ti', 'tu', 'tü', 'mış', 'miş', 'muş', 'müş', 'acak', 'ecek', 'yacak', 'yecek', 'acağ', 'eceğ', 'yacağ', 'yeceğ',
    'ar', 'er', 'ır', 'ir', 'ur', 'ür', 'maz', 'mez', 'sa', 'se', 'malı', 'meli', 'n', 'ıl', 'il', 'ul', 'ül', 'ın', 'in', 'un', 'ün',
    'dır', 'dir', 'dur', 'dür', 'tır', 'tir', 'tur', 'tür', 'ış', 'iş', 'uş', 'üş', 'ıp', 'ip', 'up', 'üp', 'yıp', 'yip', 'yup', 'yüp',
    'arak', 'erek', 'yarak', 'yerek', 'ınca', 'ince', 'unca', 'ünce', 'yınca', 'yince', 'yunca', 'yünce', 'dık', 'dik', 'duk', 'dük', 'tık', 'tik', 'tuk', 'tük',
    'dığ', 'diğ', 'duğ', 'düğ', 'tığ', 'tiğ', 'tuğ', 'tüğ', 'an', 'en', 'yan', 'yen', 'ası', 'esi', 'yası', 'yesi', 'abil', 'ebil', 'yabil', 'yebil',
    'ama', 'eme', 'yama', 'yeme', 'm', 'k', 'sın', 'sin', 'sun', 'sün', 'ız', 'iz', 'uz', 'üz', 'sınız', 'siniz', 'sunuz', 'sünüz', 'lar', 'ler',
    'ınız', 'iniz', 'unuz', 'ünüz', 'ıver', 'iver', 'uver', 'üver', 'yıver', 'yiver', 'yuver', 'yüver', 'madan', 'meden',
    'dıkça', 'dikçe', 'dukça', 'dükçe', 'tıkça', 'tikçe', 'tukça', 'tükçe', 'mamış', 'memiş', 'mıyor', 'miyor', 'muyor', 'müyor',
    'ayım', 'eyim', 'yayım', 'yeyim', 'alım', 'elim', 'yalım', 'yelim', 'sana', 'sene', 'ya', 'ye', 'a', 'e',
]
SUFFIXES = sorted(set(NOMINAL + VERBAL), key=len, reverse=True)
# suffixes whose vowels do not follow harmony
INVARIANT = {'yor', 'ken', 'yken', 'ki', 'daki', 'deki', 'taki', 'teki', 'ndaki', 'leyin', 'layın', 'ıyor', 'iyor', 'uyor', 'üyor', 'mıyor', 'miyor', 'muyor', 'müyor',
             'abil', 'ebil', 'yabil', 'yebil', 'ıver', 'iver', 'uver', 'üver', 'yıver', 'yiver', 'yuver', 'yüver'}
SOFT = {'b': 'p', 'c': 'ç', 'd': 't', 'ğ': 'k', 'g': 'k'}


def harmonious(rest, suf, inverse=False):
    """Vowel harmony: the suffix's vowels must agree with the last vowel of the stem
    (reversed for stems zemberek marks InverseHarmony: kalp-ler, saat-i)."""
    if suf in INVARIANT:
        return True
    lv = last_vowel(rest)
    if lv is None:
        return True
    back = (lv in BACK) != inverse
    rounded = lv in ROUNDED
    for v in suf:
        if v not in VOWELS or v in 'oö':
            continue
        if v in 'ae':
            if (v == 'a') != back:
                return False
        else:  # ı i u ü: four-way harmony
            if ((v in 'ıu') != back) or ((v in 'uü') != rounded):
                return False
    return True


class Deriver:
    """Can `word` be produced from a known stem by adding suffixes?"""

    def __init__(self, stems, attrs_of):
        self.stems = stems
        self.attrs_of = attrs_of
        self.cache = {}

    def depth(self, word, d=0):
        """Returns the number of suffixes stripped to reach a stem, or -1."""
        if word in self.stems:
            return d
        if d > 5 or len(word) < 3:
            return -1
        if word in self.cache:
            return self.cache[word]
        result = -1
        for suf in SUFFIXES:
            if not word.endswith(suf):
                continue
            rest = word[:-len(suf)]
            if len(rest) < 2:
                continue
            cands = [rest]
            last = rest[-1]
            # voicing restoration (kitab-ı -> kitap) unless the stem never voices
            if last in SOFT:
                c = rest[:-1] + SOFT[last]
                if 'NoVoicing' not in self.attrs_of.get(c, ()):
                    cands.append(c)
            # vowel drop (burn-u -> burun) only for stems marked LastVowelDrop
            if len(rest) >= 3 and rest[-1] not in VOWELS and rest[-2] not in VOWELS:
                for v in 'ıiuü':
                    c = rest[:-1] + v + rest[-1]
                    if 'LastVowelDrop' in self.attrs_of.get(c, ()):
                        cands.append(c)
            # consonant doubling (hakk-ı -> hak) only for stems marked Doubling
            if len(rest) >= 3 and rest[-1] == rest[-2] and rest[-1] not in VOWELS:
                c = rest[:-1]
                if 'Doubling' in self.attrs_of.get(c, ()):
                    cands.append(c)
            for c in cands:
                if not harmonious(rest, suf, 'InverseHarmony' in self.attrs_of.get(c, ())):
                    continue
                r = self.depth(c, d + 1)
                if r >= 0:
                    result = r
                    break
            if result >= 0:
                break
        self.cache[word] = result
        return result


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--min-count', type=int, default=20, help='corpus frequency needed to admit an inflected form')
    ap.add_argument('--min-count-simple', type=int, default=8, help='frequency needed for a form with a single suffix (kitaplar)')
    ap.add_argument('--english-rank', type=int, default=20000, help='drop derived tokens that are within this rank in the English list')
    ap.add_argument('--common', default='600,900,900', help='target sizes for 4,5,6-letter common lists')
    ap.add_argument('--max-rank', type=int, default=30000, help='ignore corpus words rarer than this rank for common words')
    ap.add_argument('--ascii-ratio', type=int, default=10, help='drop a corpus form spelt without Turkish letters when its Turkish spelling is this many times more frequent')
    ap.add_argument('--out', default=os.path.join(ROOT, 'data'))
    args = ap.parse_args()

    master = list(parse_dict(fetch('master-dictionary.dict')))
    nontdk = list(parse_dict(fetch('non-tdk.dict')))

    lemmas = set()
    pos_of = {}
    attrs_of = {}
    for lemma, pos, attrs in master + nontdk:
        if not LETTERS_RE.match(lemma) or len(lemma) < 2 or not has_vowel(lemma):
            continue
        lemmas.add(lemma)
        pos_of.setdefault(lemma, set()).add(pos)
        attrs_of.setdefault(lemma, set()).update(attrs)

    # stems used for suffix stripping: no interjections/reduplications/punctuation, no
    # 2-letter foreign additions; verb stems (gelmek -> gel) are added as words too
    NO_STEM_POS = {'Interj', 'Dup', 'Punc', 'Ques'}
    stems = set()
    for lemma, poss in pos_of.items():
        if poss <= NO_STEM_POS:
            continue
        if 'Ext' in attrs_of[lemma] and len(lemma) <= 3:
            continue
        stems.add(lemma)
        if 'Verb' in poss and lemma.endswith(('mak', 'mek')):
            stem = lemma[:-3]
            stems.add(stem)
            attrs_of.setdefault(stem, set()).update(attrs_of[lemma])

    # words never used as secrets: profanity (blocklist.txt) + reviewed exclusions (common-exclude.txt)
    block = set()
    for name in ('blocklist.txt', 'common-exclude.txt'):
        path = os.path.join(HERE, name)
        if not os.path.exists(path):
            continue
        with open(path, encoding='utf-8') as f:
            for line in f:
                w = line.strip()
                if w and not w.startswith('#'):
                    block.add(fold(tr_lower(w)))

    # English tokens that leak into Turkish subtitles (you, here, time, never ...)
    english = set()
    with open(fetch('en_50k.txt'), encoding='utf-8') as f:
        for i, line in enumerate(f):
            if i >= args.english_rank:
                break
            english.add(line.split()[0].lower())

    # frequency data
    freq = {}
    with open(fetch('tr_full.txt'), encoding='utf-8') as f:
        for line in f:
            parts = line.split()
            if len(parts) != 2:
                continue
            w = fold(tr_lower(parts[0]))
            try:
                c = int(parts[1])
            except ValueError:
                continue
            if LETTERS_RE.match(w):
                freq[w] = freq.get(w, 0) + c
    rank = {}
    with open(fetch('tr_50k.txt'), encoding='utf-8') as f:
        for i, line in enumerate(f):
            w = fold(tr_lower(line.split()[0]))
            rank.setdefault(w, i + 1)

    deriver = Deriver(stems, attrs_of)
    words = set(lemmas) | stems
    admitted = rejected = english_dropped = ascii_dropped = 0
    for w, c in freq.items():
        if c < args.min_count_simple or len(w) < 3 or w in words or not has_vowel(w) or ELONGATION_RE.search(w):
            continue
        d = deriver.depth(w)
        if d < 0 or (d > 1 and c < args.min_count):
            rejected += 1
            continue
        if w in english:
            english_dropped += 1
            continue
        # subtitles typed without Turkish letters (buyuk, degil, icin, simdi): drop a form whose
        # Turkish-lettered spelling is far more common; real pairs (kasın/kaşın) are close in count
        twin = turkish_twin(w, freq)
        if twin and freq[twin] >= args.ascii_ratio * c:
            ascii_dropped += 1
            continue
        words.add(w)
        admitted += 1
    # no length-3 runs of one letter, even in the dictionaries (interjections such as aaa, hıııı)
    words = {w for w in words if len(w) >= 2 and has_vowel(w) and not ELONGATION_RE.search(w)}

    os.makedirs(args.out, exist_ok=True)
    out_words = os.path.join(args.out, 'words-tr.txt')
    with open(out_words, 'w', encoding='utf-8') as f:
        for w in sorted(words):
            f.write(w + '\n')

    # common words: frequency-ranked lemmas of the curated master dictionary, excluding
    # verbs (infinitives), interjections, question particles, conjunctions (postpositions
    # such as için/gibi/kadar are removed via tools/common-exclude.txt)
    master_pos = {}
    for lemma, pos, attrs in master:
        master_pos.setdefault(lemma, set()).add(pos.split(',')[0])
    targets = [int(x) for x in args.common.split(',')]
    common = {}
    for length, target in zip((4, 5, 6), targets):
        cands = []
        for w, r in rank.items():
            if len(w) != length or r > args.max_rank or w not in master_pos or w not in words:
                continue
            poss = master_pos[w]
            if poss & {'Verb', 'Punc', 'Interj', 'Dup', 'Ques', 'Conj'}:
                continue
            if w.endswith(('mak', 'mek')):
                continue
            cands.append((r, w))
        cands.sort()
        # take the top `target` first, then drop blocked words, so that reviewed
        # exclusions shrink the list instead of pulling in unreviewed rarer words
        common[str(length)] = [w for _, w in cands[:target] if w not in block]

    out_common = os.path.join(args.out, 'common-tr.json')
    with open(out_common, 'w', encoding='utf-8') as f:
        json.dump(common, f, ensure_ascii=False, indent=0)
        f.write('\n')

    print(f'lemmas: {len(lemmas)}, stems: {len(stems)}, admitted inflected: {admitted}, rejected: {rejected}, english dropped: {english_dropped}, ascii misspellings dropped: {ascii_dropped}, total words: {len(words)}')
    print('common: ' + ', '.join(f'{k}: {len(v)}' for k, v in common.items()))
    print(f'wrote {out_words} ({os.path.getsize(out_words)} bytes) and {out_common}')


if __name__ == '__main__':
    main()
