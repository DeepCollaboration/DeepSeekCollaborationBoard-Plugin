/**
 * GitHub: Repository-Metadaten, Releases, Fragen, Pull Requests, Teams und
 * Benutzer lesen; mit einem Token auch schreiben.
 *
 * Keine zusätzliche Abhängigkeit: `fetch` und `node:fs` genügen. Der Token
 * liegt in `$DSH_HOME/board/github.json` (Datei 0600, Verzeichnis 0700) und
 * erscheint in keiner Antwort, keiner Meldung und keinem Protokoll. Daneben
 * steht der zum Token bekannte Login — kein Geheimnis, aber am selben Ort.
 *
 * Gelesen wird auch ohne Token; die Sternzahl eines Repositories bleibt
 * zusätzlich in `$DSH_HOME/board/sterne.json` stehen. Ein fehlender oder
 * abgelaufener Zwischenspeicher verhindert keine Leseabfrage.
 */
import {
  chmodSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

/** Die API-Adresse; die Umgebungsvariable ist nur für Prüfungen da. */
export const GITHUB_API = process.env.DSH_GITHUB_API || 'https://api.github.com';

/** Das Thema, an dem eine öffentliche Station erkennbar ist. */
export const SUCH_THEMA = 'dsh-board-station';

const KOPFZEILEN = {
  accept: 'application/vnd.github+json',
  'x-github-api-version': '2022-11-28',
  'user-agent': 'dsh-board',
};

/** Ein Fehler von GitHub mit dem, was die Oberfläche zum Anzeigen braucht. */
export class GithubFehler extends Error {
  constructor(meldung, { status = 0, repo = '', grenze = null } = {}) {
    super(meldung);
    this.name = 'GithubFehler';
    this.meldung = meldung;
    this.status = status;
    this.repo = repo;
    this.grenze = grenze;
  }
}

export function tokenPfad(home) {
  return join(String(home == null ? '' : home), 'board', 'github.json');
}

export function sternePfad(home) {
  return join(String(home == null ? '' : home), 'board', 'sterne.json');
}

/** Der gespeicherte Token oder `null`; ein kaputter Eintrag zählt als keiner. */
export function liesToken(home) {
  try {
    const roh = JSON.parse(readFileSync(tokenPfad(home), 'utf8'));
    const token = roh && typeof roh.token === 'string' ? roh.token.trim() : '';
    return token || null;
  } catch {
    return null;
  }
}

/**
 * Der zuletzt bekannte GitHub-Login zum Token, leer wenn keiner vermerkt ist.
 * Er ist kein Geheimnis; die Datei bleibt trotzdem nur für den Besitzer lesbar.
 */
export function liesLogin(home) {
  try {
    const roh = JSON.parse(readFileSync(tokenPfad(home), 'utf8'));
    return roh && typeof roh.login === 'string' ? roh.login.trim() : '';
  } catch {
    return '';
  }
}

/**
 * Den Token atomar ablegen: erst `.tmp`, dann umbenennen. Die Datei ist nur
 * für den Besitzer lesbar; das Verzeichnis nur für ihn zugänglich. Der Login
 * steht daneben, damit ein späterer Leser ihn ohne Netz kennt. Fehlt er beim
 * Schreiben, bleibt ein schon vermerkter Login zum selben Token erhalten.
 */
export function schreibeToken(home, token, login = null) {
  const wert = String(token == null ? '' : token).trim();
  if (!wert) throw new GithubFehler('Token fehlt', { status: 400 });
  let anmeldung = String(login == null ? '' : login).trim();
  if (!anmeldung && liesToken(home) === wert) anmeldung = liesLogin(home);
  const inhalt = { token: wert, ...(anmeldung ? { login: anmeldung } : null) };
  const ziel = tokenPfad(home);
  const ordner = dirname(ziel);
  const temp = ziel + '.tmp';
  try {
    mkdirSync(ordner, { recursive: true, mode: 0o700 });
    try { chmodSync(ordner, 0o700); } catch { /* Das Verzeichnis bleibt nutzbar. */ }
    writeFileSync(temp, JSON.stringify(inhalt) + '\n', {
      encoding: 'utf8', mode: 0o600,
    });
    try { chmodSync(temp, 0o600); } catch { /* Die Maske beim Anlegen genügt. */ }
    renameSync(temp, ziel);
    try { chmodSync(ziel, 0o600); } catch { /* Die Maske beim Anlegen genügt. */ }
  } catch {
    try { rmSync(temp, { force: true }); } catch { /* Aufräumen ist nicht wichtig. */ }
    throw new GithubFehler('Token nicht gespeichert', { status: 500 });
  }
  return ziel;
}

/** Den Token entfernen; ein fehlender Token ist kein Fehler. */
export function loescheToken(home) {
  try {
    rmSync(tokenPfad(home), { force: true });
    rmSync(tokenPfad(home) + '.tmp', { force: true });
    return true;
  } catch {
    return false;
  }
}

/** Die zuletzt bekannten Sternzahlen; ein kaputter Eintrag zählt als leer. */
export function liesSterne(home) {
  try {
    const roh = JSON.parse(readFileSync(sternePfad(home), 'utf8'));
    return roh && typeof roh === 'object' && !Array.isArray(roh) ? roh : {};
  } catch {
    return {};
  }
}

function merkeSterne(home, schluessel, sterne, am) {
  if (!home) return;
  try {
    const alle = liesSterne(home);
    alle[schluessel] = { sterne, am };
    const ziel = sternePfad(home);
    mkdirSync(dirname(ziel), { recursive: true, mode: 0o700 });
    writeFileSync(ziel + '.tmp', JSON.stringify(alle, null, 2) + '\n', {
      encoding: 'utf8', mode: 0o600,
    });
    renameSync(ziel + '.tmp', ziel);
  } catch {
    // Der Zwischenspeicher ist eine Zugabe; das Lesen hängt nicht an ihm.
  }
}

function teil(wert) {
  return encodeURIComponent(String(wert == null ? '' : wert).trim());
}

function normalisiereRepo(roh) {
  const lizenz = roh && roh.license && typeof roh.license === 'object'
    ? (roh.license.spdx_id || roh.license.name || null)
    : null;
  return {
    name: String((roh && roh.name) || ''),
    vollerName: String((roh && roh.full_name) || ''),
    privat: Boolean(roh && roh.private),
    sichtbarkeit: roh && roh.private ? 'privat' : 'öffentlich',
    sterne: Number(roh && roh.stargazers_count) || 0,
    forks: Number(roh && roh.forks_count) || 0,
    offeneFragen: Number(roh && roh.open_issues_count) || 0,
    beschreibung: String((roh && roh.description) || ''),
    themen: Array.isArray(roh && roh.topics) ? roh.topics.map(String) : [],
    standardZweig: String((roh && roh.default_branch) || ''),
    adresse: String((roh && roh.html_url) || ''),
    gedrueckt: (roh && roh.pushed_at) || null,
    lizenz,
    archiviert: Boolean(roh && roh.archived),
    eigentuemer: String((roh && roh.owner && roh.owner.login) || ''),
  };
}

/**
 * Ein Treffer der Repository-Suche in der Form, die der Katalog braucht:
 * `owner` und `name` getrennt, dazu Beschreibung, Sterne, Verweis, Themen,
 * die Sichtbarkeit und ob das Repository archiviert ist.
 */
function normalisiereTreffer(roh) {
  const daten = normalisiereRepo(roh);
  const teile = daten.vollerName.split('/');
  return {
    owner: String(daten.eigentuemer || teile[0] || '').trim(),
    name: String(daten.name || teile[1] || '').trim(),
    beschreibung: daten.beschreibung,
    sterne: daten.sterne,
    web: daten.adresse,
    themen: daten.themen,
    privat: daten.privat,
    sichtbarkeit: daten.sichtbarkeit,
    archiviert: daten.archiviert,
  };
}

function normalisiereFreigabe(roh) {
  return {
    tag: String((roh && roh.tag_name) || ''),
    name: String((roh && roh.name) || ''),
    datum: (roh && (roh.published_at || roh.created_at)) || null,
    vorab: Boolean(roh && roh.prerelease),
  };
}

function normalisiereEintrag(roh) {
  return {
    nummer: Number(roh && roh.number) || 0,
    titel: String((roh && roh.title) || ''),
    zustand: String((roh && roh.state) || ''),
    autor: String((roh && roh.user && roh.user.login) || ''),
    adresse: String((roh && roh.html_url) || ''),
    erstellt: (roh && roh.created_at) || null,
    aktualisiert: (roh && roh.updated_at) || null,
    zusammenGefuehrt: Boolean(roh && roh.merged_at),
  };
}

/**
 * Eine Frage in der Form, die die Seite zeigt. Fragen sind Issues ohne Pull
 * Request; `zustand` steht als „offen“ oder „geschlossen“ da.
 */
function normalisiereFrage(roh) {
  return {
    nummer: Number(roh && roh.number) || 0,
    titel: String((roh && roh.title) || ''),
    zustand: roh && roh.state === 'closed' ? 'geschlossen' : 'offen',
    autor: String((roh && roh.user && roh.user.login) || ''),
    adresse: String((roh && roh.html_url) || ''),
    erstellt: (roh && roh.created_at) || null,
    aktualisiert: (roh && roh.updated_at) || null,
  };
}

/** Ein Fork: der volle Name, die Adresse und wem die Kopie gehört. */
function normalisiereFork(roh) {
  return {
    vollerName: String((roh && roh.full_name) || ''),
    adresse: String((roh && roh.html_url) || ''),
    eigentuemer: String((roh && roh.owner && roh.owner.login) || ''),
  };
}

/**
 * Ein Pull Request in der Form, die die Seite zeigt: `zustand` ist schon das
 * Wort („offen“, „zusammengeführt“, „geschlossen“), `quelle` und `ziel` sind
 * die beiden Zweige. Ein zusammengeführter bleibt als solcher erkennbar.
 */
function normalisierePull(roh) {
  const eintrag = normalisiereEintrag(roh);
  return {
    nummer: eintrag.nummer,
    titel: eintrag.titel,
    zustand: eintrag.zusammenGefuehrt
      ? 'zusammengeführt'
      : (eintrag.zustand === 'closed' ? 'geschlossen' : 'offen'),
    autor: eintrag.autor,
    adresse: eintrag.adresse,
    erstellt: eintrag.erstellt,
    aktualisiert: eintrag.aktualisiert,
    zusammenGefuehrt: eintrag.zusammenGefuehrt,
    quelle: String((roh && roh.head && roh.head.ref) || ''),
    ziel: String((roh && roh.base && roh.base.ref) || ''),
  };
}

function normalisiereTeam(roh) {
  return {
    slug: String((roh && roh.slug) || ''),
    name: String((roh && roh.name) || ''),
    beschreibung: String((roh && roh.description) || ''),
    sichtbarkeit: String((roh && roh.privacy) || ''),
    mitgliederZahl: Number(roh && roh.members_count) || 0,
  };
}

function normalisiereBenutzer(roh) {
  return {
    login: String((roh && roh.login) || ''),
    name: String((roh && roh.name) || ''),
    adresse: String((roh && roh.html_url) || ''),
    avatar: String((roh && roh.avatar_url) || ''),
    typ: String((roh && roh.type) || ''),
  };
}

/**
 * Ein Client für eine Person und ein Zuhause. `token` ersetzt den gespeicherten
 * Token; `fetchImpl` und `jetzt` sind für Prüfungen da. Antworten sind
 * normalisiert, nicht die rohe GitHub-Form.
 */
export function erstelleClient({
  home = '',
  token = null,
  basis = GITHUB_API,
  fetchImpl = globalThis.fetch,
  cacheTtl = 60000,
  jetzt = Date.now,
} = {}) {
  const basisAdresse = String(basis || GITHUB_API).replace(/\/+$/, '');
  const geheim = token == null
    ? liesToken(home)
    : (String(token).trim() || null);
  const zwischenspeicher = new Map();

  function zeit() {
    const wert = typeof jetzt === 'function' ? jetzt() : jetzt;
    if (wert instanceof Date) return wert.getTime();
    const zahl = Number(wert);
    return Number.isFinite(zahl) ? zahl : Date.now();
  }

  function kopfWert(antwort, name) {
    const kopf = antwort && antwort.headers;
    if (!kopf) return '';
    if (typeof kopf.get === 'function') return kopf.get(name) || '';
    return kopf[name] == null ? '' : String(kopf[name]);
  }

  function grenzeAus(antwort) {
    const restText = kopfWert(antwort, 'x-ratelimit-remaining');
    if (restText === '') return null;
    const rest = Number(restText);
    const resetText = kopfWert(antwort, 'x-ratelimit-reset');
    const reset = Number(resetText);
    return {
      rest: Number.isFinite(rest) ? rest : null,
      reset: Number.isFinite(reset) ? reset : null,
      ...(Number.isFinite(reset) ? { resetIso: new Date(reset * 1000).toISOString() } : null),
    };
  }

  async function hole(pfad, {
    methode = 'GET', koerper = null, repo = '', frisch = false,
  } = {}) {
    const lesen = methode === 'GET';
    const schluessel = methode + ' ' + pfad;
    if (lesen && !frisch) {
      const treffer = zwischenspeicher.get(schluessel);
      if (treffer && zeit() - treffer.am < Math.max(0, Number(cacheTtl) || 0)) {
        return treffer.wert;
      }
    }

    const kopfzeilen = { ...KOPFZEILEN };
    if (geheim) kopfzeilen.authorization = 'Bearer ' + geheim;
    if (koerper != null) kopfzeilen['content-type'] = 'application/json';

    let antwort = null;
    for (let versuch = 0; versuch < 2; versuch += 1) {
      try {
        antwort = await fetchImpl(basisAdresse + pfad, {
          method: methode,
          headers: kopfzeilen,
          ...(koerper != null ? { body: JSON.stringify(koerper) } : {}),
        });
      } catch {
        throw new GithubFehler('GitHub nicht erreichbar', { status: 0, repo });
      }
      // Einen Serverfehler einmal wiederholen; mehr nicht. Der Körper der
      // ersten Antwort wird gelesen, damit die Verbindung frei wird.
      if (antwort.status >= 500 && versuch === 0) {
        try { await antwort.text(); } catch { /* Der zweite Versuch zählt. */ }
        continue;
      }
      break;
    }

    const grenze = grenzeAus(antwort);
    if (!antwort.ok) {
      if (antwort.status === 401) {
        throw new GithubFehler('Token ungültig oder abgelaufen', {
          status: 401, repo, grenze,
        });
      }
      if ((antwort.status === 403 || antwort.status === 429)
        && grenze && grenze.rest === 0) {
        const wieder = grenze.resetIso ? '; wieder ab ' + grenze.resetIso : '';
        throw new GithubFehler('GitHub-Grenze erreicht' + wieder, {
          status: antwort.status, repo, grenze,
        });
      }
      if (antwort.status === 404) {
        const ziel = repo ? 'Repository ' + repo : 'Die Adresse';
        throw new GithubFehler(ziel + ' nicht gefunden oder nicht zugänglich', {
          status: 404, repo, grenze,
        });
      }
      throw new GithubFehler('GitHub antwortet mit HTTP ' + antwort.status, {
        status: antwort.status, repo, grenze,
      });
    }

    const text = await antwort.text();
    let wert = null;
    if (text) {
      try {
        wert = JSON.parse(text);
      } catch {
        throw new GithubFehler('GitHub antwortet unlesbar', {
          status: antwort.status, repo, grenze,
        });
      }
    }
    if (lesen && !frisch) zwischenspeicher.set(schluessel, { wert, am: zeit() });
    return wert;
  }

  function vergiss(pfad) {
    zwischenspeicher.delete('GET ' + pfad);
  }

  async function repo(owner, name) {
    const ziel = String(owner) + '/' + String(name);
    const roh = await hole('/repos/' + teil(owner) + '/' + teil(name), { repo: ziel });
    const wert = normalisiereRepo(roh);
    merkeSterne(home, ziel, wert.sterne, new Date(zeit()).toISOString());
    return wert;
  }

  /**
   * Die öffentlichen Stationen eines Themas suchen:
   * `GET /search/repositories?q=topic:<thema>&sort=stars&per_page=50`.
   * Ohne Token ist die Suche anonym erlaubt; ein Token, wenn vorhanden, hebt
   * nur die Grenze. `frisch` umgeht den Zwischenspeicher des Clients.
   */
  async function suche({
    thema = SUCH_THEMA, frisch = false, proSeite = 50,
  } = {}) {
    const anzahl = Math.max(1, Math.min(100, Math.trunc(Number(proSeite) || 50)));
    const roh = await hole(
      '/search/repositories?q=topic:' + encodeURIComponent(String(thema || SUCH_THEMA))
      + '&sort=stars&per_page=' + anzahl,
      { repo: '', frisch },
    );
    const treffer = Array.isArray(roh && roh.items) ? roh.items : [];
    return treffer.map(normalisiereTreffer);
  }

  async function releases(owner, name) {
    const roh = await hole('/repos/' + teil(owner) + '/' + teil(name)
      + '/releases?per_page=30', { repo: String(owner) + '/' + String(name) });
    return (Array.isArray(roh) ? roh : []).map(normalisiereFreigabe);
  }

  async function issues(owner, name, { state = 'open' } = {}) {
    const roh = await hole('/repos/' + teil(owner) + '/' + teil(name)
      + '/issues?state=' + encodeURIComponent(state) + '&per_page=100', {
      repo: String(owner) + '/' + String(name),
    });
    // Die Fragen-Adresse liefert auch Pull Requests; die gehören nicht hierher.
    return (Array.isArray(roh) ? roh : [])
      .filter((eintrag) => !(eintrag && eintrag.pull_request))
      .map(normalisiereEintrag);
  }

  async function pulls(owner, name, { state = 'open' } = {}) {
    const roh = await hole('/repos/' + teil(owner) + '/' + teil(name)
      + '/pulls?state=' + encodeURIComponent(state) + '&per_page=100', {
      repo: String(owner) + '/' + String(name),
    });
    return (Array.isArray(roh) ? roh : []).map(normalisiereEintrag);
  }

  /**
   * Die Beiträge eines Repositories: Pull Requests in jedem Zustand. Gelesen
   * wird auf Wunsch frisch, damit ein gerade zusammengeführter Beitrag beim
   * nächsten Öffnen seinen neuen Stand zeigt.
   */
  async function beitraege(owner, name, { state = 'all', frisch = false } = {}) {
    const roh = await hole('/repos/' + teil(owner) + '/' + teil(name)
      + '/pulls?state=' + encodeURIComponent(state) + '&per_page=100', {
      repo: String(owner) + '/' + String(name),
      frisch,
    });
    return (Array.isArray(roh) ? roh : []).map(normalisierePull);
  }

  /** Ein einzelner Pull Request — der Zustand gilt beim Lesen. */
  async function pull(owner, name, nummer) {
    const ziel = String(owner) + '/' + String(name);
    const roh = await hole('/repos/' + teil(owner) + '/' + teil(name)
      + '/pulls/' + teil(nummer), { repo: ziel, frisch: true });
    return normalisierePull(roh);
  }

  /**
   * Die Fragen eines Repositories: alle Issues, offene und geschlossene, aber
   * keine Pull Requests. Gelesen wird auf Wunsch frisch, damit eine gerade
   * geschlossene Frage beim nächsten Blick ihren neuen Stand zeigt.
   */
  async function fragen(owner, name, { state = 'all', frisch = false } = {}) {
    const roh = await hole('/repos/' + teil(owner) + '/' + teil(name)
      + '/issues?state=' + encodeURIComponent(state) + '&per_page=100', {
      repo: String(owner) + '/' + String(name),
      frisch,
    });
    return (Array.isArray(roh) ? roh : [])
      .filter((eintrag) => !(eintrag && eintrag.pull_request))
      .map(normalisiereFrage);
  }

  async function teams(org, { frisch = false } = {}) {
    const roh = await hole('/orgs/' + teil(org) + '/teams?per_page=100', {
      repo: '', frisch,
    });
    return (Array.isArray(roh) ? roh : []).map(normalisiereTeam);
  }

  async function teamMitglieder(org, slug, { frisch = false } = {}) {
    const roh = await hole('/orgs/' + teil(org) + '/teams/' + teil(slug)
      + '/members?per_page=100', { repo: '', frisch });
    return (Array.isArray(roh) ? roh : []).map(normalisiereBenutzer);
  }

  async function benutzer(login) {
    const roh = await hole('/users/' + teil(login), { repo: '' });
    return normalisiereBenutzer(roh);
  }

  /** Die eigene Person zum Token — die Prüfung vor dem Speichern. */
  async function ich() {
    return normalisiereBenutzer(await hole('/user', { repo: '', frisch: true }));
  }

  async function berechtigung(owner, name, login) {
    const ziel = String(owner) + '/' + String(name);
    const roh = await hole('/repos/' + teil(owner) + '/' + teil(name)
      + '/collaborators/' + teil(login) + '/permission', { repo: ziel });
    return {
      berechtigung: String((roh && roh.permission) || ''),
      rolle: String((roh && roh.role_name) || ''),
    };
  }

  async function rateGrenze() {
    const roh = await hole('/rate_limit', { repo: '', frisch: true });
    const kern = roh && roh.resources && roh.resources.core ? roh.resources.core : {};
    const reset = Number(kern.reset);
    return {
      rest: Number(kern.remaining) || 0,
      reset: Number.isFinite(reset) ? reset : null,
      limit: Number(kern.limit) || 0,
      ...(Number.isFinite(reset) ? { resetIso: new Date(reset * 1000).toISOString() } : null),
    };
  }

  /**
   * Ein neues, öffentliches Repository anlegen. `eigenes` sagt, dass der
   * Eigentümer der angemeldete Login ist: dann entsteht es unter `/user/repos`,
   * sonst unter der Organisation (`/orgs/<owner>/repos`). Die Themen setzt
   * GitHub erst danach; sie werden gleich mitgeschickt.
   */
  async function erstelleRepo(org, {
    name, privat = false, beschreibung = '', themen = [], eigenes = false,
  } = {}) {
    const ziel = String(org) + '/' + String(name);
    const roh = await hole(eigenes ? '/user/repos' : '/orgs/' + teil(org) + '/repos', {
      methode: 'POST',
      repo: ziel,
      koerper: {
        name: String(name == null ? '' : name),
        private: Boolean(privat),
        description: String(beschreibung == null ? '' : beschreibung),
      },
    });
    const wert = normalisiereRepo(roh);
    const liste = Array.isArray(themen) ? themen.map(String).filter(Boolean) : [];
    if (liste.length) {
      // Die Anlage kennt keine Themen; sie werden danach gesetzt.
      await hole('/repos/' + teil(org) + '/' + teil(name) + '/topics', {
        methode: 'PUT', repo: ziel, koerper: { names: liste },
      });
      wert.themen = liste;
    }
    return wert;
  }

  /**
   * Eine Datei über die Inhalts-API schreiben: `PUT
   * /repos/<owner>/<name>/contents/<pfad>`. Der Inhalt wird base64-kodiert;
   * der Token steht im Kopf der Anfrage, nie in der Adresse. Ein `git push`
   * findet hier nicht statt.
   */
  async function setzeInhalt(owner, name, pfad, inhalt, nachricht = '') {
    const ziel = String(owner) + '/' + String(name);
    const teile = String(pfad == null ? '' : pfad)
      .split('/').filter(Boolean).map(teil);
    if (!teile.length) throw new GithubFehler('Der Pfad fehlt', { status: 400, repo: ziel });
    const roh = await hole('/repos/' + teil(owner) + '/' + teil(name)
      + '/contents/' + teile.join('/'), {
      methode: 'PUT',
      repo: ziel,
      koerper: {
        message: String(nachricht == null ? '' : nachricht),
        content: Buffer.from(String(inhalt == null ? '' : inhalt), 'utf8')
          .toString('base64'),
      },
    });
    return {
      pfad: teile.join('/'),
      sha: String((roh && roh.content && roh.content.sha) || ''),
    };
  }

  async function setzeSichtbarkeit(owner, name, privat) {
    const ziel = String(owner) + '/' + String(name);
    const roh = await hole('/repos/' + teil(owner) + '/' + teil(name), {
      methode: 'PATCH', repo: ziel, koerper: { private: Boolean(privat) },
    });
    vergiss('/repos/' + teil(owner) + '/' + teil(name));
    return normalisiereRepo(roh);
  }

  async function erstellePull(owner, name, {
    titel, text = '', head, base,
  } = {}) {
    const ziel = String(owner) + '/' + String(name);
    const roh = await hole('/repos/' + teil(owner) + '/' + teil(name) + '/pulls', {
      methode: 'POST',
      repo: ziel,
      koerper: {
        title: String(titel == null ? '' : titel),
        body: String(text == null ? '' : text),
        head: String(head == null ? '' : head),
        base: String(base == null ? '' : base),
      },
    });
    vergiss('/repos/' + teil(owner) + '/' + teil(name) + '/pulls?state=open&per_page=100');
    vergiss('/repos/' + teil(owner) + '/' + teil(name) + '/pulls?state=all&per_page=100');
    return normalisiereEintrag(roh);
  }

  async function erstelleIssue(owner, name, { titel, text = '' } = {}) {
    const ziel = String(owner) + '/' + String(name);
    const roh = await hole('/repos/' + teil(owner) + '/' + teil(name) + '/issues', {
      methode: 'POST',
      repo: ziel,
      koerper: {
        title: String(titel == null ? '' : titel),
        body: String(text == null ? '' : text),
      },
    });
    vergiss('/repos/' + teil(owner) + '/' + teil(name) + '/issues?state=open&per_page=100');
    vergiss('/repos/' + teil(owner) + '/' + teil(name) + '/issues?state=all&per_page=100');
    return normalisiereEintrag(roh);
  }

  /** Eine Frage anlegen; die Antwort ist wieder ein Issue ohne Pull Request. */
  async function erstelleFrage(owner, name, { titel, text = '' } = {}) {
    const frage = await erstelleIssue(owner, name, { titel, text });
    return {
      ...frage,
      zustand: frage.zustand === 'closed' ? 'geschlossen' : 'offen',
    };
  }

  async function erstelleFork(owner, name) {
    const ziel = String(owner) + '/' + String(name);
    const roh = await hole('/repos/' + teil(owner) + '/' + teil(name) + '/forks', {
      methode: 'POST', repo: ziel,
    });
    return normalisiereFork(roh);
  }

  return {
    repo,
    suche,
    releases,
    issues,
    pulls,
    beitraege,
    pull,
    fragen,
    teams,
    teamMitglieder,
    benutzer,
    ich,
    berechtigung,
    rateGrenze,
    erstelleRepo,
    setzeInhalt,
    setzeSichtbarkeit,
    erstellePull,
    erstelleIssue,
    erstelleFrage,
    erstelleFork,
  };
}
