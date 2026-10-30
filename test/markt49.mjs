/**
 * Prüfung Schritt 49 — Die Sprache im Client, ohne Browser.
 *
 * Der Client wird mit einem nachgebildeten `window.__ModuleLoader__` und
 * einem kleinen React-Ersatz geladen. `fetch` ist ebenfalls nachgebildet:
 * `/board/sprache` liefert ein kleines englisches Wörterbuch, die übrigen
 * Wege antworten leer. Geprüft wird:
 *
 *   1. Die Sprache des Dashboards (`en`) wird geladen, und ein Text erscheint
 *      auf Englisch.
 *   2. Fehlt ein Eintrag, bleibt der deutsche Ausgangstext stehen (keine
 *      leeren Stellen, keine Schlüsselnamen).
 *   3. Werte werden eingesetzt: `{0}` im Text, hier am Akzent-Knopf.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HIER = dirname(fileURLToPath(import.meta.url));
const PRODUKT = dirname(HIER);

function pruefe(bedingung, text) {
  if (!bedingung) throw new Error(text);
}

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
    createElement(type, props, ...children) { return { type, props: props || {}, children }; },
    useState(wert) { return [wert, () => {}]; },
    useEffect() {},
    useRef(wert) { return { current: wert }; },
    useCallback(fn) { return fn; },
  };
}

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
  const ENGLISCH = {
    Akzentfarbe: 'Accent colour',
    'Akzentfarbe {0}': 'Accent colour {0}',
  };
  const ARABISCH = {
    Akzentfarbe: 'لون التمييز',
    'Akzentfarbe {0}': 'لون التمييز {0}',
  };

  const rufe = [];
  globalThis.fetch = async (pfad) => {
    rufe.push(String(pfad));
    const antwort = (wert) => ({ ok: true, status: 200, json: async () => wert });
    if (String(pfad).startsWith('/board/sprache')) {
      const id = new URL(String(pfad), 'http://localhost').searchParams.get('id') || 'de';
      return antwort({ id, texte: id === 'ar' ? ARABISCH : ENGLISCH });
    }
    if (String(pfad).startsWith('/board/darstellung')) {
      return antwort({ darstellung: { akzent: 'marke' } });
    }
    if (String(pfad).startsWith('/board/data')) {
      return antwort({
        format: 2, darf: false, personen: [], einstellungen: {},
        workflow: { layout: 'frei' }, eigentuemer: '',
      });
    }
    return antwort({});
  };

  let geladen = null;
  globalThis.window = { __ModuleLoader__: { load(definition) { geladen = definition; } } };
  globalThis.document = {
    createElement() { return { dataset: {}, textContent: '', remove() {} }; },
    head: { appendChild() {} },
  };

  await import(pathToFileURL(join(PRODUKT, 'client.js')).href);
  const React = ReactErsatz();
  const exports = geladen.factory((name) => {
    if (name === 'react') return React;
    throw new Error('Unbekanntes Modul: ' + name);
  });

  const registriert = [];
  const sprachen = [];
  let sprachWechsel = null;
  const deklariert = Array.isArray(exports.inject) ? exports.inject : [];
  const dienste = {
    slots: {
      inject(name, fn) { fn(); },
      register(options, component) { registriert.push({ options, component }); return () => {}; },
    },
    locale: {
      getSnapshot: () => ({ active: 'en' }),
      addLanguage(eintrag) { sprachen.push(eintrag); return () => {}; },
    },
  };
  // Wie im echten Betrieb: Was nicht in `inject` steht, ist nicht lesbar.
  const ctx = new Proxy({
    effect(fn) { fn(); },
    on(name, fn) {
      if (name === 'locale/change') sprachWechsel = fn;
      return () => {};
    },
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
  exports.apply(ctx);
  await new Promise((fertig) => setTimeout(fertig, 24));

  pruefe(rufe.some((pfad) => pfad.includes('/board/sprache?id=en')),
    'Der Client hat das englische Wörterbuch nicht geholt: ' + JSON.stringify(rufe));
  for (const [id, label] of [['de', 'Deutsch'], ['es', 'Español'], ['fr', 'Français'],
    ['ru', 'Русский'], ['ja', '日本語'], ['ar', 'العربية']]) {
    pruefe(sprachen.some((eintrag) => eintrag.id === id
      && eintrag.label === label && eintrag.fallback === 'en'),
    'Die Sprache „' + id + '“ fehlt im Umschalter: ' + JSON.stringify(sprachen));
  }

  const einstellungen = registriert.find((e) => e.options.name === 'settings.section');
  pruefe(einstellungen, 'Der Einstellungsabschnitt fehlt');
  const baum = rendern(einstellungen.component({}));
  const sichtbar = texte(baum).join(' | ');

  pruefe(sichtbar.includes('Accent colour'),
    'Der englische Text erscheint nicht: ' + sichtbar.slice(0, 300));
  pruefe(sichtbar.includes('Anordnung'),
    'Der deutsche Ausgangstext fehlt, wo die Übersetzung fehlt: '
      + sichtbar.slice(0, 300));

  // Der Platzhalter: der Akzent-Knopf trägt „Accent colour <Name>“.
  const beschriftungen = [];
  const sammle = (knoten) => {
    if (!knoten || typeof knoten !== 'object') return;
    if (Array.isArray(knoten)) { knoten.forEach(sammle); return; }
    if (knoten.props) {
      for (const [name, wert] of Object.entries(knoten.props)) {
        if (name === 'aria-label' && typeof wert === 'string') beschriftungen.push(wert);
      }
    }
    (knoten.children || []).forEach(sammle);
  };
  sammle(baum);
  pruefe(beschriftungen.some((text) => /^Accent colour .+/.test(text)),
    'Der eingesetzte Wert fehlt: ' + JSON.stringify(beschriftungen.slice(0, 8)));

  // Arabisch: Wörterbuch kommt nach, das Board wird rechtsläufig.
  pruefe(typeof sprachWechsel === 'function', 'Der Sprachwechsel ist nicht angeschlossen');
  sprachWechsel({ active: 'ar' });
  await new Promise((fertig) => setTimeout(fertig, 24));
  pruefe(rufe.some((pfad) => pfad.includes('/board/sprache?id=ar')),
    'Der Client hat das arabische Wörterbuch nicht geholt: ' + JSON.stringify(rufe));
  const arabisch = rendern(einstellungen.component({}));
  pruefe(arabisch.props && arabisch.props.dir === 'rtl',
    'Das Board wird für Arabisch nicht rechtsläufig: '
      + JSON.stringify(arabisch.props && arabisch.props.dir));
  pruefe(texte(arabisch).join(' | ').includes('لون التمييز'),
    'Der arabische Text erscheint nicht: '
      + texte(arabisch).join(' | ').slice(0, 300));

  console.log('ok Sprache im Client: Englisch geladen, Ausgangstext als Rückfall, '
    + 'Werte eingesetzt, sechs Sprachen angemeldet, Arabisch rechtsläufig');
}

try {
  await lauf();
  process.exit(0);
} catch (fehler) {
  console.error('FEHLER: ' + String((fehler && fehler.message) || fehler));
  process.exit(1);
}
