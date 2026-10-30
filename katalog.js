/**
 * Der Katalog: die öffentlichen Dinge des Hauptboards mit Sternen, Fassung,
 * Host, Verweis, Beispielen, Prüfung, offenen Fragen und offenen Beiträgen.
 *
 * Gelesen wird `katalog.json` im Hauptboard. Die Einträge sind Verweise; ihre
 * Repositories werden wie in der Komposition aufgelöst — relativ zum
 * Hauptboard, sonst als Geschwisterordner. Ein fehlendes öffentliches
 * Repository bleibt als Lücke stehen und wird nicht verschluckt.
 *
 * Neben den kuratierten Einträgen stehen die gefundenen: öffentliche
 * Stationen, die auf GitHub das Thema `dsh-board-station` tragen. Sie werden
 * ohne Zutun gesucht; ein Treffer, der schon kuratiert ist, kommt nicht
 * doppelt. `eintraege` ist die zusammengeführte Liste, `kuratiert` und
 * `gefunden` sind die beiden Teile.
 *
 * Der öffentliche Katalog nennt nichts Privates. Ein lokaler Ordner, der nach
 * `sichtbarkeit.json` oder nach seinem Namen privat ist, und ein Repository,
 * das GitHub als privat meldet, fallen still aus allen drei Listen — der Name
 * erscheint auch nicht in `luecken` oder im Hinweis. Die Namensregel trifft
 * nur lokale Ordner; ein gefundener GitHub-Eintrag bleibt öffentlich, solange
 * GitHub ihn nicht als privat meldet. Dasselbe gilt für Einträge, die in der
 * Sperrliste `gesperrt` von `katalog.json` stehen: Sie verschwinden aus dem
 * Katalog, ohne aus `katalog.json` gelöscht zu werden; der direkte Weg zu
 * einer Station bleibt lesbar.
 *
 * Was von GitHub kommt, wird zwischengespeichert: die Sternzahl je Repository
 * in `$DSH_HOME/board/sterne.json`, der fertige Katalog samt letztem
 * Suchstand in `$DSH_HOME/board/katalog-cache.json`. Beides gilt zehn
 * Minuten; `DSH_BOARD_CACHE_TTL` überschreibt die Zeit in Millisekunden,
 * `frisch` umgeht den Zwischenspeicher. Ohne Netz kommt der letzte Stand —
 * von den kuratierten Einträgen und von der Suche —, mit einem Hinweis
 * darüber. Fragen und Beiträge sind zwei Zahlen; eine nicht ermittelbare
 * bleibt `null`, nicht 0.
 */
import {
  existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, dirname, join, resolve } from 'node:path';
import { erstelleClient, liesSterne, SUCH_THEMA } from './github.js';
import { liesBoard } from './formate/board.js';
import { liesKatalog } from './formate/katalog.js';
import { liesStation } from './formate/station.js';
import { liesWorkflow } from './formate/workflow.js';
import { liesVorhaben } from './formate/vorhaben.js';
import { liesRepo } from './repos.js';
import { PRIVAT, sichtbarkeitAusName, sichtbarkeitVon } from './rechte.js';

/** Zehn Minuten; die Umgebungsvariable ersetzt die Zahl für Prüfungen. */
const STANDARD_TTL = 10 * 60 * 1000;
const NETZ_MS = 5000;

function kurz(fehler) {
  return String((fehler && fehler.message) || fehler).split('\n')[0].trim();
}

function zeitWert(jetzt) {
  const wert = typeof jetzt === 'function' ? jetzt() : jetzt;
  if (wert instanceof Date) return wert.getTime();
  const zahl = Number(wert);
  return Number.isFinite(zahl) ? zahl : Date.now();
}

function ttlWert() {
  const text = String(process.env.DSH_BOARD_CACHE_TTL || '').trim();
  if (!text) return STANDARD_TTL;
  const roh = Number(text);
  return Number.isFinite(roh) && roh >= 0 ? roh : STANDARD_TTL;
}

/**
 * Wo ein Repository liegt. Dieselbe Regel wie in der Komposition: zuerst
 * relativ zum Hauptboard, ein nackter Name sonst als Geschwisterordner.
 */
function ortVon(verweis, basis) {
  const text = String(verweis == null ? '' : verweis).trim();
  if (!text) return '';
  if (/^(https?:\/\/|git@|ssh:\/\/|git:\/\/)/i.test(text)) return '';
  const direkt = resolve(basis, text);
  if (existsSync(direkt)) return direkt;
  if (!text.includes('/') && !text.includes('\\')) {
    const neben = resolve(dirname(basis), text);
    if (existsSync(neben)) return neben;
  }
  return direkt;
}

function gitLauf(pfad, args) {
  try {
    const lauf = spawnSync('git', ['-C', pfad, ...args], {
      encoding: 'utf8',
      timeout: NETZ_MS,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
    return { ok: lauf.status === 0, out: String(lauf.stdout || '').trim() };
  } catch {
    return { ok: false, out: '' };
  }
}

function remoteVon(pfad) {
  try {
    if (!existsSync(pfad)) return '';
    const lauf = gitLauf(pfad, ['remote', 'get-url', 'origin']);
    return lauf.ok ? lauf.out : '';
  } catch {
    return '';
  }
}

/** Der letzte Tag eines Repositories; ohne Tag bleibt die Fassung leer. */
function fassungVon(pfad) {
  const lauf = gitLauf(pfad, ['describe', '--tags', '--abbrev=0']);
  return lauf.ok && lauf.out ? lauf.out : '';
}

/** Ein GitHub-Remote als `{ owner, name }`; andere Remotes ergeben `null`. */
function githubZiel(remote) {
  const treffer = String(remote == null ? '' : remote).trim().match(
    /github\.com[:/]+([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100}?)(?:\.git)?\/?$/i,
  );
  if (!treffer) return null;
  return { owner: treffer[1], name: treffer[2] };
}

function webAdresse(ziel) {
  return ziel ? 'https://github.com/' + ziel.owner + '/' + ziel.name : '';
}

/** Ein Eintrag, der aus der Suche stammt, nicht aus dem Katalog. */
function istGefunden(eintrag) {
  return Boolean(eintrag && typeof eintrag === 'object'
    && eintrag.herkunft === 'gefunden');
}

/** Der Schlüssel `owner/repo` eines Eintrags, klein geschrieben; sonst leer. */
function eintragSchluessel(eintrag) {
  if (!eintrag || typeof eintrag !== 'object') return '';
  const ziel = eintrag.github && typeof eintrag.github === 'object'
    ? eintrag.github
    : githubZiel(eintrag.remote);
  if (ziel && ziel.owner && ziel.name) {
    return String(ziel.owner).trim().toLowerCase() + '/'
      + String(ziel.name).trim().toLowerCase();
  }
  const repo = String(eintrag.repo == null ? '' : eintrag.repo).trim();
  // Gefundene Stationen nennen ihren Verweis als `owner/name`; ein lokaler
  // Pfad ist kein solcher Schlüssel.
  if (/^[^/\\]+\/[^/\\]+$/.test(repo)) return repo.toLowerCase();
  return '';
}

/**
 * Ob ein lokaler Ordner privat ist. Es gilt die Sichtbarkeitsregel aus
 * `rechte.js`: zuerst die Karten, zuletzt der Name — `vorhaben-…` und
 * `board-team` sind privat. Für gefundene GitHub-Einträge gilt sie nicht;
 * über die entscheidet GitHub.
 */
function istPrivatLokal(home, pfad) {
  const text = String(pfad == null ? '' : pfad).trim();
  if (!text) return false;
  if (/^(https?:\/\/|git@|ssh:\/\/|git:\/\/|file:\/\/)/i.test(text)) return false;
  // Ohne Zuhause gibt es keine Karte zu lesen; die Namensregel gilt trotzdem.
  if (!home) return sichtbarkeitAusName(basename(resolve(text))) === PRIVAT;
  try {
    return sichtbarkeitVon(home, text) === PRIVAT;
  } catch {
    return false;
  }
}

/** Was GitHub über die Sichtbarkeit eines Repositories sagt. */
function istGemeldetPrivat(daten) {
  if (!daten || typeof daten !== 'object') return false;
  return daten.privat === true || daten.private === true
    || daten.sichtbarkeit === PRIVAT;
}

/** Die Sperrliste aus `katalog.json` als kleine Schlüssel. */
function sperrListe(gesperrt) {
  const liste = Array.isArray(gesperrt) ? gesperrt : [];
  const schluessel = [];
  for (const eintrag of liste) {
    const text = String(eintrag && eintrag.repo != null ? eintrag.repo : '')
      .trim().toLowerCase();
    if (text && !schluessel.includes(text)) schluessel.push(text);
  }
  return schluessel;
}

/**
 * Die Namen, unter denen ein Eintrag gesperrt sein kann: der Verweis selbst,
 * sein Ordnername und — bei einem GitHub-Verweis — `owner/name` und der
 * Repository-Name. Eine Sperre ist ein Verweis `owner/repo` oder ein Name.
 */
function sperrNamen(eintrag) {
  const namen = new Set();
  if (!eintrag || typeof eintrag !== 'object') return namen;
  const repo = String(eintrag.repo == null ? '' : eintrag.repo).trim();
  if (repo) {
    namen.add(repo.toLowerCase());
    const ordner = basename(repo).toLowerCase();
    if (ordner) namen.add(ordner);
  }
  const schluessel = eintragSchluessel(eintrag);
  if (schluessel) {
    namen.add(schluessel);
    const teile = schluessel.split('/');
    if (teile.length === 2 && teile[1]) namen.add(teile[1]);
  }
  return namen;
}

/** Ob ein Eintrag auf der Sperrliste steht. */
function istGesperrt(eintrag, sperren) {
  if (!sperren.length) return false;
  const namen = sperrNamen(eintrag);
  return sperren.some((sperre) => namen.has(sperre));
}

/**
 * Was nicht in den öffentlichen Katalog gehört: private und gesperrte
 * Einträge. Beides geschieht still — kein Name wandert deshalb in `luecken`
 * oder in den Hinweis. Die Namensregel trifft nur lokale Ordner; ein
 * gefundener GitHub-Eintrag bleibt öffentlich, solange GitHub ihn nicht als
 * privat meldet.
 */
function sichtbareEintraege(eintraege, { home = '', gesperrt = [] } = {}) {
  const sperren = sperrListe(gesperrt);
  return (Array.isArray(eintraege) ? eintraege : []).filter((eintrag) => {
    if (!eintrag || typeof eintrag !== 'object') return false;
    if (istGemeldetPrivat(eintrag)) return false;
    if (eintrag.herkunft !== 'gefunden'
      && istPrivatLokal(home, eintrag.repo)) return false;
    return !istGesperrt(eintrag, sperren);
  });
}

/**
 * Kuratierte und gefundene Einträge zusammenführen: kuratiert zuerst, dann
 * gefunden, je `owner/repo` einmal. Ein kuratierter Eintrag bleibt, wie er
 * ist; Felder der gefundenen Fassung werden nicht in ihn übernommen.
 */
function zusammenfuehren(kuratiert, gefunden) {
  const gesehen = new Set();
  const liste = [];
  const nehmen = (eintrag, herkunft) => {
    if (!eintrag || typeof eintrag !== 'object') return;
    const schluessel = eintragSchluessel(eintrag);
    if (schluessel) {
      if (gesehen.has(schluessel)) return;
      gesehen.add(schluessel);
    }
    liste.push({ ...eintrag, herkunft });
  };
  for (const eintrag of Array.isArray(kuratiert) ? kuratiert : []) {
    nehmen(eintrag, 'kuratiert');
  }
  for (const eintrag of Array.isArray(gefunden) ? gefunden : []) {
    nehmen(eintrag, 'gefunden');
  }
  return liste;
}

/**
 * Die Beispiele einer Station: die Namen aus `station.json`; ist die Liste
 * dort leer, die Dateien im Ordner `beispiele/` des Repositories. Fehlt
 * beides, bleibt die Liste leer. Workflows und Vorhaben haben keine Beispiele.
 */
function beispieleLesen(ort, station) {
  const namen = [];
  for (const eintrag of station.beispiele) {
    const name = typeof eintrag === 'string' ? eintrag.trim() : '';
    if (name && !namen.includes(name)) namen.push(name);
  }
  if (namen.length) return namen;
  try {
    return readdirSync(join(ort, 'beispiele'), { withFileTypes: true })
      .filter((eintrag) => eintrag.isFile())
      .map((eintrag) => eintrag.name)
      .sort((a, b) => a.localeCompare(b, 'de'));
  } catch {
    return [];
  }
}

/**
 * Die Schlüssel, unter denen eine Prüfung zu einem Eintrag passt: `owner/repo`
 * klein geschrieben und der aufgelöste lokale Pfad. Ein Verweis kann beides
 * sein; dann trägt er beide Schlüssel.
 */
function pruefungsSchluessel(verweis, basis) {
  const text = String(verweis == null ? '' : verweis).trim();
  if (!text) return [];
  const schluessel = [];
  if (/^[^/\\]+\/[^/\\]+$/.test(text)) schluessel.push('repo:' + text.toLowerCase());
  const pfad = ortVon(text, basis);
  if (pfad) schluessel.push('pfad:' + resolve(pfad));
  return schluessel;
}

/** Die Prüfungen aus `katalog.json` als Karte; die spätere Nennung gewinnt. */
function pruefungsKarte(pruefungen, basis) {
  const karte = new Map();
  for (const roh of Array.isArray(pruefungen) ? pruefungen : []) {
    if (!roh || typeof roh !== 'object') continue;
    const pruefung = {
      repo: String(roh.repo == null ? '' : roh.repo),
      von: String(roh.von == null ? '' : roh.von),
      am: String(roh.am == null ? '' : roh.am),
    };
    if (!pruefung.repo) continue;
    for (const schluessel of pruefungsSchluessel(pruefung.repo, basis)) {
      karte.set(schluessel, pruefung);
    }
  }
  return karte;
}

/** Die Schlüssel eines Eintrags für die Zuordnung einer Prüfung. */
function eintragsSchluessel(eintrag) {
  if (!eintrag || typeof eintrag !== 'object') return [];
  const schluessel = [];
  const repo = eintragSchluessel(eintrag);
  if (repo) schluessel.push('repo:' + repo);
  const ort = String(eintrag.repo == null ? '' : eintrag.repo).trim();
  if (ort && !/^(https?:\/\/|git@|ssh:\/\/|git:\/\/)/i.test(ort)
    && !/^[^/\\]+\/[^/\\]+$/.test(ort)) {
    schluessel.push('pfad:' + resolve(ort));
  }
  return schluessel;
}

/** Die Prüfung zu einem Eintrag; ohne Eintrag bleibt es bei `null`. */
function pruefungFuer(eintrag, karte) {
  if (!karte || !karte.size) return null;
  for (const schluessel of eintragsSchluessel(eintrag)) {
    const treffer = karte.get(schluessel);
    if (treffer) return { ...treffer };
  }
  return null;
}

/** Ein Suchtreffer als Katalogeintrag; Name und Verweis kommen von GitHub. */
function gefundenerEintrag(treffer) {
  const owner = String((treffer && treffer.owner) || '').trim();
  const name = String((treffer && treffer.name) || '').trim();
  const sterne = treffer ? treffer.sterne : null;
  return {
    art: 'station',
    repo: owner + '/' + name,
    name,
    beschreibung: String((treffer && treffer.beschreibung) || ''),
    sterne: Number.isFinite(sterne) ? sterne : null,
    fragen: null,
    beitraege: null,
    freigaben: null,
    beispiele: [],
    web: String((treffer && treffer.web) || '') || webAdresse({ owner, name }),
    herkunft: 'gefunden',
    github: { owner, name },
  };
}

/**
 * Die Suchtreffer zu Einträgen machen: archivierte und private überspringen,
 * kuratierte nicht doppelt aufnehmen, und innerhalb der Gefundenen über
 * `owner/name` zusammenfassen — ohne Rücksicht auf Groß- und Kleinschreibung.
 */
function trefferFiltern(treffer, kuratiertSchluessel) {
  const gesehen = new Set();
  const liste = [];
  for (const roh of Array.isArray(treffer) ? treffer : []) {
    if (!roh || roh.archiviert) continue;
    // Ein Treffer kann inzwischen privat sein; er gehört dann nicht in den
    // öffentlichen Katalog — auch nicht als Name in einer Meldung.
    if (istGemeldetPrivat(roh)) continue;
    const owner = String(roh.owner == null ? '' : roh.owner).trim();
    const name = String(roh.name == null ? '' : roh.name).trim();
    if (!owner || !name) continue;
    const schluessel = (owner + '/' + name).toLowerCase();
    if (kuratiertSchluessel.has(schluessel) || gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);
    liste.push(gefundenerEintrag({ ...roh, owner, name }));
  }
  return liste;
}

/** Wie oft eine Station in den Workflows des Hauptboards vorkommt. */
function verwendungZaehlen(hauptboard) {
  const zaehler = new Map();
  let board;
  try {
    board = liesBoard(hauptboard);
  } catch {
    return zaehler;
  }
  for (const verweis of board.workflows) {
    const workflowOrt = ortVon(verweis.repo, hauptboard);
    if (!workflowOrt) continue;
    let workflow;
    try {
      workflow = liesWorkflow(workflowOrt);
    } catch {
      continue;
    }
    for (const station of workflow.stationen) {
      const ziel = ortVon(station.repo, workflowOrt);
      if (!ziel) continue;
      zaehler.set(ziel, (zaehler.get(ziel) || 0) + 1);
    }
  }
  return zaehler;
}

/**
 * Eine Karte aus einem Katalogeintrag lesen. Was die Datei des Repositories
 * nicht hergibt, bleibt leer; ein Name wird nicht erfunden.
 */
function eintragLesen(art, ort, besonderheit, verwendet) {
  const repo = liesRepo(ort);
  if (repo.art !== art) {
    throw new Error('Der Ordner ist kein ' + art + ': ' + ort);
  }
  const fassung = fassungVon(ort);
  const remote = remoteVon(ort);
  const ziel = githubZiel(remote);
  const eintrag = {
    art,
    herkunft: 'kuratiert',
    name: '',
    host: '',
    fassung,
    beschreibung: '',
    tags: [],
    repo: ort,
    remote,
    adresse: webAdresse(ziel),
    sterne: null,
    fragen: null,
    beitraege: null,
    freigaben: null,
    beispiele: [],
    geprueft: null,
    ...(art === 'station' ? { verwendet } : null),
    ...(besonderheit ? { besonderheit } : null),
  };
  if (art === 'station') {
    const station = liesStation(ort);
    eintrag.name = station.name;
    eintrag.host = station.host;
    eintrag.beschreibung = station.beschreibung;
    eintrag.tags = station.tags.slice();
    eintrag.beispiele = beispieleLesen(ort, station);
  } else if (art === 'workflow') {
    const workflow = liesWorkflow(ort);
    eintrag.name = workflow.titel;
    eintrag.host = workflow.autor;
    eintrag.beschreibung = workflow.beschreibung;
  } else {
    const vorhaben = liesVorhaben(ort);
    eintrag.name = vorhaben.name;
    const erste = Object.values(vorhaben.verantwortliche || {})
      .flat().find((login) => String(login || '').trim());
    eintrag.host = erste ? String(erste) : '';
  }
  if (ziel) eintrag.github = ziel;
  return eintrag;
}

/* --- Zwischenspeicher ----------------------------------------------------- */

export function katalogCachePfad(home) {
  return join(String(home == null ? '' : home), 'board', 'katalog-cache.json');
}

export function liesKatalogCache(home) {
  if (!home) return null;
  try {
    const roh = JSON.parse(readFileSync(katalogCachePfad(home), 'utf8'));
    if (!roh || typeof roh !== 'object' || !Array.isArray(roh.eintraege)) return null;
    return roh;
  } catch {
    return null;
  }
}

/** Der zuletzt gemerkte Stand einer Station im Katalog-Zwischenspeicher. */
function stationStandAusCache(cache, pfad) {
  const alle = cache && cache.stationen && typeof cache.stationen === 'object'
    ? cache.stationen
    : null;
  const wert = alle ? alle[pfad] : null;
  return wert && typeof wert === 'object' ? wert : null;
}

/** Der zuletzt bekannte Stand der Suche; fehlt er, ist er leer. */
function gefundenAusCache(cache) {
  const roh = cache && cache.gefunden;
  if (!roh || typeof roh !== 'object' || !Array.isArray(roh.eintraege)) return null;
  return {
    am: typeof roh.am === 'string' ? roh.am : '',
    eintraege: roh.eintraege.filter(
      (eintrag) => eintrag && typeof eintrag === 'object',
    ),
  };
}

/**
 * Einem Eintrag aus einem älteren Zwischenspeicher die Felder geben, die er
 * noch nicht kennt — leer statt erfunden.
 */
function ergaenzeFelder(eintrag) {
  return {
    ...eintrag,
    beispiele: Array.isArray(eintrag.beispiele) ? eintrag.beispiele : [],
    fragen: Number.isFinite(eintrag.fragen) ? eintrag.fragen : null,
    beitraege: Number.isFinite(eintrag.beitraege) ? eintrag.beitraege : null,
    freigaben: Array.isArray(eintrag.freigaben) ? eintrag.freigaben : null,
    geprueft: eintrag.geprueft && typeof eintrag.geprueft === 'object'
      ? eintrag.geprueft
      : null,
  };
}

/** Die drei Listen aus einem Zwischenspeicher, auch aus einem älteren. */
function katalogAusCache(cache) {
  const alle = Array.isArray(cache && cache.eintraege) ? cache.eintraege : [];
  const gespeichert = gefundenAusCache(cache);
  const gefunden = gespeichert
    ? gespeichert.eintraege
    : alle.filter(istGefunden);
  const kuratiert = alle.filter((eintrag) => !istGefunden(eintrag));
  const eintraege = zusammenfuehren(kuratiert, gefunden).map(ergaenzeFelder);
  return {
    eintraege,
    kuratiert: eintraege.filter((eintrag) => eintrag.herkunft === 'kuratiert'),
    gefunden: eintraege.filter((eintrag) => eintrag.herkunft === 'gefunden'),
    standGefunden: gespeichert ? gespeichert.am : '',
  };
}

/** Ein Zeitpunkt als Text für den Hinweis; ein unlesbarer bleibt, wie er ist. */
function standText(am) {
  const text = String(am == null ? '' : am).trim();
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) return text;
  try {
    return new Date(ms).toLocaleString('de-DE', {
      dateStyle: 'short', timeStyle: 'short',
    });
  } catch {
    return new Date(ms).toISOString();
  }
}

function schreibeKatalogCache(home, am, eintraege, gefunden, stationen = null) {
  if (!home) return;
  try {
    const ziel = katalogCachePfad(home);
    mkdirSync(dirname(ziel), { recursive: true });
    const inhalt = {
      am,
      eintraege,
      gefunden: gefunden || { am: '', eintraege: [] },
      // Der Stand je Station ist eine Zugabe zum Katalog: er hält die Zahlen
      // der Stationsseite, ohne einen Eintrag in die kuratierte Liste zu legen.
      ...(stationen && typeof stationen === 'object'
        && Object.keys(stationen).length ? { stationen } : null),
    };
    writeFileSync(ziel + '.tmp', JSON.stringify(inhalt, null, 2) + '\n', 'utf8');
    renameSync(ziel + '.tmp', ziel);
  } catch {
    // Der Zwischenspeicher ist eine Zugabe; das Sammeln hängt nicht an ihm.
  }
}

function merkeSterne(home, schluessel, sterne, am) {
  if (!home) return;
  try {
    const alle = liesSterne(home);
    alle[schluessel] = { sterne, am };
    const ziel = join(home, 'board', 'sterne.json');
    mkdirSync(dirname(ziel), { recursive: true });
    writeFileSync(ziel + '.tmp', JSON.stringify(alle, null, 2) + '\n', 'utf8');
    renameSync(ziel + '.tmp', ziel);
  } catch {
    // Der Zwischenspeicher ist eine Zugabe; das Sammeln hängt nicht an ihm.
  }
}

/** Die zuletzt bekannte Sternzahl; die Schreibweise des Owners zählt nicht. */
function sterneAus(alle, schluessel) {
  if (alle && Object.prototype.hasOwnProperty.call(alle, schluessel)) {
    return alle[schluessel];
  }
  const klein = String(schluessel).toLowerCase();
  for (const [name, wert] of Object.entries(alle || {})) {
    if (name.toLowerCase() === klein) return wert;
  }
  return null;
}

function letzterStand(cache, alle) {
  if (cache && typeof cache.am === 'string' && cache.am) return cache.am;
  const zeiten = Object.values(alle || {})
    .map((eintrag) => (eintrag && typeof eintrag.am === 'string' ? eintrag.am : ''))
    .filter(Boolean)
    .sort();
  return zeiten.length ? zeiten[zeiten.length - 1] : null;
}

/**
 * Die Zahlen aus dem letzten guten Stand übernehmen, soweit der neue Lauf
 * keine hat. Eine nicht ermittelbare Zahl bleibt `null`; sie wird nicht 0.
 */
function uebernimmZahlen(eintrag, alt) {
  if (!alt || typeof alt !== 'object') return;
  if (eintrag.fragen == null && Number.isFinite(alt.fragen)) eintrag.fragen = alt.fragen;
  if (eintrag.beitraege == null && Number.isFinite(alt.beitraege)) {
    eintrag.beitraege = alt.beitraege;
  }
  if (eintrag.sterne == null && Number.isFinite(alt.sterne)) eintrag.sterne = alt.sterne;
}

/**
 * Was der letzte gute Stand zu einem Eintrag sagte, übernehmen — nur dort, wo
 * der neue Lauf nichts hergibt. Ohne Netz bleibt so die letzte Freigabe und
 * die letzte Zahl stehen, statt auf einen leeren Wert zurückzufallen.
 */
function uebernimmAlt(eintrag, alt) {
  if (!alt || typeof alt !== 'object') return;
  if (String(alt.fassung == null ? '' : alt.fassung).trim()) {
    eintrag.fassung = String(alt.fassung).trim();
  }
  uebernimmZahlen(eintrag, alt);
  if (!eintrag.adresse && alt.adresse) eintrag.adresse = String(alt.adresse);
  if (eintrag.freigaben == null && Array.isArray(alt.freigaben)) {
    eintrag.freigaben = alt.freigaben;
  }
}

/**
 * Den Katalog des Hauptboards sammeln.
 *
 * `hauptboard` ist der Ordner des Hauptboards, `home` das Zuhause für die
 * Zwischenspeicher. `client` ersetzt den GitHub-Client für Prüfungen, `jetzt`
 * die Uhr. `frisch` liest die Repositories und GitHub neu, statt den
 * Zwischenspeicher zu nehmen.
 *
 * Zurück kommt `{ eintraege, kuratiert, gefunden, hinweis, stand,
 * standGefunden, luecken }`. `eintraege` ist die zusammengeführte Liste,
 * kuratiert zuerst; jeder Eintrag nennt seine Herkunft. `stand` ist die letzte
 * Sammlung, `standGefunden` die letzte Suche.
 */
export async function sammleKatalog({
  hauptboard, home = '', client = null, jetzt, frisch = false,
} = {}) {
  const ort = resolve(String(hauptboard == null ? '' : hauptboard));
  const jetztMs = zeitWert(jetzt);
  const ttl = ttlWert();
  const cache = liesKatalogCache(home);

  if (!frisch && cache) {
    const amMs = Date.parse(String(cache.am || ''));
    if (Number.isFinite(amMs) && jetztMs - amMs < ttl) {
      const ausCache = katalogAusCache(cache);
      // Die Prüfungen und die Sperrliste stehen in `katalog.json`, nicht im
      // Zwischenspeicher des Katalogs; sie gelten auch auf dem schnellen Weg.
      let gesperrt = [];
      try {
        const frischGelesen = liesKatalog(ort);
        const karte = pruefungsKarte(frischGelesen.geprueft, ort);
        gesperrt = frischGelesen.gesperrt;
        for (const eintrag of ausCache.eintraege) {
          eintrag.geprueft = pruefungFuer(eintrag, karte);
        }
      } catch {
        // Ein unlesbarer Katalog lässt den letzten Stand stehen.
      }
      // Private und gesperrte Einträge verschwinden auch aus einem Stand, der
      // noch im Zwischenspeicher liegt.
      const eintraege = sichtbareEintraege(ausCache.eintraege, { home, gesperrt });
      return {
        ...ausCache,
        eintraege,
        kuratiert: eintraege.filter((eintrag) => eintrag.herkunft === 'kuratiert'),
        gefunden: eintraege.filter((eintrag) => eintrag.herkunft === 'gefunden'),
        hinweis: '',
        stand: cache.am,
        luecken: [],
      };
    }
  }

  const katalog = liesKatalog(ort);
  const gesperrt = katalog.gesperrt;
  const sperren = sperrListe(gesperrt);
  const pruefungen = pruefungsKarte(katalog.geprueft, ort);
  const verwendung = verwendungZaehlen(ort);
  const luecken = [];
  const eintraege = [];
  // Der letzte gute Stand je Eintrag, auch wenn er schon älter als die TTL
  // ist: ohne Netz zählt er weiter, statt einen leeren Wert zu zeigen.
  const vorher = new Map();
  for (const alt of cache && Array.isArray(cache.eintraege) ? cache.eintraege : []) {
    if (!alt || typeof alt !== 'object' || !alt.art || !alt.repo) continue;
    vorher.set(String(alt.art) + ':' + String(alt.repo), alt);
  }

  // Ein privates oder gesperrtes Ding wird weder gelesen noch als Lücke
  // genannt: Sein Name soll im öffentlichen Katalog nicht vorkommen. Liegt der
  // Ordner, entscheidet seine Sichtbarkeit; fehlt er, zählen auch der Name des
  // Verweises und der mögliche Geschwisterordner.
  const weg = (verweis, pfad) => {
    const text = String(verweis == null ? '' : verweis).trim();
    const orte = [pfad];
    if (!existsSync(pfad)) {
      if (text && !/[/\\]/.test(text)) orte.push(resolve(dirname(ort), text));
      if (text) orte.push(text);
    }
    return (orte.some((ziel) => istPrivatLokal(home, ziel))
      || istGesperrt({ repo: pfad }, sperren)
      || istGesperrt({ repo: text }, sperren));
  };

  const lesen = (art, verweis, besonderheit = '') => {
    const pfad = ortVon(verweis, ort);
    if (!pfad) {
      if (weg(verweis, verweis)) return;
      luecken.push({
        art,
        repo: String(verweis == null ? '' : verweis),
        grund: 'Das Repository liegt nicht lokal',
      });
      return;
    }
    if (weg(verweis, pfad)) return;
    try {
      eintraege.push(eintragLesen(
        art, pfad, besonderheit, verwendung.get(pfad) || 0,
      ));
    } catch (fehler) {
      luecken.push({ art, repo: pfad, grund: kurz(fehler) });
    }
  };

  for (const eintrag of katalog.stationen) {
    lesen('station', eintrag.repo, eintrag.besonderheit);
  }
  for (const eintrag of katalog.workflows) lesen('workflow', eintrag.repo);
  for (const eintrag of katalog.vorhaben) lesen('vorhaben', eintrag.repo);

  // Ohne eigenen Client entsteht einer aus dem Zuhause; ein Token ist für
  // öffentliche Angaben nicht nötig.
  const github = client || erstelleClient({ home, jetzt: () => jetztMs });
  const bekannt = liesSterne(home);
  let hinweis = '';
  let netzFehler = false;
  const jetztIso = new Date(jetztMs).toISOString();

  for (const eintrag of eintraege) {
    if (!eintrag.github) continue;
    const { owner, name } = eintrag.github;
    const schluessel = owner + '/' + name;
    const alt = vorher.get(eintrag.art + ':' + eintrag.repo) || null;
    const melde = (fehler) => {
      const status = Number((fehler && fehler.status) || 0);
      if (status === 0) netzFehler = true;
      else eintrag.fehler = kurz(fehler);
    };
    try {
      const daten = await github.repo(owner, name);
      // Ein Repository, das bei GitHub privat ist, gehört nicht in den
      // öffentlichen Katalog. Es wird still übergangen; Fragen, Beiträge und
      // Freigaben werden dafür nicht mehr gefragt.
      if (istGemeldetPrivat(daten)) {
        eintrag.privat = true;
        continue;
      }
      eintrag.sterne = Number.isFinite(daten.sterne) ? daten.sterne : null;
      if (daten.adresse) eintrag.adresse = daten.adresse;
      merkeSterne(home, schluessel, eintrag.sterne, jetztIso);
    } catch (fehler) {
      // Ohne Metadaten sind auch die Zahlen nicht ermittelbar: sie bleiben
      // `null` oder der letzte Stand, aber niemals 0.
      melde(fehler);
      uebernimmAlt(eintrag, alt);
      const altSterne = sterneAus(bekannt, schluessel);
      if (altSterne && Number.isFinite(altSterne.sterne)) {
        eintrag.sterne = altSterne.sterne;
      }
      continue;
    }

    // Zwei getrennte Zahlen: offene Fragen sind Issues ohne Pull Request,
    // Beiträge sind offene Pull Requests. Der Pull Request zählt nicht als
    // Frage. Ein Fehler lässt den letzten Stand stehen.
    try {
      const offeneFragen = await github.fragen(owner, name, { state: 'open' });
      eintrag.fragen = Array.isArray(offeneFragen) ? offeneFragen.length : null;
    } catch (fehler) {
      melde(fehler);
      uebernimmZahlen(eintrag, alt);
    }
    try {
      const offeneBeitraege = await github.beitraege(owner, name, { state: 'open' });
      eintrag.beitraege = Array.isArray(offeneBeitraege)
        ? offeneBeitraege.length
        : null;
    } catch (fehler) {
      melde(fehler);
      uebernimmZahlen(eintrag, alt);
    }

    try {
      const freigaben = await github.releases(owner, name);
      if (Array.isArray(freigaben)) {
        eintrag.freigaben = freigaben;
        if (freigaben.length && String(freigaben[0].tag || '').trim()) {
          eintrag.fassung = String(freigaben[0].tag).trim();
        }
      }
    } catch (fehler) {
      melde(fehler);
      uebernimmAlt(eintrag, alt);
    }
  }

  const stand = netzFehler ? letzterStand(cache, bekannt) : jetztIso;
  if (netzFehler) hinweis = 'GitHub nicht erreichbar; letzter Stand';

  // Nach den kuratierten Einträgen die Suche. Ihr letzter Stand bleibt
  // stehen, wenn die Suche nicht geht — ein Fehler ist eine Meldung, kein
  // Absturz und keine leere Liste.
  const altGefunden = gefundenAusCache(cache) || { am: '', eintraege: [] };
  let gefunden = altGefunden.eintraege;
  let gefundenStand = altGefunden.am;
  let sucheAusfall = false;
  if (typeof github.suche === 'function') {
    const kuratiertSchluessel = new Set();
    for (const eintrag of eintraege) {
      if (!eintrag.github) continue;
      kuratiertSchluessel.add(
        (eintrag.github.owner + '/' + eintrag.github.name).toLowerCase(),
      );
    }
    try {
      const treffer = await github.suche({ thema: SUCH_THEMA, frisch });
      gefunden = trefferFiltern(treffer, kuratiertSchluessel);
      gefundenStand = jetztIso;
    } catch (fehler) {
      const status = Number((fehler && fehler.status) || 0);
      // Netz, Grenze und Serverfehler sind Meldungen; eine Suche, die es an
      // dieser Adresse nicht gibt (404), ist keine. Der letzte Stand bleibt.
      const melden = status === 0 || status === 403 || status === 429 || status >= 500;
      if (melden) {
        sucheAusfall = true;
        if (gefundenStand) {
          hinweis = 'Ohne Verbindung: letzter Stand vom ' + standText(gefundenStand);
        } else if (!netzFehler) {
          hinweis = 'Ohne Verbindung: Suche nicht möglich';
        }
      }
    }
  }

  // Beim Kuratierten ist das Feld `github` nur für das Sammeln da; in Antwort
  // und Zwischenspeicher steht es nicht. Ein gefundener Eintrag trägt seinen
  // GitHub-Bezug dagegen mit — er ist sein einziger Verweis. Die Prüfung aus
  // `katalog.json` wird jedem Eintrag zugeordnet; ohne Eintrag bleibt `null`.
  // Private und gesperrte Einträge fallen vorher still heraus.
  const zusammen = sichtbareEintraege(
    zusammenfuehren(eintraege, gefunden),
    { home, gesperrt },
  );
  const ausgabe = zusammen.map((eintrag) => {
    const geprueft = pruefungFuer(eintrag, pruefungen);
    if (eintrag.herkunft !== 'kuratiert') return { ...eintrag, geprueft };
    const { github, ...rest } = eintrag;
    return { ...rest, geprueft };
  });
  const kuratiert = ausgabe.filter((eintrag) => eintrag.herkunft === 'kuratiert');
  const gefundenAusgabe = ausgabe.filter((eintrag) => eintrag.herkunft === 'gefunden');
  if (!netzFehler && !sucheAusfall) {
    schreibeKatalogCache(home, jetztIso, ausgabe, {
      am: gefundenStand,
      eintraege: gefundenAusgabe,
    }, cache && cache.stationen ? cache.stationen : null);
  }

  return {
    eintraege: ausgabe,
    kuratiert,
    gefunden: gefundenAusgabe,
    hinweis,
    stand,
    standGefunden: gefundenStand || '',
    luecken,
  };
}

/**
 * Der Eintrag im Katalog-Zwischenspeicher, der zu diesem Ordner gehört:
 * zuerst über den lokalen Pfad, sonst über `owner/name`.
 */
function cacheEintrag(cache, pfad, ziel) {
  const liste = Array.isArray(cache && cache.eintraege) ? cache.eintraege : [];
  for (const eintrag of liste) {
    if (!eintrag || typeof eintrag !== 'object') continue;
    const ort = String(eintrag.repo == null ? '' : eintrag.repo).trim();
    if (!ort || /^(https?:\/\/|git@|ssh:\/\/|git:\/\/|file:\/\/)/i.test(ort)) continue;
    try {
      if (resolve(ort) === pfad) return eintrag;
    } catch {
      // Ein unbrauchbarer Verweis ist kein Treffer.
    }
  }
  const schluessel = ziel
    ? String(ziel.owner).toLowerCase() + '/' + String(ziel.name).toLowerCase()
    : '';
  if (!schluessel) return null;
  for (const eintrag of liste) {
    if (eintrag && typeof eintrag === 'object'
      && eintragSchluessel(eintrag) === schluessel) return eintrag;
  }
  return null;
}

/**
 * Das Vertrauensbild einer Station: die letzten Zahlen aus dem
 * Katalog-Zwischenspeicher, dann der frische Blick zu GitHub. Was nicht
 * erreichbar ist, bleibt beim letzten Stand; `hinweis` sagt es, statt einen
 * Fehler zu werfen. `hauptboard` liefert die Prüfung aus `katalog.json`.
 */
export async function stationZahlen({
  repo, hauptboard = '', home = '', client = null, jetzt,
} = {}) {
  const pfad = resolve(String(repo == null ? '' : repo));
  const jetztMs = zeitWert(jetzt);
  const ziel = githubZiel(remoteVon(pfad));
  const cache = liesKatalogCache(home);
  const katalogEintrag = cacheEintrag(cache, pfad, ziel);
  const gemerkt = stationStandAusCache(cache, pfad);
  const alt = katalogEintrag || gemerkt;
  const bild = {
    sterne: alt && Number.isFinite(alt.sterne) ? alt.sterne : null,
    freigaben: alt && Array.isArray(alt.freigaben) ? alt.freigaben : null,
    fragen: alt && Number.isFinite(alt.fragen) ? alt.fragen : null,
    beitraege: alt && Number.isFinite(alt.beitraege) ? alt.beitraege : null,
    adresse: (alt && typeof alt.adresse === 'string' ? alt.adresse.trim() : '')
      || webAdresse(ziel),
    geprueft: alt && alt.geprueft && typeof alt.geprueft === 'object'
      ? alt.geprueft
      : null,
    hinweis: '',
  };

  // Die Sternzahl bleibt auch dann stehen, wenn der Katalog-Eintrag fehlt.
  if (bild.sterne == null && ziel) {
    const bekannt = sterneAus(liesSterne(home), ziel.owner + '/' + ziel.name);
    if (bekannt && Number.isFinite(bekannt.sterne)) bild.sterne = bekannt.sterne;
  }
  // Die Prüfung kommt frisch aus `katalog.json`; der Zwischenspeicher trägt
  // sie nur, solange der Katalog nicht gelesen werden kann.
  if (hauptboard) {
    try {
      const katalog = liesKatalog(hauptboard);
      const karte = pruefungsKarte(katalog.geprueft, hauptboard);
      const geprueft = pruefungFuer(
        { repo: pfad, ...(ziel ? { github: ziel } : null) },
        karte,
      );
      if (geprueft) bild.geprueft = geprueft;
    } catch {
      // Ohne lesbaren Katalog bleibt die letzte Prüfung stehen.
    }
  }

  let fehlerText = '';
  let netzFehler = false;
  let geholt = false;
  const melde = (fehler) => {
    const status = Number((fehler && fehler.status) || 0);
    if (status === 0) netzFehler = true;
    else if (!fehlerText) fehlerText = kurz(fehler);
  };

  if (ziel) {
    const github = client || erstelleClient({ home, jetzt: () => jetztMs });
    try {
      const daten = await github.repo(ziel.owner, ziel.name);
      if (Number.isFinite(daten.sterne)) bild.sterne = daten.sterne;
      if (daten.adresse) bild.adresse = String(daten.adresse);
      geholt = true;
    } catch (fehler) {
      // Ohne Metadaten sind auch die anderen Zahlen nicht ermittelbar.
      melde(fehler);
    }
    if (geholt) {
      try {
        const freigaben = await github.releases(ziel.owner, ziel.name);
        if (Array.isArray(freigaben)) bild.freigaben = freigaben;
      } catch (fehler) {
        melde(fehler);
      }
      try {
        const fragen = await github.fragen(ziel.owner, ziel.name, { state: 'open' });
        if (Array.isArray(fragen)) bild.fragen = fragen.length;
      } catch (fehler) {
        melde(fehler);
      }
      try {
        const beitraege = await github.beitraege(ziel.owner, ziel.name, {
          state: 'open',
        });
        if (Array.isArray(beitraege)) bild.beitraege = beitraege.length;
      } catch (fehler) {
        melde(fehler);
      }
    }
  }

  if (netzFehler) bild.hinweis = 'GitHub nicht erreichbar; letzter Stand';
  else if (fehlerText) bild.hinweis = 'GitHub: ' + fehlerText;

  // Der letzte gute Stand wird fortgeschrieben: ohne Netz zeigt die nächste
  // Stationsseite dieselben Zahlen. Geschrieben wird nur, wenn GitHub
  // geantwortet hat; ein Fehlversuch datiert den alten Stand nicht neu.
  if (home && geholt) {
    const stand = {
      sterne: bild.sterne,
      freigaben: bild.freigaben,
      fragen: bild.fragen,
      beitraege: bild.beitraege,
      adresse: bild.adresse,
      geprueft: bild.geprueft,
    };
    if (katalogEintrag) {
      katalogEintrag.sterne = stand.sterne;
      katalogEintrag.freigaben = stand.freigaben;
      katalogEintrag.fragen = stand.fragen;
      katalogEintrag.beitraege = stand.beitraege;
      katalogEintrag.adresse = stand.adresse;
      katalogEintrag.geprueft = stand.geprueft;
    }
    const stationen = {
      ...(cache && cache.stationen && typeof cache.stationen === 'object'
        ? cache.stationen : null),
      [pfad]: { ...stand, am: new Date(jetztMs).toISOString() },
    };
    const alle = cache && Array.isArray(cache.eintraege) ? cache.eintraege : [];
    const gefunden = cache && cache.gefunden
      && Array.isArray(cache.gefunden.eintraege)
      ? cache.gefunden
      : { am: '', eintraege: alle.filter(istGefunden) };
    schreibeKatalogCache(
      home, cache && typeof cache.am === 'string' ? cache.am : '',
      alle, gefunden, stationen,
    );
  }
  return bild;
}

/**
 * Die Einträge durchsuchen: Name, Host, Tags und Beschreibung, ohne Groß- und
 * Kleinschreibung. Ein leerer Text lässt alles stehen.
 */
export function sucheKatalog(eintraege, text) {
  const liste = Array.isArray(eintraege) ? eintraege : [];
  const suche = String(text == null ? '' : text).trim().toLowerCase();
  if (!suche) return liste.slice();
  return liste.filter((eintrag) => {
    if (!eintrag || typeof eintrag !== 'object') return false;
    const teile = [
      eintrag.name,
      eintrag.host,
      eintrag.beschreibung,
      // Auch der Verweis lässt sich suchen: `station-…` ist der Name, unter
      // dem das Ding bei GitHub steht.
      eintrag.repo,
      ...(Array.isArray(eintrag.tags) ? eintrag.tags : []),
    ];
    return teile.some((teil) => String(teil == null ? '' : teil)
      .toLowerCase().includes(suche));
  });
}
