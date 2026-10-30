/**
 * Prüfung Schritt 33 — Die Konfliktmeldung nennt die Datei.
 *
 * Die Prüffläche liegt in einem eigenen Temp-Ordner. Zwei Repositories mit
 * lokalem Bare-Remote (kein Netz):
 *
 *   - A hat in `notizen.md` je eine eigene und eine fremde Änderung; der
 *     Abgleich läuft in einen Konflikt.
 *   - B ist sauber und teilt sich mit A nur den Lauf, nicht den Fehler.
 *
 * Geprüft wird:
 *
 *   (a) A meldet „pull --rebase: Konflikt in notizen.md“ und trägt
 *       `datei: "notizen.md"`.
 *   (b) Nach dem Abgleich liegt kein `.git/rebase-merge` (und kein
 *       `.git/rebase-apply`) mehr da, die Datei trägt keine Konfliktmarker und
 *       der lokale Stand steht unverändert im Arbeitsbaum.
 *   (c) B behält seinen Stand: Pfad, Name, Remote und Zahl der lokalen
 *       Fassungen wie vorher, kein Fehler, keine Datei; Kopf und Datei von B
 *       bleiben gleich.
 *   (d) Ein zweiter Abgleich von A ändert die Meldung und die Datei nicht und
 *       lässt wieder keinen Rebase liegen.
 */
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { gleicheAlleAb, staendeFuer } from '../abgleich.js';

const WURZEL = mkdtempSync(join(tmpdir(), 'board-markt33-'));

const A = join(WURZEL, 'a');
const A_FERN = join(WURZEL, 'a-fern');
const A_ORIGIN = join(WURZEL, 'a-origin.git');
const B = join(WURZEL, 'b');
const B_ORIGIN = join(WURZEL, 'b-origin.git');

const A_BASIS = '# Notizen\n\nZeile eins.\nZeile zwei.\n';
const A_FERN_INHALT = '# Notizen\n\nZeile eins.\nZeile zwei, von fern.\n';
const A_HIER_INHALT = '# Notizen\n\nZeile eins.\nZeile zwei, von hier.\n';
const B_INHALT = 'B bleibt unberührt.\n';

function pruefe(bedingung, text) {
  if (!bedingung) throw new Error(text);
}

/** Ein Git-Befehl; ein Fehler ist ein Fehler der Prüfung. */
function git(ordner, args) {
  const lauf = spawnSync('git', ['-C', ordner, ...args], {
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  pruefe(lauf.status === 0, 'git ' + args.join(' ') + ' in ' + ordner + ': '
    + String(lauf.stderr || lauf.stdout || 'unbekannter Fehler').trim());
  return String(lauf.stdout || '').trim();
}

/** Einen Stand mit der Prüffläche als Autor festschreiben. */
function fasse(ordner, nachricht) {
  git(ordner, ['add', '-A']);
  git(ordner, ['-c', 'user.name=Prüffläche', '-c', 'user.email=pruefflaeche@board',
    'commit', '-q', '-m', nachricht]);
}

/** Ein neues Repository mit erstem Stand anlegen. */
function neuesRepo(ordner, datei, inhalt) {
  mkdirSync(ordner, { recursive: true });
  git(ordner, ['init', '-q', '-b', 'main']);
  writeFileSync(join(ordner, datei), inhalt, 'utf8');
  fasse(ordner, 'Ausgangsstand');
}

/** Ein neues nacktes Repository als Remote anlegen. */
function neuesBare(ordner) {
  mkdirSync(ordner, { recursive: true });
  git(ordner, ['init', '-q', '--bare', '-b', 'main']);
}

/** Kein halber Rebase und keine Konfliktmarker in A. */
function saubererAbbruch(was) {
  pruefe(!existsSync(join(A, '.git', 'rebase-merge')),
    was + ': A trägt noch .git/rebase-merge');
  pruefe(!existsSync(join(A, '.git', 'rebase-apply')),
    was + ': A trägt noch .git/rebase-apply');
  const inhalt = readFileSync(join(A, 'notizen.md'), 'utf8');
  pruefe(!/^(<{7}|={7}|>{7})/m.test(inhalt),
    was + ': notizen.md trägt noch Konfliktmarker:\n' + inhalt);
  pruefe(inhalt === A_HIER_INHALT,
    was + ': der lokale Stand von A steht nicht mehr im Arbeitsbaum:\n' + inhalt);
}

try {
  // A: das nackte Remote, ein Ausgangsstand und ein zweiter Klon, der eine
  // Änderung an derselben Zeile schiebt. A ändert die Zeile ebenfalls lokal.
  neuesBare(A_ORIGIN);
  neuesRepo(A, 'notizen.md', A_BASIS);
  git(A, ['remote', 'add', 'origin', A_ORIGIN]);
  git(A, ['push', '-q', 'origin', 'main']);

  git(WURZEL, ['clone', '-q', A_ORIGIN, A_FERN]);
  writeFileSync(join(A_FERN, 'notizen.md'), A_FERN_INHALT, 'utf8');
  fasse(A_FERN, 'Änderung von fern');
  git(A_FERN, ['push', '-q', 'origin', 'main']);

  writeFileSync(join(A, 'notizen.md'), A_HIER_INHALT, 'utf8');
  fasse(A, 'Änderung von hier');

  // B: sauber und ohne fremde Änderung; sein Stand bleibt der Ausgangsstand.
  neuesBare(B_ORIGIN);
  neuesRepo(B, 'stand.md', B_INHALT);
  git(B, ['remote', 'add', 'origin', B_ORIGIN]);
  git(B, ['push', '-q', 'origin', 'main']);

  const eintraege = [
    { name: 'A', art: 'vorhaben', pfad: A },
    { name: 'B', art: 'vorhaben', pfad: B },
  ];
  const bVorher = staendeFuer([eintraege[1]])[0];
  const bKopf = git(B, ['rev-parse', 'HEAD']);

  const staende = gleicheAlleAb(eintraege.map((eintrag) => ({ ...eintrag })));
  const aStand = staende.find((eintrag) => eintrag.name === 'A');
  const bStand = staende.find((eintrag) => eintrag.name === 'B');
  pruefe(aStand && bStand, 'Der Abgleich gibt nicht beide Stände zurück: '
    + JSON.stringify(staende));

  // (a) A nennt die Datei in `fehler` und in `datei`.
  pruefe(aStand.datei === 'notizen.md',
    'A trägt nicht datei "notizen.md", sondern ' + JSON.stringify(aStand.datei)
      + ': ' + JSON.stringify(aStand));
  pruefe(aStand.fehler === 'pull --rebase: Konflikt in notizen.md',
    'A meldet nicht den Konflikt in notizen.md, sondern '
      + JSON.stringify(aStand.fehler));

  // (b) Der Abbruch ist vollständig: kein Rebase, keine Marker, lokaler Stand.
  saubererAbbruch('nach dem ersten Abgleich');
  pruefe(git(A, ['status', '--porcelain']) === '',
    'Nach dem Abbruch bleibt in A etwas Uncommittetes liegen');

  // (c) B behält seinen Stand; der Fehler von A färbt nicht auf B ab.
  pruefe(bStand.pfad === bVorher.pfad && bStand.name === bVorher.name
    && bStand.art === bVorher.art,
  'Der Eintrag von B wurde verändert: ' + JSON.stringify({ vorher: bVorher, nachher: bStand }));
  pruefe(bStand.remote === bVorher.remote && bStand.nur_lokal === bVorher.nur_lokal,
    'Remote oder lokale Fassungen von B haben sich geändert: '
      + JSON.stringify({ vorher: bVorher, nachher: bStand }));
  pruefe(bStand.fehler === '' && bStand.datei === '',
    'B trägt einen Fehler oder eine Datei: ' + JSON.stringify(bStand));
  pruefe(bStand.lage === 'abgeglichen',
    'B steht nach dem Abgleich als ' + JSON.stringify(bStand.lage));
  pruefe(git(B, ['rev-parse', 'HEAD']) === bKopf,
    'B hat durch den Abgleich eine neue Fassung bekommen');
  pruefe(readFileSync(join(B, 'stand.md'), 'utf8') === B_INHALT,
    'Die Datei von B wurde verändert');
  pruefe(git(B, ['status', '--porcelain']) === '',
    'In B bleibt etwas Uncommittetes liegen');

  // (d) Ein zweiter Abgleich von A wiederholt dieselbe Meldung und lässt
  // wieder keinen Rebase liegen.
  const zweiter = gleicheAlleAb([{ name: 'A', art: 'vorhaben', pfad: A }]);
  const aNoch = zweiter[0];
  pruefe(aNoch.datei === aStand.datei,
    'Der zweite Abgleich ändert datei: ' + JSON.stringify(aNoch.datei));
  pruefe(aNoch.fehler === aStand.fehler,
    'Der zweite Abgleich ändert die Meldung: ' + JSON.stringify(aNoch.fehler));
  saubererAbbruch('nach dem zweiten Abgleich');

  console.log('ok Konflikt: Datei genannt, andere unberührt, kein halber Rebase');
} finally {
  rmSync(WURZEL, { recursive: true, force: true });
}
