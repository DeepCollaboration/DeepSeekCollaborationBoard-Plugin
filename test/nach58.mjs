/**
 * Prüfung Schritt 58 — Vier Bausteine, zuerst in den Einstellungen.
 *
 * Der Client wird mit einem nachgebildeten `window.__ModuleLoader__` und einem
 * kleinen React-Ersatz geladen — ohne Browser, ohne Netz. Gerendert wird der
 * Einstellungsabschnitt; die Haken des Ersatzes laufen nicht, also steht er
 * im Ladezustand. Geprüft wird:
 *
 *   1. Das Rendern wirft nicht.
 *   2. Ein `section` mit `role="region"` trägt `aria-labelledby` mit der
 *      Kennung seiner Überschrift.
 *   3. Mindestens ein `label` mit `htmlFor` passt zu einem `input` mit `id`.
 *   4. Im Ladezustand steht „Wird geladen …“ — und nicht der Satz über das
 *      fehlende Schreibrecht.
 *   5. `client.js` definiert `Knopf`, `Feld`, `Panel` und `Meldung` je einmal;
 *      `Knopf`, `Feld` und `Meldung` werden auch aufgerufen.
 */
import { readFileSync } from 'node:fs';
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

/** Alle Elemente eines gerenderten Baums — auch in geschachtelten Listen. */
function knotenSammeln(knoten, sammeln = []) {
  if (knoten == null || typeof knoten !== 'object') return sammeln;
  if (Array.isArray(knoten)) {
    for (const teil of knoten) knotenSammeln(teil, sammeln);
    return sammeln;
  }
  sammeln.push(knoten);
  if (Array.isArray(knoten.children)) knotenSammeln(knoten.children, sammeln);
  return sammeln;
}

async function lauf() {
  const rufe = [];
  globalThis.fetch = async (pfad) => {
    rufe.push(String(pfad));
    const antwort = (wert) => ({ ok: true, status: 200, json: async () => wert });
    if (String(pfad).startsWith('/board/sprache')) {
      const id = new URL(String(pfad), 'http://localhost').searchParams.get('id') || 'de';
      return antwort({ id, texte: {} });
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
  const ctx = {
    effect(fn) { fn(); },
    on() { return () => {}; },
    slots: {
      inject(name, fn) { fn(); },
      register(options, component) { registriert.push({ options, component }); return () => {}; },
    },
    locale: {
      getSnapshot: () => ({ active: 'de' }),
      addLanguage() { return () => {}; },
    },
  };
  exports.apply(ctx);
  await new Promise((fertig) => setTimeout(fertig, 24));

  const einstellungen = registriert.find((e) => e.options.name === 'settings.section');
  pruefe(einstellungen, 'Der Einstellungsabschnitt fehlt');

  // 1. Das Rendern wirft nicht.
  let baum;
  try {
    baum = rendern(einstellungen.component({}));
  } catch (fehler) {
    throw new Error('Das Rendern des Einstellungsabschnitts warf: '
      + String((fehler && fehler.message) || fehler));
  }
  pruefe(baum && typeof baum === 'object', 'Der Einstellungsabschnitt rendert nichts');
  const knoten = knotenSammeln(baum);

  // 2. section mit role=region, aria-labelledby trägt die Kennung der Überschrift.
  const bereich = knoten.find((k) => k.type === 'section'
    && k.props.role === 'region'
    && typeof k.props['aria-labelledby'] === 'string');
  pruefe(bereich, 'Es gibt kein section mit role="region" und aria-labelledby');
  const kennung = bereich.props['aria-labelledby'];
  pruefe(knoten.some((k) => k.type === 'h2' && k.props.id === kennung),
    'Keine h2 trägt die Kennung „' + kennung + '“ aus aria-labelledby');

  // 3. Ein label mit htmlFor passt zu einem input mit id.
  const beschriftet = knoten.some((k) => k.type === 'label'
    && typeof k.props.htmlFor === 'string'
    && knoten.some((i) => i.type === 'input' && i.props.id === k.props.htmlFor));
  pruefe(beschriftet, 'Kein label mit htmlFor passt zu einem input mit derselben id');

  // 4. Im Ladezustand: „Wird geladen …“ statt des Schreibrecht-Satzes.
  const sichtbar = texte(baum).join(' | ');
  pruefe(sichtbar.includes('Wird geladen …'),
    'Im Ladezustand steht nicht „Wird geladen …“: ' + sichtbar.slice(0, 300));
  pruefe(!sichtbar.includes('Für dieses Board fehlt das Schreibrecht.'),
    'Im Ladezustand steht der Satz über das fehlende Schreibrecht: '
      + sichtbar.slice(0, 300));
  // „Wird geladen …“ steht unter dem Kopf, vor den Einstellungen — nicht erst
  // im Konto darunter (das denselben Satz beim Laden zeigt).
  pruefe(sichtbar.indexOf('Wird geladen …') < sichtbar.indexOf('Akzentfarbe'),
    'Der Ladehinweis steht nicht unter dem Kopf der Einstellungen: '
      + sichtbar.slice(0, 300));

  // 5. Die vier Definitionen und die drei Aufrufe stehen in client.js.
  const quelle = readFileSync(join(PRODUKT, 'client.js'), 'utf8');
  for (const name of ['Knopf', 'Feld', 'Panel', 'Meldung']) {
    const stellen = quelle.split('function ' + name + '(').length - 1;
    pruefe(stellen === 1,
      'client.js definiert „' + name + '“ ' + stellen + '× statt einmal');
  }
  for (const name of ['Knopf', 'Feld', 'Meldung']) {
    pruefe(new RegExp('h\\(' + name + ',\\s*\\{').test(quelle),
      'client.js ruft „' + name + '“ nirgends auf');
  }

  console.log('ok Bausteine: Einstellungen als Panel mit Region und Kennung, '
    + 'Feld mit Label, Ladezustand „Wird geladen …“, vier Definitionen');
}

try {
  await lauf();
  process.exit(0);
} catch (fehler) {
  console.error('FEHLER: ' + String((fehler && fehler.message) || fehler));
  process.exit(1);
}
