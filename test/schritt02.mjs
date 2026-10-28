/**
 * Prüfung Schritt 02 — Ablage aus der Konfiguration, Urheber aus der Ablage.
 *
 * Kopiert das Produkt nach /tmp, gibt der Kopie eine eigene
 * `board.config.json` mit einem Prüf-Repository und einem eigenen `$DSH_HOME`,
 * lädt das Modul mit einem minimalen ctx, ruft schreibende Routen auf und sieht
 * nach, wer die entstandene Fassung festgehalten hat. Die echte Ablage wird
 * dabei nicht angefasst.
 *
 * Die Ablage liegt seit Schritt 03 in der neuen Form (`format`, `personen/`,
 * `workflows/`, `vorgaenge/<ordner>/vorhaben.json`); `board.json` kommt nicht
 * mehr vor.
 */
import {
  cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PRODUKT = dirname(dirname(fileURLToPath(import.meta.url)));
const NAME = 'Thomas Heinrich';
const stamm = mkdtempSync(join(tmpdir(), 'board-schritt02-'));
const kopie = join(stamm, 'produkt');
const ablage = join(stamm, 'ablage');
const home = join(stamm, 'home');
const ohneKopie = join(stamm, 'ohne-konfiguration');

function git(args) {
  const lauf = spawnSync('git', args, { encoding: 'utf8' });
  return {
    ok: lauf.status === 0,
    out: String(lauf.stdout || '').trim(),
    fehler: String(lauf.stderr || '').trim(),
  };
}

function gitOderFehler(args) {
  const lauf = git(args);
  if (!lauf.ok) throw new Error('git ' + args.join(' ') + ': ' + lauf.fehler);
  return lauf.out;
}

function schreibe(pfad, wert) {
  mkdirSync(dirname(pfad), { recursive: true });
  writeFileSync(pfad, JSON.stringify(wert, null, 2) + '\n', 'utf8');
}

/** Ein minimaler ctx: Handler sammeln, Effekte ausführen, kein Dienst. */
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
      get() {
        return undefined;
      },
    },
  };
}

/** Ein POST-Körper als Strom, wie ihn der Host liest. */
function anfrage(pfad, koerper) {
  return {
    method: 'POST',
    url: pfad,
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(JSON.stringify(koerper), 'utf8');
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

function pruefe(bedingung, text) {
  if (!bedingung) throw new Error(text);
}

try {
  // 1. Das Produkt als Kopie; die echte Ablage bleibt unberührt.
  cpSync(PRODUKT, kopie, { recursive: true });
  mkdirSync(join(ablage, 'personen'), { recursive: true });
  mkdirSync(join(ablage, 'workflows'), { recursive: true });
  mkdirSync(join(ablage, 'vorgaenge', 'v1'), { recursive: true });
  mkdirSync(home, { recursive: true });

  writeFileSync(join(kopie, 'board.config.json'), JSON.stringify({
    person: 'p1',
    repo: ablage,
  }, null, 2) + '\n', 'utf8');

  // 2. Prüf-Repository in der neuen Form.
  writeFileSync(join(ablage, 'format'), '1\n', 'utf8');
  schreibe(join(ablage, 'personen', 'p1.json'), {
    id: 'p1', name: NAME, farbe: '#fbbf24',
  });
  schreibe(join(ablage, 'workflows', 'p1.json'), {
    person: 'p1',
    workflows: [{
      id: 'standard',
      titel: 'Prüf-Workflow',
      schritte: [{
        id: 's1', name: 'Schritt', host: 'p1', eingang: [], ausgabe: [],
        wie: { art: 'datei', wert: '' }, skill: null,
      }],
      positionen: [{ id: 's1', schritt: 's1', x: 40, y: 80 }],
      kanten: [],
      layout: 'auto',
    }],
  });
  schreibe(join(ablage, 'vorgaenge', 'v1', 'vorhaben.json'), {
    id: 'v1',
    name: 'Prüfvorhaben',
    position: 's1',
    // Wer hier schreiben will, muss seit Schritt 06 eingetragen sein; der
    // eigene Eintrag entsteht beim Anlegen und beim Weitergeben.
    verantwortliche: { s1: ['p1'] },
    regel: 'einer',
    rueckkehr: [],
    laeufe: [],
    fork_von: null,
    zweig_von: null,
  });
  gitOderFehler(['init', '-b', 'main', ablage]);
  gitOderFehler(['-C', ablage, 'add', '-A']);
  gitOderFehler([
    '-C', ablage,
    '-c', 'user.name=Prüfung', '-c', 'user.email=pruefung@board',
    'commit', '-m', 'Prüf-Ablage angelegt',
  ]);
  const vorher = Number(gitOderFehler(['-C', ablage, 'rev-list', '--count', 'HEAD']));

  // 3. Das kopierte Modul laden und zwei schreibende Routen aufrufen:
  //    eine Einstellung (persönlich, außerhalb der Ablage) und eine Datei.
  process.env.DSH_HOME = home;
  const gebaut = ctxBauen();
  const modul = await import(pathToFileURL(join(kopie, 'index.js')).href);
  pruefe(typeof modul.apply === 'function', 'Das Modul exportiert apply nicht');
  modul.apply(gebaut.ctx);

  const einstellung = gebaut.routen.get('/board/einstellung');
  pruefe(einstellung && typeof einstellung.handler === 'function', 'Die Route /board/einstellung fehlt');
  const resEinstellung = antwort();
  await einstellung.handler(anfrage('/board/einstellung', {
    name: 'mausrad', wert: 'seitwaerts',
  }), resEinstellung);
  pruefe(resEinstellung.status === 200,
    '/board/einstellung antwortet ' + resEinstellung.status + ': ' + resEinstellung.text);

  const schreiben = gebaut.routen.get('/board/doc/schreiben');
  pruefe(schreiben && typeof schreiben.handler === 'function', 'Die Route /board/doc/schreiben fehlt');
  const resSchreiben = antwort();
  await schreiben.handler(anfrage('/board/doc/schreiben', {
    vorhaben: 'v1', datei: 'notiz.md', text: 'Ein Satz.\n',
  }), resSchreiben);
  pruefe(resSchreiben.status === 200,
    '/board/doc/schreiben antwortet ' + resSchreiben.status + ': ' + resSchreiben.text);

  // 4. Die Fassung im Prüf-Repository trägt den Namen aus der Personendatei.
  const nachher = Number(gitOderFehler(['-C', ablage, 'rev-list', '--count', 'HEAD']));
  pruefe(nachher === vorher + 1,
    'Nicht eine neue Fassung (vorher ' + vorher + ', nachher ' + nachher + ')');
  const autoren = gitOderFehler(['-C', ablage, 'log', '-1', '--format=%an']).split('\n');
  pruefe(autoren.length === 1 && autoren[0] === NAME,
    'Der Urheber ist „' + autoren.join('“, „') + '“, erwartet „' + NAME + '“');
  const autor = autoren[0];
  const nachricht = gitOderFehler(['-C', ablage, 'log', '-1', '--format=%s']);
  const einstellungen = JSON.parse(readFileSync(join(home, 'board', 'einstellungen.json'), 'utf8'));
  pruefe(einstellungen.mausrad === 'seitwaerts',
    'Die Route hat die Einstellung nicht geschrieben');
  pruefe(!existsSync(join(ablage, 'einstellungen.json')),
    'Die Einstellungen liegen noch in der Ablage');
  pruefe(!existsSync(join(ablage, 'board.json')), 'board.json wurde angelegt');
  const datei = readFileSync(join(ablage, 'vorgaenge', 'v1', 'notiz.md'), 'utf8');
  pruefe(datei === 'Ein Satz.\n', 'Die Datei im Vorhaben-Ordner fehlt oder ist falsch');

  gebaut.aufraeumen.forEach((ende) => ende());

  // 5. Ohne Konfiguration lädt das Modul weiter und stürzt nicht ab.
  cpSync(PRODUKT, ohneKopie, { recursive: true });
  rmSync(join(ohneKopie, 'board.config.json'));
  const ohne = ctxBauen();
  const modulOhne = await import(pathToFileURL(join(ohneKopie, 'index.js')).href);
  modulOhne.apply(ohne.ctx);
  pruefe(ohne.routen.has('/board/data'), 'Ohne Konfiguration fehlen die Routen');
  ohne.aufraeumen.forEach((ende) => ende());

  console.log('ok Kopie: ' + kopie);
  console.log('ok Routen: /board/einstellung → ' + resEinstellung.status
    + ', /board/doc/schreiben → ' + resSchreiben.status);
  console.log('ok Fassungen: ' + vorher + ' → ' + nachher);
  console.log('ok Urheber: ' + autor);
  console.log('ok Einstellungen: ' + join(home, 'board', 'einstellungen.json'));
  console.log('ok Datei: vorgaenge/v1/notiz.md');
  console.log('ok letzte Nachricht: ' + nachricht);
  console.log('ok ohne Konfiguration: Modul lädt und apply läuft');
  rmSync(stamm, { recursive: true, force: true });
} catch (fehler) {
  console.error('FEHLER: ' + String((fehler && fehler.message) || fehler));
  console.error('Prüfordner bleibt liegen: ' + stamm);
  process.exitCode = 1;
}
