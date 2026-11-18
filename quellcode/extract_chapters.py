#!/usr/bin/env python3
"""Holt die Kapitelinhalte aus den Einzel-Apps der NuT Lernlandkarte nach src/chapters/.

Aufruf: python3 extract_chapters.py ../nut-lernlandkarte
Pro Kapitel wird der Block von "/* ---------- Inhalt" bis vor "const INTERVALS" übernommen,
dazu die PhET-Zusatzkarten und die Audio-Einstellung. Nur nötig, wenn die Lernlandkarte
neue Inhalte bekommen hat. Danach: python3 build.py
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).parent
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT.parent.parent / 'nut-lernlandkarte'
OUT = ROOT / 'src' / 'chapters'

PHET_INJECT = """(function () {
  PHET_CARDS.forEach(pc => {
    const st = STATIONS.find(x => x.id === pc.st); if (!st) return;
    st.lesson.forEach((c, i) => { if (c.ai === undefined) c.ai = i; });
    const last = st.lesson[st.lesson.length - 1], pos = last && last.check ? st.lesson.length - 1 : st.lesson.length;
    st.lesson.splice(pos, 0, { h: pc.h, body: pc.body, ai: -1, sim: 'phet', phet: { id: pc.id, name: pc.name } });
  });
})();
"""


def extract(path):
    lines = path.read_text(encoding='utf-8').split('\n')
    start = next(i for i, l in enumerate(lines) if l.startswith('/* ---------- Inhalt'))
    end = next(i for i, l in enumerate(lines) if l.startswith('const INTERVALS'))
    helpers_start = next(i for i, l in enumerate(lines) if l.startswith('/* ---------- Hilfsfunktionen'))
    body = lines[start:end]
    # Zusätzliche Helfer eines Kapitels (z. B. Diagramme in 7_4) stehen zwischen Hilfsfunktionen und Inhalt
    extra = []
    for i, l in enumerate(lines[helpers_start:start]):
        if l.startswith('/* ---------- Diagramme'):
            extra = lines[helpers_start + i:start]
            break
    tail = lines[end:]
    phet = next((l for l in tail if l.startswith('const PHET_CARDS')), None)
    audio = next(l for l in tail if l.startswith('if (!TOPIC.audio)'))
    out = extra + body
    if phet:
        out += ['/* PhET-Simulationen als Zusatzkarten */', phet, PHET_INJECT]
    out.append(audio)
    cid = re.search(r"id: '(nt\d-\d)'", '\n'.join(body)).group(1)
    return cid, '\n'.join(out).rstrip() + '\n'


def main():
    files = sorted(p for p in SRC.glob('[789]_*.html') if 'Einzeldatei' not in p.name)
    for p in files:
        cid, text = extract(p)
        (OUT / f'{cid}.js').write_text(text, encoding='utf-8')
        print(f'{p.name} -> {cid}.js ({len(text) // 1024} KB)')


if __name__ == '__main__':
    main()
