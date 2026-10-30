/**
 * Die Prüffläche: fünf lokale Repositories unter `/tmp/board-scheibe1/`.
 *
 * Angelegt werden die Stationen „Idee“ und „Umsetzen“, der Workflow, das
 * Vorhaben „Board Gesamtkonzept“ und das Testboard — mit denselben Inhalten
 * wie `test/schritt19.mjs`. Jedes Repository ist ein Git-Repository mit einer
 * Fassung. Der Text von `idee.md` kommt aus dem echten Vorhaben.
 *
 * Das Werkzeug ist wiederholbar: Stehen die fünf Repositories schon da, wird
 * nichts geschrieben — auch `vorhaben.json` nicht. So bleibt ein Weiterschieben
 * aus einem späteren Schritt erhalten.
 *
 * Aufruf:
 *   node werkzeuge/pruefflaeche.mjs
 *
 * Ausgabe: `{ "board": "<pfad>", "vorhaben": "<kennung>" }`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const WURZEL = '/tmp/board-scheibe1';
export const VORHABEN_ID = 'board-gesamtkonzept';

const VORLAGE = process.env.BOARD_ABLAGE || '/workspace/projekte/board';

function schreibeJson(pfad, wert) {
  mkdirSync(dirname(pfad), { recursive: true });
  writeFileSync(pfad, JSON.stringify(wert, null, 2) + '\n', 'utf8');
}

function schreibeText(pfad, text) {
  mkdirSync(dirname(pfad), { recursive: true });
  writeFileSync(pfad, text, 'utf8');
}

function git(ordner, args) {
  const lauf = spawnSync('git', args, {
    cwd: ordner,
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  if (lauf.status !== 0) {
    throw new Error('git ' + args.join(' ') + ' in ' + ordner + ': '
      + String(lauf.stderr || lauf.stdout || 'unbekannter Fehler').trim());
  }
}

/** Eine Fassung je Repository — nur beim Anlegen, nie beim zweiten Lauf. */
function festschreiben(ordner) {
  git(ordner, ['init', '-q', '-b', 'main']);
  git(ordner, ['add', '-A']);
  git(ordner, [
    '-c', 'user.name=Prüffläche',
    '-c', 'user.email=pruefflaeche@board',
    'commit', '-q', '-m', 'Prüffläche',
  ]);
}

/** Die fünf Repositories mit ihren Dateien; die Verweise nennen absolute Pfade. */
function repos(wurzel, idee) {
  const stationIdee = join(wurzel, 'station-idee');
  const stationUmsetzen = join(wurzel, 'station-umsetzen');
  const workflow = join(wurzel, 'workflow');
  const vorhaben = join(wurzel, 'vorhaben');
  const board = join(wurzel, 'board');

  return [
    {
      ordner: stationIdee,
      anker: 'station.json',
      schreibe() {
        schreibeJson(join(stationIdee, 'station.json'), {
          format: 2,
          id: 'idee',
          name: 'Idee',
          beschreibung: 'Thema in einem Satz festhalten. Noch keine Struktur, keine Technik.',
          host: 'p1',
          eingang: [],
          ausgabe: [],
          aktion: {
            art: 'textfeld',
            wert: 'Thema in einem Satz festhalten. Noch keine Struktur, keine Technik.',
          },
          beispiele: [],
          reife: 'erprobt',
          lizenz: 'MIT',
          tags: ['idee', 'start'],
        });
        schreibeText(join(stationIdee, 'README.md'), '# Idee\n');
      },
    },
    {
      ordner: stationUmsetzen,
      anker: 'station.json',
      schreibe() {
        schreibeJson(join(stationUmsetzen, 'station.json'), {
          format: 2,
          id: 'umsetzen',
          name: 'Umsetzen',
          beschreibung: 'Setzt den Bauplan um: ein Schritt je Runde, ein Arbeiter je Schritt, ein frischer Prüfer je Schritt.',
          host: 'p1',
          eingang: ['bauplan.md'],
          ausgabe: ['produkt/', 'umsetzung.md'],
          aktion: { art: 'skill', datei: 'SKILL.md', wert: 'p1-umsetzen' },
          beispiele: [],
          reife: 'erprobt',
          lizenz: 'MIT',
          tags: ['umsetzen', 'bau'],
        });
        schreibeText(join(stationUmsetzen, 'SKILL.md'), '# Umsetzen\n');
        schreibeText(join(stationUmsetzen, 'README.md'), '# Umsetzen\n');
      },
    },
    {
      ordner: workflow,
      anker: 'workflow.json',
      schreibe() {
        schreibeJson(join(workflow, 'workflow.json'), {
          format: 2,
          id: 'standard',
          titel: 'Standard-Workflow',
          beschreibung: 'Vom Thema zum Produkt.',
          autor: 'p1',
          stationen: [
            { repo: stationIdee, fassung: 'v1', id: 'idee' },
            { repo: stationUmsetzen, fassung: 'v1', id: 'umsetzen' },
          ],
          positionen: [
            { id: 'idee', station: 'idee', x: 50, y: 80, bedingung: [] },
            { id: 'umsetzen', station: 'umsetzen', x: 2960, y: 380, bedingung: [] },
          ],
          kanten: [{ von: 'idee', nach: 'umsetzen' }],
          layout: 'auto',
          regeln: {},
        });
      },
    },
    {
      ordner: vorhaben,
      anker: 'vorhaben.json',
      schreibe() {
        schreibeJson(join(vorhaben, 'vorhaben.json'), {
          format: 2,
          id: VORHABEN_ID,
          name: 'Board Gesamtkonzept',
          workflow: { repo: workflow, fassung: 'v1' },
          position: 'idee',
          verantwortliche: { idee: ['p1'] },
          laeufe: [],
          fork_von: null,
          zweig_von: null,
          farbe: '#60a5fa',
        });
        schreibeText(join(vorhaben, 'idee.md'), idee);
      },
    },
    {
      ordner: board,
      anker: 'board.json',
      schreibe() {
        schreibeJson(join(board, 'board.json'), {
          format: 2,
          id: 'testboard',
          name: 'Testboard',
          art: 'team',
          personen: [{ login: 'p1', name: 'Thomas Heinrich', farbe: '#fbbf24' }],
          workflows: [{ repo: workflow, fassung: 'v1' }],
          vorhaben: [{ repo: vorhaben }],
          stationen: [{ repo: stationIdee }, { repo: stationUmsetzen }],
          einstellungen: {},
          layout: {},
        });
      },
    },
  ];
}

/**
 * Legt die Prüffläche an. Vorhandene Repositories bleiben unangetastet.
 * `wurzel` ist der Ordner der fünf Repositories; die Prüfungen legen ihre
 * eigene Fläche daneben, damit sie niemandem die gemeinsame wegziehen.
 */
export function legePruefflaeche({ wurzel = WURZEL, idee } = {}) {
  const ort = resolve(String(wurzel == null ? WURZEL : wurzel));
  const text = idee == null
    ? readFileSync(join(VORLAGE, 'vorgaenge', VORHABEN_ID, 'idee.md'), 'utf8')
    : String(idee);

  for (const repo of repos(ort, text)) {
    if (existsSync(join(repo.ordner, repo.anker))) continue;
    mkdirSync(repo.ordner, { recursive: true });
    repo.schreibe();
    festschreiben(repo.ordner);
  }

  return { board: join(ort, 'board'), vorhaben: VORHABEN_ID };
}

const direkt = process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (direkt) {
  try {
    console.log(JSON.stringify(legePruefflaeche()));
  } catch (fehler) {
    console.error('FEHLER: ' + String((fehler && fehler.message) || fehler));
    process.exit(1);
  }
}
