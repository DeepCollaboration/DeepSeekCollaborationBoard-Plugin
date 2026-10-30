/**
 * Öffentlich und privat: die Sichtbarkeit je Repository, die Prüfung der
 * Verweise und das Schreibrecht.
 *
 * Ein Repository der Fassung 2 ist ein Ordner mit eigenem Git. Ob es öffentlich
 * oder privat ist, steht nicht in seinem Inhalt, sondern an drei Stellen — in
 * dieser Reihenfolge:
 *
 *   1. `$DSH_HOME/board/sichtbarkeit.json` mit absoluten Pfaden,
 *   2. `sichtbarkeit.json` im Elternordner mit dem Ordnernamen als Schlüssel
 *      (so trägt der Umzug seine Angabe mit),
 *   3. der Name des Ordners: `vorhaben-*` und `board-team` sind privat, alles
 *      andere öffentlich.
 *
 * Gelesen wird nur. Keine dieser Dateien wird angelegt oder ergänzt; was nicht
 * dasteht, entscheidet der Name. Ein öffentliches Ding darf nur auf öffentliche
 * Dinge verweisen — `pruefeVerweise` sammelt jede solche Lücke.
 *
 * `schreibrecht` sagt, ob dieses Repository hier beschrieben werden darf —
 * als Frage nach der Person: lokal ohne Remote ja; mit Remote nur mit Token
 * und der Berechtigung, die GitHub für seinen Login nennt. `darfSchreiben`
 * ist die kurze Antwort darauf. Das Ergebnis bleibt kurz im Speicher, damit
 * nicht jede Leseabfrage GitHub fragt.
 */
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { liesToken, erstelleClient } from './github.js';
import { liesBoard } from './formate/board.js';
import { liesStation } from './formate/station.js';
import { liesWorkflow } from './formate/workflow.js';
import { liesVorhaben } from './formate/vorhaben.js';
import { cachePfad } from './repos.js';

/** Die Organisation, unter der die öffentlichen Dinge liegen. */
export const ORGANISATION = process.env.DSH_GITHUB_ORG || 'DeepCollaboration';

/** Die beiden Werte, die eine Sichtbarkeit haben kann. */
export const OEFFENTLICH = 'öffentlich';
export const PRIVAT = 'privat';

/** Die Berechtigungen, die schreiben dürfen. */
const SCHREIBRECHTE = new Set(['admin', 'maintain', 'push', 'write']);

/** Wie lange ein Schreibrecht im Speicher gilt. */
const RECHT_MS = 30000;

/** Das kurze Gedächtnis je Repository; der Schlüssel nennt Remote und Person. */
const rechte = new Map();

function liesJson(pfad) {
  try {
    const roh = JSON.parse(readFileSync(pfad, 'utf8'));
    return roh && typeof roh === 'object' && !Array.isArray(roh) ? roh : null;
  } catch {
    return null;
  }
}

/** `öffentlich`/`privat` in der Schreibweise der Karten; sonst leer. */
function normalisiere(wert) {
  const text = String(wert == null ? '' : wert).trim().toLowerCase();
  if (text === OEFFENTLICH || text === 'oeffentlich' || text === 'public') {
    return OEFFENTLICH;
  }
  if (text === PRIVAT || text === 'private') return PRIVAT;
  return '';
}

/**
 * Der Name entscheidet, wenn keine Datei etwas sagt. Auch der Katalog fragt
 * diese Regel, wenn kein Zuhause gesetzt ist und es keine Karte zu lesen gibt.
 */
export function sichtbarkeitAusName(name) {
  const text = String(name == null ? '' : name).trim();
  if (text === 'board-team' || text.startsWith('vorhaben-')) return PRIVAT;
  return OEFFENTLICH;
}

/**
 * Die Sichtbarkeit eines Repositories. `pfad` ist sein Ordner; gelesen wird
 * die Karte im Home, dann die des Elternordners, zuletzt der Name.
 */
export function sichtbarkeitVon(home, pfad) {
  const ort = resolve(String(pfad == null ? '' : pfad));
  const name = basename(ort);
  const ziel = resolve(String(home == null ? '' : home));

  // 1. Die Karte im Home. Sie nennt absolute Pfade; ein Name als Schlüssel
  //    wird zusätzlich verstanden, damit eine von Hand geschriebene Karte
  //    nicht wirkungslos bleibt.
  const karte = liesJson(join(ziel, 'board', 'sichtbarkeit.json'));
  if (karte) {
    const wert = normalisiere(karte[ort] != null ? karte[ort] : karte[name]);
    if (wert) return wert;
  }

  // 2. Die Karte des Umzugs: sie liegt neben den Repositories und nennt den
  //    Ordnernamen. So bleibt die Angabe beim Umzug erhalten.
  const eltern = liesJson(join(dirname(ort), 'sichtbarkeit.json'));
  if (eltern) {
    const wert = normalisiere(eltern[name]);
    if (wert) return wert;
  }

  // 3. Der Name.
  return sichtbarkeitAusName(name);
}

/**
 * Ein lokaler Verweis aus einem Repository; eine Adresse bleibt leer.
 *
 * Ein Verweis in der Form `owner/repo` — so steht eine neu angelegte Station
 * im Board — wird zusätzlich über `$DSH_HOME/board/cache/<owner>/<repo>`
 * aufgelöst, wie in der Komposition. Sonst meldete die Verweisprüfung eine
 * private Station nicht, die die Komposition sehr wohl zeigt.
 */
function lokal(verweis, basis, home = process.env.DSH_HOME || '') {
  const text = String(verweis == null ? '' : verweis).trim();
  if (!text || /^(https?:\/\/|git@|ssh:\/\/|git:\/\/|file:\/\/)/i.test(text)) return '';
  const direkt = resolve(basis, text);
  if (existsSync(direkt)) return direkt;
  if (!text.includes('/') && !text.includes('\\')) {
    const neben = resolve(dirname(basis), text);
    if (existsSync(neben)) return neben;
  }
  // `owner/repo` liegt im Zwischenspeicher dieses Eigentümers, nicht neben
  // dem Board.
  const teile = text.split('/');
  if (teile.length === 2 && teile[0].trim() && teile[1].trim()) {
    const zwischen = cachePfad(home, teile[0].trim(), teile[1].trim());
    if (zwischen && existsSync(zwischen)) return zwischen;
  }
  return direkt;
}

/** Die Sichtbarkeit einer Karte als Eintrag für `luecken`. */
function eintrag(pfad, art, name) {
  return {
    art,
    pfad,
    name: String(name == null ? '' : name).trim() || basename(pfad),
  };
}

function stationEintrag(pfad) {
  try {
    return eintrag(pfad, 'station', liesStation(pfad).name);
  } catch {
    return eintrag(pfad, 'station', '');
  }
}

function workflowEintrag(pfad) {
  try {
    return eintrag(pfad, 'workflow', liesWorkflow(pfad).titel);
  } catch {
    return eintrag(pfad, 'workflow', '');
  }
}

function vorhabenEintrag(pfad) {
  try {
    return eintrag(pfad, 'vorhaben', liesVorhaben(pfad).name);
  } catch {
    return eintrag(pfad, 'vorhaben', '');
  }
}

/**
 * Die Verweise eines Boards, seiner Workflows und Vorhaben durchgehen. Jeder
 * Verweis eines öffentlichen Dings auf ein privates ergibt eine Lücke
 * `{art: 'sichtbarkeit', von, auf, grund}`; `sichtbarkeiten` nennt zu jedem
 * gelesenen Repository seinen Wert.
 *
 * Fehlt ein Repository, ist das keine Lücke dieser Prüfung — die Komposition
 * meldet es an seiner Stelle. Hier wird nur geurteilt, was sich lesen lässt.
 */
export function pruefeVerweise(boardPfad, { home = process.env.DSH_HOME || '' } = {}) {
  const boardOrt = resolve(String(boardPfad == null ? '' : boardPfad));
  const board = liesBoard(boardOrt);
  const luecken = [];
  const sichtbarkeiten = {};
  const gesehen = new Set();

  function merke(pfad) {
    const ort = resolve(pfad);
    if (!sichtbarkeiten[ort]) sichtbarkeiten[ort] = sichtbarkeitVon(home, ort);
    return sichtbarkeiten[ort];
  }

  function eintragMitWert(roh) {
    return { ...roh, sichtbarkeit: merke(roh.pfad) };
  }

  function pruefe(vonRoh, aufRoh) {
    const von = eintragMitWert(vonRoh);
    const auf = eintragMitWert(aufRoh);
    if (von.sichtbarkeit !== OEFFENTLICH || auf.sichtbarkeit !== PRIVAT) return;
    const schluessel = von.pfad + '\u0000' + auf.pfad;
    if (gesehen.has(schluessel)) return;
    gesehen.add(schluessel);
    luecken.push({
      art: 'sichtbarkeit',
      von: { art: von.art, name: von.name, pfad: von.pfad },
      auf: { art: auf.art, name: auf.name, pfad: auf.pfad },
      grund: '„' + von.name + '“ ist öffentlich und verweist auf „'
        + auf.name + '“, das privat ist.',
    });
  }

  const boardEintrag = eintragMitWert(eintrag(boardOrt, 'board', board.name));
  const workflows = new Map();
  const stationen = new Map();
  const vorhaben = [];

  // Die Workflows, die das Board selbst nennt.
  const boardWorkflows = [];
  for (const verweis of board.workflows) {
    const pfad = lokal(verweis.repo, boardOrt, home);
    if (!pfad || !existsSync(pfad)) continue;
    const eintragWert = workflowEintrag(pfad);
    if (!workflows.has(pfad)) workflows.set(pfad, eintragWert);
    boardWorkflows.push(pfad);
  }

  // Die Vorhaben und der Workflow, auf den jedes verweist.
  for (const verweis of board.vorhaben) {
    const pfad = lokal(verweis.repo, boardOrt, home);
    if (!pfad || !existsSync(pfad)) continue;
    let roh = null;
    try {
      roh = liesVorhaben(pfad);
    } catch {
      /* Ohne lesbare Datei bleibt nur der Pfad. */
    }
    vorhaben.push({ pfad, eintrag: vorhabenEintrag(pfad), roh });
    if (!roh) continue;
    const wfPfad = lokal(roh.workflow && roh.workflow.repo, boardOrt, home);
    if (wfPfad && existsSync(wfPfad) && !workflows.has(wfPfad)) {
      workflows.set(wfPfad, workflowEintrag(wfPfad));
    }
  }

  // Die Stationen, die das Board selbst nennt.
  for (const verweis of board.stationen) {
    const pfad = lokal(verweis.repo, boardOrt, home);
    if (!pfad || !existsSync(pfad)) continue;
    if (!stationen.has(pfad)) stationen.set(pfad, stationEintrag(pfad));
  }

  // Das Board verweist auf seine Workflows, Vorhaben und Stationen.
  for (const pfad of boardWorkflows) pruefe(boardEintrag, workflows.get(pfad));
  for (const eintragWert of stationen.values()) pruefe(boardEintrag, eintragWert);
  for (const eintragWert of vorhaben) pruefe(boardEintrag, eintragWert.eintrag);

  // Jeder Workflow verweist auf seine Stationen.
  for (const [wfPfad] of workflows) {
    let roh = null;
    try {
      roh = liesWorkflow(wfPfad);
    } catch {
      continue;
    }
    for (const verweis of roh.stationen) {
      const pfad = lokal(verweis.repo, wfPfad, home);
      if (!pfad || !existsSync(pfad)) continue;
      if (!stationen.has(pfad)) stationen.set(pfad, stationEintrag(pfad));
      pruefe(workflows.get(wfPfad), stationen.get(pfad));
    }
  }

  // Jedes Vorhaben verweist auf seinen Workflow.
  for (const eintragWert of vorhaben) {
    if (!eintragWert.roh) continue;
    const wfPfad = lokal(eintragWert.roh.workflow && eintragWert.roh.workflow.repo, boardOrt, home);
    if (!wfPfad || !existsSync(wfPfad) || !workflows.has(wfPfad)) continue;
    pruefe(eintragWert.eintrag, workflows.get(wfPfad));
  }

  return { luecken, sichtbarkeiten };
}

/* --- Verantwortung ------------------------------------------------------- */

/**
 * Die Logins, die an einer Stelle eines Vorhabens eingetragen sind. `position`
 * ist die Kennung der Position im Workflow. Fehlt die Angabe oder ist sie kein
 * Feld, bleibt die Liste leer — es wird nichts erfunden.
 */
export function verantwortlicheVon({ vorhaben, position } = {}) {
  const feld = vorhaben && vorhaben.verantwortliche;
  if (!feld || typeof feld !== 'object' || Array.isArray(feld)) return [];
  const liste = feld[String(position == null ? '' : position)];
  if (!Array.isArray(liste)) return [];
  return liste
    .map((eintrag) => String(eintrag == null ? '' : eintrag).trim())
    .filter(Boolean);
}

/** Die Mitglieder eines Teams, gleich in welcher der bekannten Formen. */
function mitgliederVon(team) {
  if (!team || typeof team !== 'object') return [];
  const roh = team.mitglieder || team.members || team.member || [];
  return (Array.isArray(roh) ? roh : [])
    .map((eintrag) => (typeof eintrag === 'string'
      ? eintrag
      : String((eintrag && (eintrag.login || eintrag.name)) || '')))
    .map((eintrag) => eintrag.trim())
    .filter(Boolean);
}

/** Heißt dieses Team `name`? Name, Schlüssel und Kennung zählen. */
function teamNamePasst(team, name, org) {
  if (!team || typeof team !== 'object') return false;
  const gesucht = String(name == null ? '' : name).trim().toLowerCase();
  if (!gesucht) return false;
  const kandidaten = [team.name, team.slug, team.key, team.schluessel, team.team, team.id]
    .map((wert) => String(wert == null ? '' : wert).trim().toLowerCase())
    .filter(Boolean);
  if (kandidaten.includes(gesucht)) return true;
  return Boolean(org)
    && kandidaten.includes(String(org).trim().toLowerCase() + '/' + gesucht);
}

/**
 * Ist `login` Mitglied des Teams `name`? `teams` ist die Antwort aus
 * `github.js` (Liste mit `mitglieder`) oder eine Zuordnung von Teamnamen zu
 * Logins. Beides wird verstanden; ohne Angabe gilt: nein.
 */
function istTeamMitglied(teams, name, login, org) {
  const gesucht = String(login == null ? '' : login).trim().toLowerCase();
  if (!gesucht) return false;
  if (typeof teams === 'function') {
    try {
      return teams(String(name), gesucht) === true;
    } catch {
      return false;
    }
  }
  if (Array.isArray(teams)) {
    const team = teams.find((eintrag) => teamNamePasst(eintrag, name, org));
    if (!team) return false;
    return mitgliederVon(team).some((wert) => wert.toLowerCase() === gesucht);
  }
  if (teams && typeof teams === 'object') {
    // Eine Antwort der Teams-Route: die Liste steht unter `teams`.
    if (Array.isArray(teams.teams)) {
      return istTeamMitglied(teams.teams, name, login, org);
    }
    const gesuchtName = String(name == null ? '' : name).toLowerCase();
    const schluessel = Object.keys(teams).find((wert) => {
      const klein = wert.toLowerCase();
      return klein === gesuchtName
        || (Boolean(org) && klein === String(org).toLowerCase() + '/' + gesuchtName);
    });
    if (schluessel == null) return false;
    const wert = teams[schluessel];
    if (Array.isArray(wert)) {
      return wert.map((eintrag) => (typeof eintrag === 'string'
        ? eintrag
        : (eintrag && (eintrag.login || eintrag.name)) || ''))
        .some((eintrag) => String(eintrag).toLowerCase() === gesucht);
    }
    return mitgliederVon(wert).some((eintrag) => eintrag.toLowerCase() === gesucht);
  }
  return false;
}

/**
 * Ist diese Identität für diese Stelle verantwortlich?
 *
 *   - Steht ihr GitHub-Name in `verantwortliche[position]`, ja.
 *   - Sonst zählt die Mitgliedschaft im Team `vorhaben` — für eine Station
 *     `stations`, für einen Workflow `workflows` (`art` sagt, welches gilt).
 *   - Hat die Identität keinen GitHub-Namen und liegt das Repository lokal,
 *     gilt der lokale Besitzer als verantwortlich. Mit Remote bleibt es bei
 *     „nein“.
 *   - Hat sie einen Namen, der nicht in der Liste steht, wird sie abgewiesen,
 *     auch lokal.
 *
 * `teams` sind die gelesenen Teams (Name, Schlüssel, Mitglieder); `org` ist
 * die Organisation, unter der sie liegen. Gelesen wird hier nichts.
 */
export function istVerantwortlich({
  vorhaben, position, identitaet = null, teams = null, org = '',
  lokal = false, art = 'vorhaben', team = '',
} = {}) {
  const liste = verantwortlicheVon({ vorhaben, position });
  const login = String((identitaet && identitaet.github) || '').trim();
  const gesucht = login.toLowerCase();
  if (gesucht && liste.some((eintrag) => eintrag.toLowerCase() === gesucht)) {
    return true;
  }
  if (!gesucht) return Boolean(lokal);
  const teamName = String(team || '').trim()
    || (art === 'station' ? 'stations' : art === 'workflow' ? 'workflows' : 'vorhaben');
  return istTeamMitglied(teams, teamName, login, org);
}

/* --- Das Schreibrecht ---------------------------------------------------- */

function git(pfad, args) {
  try {
    const lauf = spawnSync('git', ['-C', pfad, ...args], {
      encoding: 'utf8',
      timeout: 10000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
    return {
      ok: lauf.status === 0,
      out: String(lauf.stdout || '').trim(),
      fehler: String(lauf.stderr || '').trim(),
    };
  } catch (fehler) {
    return { ok: false, out: '', fehler: String((fehler && fehler.message) || fehler) };
  }
}

/** Die Adresse von `origin` oder `null`, wenn es keinen Remote gibt. */
function remoteVon(pfad) {
  const lauf = git(pfad, ['remote', 'get-url', 'origin']);
  return lauf.ok && lauf.out ? lauf.out : null;
}

/** Aus einer Remote-Adresse Besitzer und Name lesen — für `berechtigung`. */
function repoAusRemote(adresse) {
  const text = String(adresse == null ? '' : adresse).trim();
  if (!text) return null;
  const ssh = text.match(/^[^@]+@([^:]+):([^/]+)\/(.+?)(?:\.git)?\/?$/);
  if (ssh) return { owner: ssh[2], name: ssh[3].replace(/\.git$/, '') };
  if (/^file:\/\//i.test(text)) {
    const teile = text.slice(7).split('/').filter(Boolean);
    if (teile.length < 2) return null;
    return {
      owner: teile[teile.length - 2],
      name: teile[teile.length - 1].replace(/\.git$/, ''),
    };
  }
  const adresse2 = text.match(
    /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/]+@)?[^/]+\/([^/]+)\/(.+?)(?:\.git)?\/?$/i,
  );
  if (adresse2) {
    return { owner: adresse2[1], name: adresse2[2].replace(/\.git$/, '') };
  }
  const nackt = text.match(/^([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (nackt) return { owner: nackt[1], name: nackt[2].replace(/\.git$/, '') };
  return null;
}

function merkeRecht(schluessel, wert) {
  rechte.set(schluessel, { wert, am: Date.now() });
}

function ausSpeicher(schluessel) {
  const treffer = rechte.get(schluessel);
  if (!treffer) return null;
  if (Date.now() - treffer.am > RECHT_MS) {
    rechte.delete(schluessel);
    return null;
  }
  return treffer.wert;
}

/** Das kurze Gedächtnis leeren — nur für Prüfungen und nach einem Tokenwechsel. */
export function vergissRechte() {
  rechte.clear();
}

/*
 * Warum ein Schreibrecht fehlt — die Antworten der Anzeige.
 *
 *   - kein Token: niemand ist angemeldet,
 *   - Token ohne Schreibrecht: die Person ist bekannt, darf aber nicht,
 *   - Recht nicht prüfbar: GitHub antwortet nicht, also gibt es keine Antwort,
 *   - Anmeldung nicht prüfbar: GitHub weist den Token ab.
 *
 * Der Token selbst ist keine Person; gefragt wird nach dem Login, den GitHub
 * zu ihm nennt.
 */
export const GRUND_OHNE_TOKEN = 'Keine Anmeldung: es fehlt ein Token.';
export const HINWEIS_OHNE_TOKEN = 'Melde dich in den Einstellungen unter GitHub '
  + 'mit einem Token an. Ohne Anmeldung bleibt dieses Board nur lesbar.';
export const GRUND_OHNE_RECHT = 'Kein Schreibrecht: der angemeldete Login darf '
  + 'dieses Repository nicht beschreiben.';
export const HINWEIS_OHNE_RECHT = 'Nur wer bei GitHub schreiben darf, kann dieses '
  + 'Board ändern. Ein Token mit Schreibrecht hilft.';
export const GRUND_NICHT_PRUEFBAR = 'Das Schreibrecht ist nicht prüfbar: GitHub ist '
  + 'nicht erreichbar.';
export const HINWEIS_NICHT_PRUEFBAR = 'Prüfe die Verbindung und lade das Board neu; '
  + 'solange bleibt es nur lesbar.';
export const GRUND_ANMELDUNG_UNGUELTIG = 'Die Anmeldung ist nicht prüfbar: der Token '
  + 'wird von GitHub abgewiesen.';
export const HINWEIS_ANMELDUNG_UNGUELTIG = 'Trage in den Einstellungen unter GitHub '
  + 'einen gültigen Token ein.';

/** Ein Schreibrecht mit Grund; `grund` und `hinweis` nur, wenn es fehlt. */
function recht(darf, grund = '', hinweis = '') {
  return darf ? { darf: true } : { darf: false, grund, hinweis };
}

/**
 * Darf dieses Repository hier beschrieben werden — und wenn nicht, warum?
 *
 *   - lokal ohne Remote: ja,
 *   - mit Remote und ohne Token: nein, weil niemand angemeldet ist,
 *   - mit Token: die Antwort von GitHub für den Login des Tokens. `admin`,
 *     `maintain`, `push` und `write` dürfen schreiben; jede andere Antwort,
 *     auch ein Fehler, nicht.
 *
 * `client` ist ein Client aus `github.js`; fehlt er, wird einer für `home`
 * gebaut. Das Ergebnis gilt 30 Sekunden je Repository, Remote und Login.
 * Ein Fehler ohne Netz wird nicht gemerkt: der nächste Versuch darf ihn
 * wiederholen.
 */
export async function schreibrecht({ pfad, home = '', client = null } = {}) {
  const ort = resolve(String(pfad == null ? '' : pfad));
  const remote = remoteVon(ort);
  if (!remote) return recht(true);

  const token = liesToken(home);
  if (!token) {
    const wert = recht(false, GRUND_OHNE_TOKEN, HINWEIS_OHNE_TOKEN);
    merkeRecht(ort + '|' + remote + '|ohne token', wert);
    return wert;
  }

  const werkzeug = client || erstelleClient({ home });
  let login = '';
  try {
    const ich = await werkzeug.ich();
    login = String((ich && ich.login) || '').trim();
  } catch (fehler) {
    // Ohne Netz ist das Recht nicht zu prüfen; ein abgewiesener Token ist
    // auch keine Antwort über die Berechtigung dieser Person.
    if (!Number(fehler && fehler.status)) {
      return recht(false, GRUND_NICHT_PRUEFBAR, HINWEIS_NICHT_PRUEFBAR);
    }
    return recht(false, GRUND_ANMELDUNG_UNGUELTIG, HINWEIS_ANMELDUNG_UNGUELTIG);
  }
  if (!login) {
    return recht(false, GRUND_NICHT_PRUEFBAR, HINWEIS_NICHT_PRUEFBAR);
  }

  const schluessel = ort + '|' + remote + '|' + login;
  const bekannt = ausSpeicher(schluessel);
  if (bekannt !== null) return bekannt;

  const ziel = repoAusRemote(remote);
  if (!ziel) {
    // Ein Remote, den diese Form nicht kennt, liegt nicht bei GitHub; über
    // seine Rechte kann hier niemand urteilen. Er gilt als der eigene.
    const wert = recht(true);
    merkeRecht(schluessel, wert);
    return wert;
  }

  try {
    const antwort = await werkzeug.berechtigung(ziel.owner, ziel.name, login);
    const name = String((antwort && antwort.berechtigung) || '').toLowerCase();
    const wert = SCHREIBRECHTE.has(name)
      ? recht(true)
      : recht(false, GRUND_OHNE_RECHT, HINWEIS_OHNE_RECHT);
    merkeRecht(schluessel, wert);
    return wert;
  } catch (fehler) {
    // Ein Fehler ist kein Schreibrecht. Ohne Antwort von GitHub ist der Grund
    // ein anderer als bei einer Antwort, die das Recht verneint.
    if (!Number(fehler && fehler.status)) {
      return recht(false, GRUND_NICHT_PRUEFBAR, HINWEIS_NICHT_PRUEFBAR);
    }
    return recht(false, GRUND_OHNE_RECHT, HINWEIS_OHNE_RECHT);
  }
}

/**
 * Die kurze Antwort auf dieselbe Frage: `true` oder `false`.
 * `schreibrecht` nennt daneben den Grund.
 */
export async function darfSchreiben({ pfad, home = '', client = null } = {}) {
  return (await schreibrecht({ pfad, home, client })).darf === true;
}
