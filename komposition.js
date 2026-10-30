/**
 * Die Komposition: aus einem Board der Fassung 2 das Bild, das die Seite liest.
 *
 * Ein Board besitzt seine Inhalte nicht. Es verweist auf Workflows, Vorhaben
 * und Stationen; jede dieser Dateien liegt in ihrem eigenen Repository. Hier
 * wird gelesen und zusammengesetzt, nie kopiert: fehlt ein Repository oder ein
 * Verweis, steht die Lücke an ihrer Stelle, und es wird kein Name erfunden.
 *
 * Die Felder, die die Seite schon liest, bleiben dieselben — `workflow` und
 * `schritte` für den ersten Workflow, `workflows` als Flächen je Person,
 * `vorgaenge` und `personen`. Was die Seite zusätzlich braucht, um eine Lücke
 * zu benennen, steht in `luecken`.
 *
 * Jedes Repository, aus dem das Board besteht, trägt seinen Stand in
 * `staende`: Name, Art, Pfad, Lage, Zahl der nur lokalen Fassungen, Remote,
 * Zeit und Fehler. Doppelte Verweise stehen dort einmal. Gelesen wird der
 * Stand ohne Netz; abgeglichen wird nur auf Anstoß über `/board/sync`.
 */
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { staendeFuer } from './abgleich.js';
import { CACHE_ORGANISATION, cachePfad, liesRepo } from './repos.js';
import { pruefeVerweise, sichtbarkeitVon } from './rechte.js';
import { liesBoard } from './formate/board.js';
import { liesStation, pruefeStation } from './formate/station.js';
import { liesWorkflow } from './formate/workflow.js';
import { liesVorhaben } from './formate/vorhaben.js';

/** Die Aktionen, die die Seite als „Wie“ kennt. */
const WIE_ARTEN = new Set(['skill', 'skript', 'textfeld', 'chat', 'datei']);

/** Ein leerer Workflow, wenn das Board keinen einzigen auflösen kann. */
function leererWorkflow() {
  return { id: 'standard', titel: '', positionen: [], kanten: [], layout: 'auto' };
}

function kurz(fehler) {
  return String((fehler && fehler.message) || fehler).split('\n')[0].trim();
}

/**
 * Ein Git-Befehl in einem Repository der Station. Gelesen wird nur die eigene
 * Geschichte; ein Fehler ist eine Antwort wie jede andere.
 */
function gitLokal(ordner, args) {
  try {
    const lauf = spawnSync('git', ['-C', ordner, ...args], {
      encoding: 'utf8',
      timeout: 5000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
    return {
      ok: lauf.status === 0,
      out: String(lauf.stdout || ''),
    };
  } catch {
    return { ok: false, out: '' };
  }
}

/**
 * Eine Station auf einer Fassung lesen: `station.json` so, wie sie in der
 * Git-Geschichte ihres Repositories steht. Fehlt die Fassung oder die Datei
 * darin, bleibt das Ergebnis leer; `fassungFehlt` sagt es, und der Aufrufer
 * liest den aktuellen Stand. Ein Tag wird nicht erfunden.
 */
export function liesStationAufFassung(ort, fassung) {
  const name = String(fassung == null ? '' : fassung).trim();
  if (!name) return { station: null, fassungFehlt: false };
  // Ein Wert, der wie eine Option aussieht, ist keine Fassung: er wird nicht
  // an git durchgereicht.
  if (name.startsWith('-')) return { station: null, fassungFehlt: true };
  const lauf = gitLokal(ort, ['show', name + ':station.json']);
  if (!lauf.ok) return { station: null, fassungFehlt: true };
  let roh;
  try {
    roh = JSON.parse(lauf.out);
  } catch {
    return { station: null, fassungFehlt: true };
  }
  try {
    return { station: pruefeStation(roh), fassungFehlt: false };
  } catch {
    return { station: null, fassungFehlt: true };
  }
}

/**
 * Die Repositories des Boards sammeln. Jeder Pfad steht einmal da; ein später
 * gelesener Name füllt einen noch leeren Eintrag. So bleibt die Reihenfolge
 * des Lesens erhalten und ein doppelter Verweis erzeugt keine zweite Zeile.
 */
function repoListe() {
  const eintraege = new Map();
  // Die Reihenfolge der Zeilen: erst das Board, dann seine Workflows, die
  // Stationen und die Vorhaben. Innerhalb einer Art bleibt die Lesereihenfolge.
  const rang = { board: 0, workflow: 1, station: 2, vorhaben: 3 };
  return {
    merke(pfad, art, name) {
      const ort = resolve(String(pfad == null ? '' : pfad));
      let eintrag = eintraege.get(ort);
      if (!eintrag) {
        eintrag = { pfad: ort, art, name: '' };
        eintraege.set(ort, eintrag);
      }
      if (name) eintrag.name = String(name);
      return eintrag;
    },
    liste() {
      return [...eintraege.values()].sort((a, b) => {
        const ra = Object.prototype.hasOwnProperty.call(rang, a.art) ? rang[a.art] : 9;
        const rb = Object.prototype.hasOwnProperty.call(rang, b.art) ? rang[b.art] : 9;
        return ra - rb;
      });
    },
  };
}

/**
 * Wo ein Repository liegt. Ein Verweis ohne Pfad oder mit einer Adresse ist
 * keine Lücke im Sinne von „falsch“, sondern eine, die hier nicht zu lesen
 * ist: das Repository liegt nicht lokal.
 *
 * Ein nackter Name sucht zuerst den Geschwisterordner und danach den
 * Zwischenspeicher der Organisation: eine frische Installation hat die
 * Verweise nicht neben dem Board liegen, sondern unter
 * `$DSH_HOME/board/cache/<organisation>/<name>`.
 *
 * Ein Verweis in der Form `owner/repo` — so steht eine neu angelegte Station
 * im Board — wird zusätzlich über `$DSH_HOME/board/cache/<owner>/<repo>`
 * aufgelöst. Die alte Form bleibt: ein nackter Name und der Geschwisterordner
 * gelten weiter.
 */
function ortVon(verweis, basis, home = process.env.DSH_HOME || '') {
  const text = String(verweis == null ? '' : verweis).trim();
  if (!text) return { ort: '', grund: 'Der Verweis nennt kein Repository' };
  if (/^(https?:\/\/|git@|ssh:\/\/|git:\/\/)/i.test(text)) {
    return { ort: '', grund: 'Das Repository liegt nicht lokal: ' + text };
  }
  const direkt = resolve(basis, text);
  if (existsSync(direkt)) return { ort: direkt, grund: '' };
  // Ein nackter Name („station-idee“) meint bei nebeneinanderliegenden
  // Repositories den Geschwisterordner, nicht einen Unterordner des Boards.
  if (!text.includes('/') && !text.includes('\\')) {
    const neben = resolve(dirname(basis), text);
    if (existsSync(neben)) return { ort: neben, grund: '' };
    const zwischen = cachePfad(home, CACHE_ORGANISATION, text);
    if (zwischen && existsSync(zwischen)) return { ort: zwischen, grund: '' };
  }
  // `owner/repo` ist der Verweis auf ein Repository unter einem Eigentümer;
  // es liegt im Zwischenspeicher dieses Eigentümers.
  const teile = text.split('/');
  if (teile.length === 2 && teile[0].trim() && teile[1].trim()) {
    const zwischen = cachePfad(home, teile[0].trim(), teile[1].trim());
    if (zwischen && existsSync(zwischen)) return { ort: zwischen, grund: '' };
  }
  return { ort: direkt, grund: '' };
}

/** Die Aktion einer Station so, wie die Seite sie am Schritt liest. */
function wieVon(aktion) {
  const roh = aktion && typeof aktion === 'object' ? String(aktion.art || '') : '';
  const art = WIE_ARTEN.has(roh) ? roh : 'textfeld';
  if (art === 'skill' || art === 'skript') {
    const wert = String(aktion.wert || aktion.datei || '').trim();
    return wert ? { art, wert } : { art: 'textfeld', wert: '' };
  }
  return { art, wert: '' };
}

/**
 * Die Stationen eines Workflows lesen. Gelesen wird die Fassung, die der
 * Workflow nennt: ein neuer Commit an der Station ändert ihn nicht. Fehlt die
 * Fassung oder ihre `station.json`, gilt der aktuelle Stand — und der Hinweis
 * sagt, dass nachgezogen werden muss, bevor die neue Fassung gilt.
 *
 * Jeder Verweis behält seine Kennung aus dem Workflow, damit die Positionen
 * gültig bleiben, auch wenn das Repository fehlt. Fehlt es, bleibt der Name
 * leer und der Schritt trägt `fehlt`.
 */
function stationenVon(workflow, workflowOrt, luecken, repos, sichtbarkeit, home) {
  const stationen = new Map();
  for (const verweis of workflow.stationen) {
    const { ort, grund } = ortVon(verweis.repo, workflowOrt, home);
    const repoEintrag = ort ? repos.merke(ort, 'station', '') : null;
    let station = null;
    let fassungFehlt = false;
    if (!ort) {
      luecken.push({
        art: 'station',
        repo: String(verweis.repo == null ? '' : verweis.repo),
        fassung: verweis.fassung,
        workflow: workflow.id,
        station: verweis.id,
        grund,
      });
    } else {
      try {
        const repo = liesRepo(ort);
        if (repo.art !== 'station') {
          throw new Error('Der Ordner ist keine Station: ' + ort);
        }
        const gelesen = liesStationAufFassung(ort, verweis.fassung);
        fassungFehlt = gelesen.fassungFehlt;
        if (fassungFehlt) {
          luecken.push({
            art: 'station-fassung',
            repo: ort,
            fassung: verweis.fassung,
            workflow: workflow.id,
            station: verweis.id,
            grund: 'Fassung ' + verweis.fassung + ' fehlt; aktueller Stand gelesen',
          });
        }
        station = gelesen.station || liesStation(ort);
      } catch (fehler) {
        luecken.push({
          art: 'station',
          repo: ort,
          fassung: verweis.fassung,
          workflow: workflow.id,
          station: verweis.id,
          grund: kurz(fehler),
        });
      }
    }
    if (station && repoEintrag) repoEintrag.name = station.name;
    stationen.set(verweis.id, {
      fehlt: !station,
      id: verweis.id,
      fassung: verweis.fassung,
      fassungFehlt,
      name: station ? station.name : '',
      host: station ? station.host : '',
      beschreibung: station ? station.beschreibung : '',
      eingang: station ? station.eingang : [],
      ausgabe: station ? station.ausgabe : [],
      aktion: station ? { ...station.aktion } : { art: 'textfeld' },
      reife: station ? station.reife : '',
      ...(ort ? { sichtbarkeit: sichtbarkeit(ort) } : null),
    });
  }
  return stationen;
}

/**
 * Die Stationen, auf die das Board selbst verweist. Das sind mehr als die
 * Stationen eines Workflows: eine Station steht in der Bibliothek, auch wenn
 * sie noch an keiner Position liegt. `imWorkflow` sagt, ob ein Workflow des
 * Boards sie nennt; die Fassung kommt aus diesem Verweis, sonst bleibt sie
 * leer. Gelesen wird die Fassung, die der Workflow nennt; fehlt sie, gilt der
 * aktuelle Stand und `fassungFehlt` sagt es. Fehlt das Repository oder seine
 * Datei, steht der Eintrag mit `fehlt` da — ein Name wird nicht erfunden.
 */
function stationenVonBoard(board, boardOrt, workflows, sichtbarkeit, home) {
  const liste = [];
  for (const verweis of board.stationen) {
    const { ort } = ortVon(verweis.repo, boardOrt, home);
    let imWorkflow = false;
    let fassung = '';
    for (const workflow of workflows) {
      const treffer = workflow.stationen.find((eintrag) => eintrag.ort === ort);
      if (!treffer) continue;
      imWorkflow = true;
      if (!fassung) fassung = treffer.fassung;
    }
    let station = null;
    let fassungFehlt = false;
    if (ort) {
      try {
        if (liesRepo(ort).art === 'station') {
          const gelesen = liesStationAufFassung(ort, fassung);
          fassungFehlt = gelesen.fassungFehlt;
          station = gelesen.station || liesStation(ort);
        }
      } catch {
        /* Der Eintrag bleibt ohne Namen und ohne Fassung. */
      }
    }
    liste.push({
      ...(station ? {} : { fehlt: true }),
      id: station ? station.id : '',
      name: station ? station.name : '',
      host: station ? station.host : '',
      fassung,
      fassungFehlt,
      repo: ort,
      imWorkflow,
      ...(ort ? { sichtbarkeit: sichtbarkeit(ort) } : null),
    });
  }
  return liste;
}

/** Der Schritt zu einer Station — einmal je Station, nicht je Position. */
function schrittAus(station) {
  const schritt = {
    id: station.id,
    name: station.name,
    host: station.host,
    fassung: station.fassung,
    fassungFehlt: station.fassungFehlt === true,
    eingang: station.eingang,
    ausgabe: station.ausgabe,
    wie: wieVon(station.aktion),
    aktion: { ...station.aktion },
    reife: station.reife,
  };
  if (station.beschreibung) schritt.inhalt = station.beschreibung;
  if (station.fehlt) schritt.fehlt = true;
  if (station.sichtbarkeit) schritt.sichtbarkeit = station.sichtbarkeit;
  return schritt;
}

/**
 * Einen Workflow samt seinen Stationen, Positionen und Kanten zusammensetzen.
 * Die Positionen behalten ihre Kennung und Lage; der Schritt ist die Station
 * aus ihrem eigenen Repository.
 */
function workflowZusammensetzen(
  roh, workflowOrt, fassung, luecken, repos, sichtbarkeit, home,
) {
  const stationen = stationenVon(roh, workflowOrt, luecken, repos, sichtbarkeit, home);
  const schritte = [];
  const gesehen = new Set();
  for (const position of roh.positionen) {
    if (gesehen.has(position.station)) continue;
    gesehen.add(position.station);
    const station = stationen.get(position.station);
    if (!station) continue;
    schritte.push(schrittAus(station));
  }
  const positionen = roh.positionen.map((position) => {
    const eintrag = {
      id: position.id,
      schritt: position.station,
      x: position.x,
      y: position.y,
    };
    if (Array.isArray(position.bedingung) && position.bedingung.length) {
      eintrag.bedingung = position.bedingung.slice();
    }
    return eintrag;
  });
  const workflow = {
    id: roh.id,
    titel: roh.titel,
    // Wo das Workflow-Repository liegt; die Bibliothek nennt den Pfad in der
    // Einzelheit. Das Feld steht nur im Bild für die Seite.
    repo: workflowOrt,
    positionen,
    kanten: roh.kanten.map((kante) => ({ von: kante.von, nach: kante.nach })),
    layout: roh.layout,
  };
  if (roh.beschreibung) workflow.beschreibung = roh.beschreibung;
  if (roh.autor) workflow.autor = roh.autor;
  if (fassung) workflow.fassung = fassung;
  workflow.sichtbarkeit = sichtbarkeit(workflowOrt);
  return { workflow, schritte };
}

/** Die Personen des Boards; die eigene Person ist die, die liest. */
function personenVon(board, person, boardOrt, luecken) {
  const personen = board.personen.map((eintrag) => ({
    id: eintrag.login,
    name: eintrag.name,
    farbe: eintrag.farbe,
    ich: eintrag.login === String(person),
  }));
  if (!personen.some((eintrag) => eintrag.ich)) {
    // Die eigene Kennung steht nicht im Board. Sie wird nicht zu einer Person
    // mit erfundenem Namen: der Eintrag bleibt namenlos, die Lücke steht da.
    personen.push({
      id: String(person || 'p1'),
      name: '',
      farbe: '',
      ich: true,
    });
    luecken.push({
      art: 'person',
      repo: boardOrt,
      grund: 'Die eigene Person ('
        + (person ? String(person) : 'ohne Kennung')
        + ') steht nicht in board.json',
    });
  }
  return personen;
}

/**
 * Die Verantwortlichen je Position, so wie sie in `vorhaben.json` stehen.
 * Nur Listen von Namen zählen; die Reihenfolge bleibt. Die Seite liest daraus,
 * wer an welcher Station verantwortet, auch wenn das Vorhaben woanders steht.
 */
function verantwortlicheJeStation(vorhaben) {
  const feld = vorhaben && vorhaben.verantwortliche;
  if (!feld || typeof feld !== 'object' || Array.isArray(feld)) return {};
  const ergebnis = {};
  for (const [stelle, logins] of Object.entries(feld)) {
    if (!Array.isArray(logins)) continue;
    ergebnis[stelle] = logins
      .map((eintrag) => String(eintrag == null ? '' : eintrag).trim())
      .filter(Boolean);
  }
  return ergebnis;
}

/**
 * Die Vorhaben des Boards lesen. Jedes bringt seine Kennung, seinen Namen, die
 * Station, an der es steht, seine Farbe und seine Dateien mit. Ein Vorhaben,
 * dessen Repository fehlt, bleibt eine Lücke und wird nicht mit leerem Namen
 * in die Karte gesetzt.
 */
function vorgaengeVon(board, boardOrt, workflows, luecken, repos, sichtbarkeit, home) {
  const vorgaenge = [];
  const ids = new Set();
  for (const verweis of board.vorhaben) {
    const { ort, grund } = ortVon(verweis.repo, boardOrt, home);
    const repoEintrag = ort ? repos.merke(ort, 'vorhaben', '') : null;
    let repo = null;
    let vorhaben = null;
    if (!ort) {
      luecken.push({
        art: 'vorhaben',
        repo: String(verweis.repo == null ? '' : verweis.repo),
        grund,
      });
    } else {
      try {
        repo = liesRepo(ort);
        if (repo.art !== 'vorhaben') {
          throw new Error('Der Ordner ist kein Vorhaben: ' + ort);
        }
        vorhaben = liesVorhaben(ort);
      } catch (fehler) {
        luecken.push({ art: 'vorhaben', repo: ort, grund: kurz(fehler) });
      }
    }
    if (!vorhaben) continue;
    if (repoEintrag) repoEintrag.name = vorhaben.name;

    // Der Workflow des Vorhabens muss das Board führen; sonst steht die Karte
    // an einer Station, die es auf dieser Fläche nicht gibt.
    const ziel = ortVon(vorhaben.workflow.repo, boardOrt, home);
    const workflow = ziel.ort
      ? workflows.find((eintrag) => eintrag.ort === ziel.ort) || null
      : null;
    if (!workflow) {
      luecken.push({
        art: 'vorhaben-workflow',
        vorhaben: vorhaben.id,
        repo: String(vorhaben.workflow.repo == null ? '' : vorhaben.workflow.repo),
        grund: 'Der Workflow des Vorhabens steht nicht im Board',
      });
    } else if (!workflow.workflow.positionen.some((p) => p.id === vorhaben.position)) {
      luecken.push({
        art: 'vorhaben-position',
        vorhaben: vorhaben.id,
        position: vorhaben.position,
        repo: ziel.ort,
        grund: 'Die Station „' + vorhaben.position + '“ steht nicht im Workflow',
      });
    }

    const eintrag = {
      id: vorhaben.id,
      name: vorhaben.name,
      position: vorhaben.position,
      farbe: vorhaben.farbe,
      verantwortliche: vorhaben.verantwortliche,
      verantwortlicheJeStation: verantwortlicheJeStation(vorhaben),
      regel: 'einer',
      laeufe: vorhaben.laeufe,
      fork_von: vorhaben.fork_von,
      zweig_von: vorhaben.zweig_von,
      // Der Workflow des Vorhabens mit seiner festen Fassung — die Bibliothek
      // nennt beides. Fehlt der Verweis, bleibt das Feld leer; die Seite sagt
      // dann „ohne Fassung“ und erfindet keine.
      workflow: vorhaben.workflow
        ? {
          repo: vorhaben.workflow.repo || '',
          fassung: vorhaben.workflow.fassung || '',
        }
        : { repo: '', fassung: '' },
      // Der Ordner des Vorhaben-Repositories. In Fassung 2 liegen seine
      // Dateien nicht unter dem Board, sondern bei ihm selbst; die Lese-Routen
      // brauchen den absoluten Pfad. Fehlt er, bleibt das Feld leer.
      repo: ort,
      ordner: ort,
      dateien: repo.dateien,
      sichtbarkeit: sichtbarkeit(ort),
    };
    // Die Seite liest den Zweig unter seinem alten Namen weiter.
    if (vorhaben.zweig_von) eintrag.abzweig = vorhaben.zweig_von;
    if (ids.has(eintrag.id)) {
      luecken.push({
        art: 'vorhaben',
        repo: ort,
        vorhaben: eintrag.id,
        grund: 'Die Kennung „' + eintrag.id + '“ steht doppelt im Board',
      });
    }
    ids.add(eintrag.id);
    vorgaenge.push(eintrag);
  }
  return vorgaenge;
}

/**
 * Das Board der Fassung 2 aus seinem Ordner lesen und zusammensetzen.
 *
 * `repo` ist der Ordner des Board-Repositories, `person` die Kennung der
 * Person, die liest. Zurück kommt das Bild, das die Seite schon liest — mit
 * `luecken` für alles, was fehlt oder nicht auflösbar ist.
 */
export function komponiere({ repo, person, home = process.env.DSH_HOME || '' }) {
  const boardOrt = resolve(String(repo == null ? '' : repo));
  const board = liesBoard(boardOrt);
  const luecken = [];
  // Die Verweise werden gegen die Sichtbarkeit gehalten: ein öffentliches
  // Ding darf nur auf öffentliche verweisen. Die Lücken dieser Prüfung kommen
  // zu den fehlenden Repositories, sie ersetzen sie nicht.
  const verweise = pruefeVerweise(boardOrt, { home });
  luecken.push(...verweise.luecken);
  const bekannt = verweise.sichtbarkeiten || {};
  const sichtbarkeit = (pfad) => {
    if (!pfad) return '';
    const ort = resolve(String(pfad));
    return bekannt[ort] || sichtbarkeitVon(home, ort);
  };
  const repos = repoListe();
  repos.merke(boardOrt, 'board', board.name);

  // Stationen, die das Board selbst nennt, gehören zu seinem Stand — auch
  // wenn gerade kein Workflow sie verwendet. Fehlt eine, steht ihr Pfad
  // trotzdem da; der Name bleibt dann leer.
  for (const verweis of board.stationen) {
    const { ort } = ortVon(verweis.repo, boardOrt, home);
    if (!ort) continue;
    let name = '';
    try {
      if (liesRepo(ort).art === 'station') name = liesStation(ort).name;
    } catch {
      /* Der Stand nennt das Repository auch ohne lesbaren Namen. */
    }
    repos.merke(ort, 'station', name);
  }

  const personen = personenVon(board, person, boardOrt, luecken);

  const workflows = [];
  for (const verweis of board.workflows) {
    const { ort, grund } = ortVon(verweis.repo, boardOrt, home);
    const repoEintrag = ort ? repos.merke(ort, 'workflow', '') : null;
    let roh = null;
    if (!ort) {
      luecken.push({
        art: 'workflow',
        repo: String(verweis.repo == null ? '' : verweis.repo),
        fassung: verweis.fassung,
        grund,
      });
    } else {
      try {
        const workflowRepo = liesRepo(ort);
        if (workflowRepo.art !== 'workflow') {
          throw new Error('Der Ordner ist kein Workflow: ' + ort);
        }
        roh = liesWorkflow(ort);
      } catch (fehler) {
        luecken.push({
          art: 'workflow',
          repo: ort,
          fassung: verweis.fassung,
          grund: kurz(fehler),
        });
      }
    }
    if (!roh) continue;
    if (repoEintrag) repoEintrag.name = roh.titel;
    const zusammengesetzt = workflowZusammensetzen(
      roh, ort, verweis.fassung, luecken, repos, sichtbarkeit, home,
    );
    // Die Verweise des Workflows werden für `stationen` gemerkt: dort steht,
    // welche Fassung das Board von dieser Station kennt.
    const stationen = roh.stationen
      .map((eintrag) => {
        const ziel = ortVon(eintrag.repo, ort, home);
        return ziel.ort ? { ort: ziel.ort, fassung: eintrag.fassung } : null;
      })
      .filter(Boolean);
    workflows.push({
      ort,
      fassung: verweis.fassung,
      workflow: zusammengesetzt.workflow,
      schritte: zusammengesetzt.schritte,
      stationen,
    });
  }

  const stationen = stationenVonBoard(board, boardOrt, workflows, sichtbarkeit, home);

  const vorgaenge = vorgaengeVon(
    board, boardOrt, workflows, luecken, repos, sichtbarkeit, home,
  );

  const ich = personen.find((eintrag) => eintrag.ich) || personen[0];
  const erste = workflows[0] || null;
  const flaechenWorkflows = workflows.map((eintrag) => ({
    ...eintrag.workflow,
    schritte: eintrag.schritte,
  }));

  return {
    format: 2,
    // Der erste Workflow bleibt unter den alten Feldern lesbar; die weiteren
    // stehen in der Fläche seiner Person.
    workflow: erste ? erste.workflow : leererWorkflow(),
    schritte: erste ? erste.schritte : [],
    // Alle Stationen, auf die das Board verweist — auch die, die noch in
    // keinem Workflow stehen. Die Bibliothek liest sie von hier.
    stationen,
    workflows: [{
      id: ich.id,
      name: ich.name,
      farbe: ich.farbe,
      ich: true,
      workflows: flaechenWorkflows,
    }],
    vorgaenge,
    personen,
    beitraege: [],
    einstellungen: board.einstellungen || {},
    staende: staendeFuer(repos.liste()),
    // Das Board selbst trägt seine Sichtbarkeit; die Seite zeigt sie an.
    sichtbarkeit: sichtbarkeit(boardOrt),
    luecken,
  };
}
