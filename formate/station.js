/**
 * `station.json` lesen und prüfen.
 *
 * Eine Station gehört ihrem Host und beschreibt, was an ihr geschieht:
 * welcher Eingang hineingeht, welcher Ausgang herauskommt und wie die Arbeit
 * getan wird. Die Aktionsart (`aktion.art`) sagt, ob ein Skill, ein Skript,
 * ein Textfeld oder eine Datei die Station ausmacht.
 */
import {
  kennung, liesFormatDatei, liste, objekt, optionalerText, text, texte,
} from './hilfe.js';

/** Die Arten, wie an einer Station gearbeitet wird. */
export const AKTIONEN = ['skill', 'skript', 'textfeld', 'datei'];

/** Die Stufen der Reife. */
export const REIFEN = ['entwurf', 'erprobt', 'geprüft'];

/**
 * Prüft ein bereits gelesenes `station.json`. Dieselben Regeln gelten für die
 * Datei im Arbeitsbaum und für den Stand, der aus der Git-Geschichte kommt:
 * gelesen wird der Text, geprüft wird hier.
 */
export function pruefeStation(roh) {
  const was = 'Station';
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) {
    throw new Error(was + ': station.json ist kein Objekt');
  }
  if (roh.format !== 2) {
    throw new Error(was + ': station.json hat Format ' + JSON.stringify(roh.format)
      + ', erwartet 2');
  }

  const aktion = objekt(roh.aktion, 'aktion', was);
  const art = text(aktion.art, 'aktion.art', was);
  if (!AKTIONEN.includes(art)) {
    throw new Error(was + ': „aktion.art“ ist keine bekannte Aktion: ' + JSON.stringify(art));
  }
  if (aktion.datei != null) text(aktion.datei, 'aktion.datei', was);
  if (aktion.wert != null && typeof aktion.wert !== 'string') {
    throw new Error(was + ': „aktion.wert“ ist kein Text');
  }

  const reife = text(roh.reife, 'reife', was);
  if (!REIFEN.includes(reife)) {
    throw new Error(was + ': „reife“ ist keine bekannte Stufe: ' + JSON.stringify(reife));
  }

  const station = {
    format: 2,
    id: kennung(roh.id, 'id', was),
    name: text(roh.name, 'name', was),
    beschreibung: optionalerText(roh.beschreibung, 'beschreibung', was),
    host: text(roh.host, 'host', was),
    eingang: texte(roh.eingang, 'eingang', was),
    ausgabe: texte(roh.ausgabe, 'ausgabe', was),
    aktion: { art },
    beispiele: liste(roh.beispiele, 'beispiele', was),
    reife,
    lizenz: text(roh.lizenz, 'lizenz', was),
    tags: texte(roh.tags, 'tags', was),
  };
  if (aktion.datei != null) station.aktion.datei = aktion.datei;
  if (aktion.wert != null) station.aktion.wert = aktion.wert;
  return station;
}

/** Liest `station.json` aus einem Repository und prüft die Felder. */
export function liesStation(repo) {
  const roh = liesFormatDatei(repo, 'station.json', 'Station');
  return pruefeStation(roh);
}
