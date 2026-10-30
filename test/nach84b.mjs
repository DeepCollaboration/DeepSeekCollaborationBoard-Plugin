/**
 * Prüfung Schritt 84b — die Reiter im rechten Dock lassen sich mit der
 * Tastatur wechseln.
 *
 * `client.js` wird als Text gelesen, ohne Browser. Geprüft wird:
 *
 *   1. Die Reiterleiste (`role: 'tablist'`) trägt einen `onKeyDown`.
 *   2. Er behandelt Pfeil links/rechts sowie Home/End.
 *   3. Er setzt den Reiter über `setRechtsReiter` und holt den Fokus auf den
 *      gewählten Knopf (`board-reiter-…`).
 *   4. Die beiden Knöpfe tragen `role: 'tab'`, `aria-selected` und eine
 *      Kennung; die Leiste erscheint nur bei zwei offenen Reitern.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = dirname(fileURLToPath(import.meta.url));
const PRODUKT = dirname(HIER);

function pruefe(bedingung, text) {
  if (!bedingung) throw new Error(text);
}

const quelle = readFileSync(join(PRODUKT, 'client.js'), 'utf8');

const start = quelle.indexOf("const reiterLeiste = beide ? h('div', {");
pruefe(start >= 0, 'Die Reiterleiste der beiden Reiter fehlt');
const ende = quelle.indexOf("h('button', {", start);
pruefe(ende > start, 'Die Reiterleiste endet nicht');
const leiste = quelle.slice(start, ende);

pruefe(leiste.includes("role: 'tablist'"), 'Die Reiterleiste hat keine Rolle tablist');
pruefe(leiste.includes('onKeyDown:'), 'Die Reiterleiste reagiert nicht auf Tasten');
for (const taste of ['ArrowRight', 'ArrowLeft', 'Home', 'End']) {
  pruefe(leiste.includes("'" + taste + "'"), 'Die Taste ' + taste + ' fehlt');
}
pruefe(leiste.includes('setRechtsReiter(ziel)'),
  'Die Tasten setzen den Reiter nicht über setRechtsReiter');
pruefe(leiste.includes("getElementById('board-reiter-' + ziel)"),
  'Der Fokus geht nicht auf den gewählten Reiter');
pruefe(leiste.includes('requestAnimationFrame'),
  'Der Fokus wird vor dem Rendern gesetzt');

for (const [id, wort] of [['board-reiter-station', 'Station'], ['board-reiter-gespraech', 'Gespräch']]) {
  pruefe(quelle.includes("id: '" + id + "'"), 'Der Reiter ' + wort + ' hat keine Kennung');
  pruefe(quelle.includes("uebersetze('" + wort + "')"),
    'Der Reiter ' + wort + ' nutzt nicht die Übersetzung');
}
pruefe(quelle.includes("role: 'tab'"), 'Die Knöpfe tragen keine Rolle tab');
pruefe(quelle.includes("'aria-selected': rechtsAktiv === 'station'"),
  'Der Stationsreiter meldet seine Auswahl nicht');
pruefe(quelle.includes("'aria-selected': rechtsAktiv === 'gespraech'"),
  'Der Gesprächsreiter meldet seine Auswahl nicht');
pruefe(quelle.includes('const beide = stationImDock && gespraechImDock'),
  'Die Leiste hängt nicht an zwei offenen Reitern');

console.log('ok Reiter: Tastatur wechselt, Fokus folgt, Auswahl ist angesagt');
