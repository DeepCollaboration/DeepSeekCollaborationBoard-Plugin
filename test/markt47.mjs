/**
 * Prüfung Schritt 47 — Die Client-Hälfte ohne Browser: Registrierung,
 * Akzentstil und die Einstellungsseite.
 *
 * Der Client wird mit einem nachgebildeten `window.__ModuleLoader__` geladen;
 * `react` ist ein kleiner Ersatz, der die benutzten Haken kennt. Geprüft wird,
 * was sich ohne Browser prüfen lässt:
 *
 *   1. Das Modul lädt und `apply` meldet drei Plätze an: `main`,
 *      `settings.section` (Kennung `board`) und `sidebar.panellist`.
 *   2. Der Akzentstil wird einmal in den Kopf gelegt, nennt helle und dunkle
 *      Werte je Akzent und wird beim Abbau wieder entfernt.
 *   3. Die Einstellungsseite lässt sich rendern: Titel „CollaborationBoard“, die vier
 *      Zeilen und das Akzent-Merkmal am Wurzelelement.
 *   4. Der Abschnitt heißt „CollaborationBoard“.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HIER = dirname(fileURLToPath(import.meta.url));
const PRODUKT = dirname(HIER);

function pruefe(bedingung, text) {
  if (!bedingung) throw new Error(text);
}

/* --- Ein kleiner React-Ersatz ------------------------------------------- */

function ReactErsatz() {
  class Component {
    constructor(props) {
      this.props = props || {};
      this.state = {};
    }

    setState(wert) {
      const neu = typeof wert === 'function' ? wert(this.state) : wert;
      this.state = { ...this.state, ...neu };
    }
  }

  return {
    Component,
    Fragment: Symbol('Fragment'),
    createElement(type, props, ...children) {
      return { type, props: props || {}, children };
    },
    useState(wert) {
      return [wert, () => {}];
    },
    useEffect() {},
    useRef(wert) {
      return { current: wert };
    },
    useCallback(fn) {
      return fn;
    },
  };
}

/* --- Der nachgebildete Modullader --------------------------------------- */

function ladeClient() {
  let geladen = null;
  const stile = [];
  const entfernt = [];

  globalThis.window = {
    __ModuleLoader__: {
      load(definition) { geladen = definition; },
    },
  };
  globalThis.document = {
    createElement(tag) {
      const element = {
        tag,
        dataset: {},
        textContent: '',
        remove() { entfernt.push(element); },
      };
      return element;
    },
    head: {
      appendChild(element) { stile.push(element); },
    },
  };

  return import(pathToFileURL(join(PRODUKT, 'client.js')).href).then(() => {
    pruefe(geladen && typeof geladen.factory === 'function',
      'client.js meldet keine Factory an');
    const React = ReactErsatz();
    const exports = geladen.factory((name) => {
      if (name === 'react') return React;
      throw new Error('Unbekanntes Modul im Client: ' + name);
    });
    return { exports, React, stile, entfernt };
  });
}

/* --- Ein kleiner Renderer: Funktions- und Klassenkomponenten auflösen ---- */

function rendern(knoten) {
  if (Array.isArray(knoten)) return knoten.map(rendern);
  if (knoten == null || typeof knoten !== 'object') return knoten;
  const kinder = knoten.children.length === 0 ? null
    : knoten.children.length === 1 ? knoten.children[0] : knoten.children;
  const props = { ...knoten.props, ...(kinder == null ? null : { children: kinder }) };
  if (typeof knoten.type === 'function') {
    if (knoten.type.prototype && typeof knoten.type.prototype.render === 'function') {
      return rendern(new knoten.type(props).render());
    }
    return rendern(knoten.type(props));
  }
  return { ...knoten, children: (knoten.children || []).map(rendern) };
}

/* --- Der Text eines Elementbaums ---------------------------------------- */

function texte(knoten, sammeln = []) {
  if (knoten == null || typeof knoten === 'boolean') return sammeln;
  if (typeof knoten === 'string' || typeof knoten === 'number') {
    sammeln.push(String(knoten));
    return sammeln;
  }
  if (Array.isArray(knoten)) {
    for (const teil of knoten) texte(teil, sammeln);
    return sammeln;
  }
  if (Array.isArray(knoten.children)) texte(knoten.children, sammeln);
  return sammeln;
}

async function lauf() {
  const { exports, stile, entfernt } = await ladeClient();

  const registriert = [];
  const aufraeumen = [];
  const eintraege = [];
  const deklariert = Array.isArray(exports.inject) ? exports.inject : [];
  const dienste = {
    slots: {
      inject(name, fn) {
        eintraege.push(name);
        const ende = fn();
        if (typeof ende === 'function') aufraeumen.push(ende);
        return ende;
      },
      register(options, component) {
        registriert.push({ options, component });
        return () => {};
      },
    },
    locale: {
      getSnapshot: () => ({ active: 'de' }),
      addLanguage: () => () => {},
    },
  };
  // Cordis wirft beim Lesen eines Dienstes, der nicht in `inject` steht — daran
  // scheiterte der Start einmal. Der Ersatz bildet das nach, damit derselbe
  // Fehler nicht wieder unbemerkt durch die Prüfung geht.
  const ctx = new Proxy({
    effect(fn) {
      const ende = fn();
      if (typeof ende === 'function') aufraeumen.push(ende);
      return () => {};
    },
    on() { return () => {}; },
  }, {
    get(ziel, feld) {
      if (typeof feld === 'symbol' || feld in ziel) return ziel[feld];
      if (!(feld in dienste)) {
        throw new Error('cannot get property "' + String(feld) + '" without inject');
      }
      pruefe(deklariert.includes(feld),
        'Der Client liest den Dienst „' + String(feld) + '“ ohne Eintrag in inject');
      return dienste[feld];
    },
  });

  pruefe(deklariert.slice().sort().join(',') === 'locale,slots',
    'Der Client meldet andere Dienste an: ' + JSON.stringify(deklariert));

  exports.apply(ctx);

  // 1. Drei Plätze, darunter der Einstellungsabschnitt.
  const namen = registriert.map((eintrag) => eintrag.options.name);
  pruefe(namen.includes('main'), 'Der Platz „main“ fehlt: ' + namen.join(', '));
  pruefe(namen.includes('sidebar.panellist'),
    'Der Platz „sidebar.panellist“ fehlt: ' + namen.join(', '));
  const einstellungen = registriert.find((eintrag) => eintrag.options.name === 'settings.section');
  pruefe(einstellungen, 'Der Einstellungsabschnitt fehlt: ' + namen.join(', '));
  pruefe(einstellungen.options.id === 'board',
    'Der Einstellungsabschnitt hat nicht die Kennung „board“: '
      + JSON.stringify(einstellungen.options));
  pruefe(typeof einstellungen.options.label === 'function'
    && einstellungen.options.label() === 'CollaborationBoard',
  'Der Einstellungsabschnitt heißt nicht „CollaborationBoard“');

  // 2. Der Akzentstil.
  pruefe(stile.length === 1, 'Der Akzentstil wurde ' + stile.length + '× gelegt');
  const stil = stile[0].textContent;
  for (const akzent of ['marke', 'violett', 'tuerkis', 'bernstein', 'rose', 'indigo']) {
    pruefe(stil.includes('[data-board-akzent="' + akzent + '"]'),
      'Der Stil nennt den Akzent „' + akzent + '“ nicht');
  }
  pruefe(stil.includes('body[data-ds-dark-theme] [data-board-akzent="violett"]'),
    'Der Stil trennt hell und dunkel nicht');
  aufraeumen.forEach((ende) => { try { ende(); } catch { /* schon abgebaut */ } });
  pruefe(entfernt.length === 1, 'Der Akzentstil wurde beim Abbau nicht entfernt');

  // 3. Die Einstellungsseite rendert.
  const baum = rendern(einstellungen.component({}));
  const sichtbar = texte(baum).join(' | ');
  for (const wort of ['CollaborationBoard', 'Akzentfarbe', 'Anordnung', 'Mausrad', 'Eigentümer',
    'Deine Identität', 'GitHub']) {
    pruefe(sichtbar.includes(wort),
      'Die Einstellungsseite nennt „' + wort + '“ nicht: ' + sichtbar.slice(0, 300));
  }
  pruefe(baum.props && baum.props['data-board-akzent'] === 'marke',
    'Die Einstellungsseite trägt das Akzent-Merkmal nicht: '
      + JSON.stringify(baum.props && baum.props['data-board-akzent']));

  console.log('ok Client: drei Plätze, Akzentstil hell/dunkel, Einstellungsseite rendert');
}

try {
  await lauf();
  process.exit(0);
} catch (fehler) {
  console.error('FEHLER: ' + String((fehler && fehler.message) || fehler));
  process.exit(1);
}
