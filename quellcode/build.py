#!/usr/bin/env python3
"""Baut site/index.html (Lernwelt Naturalia) aus den Teilen in src/.

Aufruf: python3 build.py
Neues Kapitel: Inhaltsblock als src/chapters/<id>.js ablegen, in src/realms.js eintragen
und die id unten in CHAPTER_ORDER ergänzen.
"""
from pathlib import Path

ROOT = Path(__file__).parent
SRC = ROOT / 'src'
SITE = ROOT.parent  # die App liegt im Hauptordner des Repos
CHAPTER_ORDER = ['nt7-1', 'nt7-2', 'nt7-3', 'nt7-4', 'nt7-5', 'nt7-6', 'nt7-7', 'nt8-1', 'nt8-2', 'nt8-3', 'nt8-4', 'nt8-5',
                 'nt9-1', 'nt9-2', 'nt9-3', 'nt9-4', 'nt9-5', 'nt9-6', 'nt9-7', 'nt9-8', 'leistung', 'motor']

# Weiterleitungen alter Dateinamen: keine mehr, Naturalia steht für sich allein.
REDIRECTS = {}


def read(p):
    return (SRC / p).read_text(encoding='utf-8')


def chapter_block(cid):
    body = read(f'chapters/{cid}.js')
    return (f"CHAPTERS['{cid}'] = function () {{\n{body}\n"
            "return { STATIONS, LEVELS, TOPIC, SIMS };\n};\n")


def build():
    css = read('base.css') + read('fantasy.css')
    js = ["(function () {\n'use strict';\n", read('helpers.js'), read('realms.js'),
          "\n/* ---------- Inhalte der Kapitel (je eine Funktion, wird erst beim Betreten eines Reichs ausgeführt) ---------- */\nconst CHAPTERS = {};\n"]
    js += [chapter_block(c) for c in CHAPTER_ORDER]
    js.append("\nconst INTERVALS = [0, 1, 3, 7, 14]; // Tage bis zur nächsten Wiederholung je Box\nconst ROUND_SIZE = 6;\n\n")
    js.append(read('engine.js'))
    html = f"""<!DOCTYPE html>
<html lang="de-CH">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#161026">
<title>Naturalia – Lernwelt Natur und Technik</title>
<style>
@font-face {{ font-family: 'Fredoka'; src: url('fonts/fredoka.woff2') format('woff2'); font-weight: 300 700; font-display: swap; }}
@font-face {{ font-family: 'Nunito'; src: url('fonts/nunito.woff2') format('woff2'); font-weight: 200 1000; font-display: swap; }}
@font-face {{ font-family: 'JetBrains Mono'; src: url('fonts/jetbrains-mono.woff2') format('woff2'); font-weight: 100 800; font-display: swap; }}
{css}
</style>
</head>
<body>
<div id="app"><noscript><main class="wrap"><p>Diese Lern-App braucht JavaScript.</p></main></noscript></div>
<script src="config.js"></script>
<script src="vendor/supabase.js"></script>
<script src="vendor/qrcode.js"></script>
<script>
{''.join(js)}
</script>
</body>
</html>
"""
    (SITE / 'index.html').write_text(html, encoding='utf-8')
    for page, cid in REDIRECTS.items():
        target = 'index.html' + (f'#reich-{cid}' if cid else '')
        (SITE / page).write_text(f"""<!DOCTYPE html>
<html lang="de-CH"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Weiterleitung nach Naturalia</title>
<script>
// Alte Adresse: weiter ins Reich. Ein Sprung #learn-<Station> öffnet direkt die Schriftrolle.
(function () {{ var m = /^#learn-([a-z0-9]+)$/.exec(location.hash || ''); location.replace('{target}' + (m && '{cid}' ? '/learn-' + m[1] : '')); }})();
</script>
<style>body {{ background: #161026; color: #f8ecd0; font-family: Georgia, serif; padding: 24px; }} a {{ color: #f3d98b; }}</style>
</head><body><p>Diese App ist jetzt Teil der Lernwelt Naturalia. <a href="{target}">Weiter</a></p></body></html>
""", encoding='utf-8')
    print('gebaut:', SITE / 'index.html', f"{(SITE / 'index.html').stat().st_size // 1024} KB")


if __name__ == '__main__':
    build()
