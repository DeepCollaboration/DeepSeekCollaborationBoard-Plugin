/**
 * Der Abgleich je Repository.
 *
 * Ein Board der Fassung 2 liegt als viele Repositories da: das Board selbst,
 * seine Workflows, die Stationen und die Vorhaben. Jedes hat seinen eigenen
 * Remote und seinen eigenen Stand. Hier wird für genau ein Repository
 * abgeglichen — holen, die eigene Fassung darauf legen, weitergeben — und der
 * Stand gelesen, ohne ins Netz zu gehen.
 *
 * Ein Fehler bleibt an seinem Repository: `gleicheAlleAb` macht beim nächsten
 * weiter, und die Antwort an die Seite bleibt eine Karte mit allen Ständen.
 */
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

/** Ein Abgleich im Netz darf nicht ewig hängen. */
const NETZ_MS = 10000;
/** Ein lokaler Git-Aufruf antwortet sofort; die Grenze ist nur ein Schutz. */
const LOKAL_MS = 5000;

/**
 * Der letzte Versuch je Repository, im Speicher. Die Zeit bleibt auch nach
 * einem gescheiterten Versuch stehen; `erfolg` sagt, ob er durchging, und
 * `fehler` nennt den Grund. Nach einem Neustart ist beides leer, bis wieder
 * abgeglichen wurde.
 */
const gemerkt = new Map();

function git(pfad, args, { home = '', autor = null, grenzeMs = LOKAL_MS } = {}) {
  const satz = [
    '-C', pfad,
    ...(autor ? ['-c', 'user.name=' + autor[0], '-c', 'user.email=' + autor[1]] : []),
    ...args,
  ];
  const ssh = home ? join(home, '.ssh', 'config') : '';
  try {
    const lauf = spawnSync('git', satz, {
      encoding: 'utf8',
      timeout: grenzeMs,
      // Der Host kann nicht antworten: lieber scheitern als auf eine Eingabe
      // warten, die niemand sieht.
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        ...(ssh && existsSync(ssh) ? { GIT_SSH_COMMAND: 'ssh -F ' + ssh } : {}),
      },
    });
    return {
      ok: lauf.status === 0,
      out: String(lauf.stdout || ''),
      fehler: String(lauf.stderr || ''),
    };
  } catch (fehler) {
    return { ok: false, out: '', fehler: String((fehler && fehler.message) || fehler) };
  }
}

/** Die erste Zeile einer Fehlermeldung, kurz genug für eine Standzeile. */
function kurz(text, grenze = 300) {
  const zeile = String(text == null ? '' : text)
    .split('\n').map((z) => z.trim()).find(Boolean) || '';
  return zeile.length > grenze ? zeile.slice(0, grenze - 1) + '…' : zeile;
}

/**
 * Der Pfad aus einer Konfliktzeile, sonst leer. Git schreibt den Konflikt je
 * nach Fassung und Lage auf die eine oder die andere Ausgabe; deshalb werden
 * beide Texte gelesen. Erkannt werden `CONFLICT (…): … in <pfad>` und die
 * kürzere Form `Merge conflict in <pfad>`.
 */
function konfliktDatei(...texte) {
  for (const text of texte) {
    for (const roh of String(text == null ? '' : text).split('\n')) {
      const zeile = roh.trim();
      if (!zeile) continue;
      const treffer = zeile.match(/^(?:CONFLICT \([^)]*\):\s*)?Merge conflict in (.+)$/)
        || zeile.match(/^CONFLICT \([^)]*\):.*\bin (.+)$/);
      if (!treffer) continue;
      const pfad = treffer[1].trim();
      if (pfad) return pfad;
    }
  }
  return '';
}

/** Die Adresse von `origin` oder `null`, wenn es keinen gibt. */
function remoteAdresse(pfad) {
  const r = git(pfad, ['remote', 'get-url', 'origin']);
  const adresse = r.ok ? r.out.trim() : '';
  return adresse || null;
}

/** Der Zweig, auf dem das Repository liegt. Ohne Namen gilt `main`. */
function zweigName(pfad) {
  const r = git(pfad, ['symbolic-ref', '--short', 'HEAD']);
  const name = r.ok ? r.out.trim() : '';
  return name || 'main';
}

/**
 * Wie viele Fassungen im Remote noch fehlen. Gibt es den fremden Zweig noch
 * nicht, ist jede eigene Fassung nur hier — dann zählt HEAD.
 */
function nurLokal(pfad, zweig) {
  const r = git(pfad, ['rev-list', '--count', 'origin/' + zweig + '..HEAD']);
  if (r.ok) {
    const zahl = Number(r.out.trim());
    return Number.isFinite(zahl) && zahl > 0 ? zahl : 0;
  }
  const alle = git(pfad, ['rev-list', '--count', 'HEAD']);
  const zahl = Number(alle.ok ? alle.out.trim() : 0);
  return Number.isFinite(zahl) && zahl > 0 ? zahl : 0;
}

function eintragBasis(eintrag) {
  const pfad = String((eintrag && eintrag.pfad) || '');
  return {
    name: String((eintrag && eintrag.name) || ''),
    art: String((eintrag && eintrag.art) || ''),
    pfad: pfad ? resolve(pfad) : '',
  };
}

/**
 * Der Stand eines Repositories, ohne ins Netz zu gehen: Remote, Zahl der nur
 * lokalen Fassungen und die letzte erfolgreiche Zeit aus dem Speicher.
 */
export function standFuer(eintrag) {
  const basis = eintragBasis(eintrag);
  if (!basis.pfad) {
    return {
      ...basis, lage: 'nicht abgeglichen', nur_lokal: 0, remote: null, zeit: null,
      datei: '', fehler: 'Kein Pfad',
    };
  }
  if (!existsSync(basis.pfad)) {
    return {
      ...basis, lage: 'nicht abgeglichen', nur_lokal: 0, remote: null, zeit: null,
      datei: '', fehler: 'Der Ordner fehlt: ' + basis.pfad,
    };
  }
  const remote = remoteAdresse(basis.pfad);
  if (!remote) {
    return {
      ...basis, lage: 'kein remote', nur_lokal: 0, remote: null, zeit: null,
      datei: '', fehler: '',
    };
  }
  const offen = nurLokal(basis.pfad, zweigName(basis.pfad));
  const merker = gemerkt.get(basis.pfad) || null;
  return {
    ...basis,
    lage: merker && merker.erfolg && offen === 0 ? 'abgeglichen' : 'nicht abgeglichen',
    nur_lokal: offen,
    remote,
    zeit: merker ? merker.zeit : null,
    datei: merker ? String(merker.datei || '') : '',
    fehler: merker ? String(merker.fehler || '') : '',
  };
}

/**
 * Ein Abgleich für ein Repository: holen, die eigene Fassung darauf legen,
 * weitergeben. Der Aufruf wirft nicht; ein Fehler steht im Stand und die
 * lokale Fassung bleibt liegen.
 */
export function gleicheAb(eintrag, optionen = {}) {
  const basis = eintragBasis(eintrag);
  if (!basis.pfad) {
    return {
      ...basis, lage: 'nicht abgeglichen', nur_lokal: 0, remote: null, zeit: null,
      datei: '', fehler: 'Kein Pfad',
    };
  }
  const remote = remoteAdresse(basis.pfad);
  if (!remote) {
    const vorher = gemerkt.get(basis.pfad) || {};
    gemerkt.set(basis.pfad, {
      zeit: vorher.zeit || null, erfolg: false, datei: '', fehler: '',
    });
    return standFuer(basis);
  }

  const zweig = zweigName(basis.pfad);
  let datei = '';
  let fehler = '';
  const fetch = git(basis.pfad, ['fetch', '--prune', 'origin'],
    { ...optionen, grenzeMs: NETZ_MS });
  if (!fetch.ok) {
    fehler = 'fetch: ' + (kurz(fetch.fehler) || 'gescheitert');
  } else if (git(basis.pfad, ['rev-parse', '--verify', '--quiet', 'origin/' + zweig]).ok) {
    const pull = git(basis.pfad, ['pull', '--rebase', 'origin', zweig],
      { ...optionen, grenzeMs: NETZ_MS });
    if (!pull.ok) {
      // Kein halber Rebase bleibt liegen: der lokale Stand gilt weiter.
      git(basis.pfad, ['rebase', '--abort']);
      datei = konfliktDatei(pull.out, pull.fehler);
      fehler = datei
        ? 'pull --rebase: Konflikt in ' + datei
        : 'pull --rebase: ' + (kurz(pull.fehler) || 'gescheitert');
    }
  }
  if (!fehler) {
    const push = git(basis.pfad, ['push', 'origin', zweig],
      { ...optionen, grenzeMs: NETZ_MS });
    if (!push.ok) fehler = 'push: ' + (kurz(push.fehler) || 'gescheitert');
  }

  const vorher = gemerkt.get(basis.pfad) || {};
  gemerkt.set(basis.pfad, {
    zeit: fehler ? (vorher.zeit || null) : new Date().toISOString(),
    erfolg: !fehler,
    datei,
    fehler,
  });

  const stand = standFuer(basis);
  if (fehler) stand.fehler = fehler;
  stand.datei = datei;
  return stand;
}

/** Die Einträge säubern: jeder Pfad genau einmal, mit dem ersten Namen. */
function eintraege(eintraegeRoh) {
  const liste = [];
  const gesehen = new Map();
  for (const roh of Array.isArray(eintraegeRoh) ? eintraegeRoh : []) {
    if (!roh || !roh.pfad) continue;
    const pfad = resolve(String(roh.pfad));
    const vorhanden = gesehen.get(pfad);
    if (vorhanden) {
      if (!vorhanden.name && roh.name) vorhanden.name = String(roh.name);
      continue;
    }
    const eintrag = {
      pfad,
      art: String(roh.art || ''),
      name: String(roh.name || ''),
    };
    gesehen.set(pfad, eintrag);
    liste.push(eintrag);
  }
  return liste;
}

/** Die Stände aller Repositories lesen, ohne ins Netz zu gehen. */
export function staendeFuer(eintraegeRoh) {
  return eintraege(eintraegeRoh).map((eintrag) => standFuer(eintrag));
}

/**
 * Alle Repositories der Reihe nach abgleichen. Ein Fehler bei einem hält die
 * anderen nicht an; die zurückgegebenen Stände sagen je Repository, was gilt.
 */
export function gleicheAlleAb(eintraegeRoh, optionen = {}) {
  const staende = [];
  for (const eintrag of eintraege(eintraegeRoh)) {
    try {
      staende.push(gleicheAb(eintrag, optionen));
    } catch (fehler) {
      const stand = standFuer(eintrag);
      stand.lage = 'nicht abgeglichen';
      stand.fehler = kurz(fehler) || 'Abgleich gescheitert';
      staende.push(stand);
    }
  }
  return staende;
}

/**
 * Die alte Zusammenfassung aus den Ständen: Summe der lokalen Fassungen, die
 * letzte erfolgreiche Zeit und die schlechteste Lage. Die Reihenfolge ist
 * „abgeglichen“ vor „kein remote“ vor „nicht abgeglichen“; ein Repository ohne
 * Remote ist nicht abgeglichen, aber kein Fehler.
 */
export function zusammenfassen(staende) {
  const liste = Array.isArray(staende)
    ? staende.filter((eintrag) => eintrag && typeof eintrag === 'object')
    : [];
  if (!liste.length) {
    return { zeit: null, nur_lokal: 0, remote: null, lage: 'kein remote' };
  }
  const rang = { 'abgeglichen': 0, 'kein remote': 1, 'nicht abgeglichen': 2 };
  let lage = 'abgeglichen';
  for (const eintrag of liste) {
    const wert = Object.prototype.hasOwnProperty.call(rang, eintrag.lage) ? eintrag.lage : '';
    const eigen = wert ? rang[wert] : 2;
    if (eigen > rang[lage]) lage = wert || 'nicht abgeglichen';
  }
  const nurLokalGesamt = liste.reduce(
    (summe, eintrag) => summe + (Number(eintrag.nur_lokal) || 0), 0);
  const zeiten = liste.map((eintrag) => String(eintrag.zeit || ''))
    .filter(Boolean).sort();
  const board = liste.find((eintrag) => eintrag.art === 'board') || null;
  const mitRemote = liste.find((eintrag) => eintrag.remote) || null;
  return {
    zeit: zeiten.length ? zeiten[zeiten.length - 1] : null,
    nur_lokal: nurLokalGesamt,
    remote: board && board.remote ? board.remote : (mitRemote ? mitRemote.remote : null),
    lage,
  };
}
