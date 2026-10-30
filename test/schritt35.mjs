/**
 * Prüfung Schritt 35 — Beiträge als Pull Requests.
 *
 * Unter `/tmp/board-scheibe1/schritt35` entstehen ein Board der Fassung 2 mit
 * einer Station, einem Workflow und einem Vorhaben, alle als eigene
 * Repositories mit GitHub-Remote. Ein nachgebildeter GitHub-Server nimmt Pull
 * Requests an, liest sie und führt sie zusammen.
 *
 * Geprüft wird:
 *
 *   1. Ohne Token ist ein öffentliches Repository lesbar; die Antwort trägt
 *      `kann:false`, die GitHub-Adresse und den Verweis auf GitHub.
 *   2. Ohne Token wird kein Pull Request angelegt: 409 mit `kann:false`, der
 *      Adresse und „Pull Request auf GitHub öffnen“.
 *   3. Mit Token legt die Route einen Pull Request an; Antwort und Liste
 *      nennen Nummer, Adresse und „offen“.
 *   4. Nach dem Zusammenführen bleibt der Beitrag sichtbar und heißt
 *      „zusammengeführt“; ein abgelehnter bleibt „geschlossen“ sichtbar.
 *   5. Ein einzelner Beitrag lässt sich mit seinem Zustand lesen.
 *   6. Mit einem Token ohne Schreibrecht entsteht kein Pull Request (403).
 *   7. Im lokalen Repository entsteht kein Commit und keine Änderung.
 *
 * Kein echter GitHub-Aufruf; Ablage und Home werden danach entfernt.
 */
import { createServer } from 'node:http';
import {
  existsSync, mkdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HIER = dirname(fileURLToPath(import.meta.url));
const PRODUKT = dirname(HIER);
const WURZEL = '/tmp/board-scheibe1';
const ABLAGE = join(WURZEL, 'schritt35');
const HOME = join(ABLAGE, 'home');
const FLAECHE = join(ABLAGE, 'flaeche');
const BOARD = join(FLAECHE, 'board-hauptboard');
const STATION = join(FLAECHE, 'station-idee');
const WORKFLOW = join(FLAECHE, 'workflow-standard');
const VORHABEN = join(FLAECHE, 'vorhaben-board-gesamtkonzept');
/** Ein Repository mit GitHub-Remote, das das Board nicht nennt. */
const FREMD = join(FLAECHE, 'fremd-repo');
const ORGANISATION = 'DeepCollaboration';
const TOKEN = 'pruef-token';
const NUR_LESEN = 'nurleser-token';
const REPO = ORGANISATION + '/vorhaben-board-gesamtkonzept';
const ADRESSE = 'https://github.com/' + REPO;
/** Die Repositories, die der nachgebildete Server kennt. */
const BEKANNT = new Set([
  'board-hauptboard', 'station-idee', 'workflow-standard',
  'vorhaben-board-gesamtkonzept',
]);

function pruefe(bedingung, text) {
  if (!bedingung) throw new Error(text);
}

function schreibeJson(pfad, wert) {
  mkdirSync(dirname(pfad), { recursive: true });
  writeFileSync(pfad, JSON.stringify(wert, null, 2) + '\n', 'utf8');
}

function git(ordner, args) {
  const lauf = spawnSync('git', args, {
    cwd: ordner,
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  pruefe(lauf.status === 0, 'git ' + args.join(' ') + ' in ' + ordner + ': '
    + String(lauf.stderr || lauf.stdout || 'unbekannter Fehler').trim());
  return String(lauf.stdout || '').trim();
}

/** Ein Repository mit einer Fassung `v0` und einem GitHub-Remote. */
function festschreiben(ordner, name) {
  git(ordner, ['init', '-q', '-b', 'main']);
  git(ordner, ['add', '-A']);
  git(ordner, [
    '-c', 'user.name=Prüffläche',
    '-c', 'user.email=pruefflaeche@board',
    'commit', '-q', '-m', 'Prüffläche',
  ]);
  git(ordner, ['tag', 'v0']);
  git(ordner, ['remote', 'add', 'origin', 'https://github.com/'
    + ORGANISATION + '/' + name + '.git']);
}

/** Das Board der Fassung 2: ein Vorhaben an einer Station. */
function legeFlaeche() {
  schreibeJson(join(STATION, 'station.json'), {
    format: 2,
    id: 'idee',
    name: 'Idee',
    beschreibung: 'Thema in einem Satz festhalten.',
    host: 'p1',
    eingang: [],
    ausgabe: [],
    aktion: { art: 'textfeld', wert: 'Thema in einem Satz festhalten.' },
    beispiele: [],
    reife: 'erprobt',
    lizenz: 'MIT',
    tags: ['idee'],
  });
  writeFileSync(join(STATION, 'README.md'), '# Idee\n', 'utf8');
  festschreiben(STATION, 'station-idee');

  schreibeJson(join(WORKFLOW, 'workflow.json'), {
    format: 2,
    id: 'standard',
    titel: 'Standard-Workflow',
    beschreibung: 'Vom ersten Satz zum Produkt.',
    autor: 'p1',
    stationen: [{ repo: STATION, fassung: 'v1', id: 'idee' }],
    positionen: [{ id: 'idee', station: 'idee', x: 50, y: 80, bedingung: [] }],
    kanten: [],
    layout: 'auto',
    regeln: {},
  });
  festschreiben(WORKFLOW, 'workflow-standard');

  schreibeJson(join(VORHABEN, 'vorhaben.json'), {
    format: 2,
    id: 'board-gesamtkonzept',
    name: 'Board Gesamtkonzept',
    workflow: { repo: WORKFLOW, fassung: 'v1' },
    position: 'idee',
    verantwortliche: { idee: ['p1'] },
    laeufe: [],
    farbe: '#8b5cf6',
  });
  writeFileSync(join(VORHABEN, 'README.md'), '# Vorhaben\n', 'utf8');
  festschreiben(VORHABEN, 'vorhaben-board-gesamtkonzept');

  schreibeJson(join(BOARD, 'board.json'), {
    format: 2,
    id: 'hauptboard',
    name: 'Hauptboard',
    art: 'hauptboard',
    personen: [{ login: 'p1', name: 'Thomas Heinrich', farbe: '#fbbf24' }],
    workflows: [{ repo: WORKFLOW, fassung: 'v1' }],
    vorhaben: [{ repo: VORHABEN }],
    stationen: [{ repo: STATION }],
    einstellungen: {},
    layout: {},
  });
  writeFileSync(join(BOARD, 'README.md'), '# Hauptboard\n', 'utf8');
  festschreiben(BOARD, 'board-hauptboard');
}

/* --- Der nachgebildete GitHub-Server ------------------------------------- */

let server = null;
let basis = '';
const PRS = [];
const anfragen = [];
let naechsteNummer = 1;

function pullAntwort(pr) {
  return {
    number: pr.nummer,
    title: pr.titel,
    body: pr.text,
    state: pr.state,
    merged_at: pr.merged_at,
    user: { login: pr.autor || 'p1' },
    html_url: 'https://github.com/' + pr.repo + '/pull/' + pr.nummer,
    created_at: pr.erstellt,
    updated_at: pr.aktualisiert || pr.erstellt,
    head: { ref: pr.head },
    base: { ref: pr.base },
  };
}

/** GitHub führt einen Pull Request zusammen: geschlossen, mit `merged_at`. */
function fuehreZusammen(pr) {
  pr.state = 'closed';
  pr.merged_at = '2026-10-28T12:00:00Z';
}

/** GitHub lehnt einen Pull Request ab: geschlossen, ohne `merged_at`. */
function lehneAb(pr) {
  pr.state = 'closed';
  pr.merged_at = null;
}

function starteServer() {
  return new Promise((erfuellt, abgelehnt) => {
    const s = createServer(async (req, res) => {
      let roh = '';
      for await (const stueck of req) roh += stueck;
      const senden = (status, wert) => {
        const text = wert == null ? '' : JSON.stringify(wert);
        res.writeHead(status, {
          'content-type': 'application/json; charset=utf-8',
          'content-length': Buffer.byteLength(text),
        });
        res.end(text);
      };
      const pfad = new URL(req.url, 'http://127.0.0.1').pathname;
      const teile = pfad.split('/').filter(Boolean);
      anfragen.push(req.method + ' ' + pfad);
      const kopf = String(req.headers.authorization || '');
      const token = kopf.replace(/^Bearer\s+/i, '');

      if (req.method === 'GET' && pfad === '/user') {
        senden(200, { login: token === NUR_LESEN ? 'nurleser' : 'p1' });
        return;
      }
      if (teile[0] === 'repos' && teile.length >= 3) {
        const owner = teile[1];
        const name = teile[2];
        const repo = owner + '/' + name;
        if (!BEKANNT.has(name)) {
          senden(404, { message: 'Not Found' });
          return;
        }

        // Das Schreibrecht: „nurleser“ darf lesen, alle anderen schreiben.
        if (teile[3] === 'collaborators' && teile[5] === 'permission') {
          senden(200, {
            permission: teile[4] === 'nurleser' ? 'read' : 'push',
            role_name: teile[4] === 'nurleser' ? 'read' : 'push',
          });
          return;
        }

        // Die Beiträge: alle Zustände, der neueste zuerst.
        if (req.method === 'GET' && teile[3] === 'pulls' && teile.length === 4) {
          senden(200, PRS.filter((pr) => pr.repo === repo).slice().reverse()
            .map(pullAntwort));
          return;
        }

        // Ein einzelner Beitrag.
        if (req.method === 'GET' && teile[3] === 'pulls' && teile.length === 5) {
          const pr = PRS.find((eintrag) => eintrag.repo === repo
            && eintrag.nummer === Number(teile[4]));
          if (!pr) { senden(404, { message: 'Not Found' }); return; }
          senden(200, pullAntwort(pr));
          return;
        }

        // Anlegen.
        if (req.method === 'POST' && teile[3] === 'pulls' && teile.length === 4) {
          let koerper = {};
          try { koerper = JSON.parse(roh || '{}'); } catch { koerper = {}; }
          if (!koerper.head || !koerper.base) {
            senden(422, { message: 'head und base sind Pflicht' });
            return;
          }
          const pr = {
            repo,
            nummer: naechsteNummer,
            titel: String(koerper.title || ''),
            text: String(koerper.body || ''),
            head: String(koerper.head),
            base: String(koerper.base),
            state: 'open',
            merged_at: null,
            erstellt: '2026-10-28T10:00:00Z',
          };
          naechsteNummer += 1;
          PRS.push(pr);
          senden(201, pullAntwort(pr));
          return;
        }

        // Die Metadaten eines Repositories.
        if (req.method === 'GET' && teile.length === 3) {
          senden(200, {
            name,
            full_name: repo,
            private: false,
            stargazers_count: 0,
            forks_count: 0,
            open_issues_count: 0,
            description: 'Prüf-Repository',
            topics: [],
            default_branch: 'main',
            html_url: 'https://github.com/' + repo,
            pushed_at: null,
            license: null,
            archived: false,
            owner: { login: owner },
          });
          return;
        }
      }
      senden(404, { message: 'Not Found' });
    });
    s.on('error', abgelehnt);
    s.listen(0, '127.0.0.1', () => {
      server = s;
      basis = 'http://127.0.0.1:' + s.address().port;
      erfuellt(basis);
    });
  });
}

function beendeServer() {
  return new Promise((fertig) => {
    if (!server) { fertig(); return; }
    server.close(() => { server = null; fertig(); });
  });
}

/* --- Der Server in-process ----------------------------------------------- */

function ctxBauen() {
  const routen = new Map();
  const aufraeumen = [];
  return {
    routen,
    aufraeumen,
    ctx: {
      webServer: {
        register(route) {
          routen.set(route.path, route);
          return () => routen.delete(route.path);
        },
      },
      effect(fn) {
        const ende = fn();
        if (typeof ende === 'function') aufraeumen.push(ende);
      },
      get() { return undefined; },
    },
  };
}

function anfrage(pfad, koerper) {
  return {
    method: koerper === undefined ? 'GET' : 'POST',
    url: pfad,
    async *[Symbol.asyncIterator]() {
      if (koerper !== undefined) yield JSON.stringify(koerper);
    },
  };
}

function antwort() {
  return {
    status: 0,
    text: '',
    writeHead(status) { this.status = status; },
    end(text) { this.text = String(text == null ? '' : text); },
  };
}

async function ruf(gebaut, pfad, koerper) {
  const res = antwort();
  await gebaut.routen.get(String(pfad).split('?')[0]).handler(
    anfrage(pfad, koerper), res,
  );
  for (let i = 0; i < 300 && res.status === 0; i += 1) {
    await new Promise((fertig) => setTimeout(fertig, 10));
  }
  return {
    status: res.status,
    text: res.text,
    daten: res.text ? JSON.parse(res.text) : null,
  };
}

function tokenAblegen(token) {
  mkdirSync(join(HOME, 'board'), { recursive: true });
  writeFileSync(join(HOME, 'board', 'github.json'),
    JSON.stringify({ token }) + '\n', { encoding: 'utf8', mode: 0o600 });
}

/* --- Die Prüfung --------------------------------------------------------- */

let gebaut = null;
let bestanden = false;

rmSync(ABLAGE, { recursive: true, force: true });

try {
  mkdirSync(ABLAGE, { recursive: true });
  legeFlaeche();
  schreibeJson(join(HOME, 'board', 'boards.json'), {
    format: 1,
    aktiv: 'hauptboard-2',
    boards: [{
      id: 'hauptboard-2', name: 'Hauptboard', format: 2, art: 'hauptboard',
      repo: BOARD, remote: null, person: 'p1', sichtbarkeit: 'öffentlich',
    }],
  });

  await starteServer();
  process.env.DSH_HOME = HOME;
  process.env.DSH_GITHUB_API = basis;

  const indexModul = await import(pathToFileURL(join(PRODUKT, 'index.js')).href);
  gebaut = ctxBauen();
  indexModul.apply(gebaut.ctx);
  pruefe(gebaut.routen.has('/board/github/beitraege'),
    'Die Route /board/github/beitraege fehlt');
  pruefe(gebaut.routen.has('/board/github/beitrag'),
    'Die Route /board/github/beitrag fehlt');

  const beitragsListe = '/board/github/beitraege?repo=' + encodeURIComponent(REPO);

  // 1. Ohne Token: öffentlich lesbar, aber kein Anlegen.
  const ohneToken = await ruf(gebaut, beitragsListe);
  pruefe(ohneToken.status === 200, 'Ohne Token antwortet die Liste '
    + ohneToken.status + ': ' + ohneToken.text);
  pruefe(ohneToken.daten.kann === false, 'Ohne Token behauptet die Liste, '
    + 'ein Pull Request sei möglich: ' + ohneToken.text);
  pruefe(ohneToken.daten.adresse === ADRESSE, 'Die GitHub-Adresse fehlt: '
    + JSON.stringify(ohneToken.daten.adresse));
  pruefe(Array.isArray(ohneToken.daten.beitraege)
    && ohneToken.daten.beitraege.length === 0,
  'Ohne Beiträge ist die Liste nicht leer: ' + ohneToken.text);
  pruefe(ohneToken.daten.hinweis === '', 'Ohne Grund meldet die Liste einen '
    + 'Hinweis: ' + JSON.stringify(ohneToken.daten.hinweis));

  // 2. Ohne Token kein Pull Request: 409 mit Adresse und kann:false.
  const beitrag = {
    repo: REPO,
    titel: 'Idee schärfen',
    text: 'Der Beitrag.',
    head: 'beitrag/eins',
    base: 'main',
  };
  const abgewiesen = await ruf(gebaut, '/board/github/beitrag', beitrag);
  pruefe(abgewiesen.status === 409, 'Ohne Token antwortet das Anlegen '
    + abgewiesen.status + ': ' + abgewiesen.text);
  pruefe(abgewiesen.daten.kann === false, 'Ohne Token fehlt „kann: false“: '
    + abgewiesen.text);
  pruefe(abgewiesen.daten.adresse === ADRESSE, 'Der 409 nennt die '
    + 'GitHub-Adresse nicht: ' + JSON.stringify(abgewiesen.daten.adresse));
  pruefe(String(abgewiesen.daten.hinweis).includes('Pull Request auf GitHub öffnen'),
    'Der Hinweis auf GitHub fehlt: ' + JSON.stringify(abgewiesen.daten.hinweis));
  pruefe(PRS.length === 0, 'Ohne Token wurde ein Pull Request angelegt');
  pruefe(!anfragen.some((eintrag) => eintrag.startsWith('POST')),
    'Ohne Token ging ein Schreibaufruf an GitHub: ' + JSON.stringify(anfragen));

  // Ein Repository, das ohne Zugang nicht lesbar ist, bleibt ein Verweis.
  const fern = await ruf(gebaut, '/board/github/beitraege?repo='
    + encodeURIComponent(ORGANISATION + '/geheim'));
  pruefe(fern.status === 200 && fern.daten.kann === false
    && String(fern.daten.hinweis).trim(), 'Ein nicht lesbares Repository '
    + 'antwortet nicht mit dem Verweis: ' + fern.text);

  // 3. Mit Token: anlegen.
  tokenAblegen(TOKEN);
  const kopfVorher = git(VORHABEN, ['rev-parse', 'HEAD']);

  const ohneZweig = await ruf(gebaut, '/board/github/beitrag', {
    repo: REPO, titel: 'Ohne Zweig', text: '', base: 'main',
  });
  pruefe(ohneZweig.status === 400, 'Ohne Quellzweig antwortet das Anlegen '
    + ohneZweig.status + ': ' + ohneZweig.text);

  const angelegt = await ruf(gebaut, '/board/github/beitrag', beitrag);
  pruefe(angelegt.status === 200, 'Mit Token antwortet das Anlegen '
    + angelegt.status + ': ' + angelegt.text);
  pruefe(angelegt.daten.nummer === 1, 'Der angelegte Beitrag hat nicht die '
    + 'Nummer 1: ' + angelegt.text);
  pruefe(angelegt.daten.adresse === ADRESSE + '/pull/1', 'Die Adresse des '
    + 'Beitrags stimmt nicht: ' + JSON.stringify(angelegt.daten.adresse));
  pruefe(PRS.length === 1, 'Bei GitHub liegt nicht genau ein Pull Request: '
    + JSON.stringify(PRS.map((pr) => pr.nummer)));
  pruefe(PRS[0].titel === 'Idee schärfen' && PRS[0].text === 'Der Beitrag.'
    && PRS[0].head === 'beitrag/eins' && PRS[0].base === 'main',
  'Der Pull Request trägt nicht Titel, Text und Zweige: '
    + JSON.stringify(PRS[0]));

  // 4. Die Liste zeigt den Beitrag als „offen“.
  const mitToken = await ruf(gebaut, beitragsListe);
  pruefe(mitToken.status === 200, 'Mit Token antwortet die Liste '
    + mitToken.status + ': ' + mitToken.text);
  pruefe(mitToken.daten.kann === true, 'Mit Token fehlt „kann: true“: '
    + mitToken.text);
  pruefe(mitToken.daten.beitraege.length === 1, 'Die Liste zeigt nicht genau '
    + 'einen Beitrag: ' + mitToken.text);
  const erster = mitToken.daten.beitraege[0];
  pruefe(erster.nummer === 1 && erster.titel === 'Idee schärfen'
    && erster.zustand === 'offen' && erster.zusammenGefuehrt === false,
  'Der Beitrag steht nicht als „offen“ in der Liste: '
    + JSON.stringify(erster));
  pruefe(erster.autor === 'p1' && erster.quelle === 'beitrag/eins'
    && erster.ziel === 'main', 'Autor oder Zweige des Beitrags fehlen: '
    + JSON.stringify(erster));

  const einzeln = await ruf(gebaut, '/board/github/beitrag?repo='
    + encodeURIComponent(REPO) + '&nummer=1');
  pruefe(einzeln.status === 200, 'Der einzelne Beitrag antwortet '
    + einzeln.status + ': ' + einzeln.text);
  pruefe(einzeln.daten.beitrag.nummer === 1
    && einzeln.daten.beitrag.zustand === 'offen',
  'Der einzelne Beitrag nennt Nummer oder Zustand nicht: ' + einzeln.text);

  // 5. Zusammengeführt: derselbe Beitrag bleibt sichtbar.
  fuehreZusammen(PRS[0]);
  const zusammengefuehrt = await ruf(gebaut, beitragsListe);
  pruefe(zusammengefuehrt.daten.beitraege.length === 1,
    'Der zusammengeführte Beitrag verschwindet: ' + zusammengefuehrt.text);
  const eins = zusammengefuehrt.daten.beitraege[0];
  pruefe(eins.nummer === 1 && eins.zustand === 'zusammengeführt'
    && eins.zusammenGefuehrt === true,
  'Der zusammengeführte Beitrag heißt nicht „zusammengeführt“: '
    + JSON.stringify(eins));

  // 6. Ein abgelehnter Beitrag bleibt „geschlossen“ sichtbar. Die Oberfläche
  //    schickt den lokalen Ordner; auch er wird verstanden.
  const zweiter = await ruf(gebaut, '/board/github/beitrag', {
    repo: VORHABEN,
    titel: 'Verworfen',
    text: '',
    head: 'beitrag/zwei',
    base: 'main',
  });
  pruefe(zweiter.status === 200 && zweiter.daten.nummer === 2,
    'Der zweite Beitrag wurde nicht angelegt: ' + zweiter.text);
  lehneAb(PRS[1]);
  const liste = await ruf(gebaut, beitragsListe);
  pruefe(liste.daten.beitraege.length === 2, 'Die abgelehnte und die '
    + 'zusammengeführte Fassung stehen nicht beide in der Liste: '
    + liste.text);
  const bleibtEins = liste.daten.beitraege.find((b) => b.nummer === 1);
  const bleibtZwei = liste.daten.beitraege.find((b) => b.nummer === 2);
  pruefe(bleibtEins && bleibtEins.zustand === 'zusammengeführt',
    'Der zusammengeführte Beitrag verliert seinen Zustand: '
    + JSON.stringify(bleibtEins));
  pruefe(bleibtZwei && bleibtZwei.zustand === 'geschlossen'
    && bleibtZwei.zusammenGefuehrt === false,
  'Der abgelehnte Beitrag steht nicht als „geschlossen“: '
    + JSON.stringify(bleibtZwei));

  // Der lokale Ordner ist der Weg der Oberfläche: er löst zur selben Adresse
  // auf und zeigt denselben Stand.
  const ueberOrdner = await ruf(gebaut, '/board/github/beitraege?repo='
    + encodeURIComponent(VORHABEN));
  pruefe(ueberOrdner.status === 200 && ueberOrdner.daten.adresse === ADRESSE
    && ueberOrdner.daten.beitraege.length === 2,
  'Der lokale Ordner löst nicht zum GitHub-Repository auf: ' + ueberOrdner.text);

  // 7. Ein fremder lokaler Ordner wird abgewiesen, bevor GitHub gefragt wird:
  //    ein GitHub-Remote allein macht ihn nicht zu einem Repository des
  //    Boards. Auch als owner/name bleibt er fremd.
  mkdirSync(FREMD, { recursive: true });
  writeFileSync(join(FREMD, 'README.md'), '# Fremd\n', 'utf8');
  festschreiben(FREMD, 'fremd-repo');
  const vorherAnfragen = anfragen.length;
  const fremdOrdner = await ruf(gebaut, '/board/github/beitrag', {
    repo: FREMD,
    titel: 'Nicht aus dem Board',
    text: '',
    head: 'beitrag/fremd',
    base: 'main',
  });
  pruefe(fremdOrdner.status === 403, 'Ein fremder lokaler Ordner antwortet '
    + fremdOrdner.status + ': ' + fremdOrdner.text);
  pruefe(String(fremdOrdner.daten.error).includes('DeepCollaboration/fremd-repo'),
    'Der Fehler nennt das fremde Repository nicht: ' + fremdOrdner.text);
  pruefe(anfragen.length === vorherAnfragen,
    'Für den fremden Ordner ging ein Aufruf an GitHub: '
      + JSON.stringify(anfragen.slice(vorherAnfragen)));
  pruefe(!anfragen.some((eintrag) => String(eintrag).includes('fremd-repo')),
    'Für das fremde Repository wurde GitHub gefragt: ' + JSON.stringify(anfragen));
  pruefe(PRS.length === 2, 'Für den fremden Ordner wurde ein Pull Request '
    + 'angelegt: ' + JSON.stringify(PRS.map((pr) => pr.repo + '#' + pr.nummer)));

  const fremdName = await ruf(gebaut, '/board/github/beitrag', {
    repo: 'DeepCollaboration/fremd-repo',
    titel: 'Nicht aus dem Board',
    text: '',
    head: 'beitrag/fremd',
    base: 'main',
  });
  pruefe(fremdName.status === 403, 'Ein fremdes Repository als owner/name '
    + 'antwortet ' + fremdName.status + ': ' + fremdName.text);
  pruefe(anfragen.length === vorherAnfragen,
    'Für das fremde Repository als owner/name ging ein Aufruf an GitHub: '
      + JSON.stringify(anfragen.slice(vorherAnfragen)));

  // 8. Ein Token ohne Schreibrecht legt nichts an.
  tokenAblegen(NUR_LESEN);
  const ohneRecht = await ruf(gebaut, '/board/github/beitrag', {
    repo: REPO,
    titel: 'Darf nicht',
    text: '',
    head: 'beitrag/drei',
    base: 'main',
  });
  pruefe(ohneRecht.status === 403, 'Ohne Schreibrecht antwortet das Anlegen '
    + ohneRecht.status + ': ' + ohneRecht.text);
  pruefe(String(ohneRecht.daten.error).includes(REPO), 'Der Fehler nennt das '
    + 'Repository nicht: ' + ohneRecht.text);
  pruefe(PRS.length === 2, 'Ohne Schreibrecht wurde ein Pull Request angelegt: '
    + JSON.stringify(PRS.map((pr) => pr.nummer)));

  // 9. Kein Commit und keine Änderung im lokalen Repository.
  pruefe(git(VORHABEN, ['rev-parse', 'HEAD']) === kopfVorher,
    'Der Beitrag hat einen Commit im lokalen Repository angelegt');
  pruefe(git(VORHABEN, ['status', '--porcelain']) === '',
    'Der Beitrag hat Dateien im lokalen Repository verändert');
  pruefe(git(BOARD, ['status', '--porcelain']) === '',
    'Der Beitrag hat das Board verändert');
  pruefe(git(STATION, ['status', '--porcelain']) === '',
    'Der Beitrag hat die Station verändert');

  bestanden = true;
} finally {
  if (gebaut) gebaut.aufraeumen.forEach((ende) => ende());
  await beendeServer();
  delete process.env.DSH_GITHUB_API;
  delete process.env.DSH_HOME;
  rmSync(ABLAGE, { recursive: true, force: true });
}

pruefe(bestanden, 'Die Prüfung ist nicht durchgelaufen');
pruefe(!existsSync(ABLAGE), 'Ablage und Home wurden nicht entfernt');
console.log('ok Beiträge: ohne Token Verweis, mit Token PR #1 offen, '
  + 'zusammengeführt, geschlossen sichtbar');
