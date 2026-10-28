/**
 * Die Ablage als Dateien.
 *
 * Diese Datei kennt die Form, die zwischen zwei Installationen gilt:
 * `format`, `personen/<kennung>.json`, `workflows/<kennung>.json` und
 * `vorgaenge/<ordner>/vorhaben.json`. Sie liest sie in das eine Objekt, das
 * der Rest des Moduls schon immer gelesen hat, und schreibt aus demselben
 * Objekt wieder Dateien — je Datei nur, wenn sich ihr Inhalt ändert.
 *
 * `board.json` kommt hier nicht vor: es wird weder gelesen noch geschrieben.
 */
import {
  existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

/** Die Fassung der Ablage, die dieses Modul schreibt und versteht. */
export const FORMAT = 1;

/** Wie eine Personen- oder Vorhaben-Kennung aussehen darf (Dateiname). */
const KENNUNG = /^[a-z0-9][a-z0-9._-]*$/;
const VORGANG_KENNUNG = /^[a-z0-9][a-z0-9-]*$/;

function liesJson(pfad, vorgabe) {
  try {
    return JSON.parse(readFileSync(pfad, 'utf8'));
  } catch {
    return vorgabe;
  }
}

function schreibeJson(pfad, wert) {
  mkdirSync(dirname(pfad), { recursive: true });
  const text = JSON.stringify(wert, null, 2) + '\n';
  writeFileSync(pfad + '.tmp', text, 'utf8');
  renameSync(pfad + '.tmp', pfad);
  return text;
}

/** Vergleicht zwei JSON-Werte ohne Rücksicht auf die Schlüsselreihenfolge. */
function kanonisch(wert) {
  if (Array.isArray(wert)) return '[' + wert.map(kanonisch).join(',') + ']';
  if (wert && typeof wert === 'object') {
    return '{' + Object.keys(wert).sort()
      .map((k) => JSON.stringify(k) + ':' + kanonisch(wert[k])).join(',') + '}';
  }
  return JSON.stringify(wert);
}

function jsonGleich(pfad, wert) {
  try {
    return kanonisch(JSON.parse(readFileSync(pfad, 'utf8'))) === kanonisch(wert);
  } catch {
    return false;
  }
}

/**
 * Liest die Formatnummer. Fehlt sie, ist das ein Fehler der Ablage. Eine 0 ist
 * eine gültige, wenn auch ältere Fassung; sie wird gelesen, damit das Board
 * sagen kann, dass die Ablage den Umzug braucht.
 */
export function liesFormat(repo) {
  let text;
  try {
    text = readFileSync(join(repo, 'format'), 'utf8').trim();
  } catch {
    throw new Error('Die Ablage nennt kein Format');
  }
  const zahl = Number(text);
  if (!Number.isInteger(zahl) || zahl < 0) {
    throw new Error('Die Ablage nennt kein gültiges Format: ' + JSON.stringify(text));
  }
  return zahl;
}

/**
 * Vergleicht die Fassung der Ablage mit der dieses Programms. Stimmen sie
 * nicht überein, wird nicht geschrieben: Ist die Ablage neuer, fehlt diesem
 * Board die Fassung; ist sie älter, fehlt der Ablage der Umzug. Der Fehler
 * trägt 409 und die Zahl der Ablage, damit jede Route ihn gleich beantworten
 * kann.
 */
export function pruefeFormat(repo) {
  const format = liesFormat(repo);
  if (format > FORMAT) {
    const fehler = new Error('Die Ablage ist neuer (Format ' + format
      + '). Dieses Board kennt Format ' + FORMAT
      + ' und schreibt nicht, bis es aktualisiert ist.');
    fehler.status = 409;
    fehler.format = format;
    throw fehler;
  }
  if (format < FORMAT) {
    const fehler = new Error('Die Ablage ist älter (Format ' + format
      + '). Dieses Board kennt Format ' + FORMAT + '; die Ablage braucht den Umzug.');
    fehler.status = 409;
    fehler.format = format;
    throw fehler;
  }
}

/** Alle Personen aus `personen/`. `ich` gehört nicht in die Datei. */
export function liesPersonen(repo, person) {
  const ordner = join(repo, 'personen');
  let dateien = [];
  try {
    dateien = readdirSync(ordner).filter((n) => n.endsWith('.json')).sort();
  } catch {
    return [];
  }
  const personen = [];
  for (const name of dateien) {
    const roh = liesJson(join(ordner, name), null);
    if (!roh || typeof roh !== 'object' || !roh.id) continue;
    personen.push({
      id: String(roh.id),
      name: typeof roh.name === 'string' ? roh.name : '',
      ...(typeof roh.farbe === 'string' ? { farbe: roh.farbe } : {}),
      ...(typeof roh.github === 'string' && roh.github ? { github: roh.github } : {}),
      ich: String(roh.id) === String(person),
    });
  }
  return personen;
}

/**
 * Ein Schritt so, wie ihn die Seite liest: Host, Wie und Skill sind gesetzt.
 * `skill` ist der Pfad zur Anweisung in der Ablage, `wie.wert` der Name, unter
 * dem sie beim Lauf im Harness liegt. Ältere Stände tragen in beiden Feldern
 * noch denselben Namen — dann bleibt genau das stehen.
 */
function schrittAnzeige(schritt, dateiPerson) {
  const wie = schritt.wie && typeof schritt.wie === 'object'
    ? schritt.wie
    : { art: 'datei', wert: '' };
  const pfad = typeof schritt.skill === 'string' ? schritt.skill : '';
  return {
    ...schritt,
    host: String(schritt.host || dateiPerson),
    wie,
    skill: wie.art === 'skill' ? (pfad || String(wie.wert || '') || null) : null,
  };
}

/**
 * Die Schritte eines Workflows zum Anzeigen. Ein Verweis
 * `{ ref: "<person>/<workflow>/<schritt>" }` wird aus den Dateien der genannten
 * Person aufgelöst — gelesen, nicht kopiert. Fehlt das Ziel, steht der Verweis
 * als fehlend da; einen Namen gibt es dann nicht.
 *
 * `fremd` heißt: der Host des Schritts ist nicht die eigene Person. Ein solcher
 * Schritt ist auf dieser Installation nicht bearbeitbar; geändert wird er in
 * der Workflow-Datei seines Hosts.
 */
function schritteAnzeigen(liste, dateiPerson, ziele, ichPerson) {
  const schritte = Array.isArray(liste) ? liste : [];
  // Eigene Kennungen zuerst: ein Verweis darf keine davon überschreiben.
  const gesehen = new Set(schritte
    .filter((s) => s && typeof s === 'object' && s.id && !s.ref)
    .map((s) => String(s.id)));

  return schritte.map((s) => {
    if (!s || typeof s !== 'object') return null;

    if (typeof s.ref === 'string') {
      const ref = s.ref;
      const teile = ref.split('/');
      const ziel = teile.length === 3 ? ziele.get(ref) : null;
      if (ziel) {
        const anzeige = schrittAnzeige(ziel.schritt, ziel.person);
        // Steht am Verweis eine eigene Kennung, gilt sie — sonst die des
        // Ziels, solange sie in diesem Workflow frei ist. So bleiben
        // Positionen gültig, die auf den Verweis zeigen.
        let id = s.id ? String(s.id) : String(anzeige.id);
        if (!s.id && gesehen.has(id)) id = 'ref:' + ref;
        gesehen.add(id);
        return {
          ...anzeige,
          id,
          ref,
          fremd: String(anzeige.host) !== String(ichPerson),
        };
      }
      const id = s.id ? String(s.id) : 'ref:' + ref;
      gesehen.add(id);
      return {
        id,
        ref,
        name: '',
        host: teile.length === 3 ? teile[0] : '',
        eingang: [],
        ausgabe: [],
        wie: { art: 'textfeld', wert: '' },
        skill: null,
        fehlt: true,
        fremd: true,
      };
    }

    if (!s.id) return null;
    const anzeige = schrittAnzeige(s, dateiPerson);
    gesehen.add(String(anzeige.id));
    return { ...anzeige, fremd: String(anzeige.host) !== String(ichPerson) };
  }).filter(Boolean);
}

/**
 * Alle Personen mit ihren Workflows, die eigene Person zuerst. Gelesen werden
 * `personen/*.json` und `workflows/*.json`; ein Verweis in einer Workflow-Datei
 * wird aus der Datei seines Hosts aufgelöst.
 */
export function liesWorkflows(repo, person) {
  const personen = liesPersonen(repo, person);
  // Jede Workflow-Datei zählt, auch wenn ihre Personendatei (noch) fehlt: die
  // Kennung steht im Dateinamen, den Namen gibt es dann eben nicht.
  try {
    for (const name of readdirSync(join(repo, 'workflows')).filter((n) => n.endsWith('.json')).sort()) {
      const id = name.slice(0, -'.json'.length);
      if (!id || personen.some((p) => p.id === id)) continue;
      personen.push({ id, name: '', ich: String(id) === String(person) });
    }
  } catch {
    /* keine Workflow-Dateien */
  }
  const dateien = new Map();
  const ziele = new Map();

  for (const p of personen) {
    const roh = liesJson(join(repo, 'workflows', p.id + '.json'), null);
    const liste = roh && Array.isArray(roh.workflows) ? roh.workflows : [];
    dateien.set(p.id, liste);
    for (const workflow of liste) {
      if (!workflow || typeof workflow !== 'object' || !workflow.id) continue;
      for (const schritt of Array.isArray(workflow.schritte) ? workflow.schritte : []) {
        if (!schritt || typeof schritt !== 'object' || !schritt.id || schritt.ref) continue;
        ziele.set(p.id + '/' + String(workflow.id) + '/' + String(schritt.id),
          { schritt, person: p.id });
      }
    }
  }

  const liste = personen.map((p) => {
    const workflows = (dateien.get(p.id) || [])
      .filter((w) => w && typeof w === 'object' && w.id)
      .map((w) => {
        const { schritte, ...rest } = w;
        return {
          ...rest,
          id: String(w.id),
          titel: typeof w.titel === 'string' ? w.titel : '',
          schritte: schritteAnzeigen(schritte, p.id, ziele, person),
          positionen: Array.isArray(w.positionen) ? w.positionen : [],
          kanten: Array.isArray(w.kanten) ? w.kanten : [],
          layout: w.layout === 'frei' ? 'frei' : 'auto',
        };
      });
    const eintrag = { id: p.id, name: p.name, ich: p.ich, workflows };
    if (p.farbe) eintrag.farbe = p.farbe;
    return eintrag;
  });

  // Die eigene Fläche steht zuerst; alle anderen folgen in der Reihenfolge
  // ihrer Dateien.
  const stelle = liste.findIndex((p) => p.ich);
  if (stelle > 0) liste.unshift(...liste.splice(stelle, 1));
  return liste;
}

/** Der erste Workflow der eigenen Person und seine Schritte. */
export function liesEigenerWorkflow(repo, person) {
  const eigene = liesWorkflows(repo, person).find((p) => p.ich);
  const erster = eigene && eigene.workflows[0] ? eigene.workflows[0] : null;
  if (!erster) {
    return {
      workflow: { id: 'standard', titel: '', positionen: [], kanten: [], layout: 'auto' },
      schritte: [],
    };
  }
  const { schritte, ...workflow } = erster;
  return { workflow, schritte };
}

/** Alle Vorhaben aus ihren Ordnern; der Ordnername bleibt am Eintrag. */
export function liesVorgaenge(repo) {
  const ordner = join(repo, 'vorgaenge');
  let eintraege = [];
  try {
    eintraege = readdirSync(ordner, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
  const vorgaenge = [];
  for (const name of eintraege) {
    const roh = liesJson(join(ordner, name, 'vorhaben.json'), null);
    if (!roh || typeof roh !== 'object' || !roh.id) continue;
    const vorgang = {
      ...roh,
      id: String(roh.id),
      name: typeof roh.name === 'string' ? roh.name : '',
      position: String(roh.position || ''),
      ordner: name,
      verantwortliche: roh.verantwortliche && typeof roh.verantwortliche === 'object'
        && !Array.isArray(roh.verantwortliche) ? roh.verantwortliche : {},
      regel: roh.regel === 'alle' ? 'alle' : 'einer',
      rueckkehr: Array.isArray(roh.rueckkehr) ? roh.rueckkehr : [],
      laeufe: Array.isArray(roh.laeufe) ? roh.laeufe : [],
      fork_von: roh.fork_von == null ? null : roh.fork_von,
      zweig_von: roh.zweig_von == null ? null : roh.zweig_von,
    };
    // Die Seite liest den Zweig unter seinem alten Namen weiter.
    if (vorgang.zweig_von) vorgang.abzweig = vorgang.zweig_von;
    vorgaenge.push(vorgang);
  }
  return vorgaenge;
}

/**
 * Alle Beiträge aus `beitraege/<vorhaben>/<beitrag>.json`. Ein Beitrag ist eine
 * eigene Datei mit Notiz und, wenn nötig, vorgeschlagenen Fassungen daneben im
 * Ordner `<beitrag>/`. Gelesen wird nur, was da ist; eine kaputte Datei wird
 * übersprungen, nicht geraten.
 */
export function liesBeitraege(repo) {
  const ordner = join(repo, 'beitraege');
  let vorhabenOrdner = [];
  try {
    vorhabenOrdner = readdirSync(ordner, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
  const beitraege = [];
  for (const vorhaben of vorhabenOrdner) {
    let dateien = [];
    try {
      dateien = readdirSync(join(ordner, vorhaben)).filter((n) => n.endsWith('.json')).sort();
    } catch {
      continue;
    }
    for (const name of dateien) {
      const roh = liesJson(join(ordner, vorhaben, name), null);
      if (!roh || typeof roh !== 'object' || !roh.id) continue;
      const liste = Array.isArray(roh.dateien) ? roh.dateien : [];
      beitraege.push({
        ...roh,
        id: String(roh.id),
        vorhaben: String(roh.vorhaben || vorhaben),
        schritt: String(roh.schritt || ''),
        von: typeof roh.von === 'string' ? roh.von : '',
        seit: typeof roh.seit === 'string' ? roh.seit : '',
        basis: typeof roh.basis === 'string' ? roh.basis : '',
        notiz: typeof roh.notiz === 'string' ? roh.notiz : '',
        dateien: liste
          .filter((d) => d && typeof d === 'object' && typeof d.name === 'string')
          .map((d) => ({
            name: d.name,
            datei: typeof d.datei === 'string' ? d.datei : '',
          })),
        entschieden: roh.entschieden == null ? null : roh.entschieden,
      });
    }
  }
  return beitraege;
}

/** Eine vorgeschlagene Fassung ist ein flacher Name mit `.md` im Beitragsordner. */
function beitragDateiname(wert) {
  const name = String(wert == null ? '' : wert);
  return /^[A-Za-z0-9][A-Za-z0-9._-]*\.md$/.test(name) && !name.includes('..') ? name : '';
}

/**
 * Schreibt einen Beitrag: die Beschreibung als JSON, die vorgeschlagenen
 * Fassungen daneben im Ordner `<beitrag>/`. Die Originaldateien im Vorhaben
 * werden nicht angefasst — ein Beitrag ist eine eigene Datei, keine Änderung.
 */
export function schreibeBeitrag(repo, beitrag, dateien) {
  pruefeFormat(repo);
  const vorhaben = String(beitrag.vorhaben || '');
  if (!KENNUNG.test(vorhaben)) throw new Error('Ungültige Vorhaben-Kennung: ' + vorhaben);
  const id = String(beitrag.id || '');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error('Ungültige Beitrags-Kennung: ' + id);

  const eintraege = [];
  const ort = join(repo, 'beitraege', vorhaben, id);
  try {
    for (const datei of Array.isArray(dateien) ? dateien : []) {
      const name = beitragDateiname(datei && datei.name);
      if (!name) {
        throw new Error('Ungültiger Dateiname im Beitrag: ' + String(datei && datei.name));
      }
      mkdirSync(ort, { recursive: true });
      const ziel = join(ort, name);
      writeFileSync(ziel + '.tmp', String(datei.text == null ? '' : datei.text), 'utf8');
      renameSync(ziel + '.tmp', ziel);
      eintraege.push({ name, datei: 'beitraege/' + vorhaben + '/' + id + '/' + name });
    }

    const wert = { ...beitrag, dateien: eintraege };
    schreibeJson(join(repo, 'beitraege', vorhaben, id + '.json'), wert);
    return wert;
  } catch (fehler) {
    // Ganz oder gar nicht: ein halber Beitrag bleibt nicht liegen.
    rmSync(ort, { recursive: true, force: true });
    rmSync(join(repo, 'beitraege', vorhaben, id + '.json'), { force: true });
    throw fehler;
  }
}

/**
 * Trägt den Entscheid in die Beitragsdatei ein. Der Beitrag bleibt mit Notiz
 * und vorgeschlagenen Fassungen liegen; geändert wird nur sein Feld
 * `entschieden`. Geschrieben wird ganz oder gar nicht — eine halbe
 * Entscheidung gibt es nicht.
 */
export function schreibeEntscheid(repo, vorhaben, id, entschieden) {
  pruefeFormat(repo);
  const kennung = String(vorhaben || '');
  if (!KENNUNG.test(kennung) || kennung.includes('..')) {
    throw new Error('Ungültige Vorhaben-Kennung: ' + kennung);
  }
  const beitragId = String(id || '');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(beitragId)) {
    throw new Error('Ungültige Beitrags-Kennung: ' + beitragId);
  }
  const pfad = join(repo, 'beitraege', kennung, beitragId + '.json');
  const roh = liesJson(pfad, null);
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) {
    throw new Error('Diesen Beitrag gibt es nicht');
  }
  const wert = { ...roh, entschieden };
  schreibeJson(pfad, wert);
  return wert;
}

function liesSeitendatei(home, name, vorgabe) {
  if (!home) return vorgabe;
  return liesJson(join(home, 'board', name), vorgabe);
}

/** Die persönlichen Einstellungen — außerhalb der Ablage. */
export function liesEinstellungen(home) {
  const roh = liesSeitendatei(home, 'einstellungen.json', {});
  return roh && typeof roh === 'object' && !Array.isArray(roh) ? roh : {};
}

/** Die Gespräche — persönlich, weil jede Person ihre eigenen Sitzungen hat. */
export function liesGespraeche(home) {
  const roh = liesSeitendatei(home, 'gespraeche.json', {});
  return roh && typeof roh === 'object' && !Array.isArray(roh) ? roh : {};
}

/** Die ganze Ablage in der Form, die der Rest des Moduls benutzt. */
export function liesAblage({ repo, person, home }) {
  // Einmal lesen und daraus beide Formen ableiten: die eigene Fläche für die
  // bisherigen Leser und die Liste aller Personen für `/board/data`.
  const workflows = liesWorkflows(repo, person);
  const eigene = workflows.find((p) => p.ich) || workflows[0] || null;
  const erster = eigene && eigene.workflows[0] ? eigene.workflows[0] : null;
  const schritte = erster ? erster.schritte : [];
  const workflow = erster
    ? (({ schritte: _schritte, ...rest }) => rest)(erster)
    : { id: 'standard', titel: '', positionen: [], kanten: [], layout: 'auto' };
  const vorgaenge = liesVorgaenge(repo);
  const gespraeche = liesGespraeche(home);
  vorgaenge.forEach((v) => {
    v.gespraeche = Array.isArray(gespraeche[v.id]) ? gespraeche[v.id] : [];
  });
  return {
    workflow,
    schritte,
    workflows,
    vorgaenge,
    beitraege: liesBeitraege(repo),
    personen: liesPersonen(repo, person),
    einstellungen: liesEinstellungen(home),
  };
}

function wieDatei(wert) {
  const roh = wert && typeof wert === 'object' ? String(wert.art || '') : '';
  const erlaubt = new Set(['skill', 'skript', 'textfeld', 'chat', 'datei']);
  const art = erlaubt.has(roh) ? roh : (roh === 'manuell' ? 'textfeld' : 'textfeld');
  if (art === 'textfeld' || art === 'chat' || art === 'datei') return { art, wert: '' };
  const name = String((wert && wert.wert) == null ? '' : wert.wert).trim().slice(0, 200);
  return name ? { art, wert: name } : { art: 'textfeld', wert: '' };
}

function schrittDatei(schritt, person) {
  const wie = wieDatei(schritt.wie);
  const pfad = typeof schritt.skill === 'string' ? schritt.skill : '';
  const eintrag = {
    id: String(schritt.id),
    name: String(schritt.name || ''),
    host: String(schritt.host || person),
    eingang: Array.isArray(schritt.eingang) ? schritt.eingang : [],
    ausgabe: Array.isArray(schritt.ausgabe) ? schritt.ausgabe : [],
    wie,
    // `skill` nennt die Datei in der Ablage, `wie.wert` den Namen im Harness.
    skill: wie.art === 'skill' ? (pfad || wie.wert) : null,
  };
  if (typeof schritt.inhalt === 'string') eintrag.inhalt = schritt.inhalt;
  if (schritt.werkstatt && typeof schritt.werkstatt === 'object') {
    eintrag.werkstatt = schritt.werkstatt;
  }
  if (schritt.weiter) eintrag.weiter = schritt.weiter;
  return eintrag;
}

function positionDatei(position) {
  const eintrag = { id: String(position.id) };
  if (Array.isArray(position.bedingung)) eintrag.bedingung = position.bedingung;
  eintrag.schritt = position.schritt;
  eintrag.x = position.x;
  eintrag.y = position.y;
  for (const [schluessel, wert] of Object.entries(position)) {
    if (['id', 'bedingung', 'schritt', 'x', 'y', 'name', 'abgeleitet', 'fehlt']
      .includes(schluessel)) continue;
    eintrag[schluessel] = wert;
  }
  return eintrag;
}

function workflowDatei(board, person) {
  const workflow = board.workflow || {};
  // Ein Verweis bleibt ein Verweis: er wird beim Lesen aufgelöst, aber nie als
  // kopierter Schritt in die eigene Datei geschrieben. Seine Kennung steht mit
  // in der Datei, damit die Positionen gültig bleiben, wenn das Ziel später
  // aus der Ablage verschwindet.
  const schritte = (board.schritte || [])
    .filter((s) => s && typeof s === 'object')
    .filter((s) => typeof s.ref === 'string'
      || ((s.id && (!s.host || String(s.host) === String(person)))))
    .map((s) => (typeof s.ref === 'string'
      ? { ref: String(s.ref), ...(s.id ? { id: String(s.id) } : {}) }
      : schrittDatei(s, person)));
  return {
    id: String(workflow.id || 'standard'),
    titel: String(workflow.titel || ''),
    schritte,
    positionen: (Array.isArray(workflow.positionen) ? workflow.positionen : [])
      .filter((p) => p && typeof p === 'object' && p.id)
      .map(positionDatei),
    kanten: (Array.isArray(workflow.kanten) ? workflow.kanten : [])
      .filter((k) => k && k.von && k.nach)
      .map((k) => ({ von: k.von, nach: k.nach })),
    layout: workflow.layout === 'frei' ? 'frei' : 'auto',
  };
}

function vorgangDatei(vorgang) {
  const eintrag = {
    id: String(vorgang.id),
    name: String(vorgang.name || ''),
    position: String(vorgang.position || ''),
    verantwortliche: vorgang.verantwortliche && typeof vorgang.verantwortliche === 'object'
      && !Array.isArray(vorgang.verantwortliche) ? vorgang.verantwortliche : {},
    regel: vorgang.regel === 'alle' ? 'alle' : 'einer',
    rueckkehr: Array.isArray(vorgang.rueckkehr) ? vorgang.rueckkehr : [],
    laeufe: Array.isArray(vorgang.laeufe) ? vorgang.laeufe : [],
    fork_von: vorgang.fork_von == null ? null : vorgang.fork_von,
    zweig_von: vorgang.zweig_von || vorgang.abzweig || null,
  };
  if (typeof vorgang.farbe === 'string') eintrag.farbe = vorgang.farbe;
  return eintrag;
}

/**
 * Die Dateien, die zu diesem Stand gehören: Pfad → Text. Reine Rechnung,
 * damit auch der Umzug sie benutzen kann.
 */
export function baueDateien(board, person, workflowListe) {
  const dateien = new Map();
  // Geschrieben wird nur die eigene Personendatei. Die Dateien der anderen
  // gehören ihnen; ein Speichern hier darf sie nicht mit dem eigenen, vielleicht
  // veralteten Stand überschreiben.
  for (const p of board.personen || []) {
    if (!p || !p.id) continue;
    const kennung = String(p.id);
    if (kennung !== String(person)) continue;
    if (!KENNUNG.test(kennung)) throw new Error('Ungültige Personenkennung: ' + kennung);
    const eintrag = { id: kennung, name: String(p.name || '') };
    if (typeof p.farbe === 'string') eintrag.farbe = p.farbe;
    if (typeof p.github === 'string' && p.github) eintrag.github = p.github;
    dateien.set('personen/' + kennung + '.json', JSON.stringify(eintrag, null, 2) + '\n');
  }

  const eigener = workflowDatei(board, person);
  const liste = Array.isArray(workflowListe) ? workflowListe.slice() : [];
  const stelle = liste.findIndex((w) => w && w.id === eigener.id);
  if (stelle >= 0) liste[stelle] = eigener; else liste.unshift(eigener);
  dateien.set('workflows/' + person + '.json', JSON.stringify({
    person,
    workflows: liste,
  }, null, 2) + '\n');

  for (const v of board.vorgaenge || []) {
    if (!v || !v.id) continue;
    // Ein Vorhaben, das diese Person beim Lesen nicht verantwortet hat, bleibt
    // unangetastet — auch dann, wenn ein anderes Speichern den ganzen Stand
    // schreibt. Der Vermerk kommt aus dem Lesen, nicht aus der Datei.
    if (v.schreibbar === false) continue;
    const ordner = String(v.ordner || v.id);
    if (!VORGANG_KENNUNG.test(ordner)) continue;
    dateien.set('vorgaenge/' + ordner + '/vorhaben.json',
      JSON.stringify(vorgangDatei(v), null, 2) + '\n');
  }
  return dateien;
}

/** Was im Ordner `workflows/` schon an weiteren Workflows steht. */
function weitereWorkflows(repo, person, eigener) {
  const roh = liesJson(join(repo, 'workflows', person + '.json'), null);
  const liste = roh && Array.isArray(roh.workflows) ? roh.workflows : [];
  return liste.filter((w) => w && w.id !== eigener.id);
}

function schreibeSeitendatei(pfad, wert, geschrieben) {
  if (!pfad) return;
  if (jsonGleich(pfad, wert)) return;
  schreibeJson(pfad, wert);
  geschrieben.push(pfad);
}

/**
 * Schreibt den Stand als Dateien. Jede Datei nur, wenn sie sich ändert;
 * die Einstellungen und Gespräche liegen persönlich außerhalb der Ablage.
 */
export function schreibeAblage(board, { repo, person, home }) {
  // Die letzte Prüfung vor dem Schreiben. Die Routen prüfen schon vor ihrer
  // Arbeit; hier steht sie noch einmal, damit keine Schreibstelle sie
  // vergessen kann.
  pruefeFormat(repo);

  const eigener = workflowDatei(board, person);
  const dateien = baueDateien(board, person, weitereWorkflows(repo, person, eigener));
  const geschrieben = [];
  for (const [relativ, inhalt] of dateien) {
    const ziel = join(repo, relativ);
    if (existsSync(ziel)) {
      try {
        if (kanonisch(JSON.parse(readFileSync(ziel, 'utf8')))
          === kanonisch(JSON.parse(inhalt))) continue;
      } catch {
        /* anders formatiert: neu schreiben */
      }
    }
    mkdirSync(dirname(ziel), { recursive: true });
    writeFileSync(ziel + '.tmp', inhalt, 'utf8');
    renameSync(ziel + '.tmp', ziel);
    geschrieben.push(relativ);
  }

  if (home) {
    schreibeSeitendatei(join(home, 'board', 'einstellungen.json'),
      board.einstellungen || {}, geschrieben);
    const gespraeche = {};
    for (const v of board.vorgaenge || []) {
      if (!v || !v.id) continue;
      const liste = Array.isArray(v.gespraeche) ? v.gespraeche : [];
      if (liste.length) gespraeche[v.id] = liste;
    }
    schreibeSeitendatei(join(home, 'board', 'gespraeche.json'), gespraeche, geschrieben);
  }
  return geschrieben;
}
