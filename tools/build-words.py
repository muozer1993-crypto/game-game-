#!/usr/bin/env python3
"""Build data/words-tr.txt and data/common-tr.json from openly licensed sources.

Sources (pinned; see data/LICENSES.md):
  * zemberek-nlp master-dictionary.dict + non-tdk.dict   (Apache-2.0)  -> lemmas
  * hermitdave/FrequencyWords tr_full.txt + tr_50k.txt    (CC BY-SA 4.0) -> frequencies, inflected forms

Usage:  python3 tools/build-words.py            (downloads sources into tools/cache/)
        python3 tools/build-words.py --min-count 10 --common 600,900,900
"""
import argparse
import json
import os
import re
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CACHE = os.path.join(HERE, 'cache')

ZEMBEREK = 'https://raw.githubusercontent.com/ahmetaa/zemberek-nlp/037202c7e18b977c95181a76db05cb1e95846554/morphology/src/main/resources/tr/'
HERMIT = 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/tr/'
SOURCES = {
    'master-dictionary.dict': ZEMBEREK + 'master-dictionary.dict',
    'non-tdk.dict': ZEMBEREK + 'non-tdk.dict',
    'tr_full.txt': HERMIT + 'tr_full.txt',
    'tr_50k.txt': HERMIT + 'tr_50k.txt',
}

LETTERS_RE = re.compile(r'^[abcçdefgğhıijklmnoöprsştuüvyz]+$')
VOWELS = 'aeıioöuü'


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


def tr_lower(s):
    return s.replace('I', 'ı').replace('İ', 'i').lower()


def parse_dict(path):
    """Yield (lemma, pos, attrs) from a zemberek .dict file."""
    with open(path, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            lemma, _, rest = line.partition('[')
            lemma = fold(tr_lower(lemma.strip()))
            pos = None  # zemberek: no P: tag means Noun, except -mak/-mek infinitives which are verbs
            attrs = ''
            if rest:
                for group in rest.rstrip(']').split(';'):
                    key, _, value = group.strip().partition(':')
                    if key == 'P':
                        pos = value.strip()
                    elif key == 'A':
                        attrs = value
            if pos is None:
                pos = 'Verb' if lemma.endswith(('mak', 'mek')) else 'Noun'
            yield lemma, pos, attrs


# --- suffix stripping (approximate; only used to admit corpus forms that reduce to a known stem)
def harmony(forms):
    return [f for f in forms]

NOMINAL = harmony([
    'lar', 'ler', 'ı', 'i', 'u', 'ü', 'yı', 'yi', 'yu', 'yü', 'ın', 'in', 'un', 'ün', 'nın', 'nin', 'nun', 'nün',
    'a', 'e', 'ya', 'ye', 'na', 'ne', 'da', 'de', 'ta', 'te', 'nda', 'nde', 'dan', 'den', 'tan', 'ten', 'ndan', 'nden',
    'la', 'le', 'yla', 'yle', 'm', 'ım', 'im', 'um', 'üm', 'mız', 'miz', 'muz', 'müz', 'ımız', 'imiz', 'umuz', 'ümüz',
    'n', 'nız', 'niz', 'nuz', 'nüz', 'ınız', 'iniz', 'unuz', 'ünüz', 'sı', 'si', 'su', 'sü', 'ki', 'ndaki', 'daki', 'deki', 'taki', 'teki',
    'lık', 'lik', 'luk', 'lük', 'lığ', 'liğ', 'luğ', 'lüğ', 'cı', 'ci', 'cu', 'cü', 'çı', 'çi', 'çu', 'çü', 'lı', 'li', 'lu', 'lü',
    'sız', 'siz', 'suz', 'süz', 'ca', 'ce', 'ça', 'çe', 'daş', 'deş', 'taş', 'teş', 'dır', 'dir', 'dur', 'dür', 'tır', 'tir', 'tur', 'tür',
    'ken', 'yken', 'yım', 'yim', 'yum', 'yüm', 'sın', 'sin', 'sun', 'sün', 'yız', 'yiz', 'yuz', 'yüz', 'ız', 'iz', 'uz', 'üz',
    'sınız', 'siniz', 'sunuz', 'sünüz', 'ydı', 'ydi', 'ydu', 'ydü', 'dı', 'di', 'du', 'dü', 'tı', 'ti', 'tu', 'tü',
    'ymış', 'ymiş', 'ymuş', 'ymüş', 'mış', 'miş', 'muş', 'müş', 'ysa', 'yse', 'sa', 'se', 'msı', 'msi', 'msu', 'msü', 'cık', 'cik', 'cuk', 'cük',
    'cağız', 'ceğiz', 'cığ', 'ciğ', 'cuğ', 'cüğ', 'leyin', 'layın', 'ler', 'lar',
])
VERBAL = harmony([
    'mak', 'mek', 'ma', 'me', 'mayı', 'meyi', 'maya', 'meye', 'makta', 'mekte', 'maktan', 'mekten', 'yor', 'ıyor', 'iyor', 'uyor', 'üyor',
    'dı', 'di', 'du', 'dü', 'tı', 'ti', 'tu', 'tü', 'mış', 'miş', 'muş', 'müş', 'acak', 'ecek', 'yacak', 'yecek', 'acağ', 'eceğ', 'yacağ', 'yeceğ',
    'ar', 'er', 'ır', 'ir', 'ur', 'ür', 'maz', 'mez', 'sa', 'se', 'malı', 'meli', 'n', 'ıl', 'il', 'ul', 'ül', 'ın', 'in', 'un', 'ün',
    'dır', 'dir', 'dur', 'dür', 'tır', 'tir', 'tur', 'tür', 'ış', 'iş', 'uş', 'üş', 'ıp', 'ip', 'up', 'üp', 'yıp', 'yip', 'yup', 'yüp',
    'arak', 'erek', 'yarak', 'yerek', 'ınca', 'ince', 'unca', 'ünce', 'yınca', 'yince', 'yunca', 'yünce', 'dık', 'dik', 'duk', 'dük', 'tık', 'tik', 'tuk', 'tük',
    'dığ', 'diğ', 'duğ', 'düğ', 'tığ', 'tiğ', 'tuğ', 'tüğ', 'an', 'en', 'yan', 'yen', 'ası', 'esi', 'yası', 'yesi', 'abil', 'ebil', 'yabil', 'yebil',
    'ama', 'eme', 'yama', 'yeme', 'm', 'k', 'sın', 'sin', 'sun', 'sün', 'ız', 'iz', 'uz', 'üz', 'sınız', 'siniz', 'sunuz', 'sünüz', 'lar', 'ler',
    'ın', 'in', 'un', 'ün', 'ınız', 'iniz', 'unuz', 'ünüz', 'ıver', 'iver', 'uver', 'üver', 'yıver', 'yiver', 'yuver', 'yüver', 'madan', 'meden',
    'dıkça', 'dikçe', 'dukça', 'dükçe', 'tıkça', 'tikçe', 'tukça', 'tükçe', 'ken', 'yken', 'mamış', 'memiş', 'mıyor', 'miyor', 'muyor', 'müyor',
    'ayım', 'eyim', 'yayım', 'yeyim', 'alım', 'elim', 'yalım', 'yelim', 'sana', 'sene', 'ya', 'ye', 'a', 'e',
])
SUFFIXES = sorted(set(NOMINAL + VERBAL), key=len, reverse=True)
SOFT = {'b': 'p', 'c': 'ç', 'd': 't', 'ğ': 'k', 'g': 'k'}


class Deriver:
    def __init__(self, stems):
        self.stems = stems
        self.cache = {}

    def ok(self, word, depth=0):
        if word in self.stems:
            return True
        if depth > 5 or len(word) < 3:
            return False
        key = word
        if key in self.cache:
            return self.cache[key]
        result = False
        for suf in SUFFIXES:
            if not word.endswith(suf):
                continue
            rest = word[:-len(suf)]
            if len(rest) < 2:
                continue
            cands = [rest]
            last = rest[-1]
            if last in SOFT:
                cands.append(rest[:-1] + SOFT[last])
            # vowel drop restoration: burn-u -> burun, oğl-u -> oğul
            if len(rest) >= 3 and rest[-1] not in VOWELS and rest[-2] not in VOWELS:
                for v in 'ıiuü':
                    cands.append(rest[:-1] + v + rest[-1])
            # consonant doubling: hakk-ı -> hak
            if len(rest) >= 3 and rest[-1] == rest[-2] and rest[-1] not in VOWELS:
                cands.append(rest[:-1])
            for c in cands:
                if self.ok(c, depth + 1):
                    result = True
                    break
            if result:
                break
        self.cache[key] = result
        return result


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--min-count', type=int, default=20, help='corpus frequency needed to admit an inflected form')
    ap.add_argument('--common', default='600,900,900', help='target sizes for 4,5,6-letter common lists')
    ap.add_argument('--max-rank', type=int, default=30000, help='ignore corpus words rarer than this rank for common words')
    ap.add_argument('--out', default=os.path.join(ROOT, 'data'))
    args = ap.parse_args()

    master = list(parse_dict(fetch('master-dictionary.dict')))
    nontdk = list(parse_dict(fetch('non-tdk.dict')))

    lemmas = set()
    pos_of = {}
    for lemma, pos, attrs in master + nontdk:
        if not LETTERS_RE.match(lemma) or len(lemma) < 2:
            continue
        lemmas.add(lemma)
        pos_of.setdefault(lemma, set()).add(pos)
    # verb stems (gelmek -> gel) are valid word forms (imperative) and stems for stripping
    stems = set(lemmas)
    for lemma, poss in pos_of.items():
        if 'Verb' in poss and (lemma.endswith('mak') or lemma.endswith('mek')):
            stems.add(lemma[:-3])

    # blocklist
    block = set()
    with open(os.path.join(HERE, 'blocklist.txt'), encoding='utf-8') as f:
        for line in f:
            w = line.strip()
            if w and not w.startswith('#'):
                block.add(fold(tr_lower(w)))

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

    deriver = Deriver(stems)
    words = set(stems)
    admitted = 0
    rejected = 0
    for w, c in freq.items():
        if c < args.min_count or len(w) < 3 or w in words:
            continue
        if deriver.ok(w):
            words.add(w)
            admitted += 1
        else:
            rejected += 1
    words = {w for w in words if len(w) >= 2}

    os.makedirs(args.out, exist_ok=True)
    out_words = os.path.join(args.out, 'words-tr.txt')
    with open(out_words, 'w', encoding='utf-8') as f:
        for w in sorted(words):
            f.write(w + '\n')

    # common words: frequency-ranked curated lemmas (master dictionary only, no verbs/interjections)
    master_pos = {}
    for lemma, pos, attrs in master:
        master_pos.setdefault(lemma, set()).add(pos)
    targets = [int(x) for x in args.common.split(',')]
    common = {}
    for length, target in zip((4, 5, 6), targets):
        cands = []
        for w, r in rank.items():
            if len(w) != length or r > args.max_rank or w in block or w not in master_pos:
                continue
            poss = master_pos[w]
            if poss & {'Verb', 'Punc', 'Interj', 'Dup', 'Ques', 'Conj', 'Postp'}:
                continue
            if w.endswith(('mak', 'mek')):
                continue
            cands.append((r, w))
        cands.sort()
        common[str(length)] = [w for _, w in cands[:target]]

    out_common = os.path.join(args.out, 'common-tr.json')
    with open(out_common, 'w', encoding='utf-8') as f:
        json.dump(common, f, ensure_ascii=False, indent=0)
        f.write('\n')

    print(f'lemmas: {len(lemmas)}, stems: {len(stems)}, admitted inflected: {admitted}, rejected: {rejected}, total words: {len(words)}')
    print(f'common: ' + ', '.join(f'{k}: {len(v)}' for k, v in common.items()))
    print(f'wrote {out_words} ({os.path.getsize(out_words)} bytes) and {out_common}')


if __name__ == '__main__':
    main()
