/**
 * Prüfung der Veröffentlichungs-Grundlagen — ohne diese Dateien ist das
 * Repository kein eigenständiges Produkt.
 *
 * Geprüft wird:
 *
 *   1. `LICENSE` ist der MIT-Text mit Jahr und Rechteinhaber; `package.json`
 *      nennt dieselbe Lizenz, Node 24 und ein `test`-Skript.
 *   2. `CHANGELOG.md` und die Editor-Dateien sind da; die Form ist erkennbar.
 *   3. `.github/workflows/ci.yml` läuft auf Node 24, prüft Syntax und Suite
 *      und lässt die eine Prüfung aus, die die Werkstatt-Ablage braucht.
 *   4. Die acht `locale/*.json` tragen den Produktnamen und eine Beschreibung;
 *      DSH liest sie als Anzeige der Plugin-Verwaltung.
 *   5. Die Wörterbücher unter `texte/` bleiben unberührt (Zahl 614).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = dirname(fileURLToPath(import.meta.url));
const PRODUKT = dirname(HIER);

function pruefe(bedingung, text) {
  if (!bedingung) throw new Error(text);
}

function lies(pfad) {
  pruefe(existsSync(join(PRODUKT, pfad)), 'Die Datei fehlt: ' + pfad);
  return readFileSync(join(PRODUKT, pfad), 'utf8');
}

// 1. Lizenz und Paket.
const lizenz = lies('LICENSE');
pruefe(/^MIT License/.test(lizenz), 'LICENSE beginnt nicht mit „MIT License“');
pruefe(lizenz.includes('Copyright (c) 2026 Thomas Heinrich'),
  'LICENSE nennt nicht Jahr und Rechteinhaber');
pruefe(lizenz.includes('Permission is hereby granted'),
  'LICENSE trägt nicht den MIT-Erlaubnistext');

const paket = JSON.parse(lies('package.json'));
pruefe(paket.license === 'MIT', 'package.json nennt nicht MIT');
pruefe(String(paket.engines && paket.engines.node).includes('24'),
  'package.json verlangt nicht Node 24');
pruefe(paket.scripts && typeof paket.scripts.test === 'string'
  && paket.scripts.test.includes('node --test'),
  'package.json hat kein test-Skript für die Suite');
pruefe(paket.repository && paket.bugs && paket.homepage,
  'package.json nennt Repository, Fehleradresse oder Startseite nicht');
pruefe(paket.private === true,
  'package.json ist nicht als privates Paket gekennzeichnet');

// 2. Changelog und Editor-Dateien.
const changelog = lies('CHANGELOG.md');
pruefe(changelog.startsWith('# Changelog'), 'CHANGELOG beginnt nicht mit dem Titel');
pruefe(/^## \[(Unveröffentlicht|\d+\.\d+\.\d+)\]/m.test(changelog),
  'CHANGELOG hat weder einen Abschnitt „Unveröffentlicht“ noch eine Fassung');
pruefe(existsSync(join(PRODUKT, '.editorconfig')), '.editorconfig fehlt');
pruefe(existsSync(join(PRODUKT, '.gitattributes')), '.gitattributes fehlt');
pruefe(existsSync(join(PRODUKT, 'README.md')), 'README.md fehlt');

// 3. CI: Node 24, Syntax, Suite; die Werkstatt-Prüfung bleibt draußen.
const ci = lies('.github/workflows/ci.yml');
pruefe(/node-version:\s*24/.test(ci), 'Die CI läuft nicht auf Node 24');
pruefe(ci.includes('node --check client.js'), 'Die CI prüft die Syntax nicht');
pruefe(ci.includes('node --test'), 'Die CI ruft die Suite nicht auf');
pruefe(ci.includes('grep -vE') && ci.includes('markt(25|26|27|42|45|46|48)'),
  'Die CI lässt die Werkstatt-Prüfungen nicht aus');

// 4. Anzeige-Metadaten für die Plugin-Verwaltung.
const SPRACHEN = ['de', 'en', 'es', 'fr', 'ja', 'ar', 'ru', 'zh'];
for (const sprache of SPRACHEN) {
  const datei = join(PRODUKT, 'locale', sprache + '.json');
  pruefe(existsSync(datei), 'locale/' + sprache + '.json fehlt');
  const meta = JSON.parse(readFileSync(datei, 'utf8')).meta || {};
  pruefe(meta.title === 'CollaborationBoard',
    'locale/' + sprache + '.json trägt nicht den Produktnamen');
  pruefe(typeof meta.description === 'string' && meta.description.trim().length > 0,
    'locale/' + sprache + '.json hat keine Beschreibung');
}

// 5. Die Wörterbücher bleiben, wie sie sind.
const texte = readdirSync(join(PRODUKT, 'texte')).filter((n) => n.endsWith('.json'));
pruefe(texte.length === 8, 'Es gibt nicht acht Wörterbücher unter texte/');
for (const name of texte) {
  const inhalt = JSON.parse(readFileSync(join(PRODUKT, 'texte', name), 'utf8'));
  const zahl = Object.keys(inhalt).length;
  if (name === 'de.json') {
    pruefe(zahl === 0, 'texte/de.json ist nicht leer');
  } else {
    pruefe(zahl === 614, 'texte/' + name + ' trägt ' + zahl + ' statt 614 Schlüssel');
  }
}

console.log('ok Grundlagen: MIT, Node 24, CI, acht Anzeige-Metadaten, 614 Schlüssel');
