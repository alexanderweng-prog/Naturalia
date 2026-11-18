# Naturalia – alle Reiche

Naturalia als eigenständiges Spiel mit allen 20 Kapiteln aus Natur und Technik als Reiche, dazu die Vertiefungen Leistung (Drachenarena) und Motor (Runenminen). Die App liegt im Hauptordner (Startseite `index.html`). Der Quellcode zum Neu-Bauen liegt in `quellcode/`.

## Was neu ist gegenüber Naturalia

- **13 neue Reiche:** Tal der Lebenskraft (7_2), Kristallwerkstatt (7_6), Smaragdsee (8_2), Festung der Abwehr (8_3), Feuerkessel (8_4), Spiegelpalast (9_1), Sternenkern (9_2), Funkenlabyrinth (9_3), Uhrwerk der Riesen (9_4), Garten der Erbschrift (9_5), Urzeitschlucht (9_6), Wispernder Wald (9_7), Quelle der Kreisläufe (9_8). Keine Nebelreiche mehr.
- **Inhalte:** Die Kapitel stammen ursprünglich aus der NuT Lernlandkarte, mit PhET-Simulationen als Zusatzkarten. Naturalia verlinkt nicht mehr auf die Lernlandkarte.
- **Vorlesen:** Das Maskottchen heisst wie in den Sprachclips Watti. Jede Schriftrolle hat «Vorlesen» mit den Sprachclips aus `audio/`. Bei richtigen Antworten kommt ein gesprochenes Lob. «Ton an/aus» gilt für alle Reiche. Leistung und Motor haben keine Sprachclips, dort liest die Browser-Stimme vor.
- **Weltkarte:** Ein langer Weg von Kapitel 7 über 8 und 9 zu den Vertiefungen.
- **Stufenwahl:** Beim ersten Besuch fragt die App nach der Klasse (7, 8, 9 oder alle). Die Reiche der eigenen Stufe leuchten, die anderen sind gedimmt, bleiben aber offen. Die Vertiefungen gelten ab der 8. Klasse. Die Klasse lässt sich unten auf der Weltkarte ändern.
- **Endgegner:** Am Ende jeder Stufe wartet ein Endgegner (7: Nebelgolem, 8: Sturmhydra, 9: Schattenkraken). Der Kampf besteht aus 12 gemischten Fragen aus allen Reichen der Stufe, mit einem Versuch pro Frage und ohne Zauberbuch. Ab 9 richtigen Antworten ist er besiegt. Danach zeigt die Auswertung pro Reich, was nochmals geübt werden sollte. Der Kampf verändert die Lernkartei der Reiche nicht, die XP zählen für den Heldenrang. Direkter Link für die Klasse: `…/Naturalia/#boss-8`. Anzahl Fragen und Siegesgrenze stehen in `quellcode/src/realms.js` (`BOSS_Q`, `BOSS_WIN`).
- **Titelschrift:** Cinzel (SIL Open Font License, `fonts/OFL-Cinzel.txt`).
- **Heldenränge** sind an die grössere Welt angepasst (höchster Rang bei 9000 XP).
- `pruefen.html` kennt alle Reiche.

## Fortschritt

Der Fortschritt wird im Browser gespeichert (Schlüssel `halingen-nt7-5-v1` usw.).

**Spielstand sichern:** Unten auf der Weltkarte können die Schüler*innen ihren Spielstand als Datei (`naturalia-<Heldenname>-<Datum>.txt`) speichern oder als Code kopieren. Mit «Spielstand laden» (Datei wählen oder Code einfügen) geht es auf einem anderen Gerät weiter. Vor dem Laden zeigt die App, wessen Stand es ist, und fragt nach, weil der Fortschritt auf dem Gerät ersetzt wird. Der Code ist komprimiert, aber zum Abtippen zu lang: etwa 200 bis 900 Zeichen nach einigen Runden, bis rund 7700 Zeichen, wenn alle Reiche komplett gespielt sind. Gedacht ist er zum Kopieren und Einfügen, zum Beispiel per Mail an sich selbst. Er ist nicht verschlüsselt, nur komprimiert.

## Ändern und neu bauen

- `python3 quellcode/extract_chapters.py PFAD/ZUR/nut-lernlandkarte` holt die Kapitelinhalte neu aus der Lernlandkarte. Das ist nur nötig, wenn sich dort etwas geändert hat.
- `python3 quellcode/build.py` erzeugt `index.html`.
- Namen, Symbole, Farben und Ränge der Reiche stehen in `quellcode/src/realms.js`.

## Veröffentlichen mit GitHub Pages

Settings → Pages → Source «Deploy from a branch», Branch `main`, Ordner `/ (root)`, Save. Nach 1–2 Minuten ist die App unter `https://alexanderweng-prog.github.io/Naturalia/` erreichbar.
