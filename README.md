# Naturalia – alle Reiche

Naturalia als Spiel, mit allen 20 Kapiteln der NuT Lernlandkarte als Reiche, dazu die Vertiefungen Leistung (Drachenarena) und Motor (Runenminen). Die App liegt im Hauptordner (Startseite `index.html`). Der Quellcode zum Neu-Bauen liegt in `quellcode/`.

## Was neu ist gegenüber Naturalia

- **13 neue Reiche:** Tal der Lebenskraft (7_2), Kristallwerkstatt (7_6), Smaragdsee (8_2), Festung der Abwehr (8_3), Feuerkessel (8_4), Spiegelpalast (9_1), Sternenkern (9_2), Funkenlabyrinth (9_3), Uhrwerk der Riesen (9_4), Garten der Erbschrift (9_5), Urzeitschlucht (9_6), Wispernder Wald (9_7), Quelle der Kreisläufe (9_8). Keine Nebelreiche mehr.
- **Inhalte aus der Lernlandkarte:** Alle Kapitel stammen aus der aktuellen Lernlandkarte, also auch die PhET-Simulationen als Zusatzkarten.
- **Vorlesen:** Jede Schriftrolle hat «Vorlesen» mit den Sprachclips aus `audio/`. Bei richtigen Antworten kommt ein gesprochenes Lob. «Ton an/aus» gilt für alle Reiche. Leistung und Motor haben keine Sprachclips, dort liest die Browser-Stimme vor.
- **Weltkarte:** Ein langer Weg von Kapitel 7 über 8 und 9 zu den Vertiefungen.
- **Heldenränge** sind an die grössere Welt angepasst (höchster Rang bei 9000 XP).
- `pruefen.html` kennt alle Reiche.

## Fortschritt

Die Reiche speichern unter denselben Schlüsseln wie die Kapitel der Lernlandkarte (`halingen-nt7-5-v1` usw.). Laufen beide Apps unter derselben Adresse, teilen sie den Fortschritt.

## Ändern und neu bauen

- `python3 quellcode/extract_chapters.py PFAD/ZUR/nut-lernlandkarte` holt die Kapitelinhalte neu aus der Lernlandkarte. Das ist nur nötig, wenn sich dort etwas geändert hat.
- `python3 quellcode/build.py` erzeugt `index.html` und die Weiterleitungen der alten Dateinamen.
- Namen, Symbole, Farben und Ränge der Reiche stehen in `quellcode/src/realms.js`.

## Veröffentlichen mit GitHub Pages

Settings → Pages → Source «Deploy from a branch», Branch `main`, Ordner `/ (root)`, Save. Nach 1–2 Minuten ist die App unter `https://alexanderweng-prog.github.io/Naturalia/` erreichbar.
