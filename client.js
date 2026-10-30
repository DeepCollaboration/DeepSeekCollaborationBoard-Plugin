/**
 * Der Client des Board-Plugins — die ganze sichtbare Fläche als React-Baum.
 *
 * Geladen wird die Datei vom Dashboard über `window.__ModuleLoader__.load`:
 * `factory` baut den Client, `apply` hängt ihn an die Slots, und `inject`
 * nennt die Dienste, die er dafür lesen darf (`slots`, `locale`). Die Sprache
 * kommt vom Dashboard (`ctx.locale`); die Wörterbücher liegen in `texte/` und
 * werden über `/board/sprache` geholt. Fehlt eine Übersetzung, bleibt der
 * deutsche Ausgangstext stehen; Arabisch dreht die Fläche rechtsläufig.
 *
 * Die Fläche ist frei: Stationen sind Karten mit eigener Lage (x, y), keine
 * Spalten. Verbindungen laufen als Schnüre zwischen ihren Ports; gezogen wird
 * mit der Maus, abgelegt auf der Fläche oder auf einer Station.
 *
 * Aufbau der Datei:
 *   Abgleich und Hinweise       Stände, Sichtbarkeit, Formatwarnung
 *   Stile                       `S` (Seite) und `E` (Einstellungen)
 *   Stationen und Farben        Arbeitsweise, Palette, Anordnung
 *   Kleine Helfer und Daten     Zeichentakt, Fläche, Workflow
 *   Text und Markdown           Links, Vergleich, Markdown
 *   Übersetzung und Sprache     `sprache`, `uebersetze`, `useSprache`
 *   Theme und Akzent            `darstellung`, `AKZENTE`, `useDarstellung`
 *   Was die Ansicht behält      `gemerkt`, `boardAenderungen`
 *   Bausteine                   `Knopf`, `Feld`, `Panel`, `Meldung`
 *   Einstellungen               `BoardEinstellungen`
 *   Konto und GitHub            `BoardKonto`
 *   Beiträge, Fragen, Teams     die Flächen am Repository
 *   BoardPage                   Zustand und Laden, Fläche und Karten, Kanten,
 *                               Bibliothek, Katalog, Leser, Chat, Beiträge,
 *                               Fragen, Startseite
 *   Slots und `apply`           was das Dashboard einhängt
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-board',
  /** Baut den Client aus React und den Diensten, die `apply` später bekommt. */
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    // Der Name, den Menschen sehen: ein Eigenname, der für das Ganze steht,
    // nicht für ein einzelnes Board. Er wird deshalb nicht übersetzt.
    const PRODUKT_NAME = 'CollaborationBoard';

    // --- Abgleich und Hinweise ---------------------------------------------

    /**
     * Der Stand des Abgleichs als eine Zeile: wann zuletzt abgeglichen wurde,
     * ob es überhaupt ein Remote gibt und wie viele Fassungen nur hier liegen.
     * Gelesen wird alles aus `stand` in /board/data.
     */
    function standZeile(stand) {
      if (!stand) return '';
      const teile = [];
      if (stand.lage === 'abgeglichen' && stand.zeit) {
        const d = new Date(stand.zeit);
        const zeit = Number.isNaN(d.getTime())
          ? String(stand.zeit)
          : d.toLocaleString(sprachTag(), {
            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
          });
        teile.push(uebersetze('zuletzt abgeglichen {0}', [zeit]));
      } else if (stand.lage === 'kein remote') {
        teile.push(uebersetze('nicht abgeglichen — kein Remote'));
      } else {
        teile.push(uebersetze('nicht abgeglichen'));
      }
      const offen = Number(stand.nur_lokal) || 0;
      if (offen > 0) {
        teile.push(offen === 1
          ? uebersetze('1 Fassung nur hier')
          : uebersetze('{0} Fassungen nur hier', [offen]));
      }
      return teile.join(' · ');
    }

    /**
     * Der Stand eines Repositories als eine Zeile: Name, Art, Lage, Zahl der
     * nur lokalen Fassungen und der Remote. Ohne Remote steht „kein Remote“ an
     * der Stelle der Lage; ein Fehler hängt am Ende. Gelesen wird alles aus
     * `staende` in /board/data — nur Fassung 2 kennt das Feld.
     */
    function repoStandZeile(eintrag) {
      if (!eintrag || typeof eintrag !== 'object') return '';
      const name = String(eintrag.name || '').trim();
      const art = String(eintrag.art || '').trim();
      const lage = String(eintrag.lage || '');
      const teile = [name || art || 'Repository'];
      if (name && art) teile.push(art);
      teile.push(lage === 'kein remote'
        ? uebersetze('kein Remote')
        : (lage || uebersetze('nicht abgeglichen')));
      const offen = Number(eintrag.nur_lokal) || 0;
      if (offen > 0) {
        teile.push(offen === 1
          ? uebersetze('1 Fassung nur hier')
          : uebersetze('{0} Fassungen nur hier', [offen]));
      }
      if (eintrag.remote) teile.push(String(eintrag.remote));
      let zeile = teile.join(' · ');
      const fehler = String(eintrag.fehler || '').split('\n')[0].trim();
      if (fehler) zeile += ' · ' + (fehler.length > 160 ? fehler.slice(0, 159) + '…' : fehler);
      return zeile;
    }

    /**
     * Die Lücken der Sichtbarkeit aus `/board/data`: ein öffentliches Ding,
     * das auf ein privates verweist. Andere Lücken (fehlende Repositories)
     * gehören an ihre Stelle und stehen hier nicht.
     */
    function sichtbarkeitsLuecken(daten) {
      const liste = daten && Array.isArray(daten.luecken) ? daten.luecken : [];
      return liste.filter((eintrag) => eintrag && eintrag.art === 'sichtbarkeit');
    }

    /** Eine solche Lücke als eine Zeile mit beiden Namen. */
    function sichtbarkeitsZeile(eintrag) {
      const name = (wert) => {
        const eigen = String((wert && wert.name) || '').trim();
        if (eigen) return eigen;
        const pfad = String((wert && wert.pfad) || '').trim();
        return pfad ? (pfad.split('/').pop() || pfad) : 'unbekannt';
      };
      return uebersetze('Öffentlich verweist auf Privates: {0} → {1}',
        [name(eintrag && eintrag.von), name(eintrag && eintrag.auf)]);
    }

    /** Die Sichtbarkeit eines Eintrags als Wort; fehlt sie, bleibt sie leer. */
    function sichtbarkeitsWort(wert) {
      return String(wert || '').trim() === 'privat'
        ? uebersetze('privat')
        : uebersetze('öffentlich');
    }

    /**
     * Zwei Programmfassungen schreiben nicht gegeneinander. Die Ablage nennt
     * ihre Fassung, das Programm seine eigene; sind sie verschieden, sagt die
     * Seite es mit beiden Zahlen. Ist die Ablage neuer, schreibt das Board
     * nicht, bis es aktualisiert ist; ist sie älter, braucht sie den Umzug.
     */
    function formatHinweis(format, formatAblage) {
      if (format == null || formatAblage == null) return '';
      if (Number(formatAblage) > Number(format)) {
        return uebersetze('Die Ablage ist neuer: Format {0}, dieses Board kennt Format {1}. Dieses Board schreibt nicht, bis es aktualisiert ist.', [formatAblage, format]);
      }
      if (Number(formatAblage) < Number(format)) {
        return uebersetze('Die Ablage ist älter: Format {0}, dieses Board schreibt Format {1}. Die Ablage braucht den Umzug.', [formatAblage, format]);
      }
      return '';
    }

    // Während eines Zuges bleibt der Zeiger, was er ist. Ohne das springt er
    // über Knöpfen und Chips um, sobald die Kiste unter ihm wegrutscht. Der
    // Stil hängt an einer festen Kennung, nicht an einer Variablen — ein
    // Neuzeichnen darf ihn nicht verlieren.
    /** Hält den Mauszeiger während eines Zuges fest, damit er nicht umspringt. */
    function zeigerFest(art) {
      if (typeof document === 'undefined' || !document.head) return;
      const kennung = 'dsh-board-zeiger';
      const alt = document.getElementById(kennung);
      if (!art) {
        if (alt) alt.remove();
        return;
      }
      const text = 'body, body * { cursor: ' + art + ' !important; }';
      if (alt) { alt.textContent = text; return; }
      const stil = document.createElement('style');
      stil.id = kennung;
      stil.textContent = text;
      document.head.appendChild(stil);
    }

    // --- Stile -------------------------------------------------------------

    // Abstände: der Takt ist 4 / 8 / 12 / 16. Er steht hier als Maßstab für
    // neue Stellen, wird aber nicht über den Bestand gezogen: Ohne Browser
    // wären die 1-px-Verschiebungen nicht prüfbar, und der Gewinn ist kleiner
    // als das Risiko. Schrift und Radien folgen dagegen der Skala darunter.

    const S = {
      page: {
        padding: '22px 26px', height: '100%', boxSizing: 'border-box',
        fontFamily: 'var(--dsw-font-family)',
        color: 'var(--dsw-alias-label-primary)',
        display: 'flex', flexDirection: 'column',
      },
      kopfFest: { flex: 'none', marginBottom: '14px' },
      // Die Kopfzeile: links das Board, in der Mitte der Titel, rechts die
      // Menschen und die Werkzeuge der Fläche. Drei Gruppen, dazwischen
      // Trenner statt Kästen; die Linie unten trennt sie von der Statuszeile.
      kopfZeile: {
        display: 'flex', alignItems: 'center', gap: '12px', minHeight: '44px',
        boxSizing: 'border-box', flexWrap: 'wrap', rowGap: '6px',
        paddingBottom: '6px',
        borderBottom: '1px solid var(--dsw-alias-border-l1)',
      },
      kopfLinks: {
        display: 'flex', alignItems: 'center', gap: '8px',
        flex: '0 1 auto', minWidth: 0, flexWrap: 'wrap',
      },
      kopfMitte: {
        display: 'flex', alignItems: 'center', gap: '10px',
        flex: '1 1 auto', minWidth: 0, flexWrap: 'wrap',
      },
      kopfRechts: {
        display: 'flex', alignItems: 'center', gap: '8px',
        flex: '1 1 auto', minWidth: 0, flexWrap: 'wrap',
        justifyContent: 'flex-end',
      },
      // Der Titel der Mitte: eine Zeile, die notfalls mit Auslassung endet,
      // damit der Dateien-Knopf an ihrem rechten Rand stehen bleibt.
      kopfTitel: {
        fontSize: '18px', fontWeight: 600, minWidth: 0,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      },
      // Ein Trenner zwischen zwei Gruppen: eine Linie, kein Kasten.
      trenner: {
        width: '1px', height: '20px', flex: 'none',
        background: 'var(--dsw-alias-border-l1)',
      },
      // Die Statuszeile sammelt unter der Kopfzeile, was der Seite zu sagen
      // ist. Fehlt alles, wird sie gar nicht gerendert.
      statusZeile: {
        display: 'flex', flexDirection: 'column', gap: '2px',
        paddingTop: '6px',
      },
      // Die Menschen am Board als eine Reihe von Chips — ohne Überschrift;
      // den Gruppennamen trägt das `aria-label` am Container.
      mitglieder: {
        display: 'flex', alignItems: 'center', gap: '6px',
        flex: '0 1 auto', minWidth: 0, flexWrap: 'wrap',
      },
      person: {
        display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px',
        fontFamily: 'inherit', padding: '3px 9px', borderRadius: '999px',
        border: '1px solid var(--dsw-alias-border-l1)', background: 'transparent',
        color: 'var(--dsw-alias-label-primary)', cursor: 'pointer',
      },
      personPunkt: {
        width: '9px', height: '9px', borderRadius: '50%', flex: 'none',
        display: 'inline-block', background: 'var(--dsw-alias-border-l2)',
      },
      // Eine Fläche je Person. Die eigene trägt die gewohnte Bedienung; die
      // fremde ist ein Leseblatt: Name und Farbe oben, darunter die Schritte
      // ihres Workflows, ohne Felder zum Ändern.
      // Die eigene Fläche ist eine Karte wie die fremden: Kopf, Rand und
      // Radius. Darin liegt das Brett mit eigenem, ruhigerem Ton.
      eigeneFlaeche: {
        marginTop: '14px', padding: '10px 12px 14px', boxSizing: 'border-box',
        borderRadius: '12px', border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-1)',
      },
      flaechenKopf: {
        display: 'flex', alignItems: 'center', gap: '7px', margin: '0 0 8px',
        fontSize: '13px',
      },
      flaechenName: { fontWeight: 600 },
      fremdFlaeche: {
        marginTop: '26px', boxSizing: 'border-box', borderRadius: '12px',
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-1)', padding: '14px 16px 18px',
      },
      fremdKopf: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' },
      fremdName: { fontSize: '18px', fontWeight: 600 },
      fremdHinweis: {
        fontSize: '12px', color: 'var(--dsw-alias-label-secondary)', lineHeight: '1.4',
      },
      fremdWorkflowTitel: {
        marginTop: '12px', fontSize: '12px', fontWeight: 600,
        color: 'var(--dsw-alias-label-secondary)',
      },
      fremdReihe: {
        display: 'flex', gap: '10px', alignItems: 'flex-start', flexWrap: 'wrap',
        marginTop: '8px',
      },
      fremdKarte: {
        width: '240px', boxSizing: 'border-box', borderRadius: '8px',
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-1)', overflow: 'hidden',
        boxShadow: 'var(--dsw-elevation-soft)',
      },
      fremdKarteKopf: {
        display: 'block', width: '100%', boxSizing: 'border-box', textAlign: 'left',
        fontFamily: 'inherit', fontSize: '13px', fontWeight: 600, lineHeight: '1.35',
        padding: '8px 10px', border: 'none', background: 'color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent)',
        color: 'var(--dsw-alias-label-primary)', cursor: 'pointer',
        borderBottom: '1px solid var(--dsw-alias-border-l1)',
      },
      fremdKarteKoerper: {
        display: 'flex', flexDirection: 'column', gap: '6px', padding: '8px 10px',
      },
      fremdKarteFuss: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary)' },
      fremdVorhaben: {
        marginTop: '8px', fontSize: '12px', lineHeight: '1.5',
        color: 'var(--dsw-alias-label-secondary)',
      },
      // Ein fremdes Vorhaben lässt sich öffnen und lesen — der Knopf führt zu
      // seinen Dateien, nicht zu Feldern zum Ändern.
      fremdVorhabenKnopf: {
        display: 'block', width: '100%', boxSizing: 'border-box', textAlign: 'left',
        marginTop: '4px', padding: '6px 8px', borderRadius: '8px',
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-1)', fontFamily: 'inherit',
        fontSize: '12px', lineHeight: '1.4',
        color: 'var(--dsw-alias-label-primary)', cursor: 'pointer',
      },
      // Ein Beitrag an einer Station: der Name dessen, der ihn geschrieben hat,
      // und seine Notiz. Ein Klick öffnet Notiz und vorgeschlagene Fassungen.
      beitragKnopf: {
        display: 'block', width: '100%', boxSizing: 'border-box', textAlign: 'left',
        marginTop: '6px', padding: '6px 9px', borderRadius: '6px',
        border: '1px dashed var(--dsw-alias-border-l2)',
        background: 'color-mix(in srgb, var(--dsw-alias-label-primary) 4%, transparent)', fontFamily: 'inherit',
        color: 'var(--dsw-alias-label-primary)', cursor: 'pointer',
      },
      beitragKopf: { fontSize: '12px', fontWeight: 600 },
      beitragNotiz: {
        marginTop: '2px', fontSize: '12px', lineHeight: 1.2,
        color: 'var(--dsw-alias-label-secondary)', overflow: 'hidden',
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
      },
      beitragDateien: {
        marginTop: '2px', fontSize: '12px', lineHeight: 1.35,
        color: 'var(--dsw-alias-label-secondary)',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      },
      beitragInhalt: { fontSize: '13px', lineHeight: 1.6, whiteSpace: 'pre-wrap' },
      personPanel: {
        marginTop: '10px', padding: '10px 12px', borderRadius: '8px',
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-1)',
        display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap',
      },
      farbGitter: {
        display: 'grid', gridTemplateColumns: 'repeat(10, 16px)', gap: '4px',
        alignItems: 'center',
      },
      projektForm: {
        margin: '0 0 6px', padding: '8px', borderRadius: '8px',
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent)',
        display: 'flex', flexDirection: 'column', gap: '6px',
      },
      farbPunkt: {
        width: '16px', height: '16px', padding: 0, borderRadius: '50%',
        boxSizing: 'border-box', border: '2px solid transparent', cursor: 'pointer',
      },
      hostZeile: {
        display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px',
        fontSize: '12px', color: 'var(--dsw-alias-label-secondary)',
      },
      title: { fontSize: '18px', fontWeight: 600, margin: '0 0 4px' },
      sub: { fontSize: '13px', color: 'var(--dsw-alias-label-secondary)', margin: 0 },
      // Die Board-Leiste: welches Board offen ist, welche es sonst noch gibt.
      // Das Verzeichnis liegt über der Seite, damit es nichts verschiebt.
      boardLeiste: {
        position: 'relative', display: 'flex', alignItems: 'center',
        gap: '8px', minWidth: 0,
      },
      boardWahl: {
        display: 'inline-flex', alignItems: 'center', gap: '6px',
        fontSize: '12px', fontFamily: 'inherit', padding: '3px 9px',
        borderRadius: '999px', border: '1px solid var(--dsw-alias-border-l1)',
        background: 'transparent', color: 'var(--dsw-alias-label-primary)', cursor: 'pointer',
      },
      boardPanel: {
        position: 'absolute', top: '100%', left: 0, marginTop: '6px', zIndex: 30,
        width: '460px', maxWidth: 'calc(100vw - 60px)',
        maxHeight: 'calc(100vh - 90px)', overflowY: 'auto',
        padding: '7px',
        borderRadius: '8px', border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-1)',
        boxShadow: 'var(--dsw-elevation-panel)',
      },
      boardEintrag: {
        display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
        padding: '6px 8px', borderRadius: '6px', border: '1px solid transparent',
        background: 'transparent', color: 'var(--dsw-alias-label-primary)',
        fontFamily: 'inherit', fontSize: '12px', textAlign: 'left', cursor: 'pointer',
      },
      boardMeta: {
        marginInlineStart: 'auto', fontSize: '12px',
        color: 'var(--dsw-alias-label-secondary)', whiteSpace: 'nowrap',
      },
      // Das Hauptboard fehlt noch: die Zeile steht in der Board-Leiste, der
      // Knopf holt es erneut.
      hauptboardFehlt: {
        display: 'inline-flex', alignItems: 'center', gap: '6px',
        marginInlineStart: 'auto', fontSize: '12px', whiteSpace: 'nowrap',
        color: 'var(--dsw-alias-label-secondary)',
      },
      // Die Anzeige der Boards: je Board eine Zeile mit Name, Art, Form,
      // Besitzer, Stand und Verweisen; darunter die Knöpfe.
      boardAnzeigeTitel: {
        fontSize: '12px', fontWeight: 400, letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: 'var(--dsw-alias-label-secondary)', opacity: 0.85,
        padding: '2px 6px 5px',
      },
      boardZeile: {
        display: 'flex', flexDirection: 'column', gap: '3px',
        padding: '6px 8px', borderRadius: '6px',
        border: '1px solid transparent',
      },
      boardZeileAktiv: {
        background: 'color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent)',
        borderColor: 'var(--dsw-alias-border-l1)',
      },
      boardKopf: { display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 },
      boardName: {
        fontSize: '12px', fontWeight: 600, overflow: 'hidden',
        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      },
      boardArt: {
        fontSize: '12px', padding: '1px 6px', borderRadius: '999px',
        border: '1px solid var(--dsw-alias-border-l1)',
        color: 'var(--dsw-alias-label-secondary)', whiteSpace: 'nowrap',
      },
      boardKnoepfe: { display: 'flex', gap: '4px', marginInlineStart: 'auto' },
      boardZeileMeta: {
        fontSize: '12px', lineHeight: 1.45,
        color: 'var(--dsw-alias-label-secondary)',
      },
      boardTrenner: {
        margin: '6px 0', borderTop: '1px solid var(--dsw-alias-border-l1)',
      },
      boardForm: {
        display: 'flex', flexDirection: 'column', gap: '6px', padding: '6px 4px 2px',
      },
      boardHinweis: {
        margin: 0, fontSize: '12px', lineHeight: 1.45,
        color: 'var(--dsw-alias-label-secondary)',
      },
      boardFehler: { margin: 0, fontSize: '12px', lineHeight: 1.4, color: 'var(--dsw-alias-state-error-primary)' },
      // Die Seite ohne Board: Identität eintragen, dann das erste Board.
      startSeite: {
        height: '100%', overflow: 'auto', boxSizing: 'border-box',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '28px',
        color: 'var(--dsw-alias-label-primary)',
      },
      startKarte: {
        width: '100%', maxWidth: '540px', padding: '24px 26px',
        borderRadius: '12px', border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-1)',
      },
      startTitel: { fontSize: '22px', fontWeight: 600, margin: '0 0 6px' },
      startText: {
        margin: '0 0 18px', fontSize: '13px', lineHeight: 1.6,
        color: 'var(--dsw-alias-label-secondary)',
      },
      startFeld: { display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '12px' },
      startMarke: {
        fontSize: '12px', letterSpacing: '0.04em', textTransform: 'uppercase',
        color: 'var(--dsw-alias-label-secondary)', opacity: 0.85,
      },
      startReihe: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' },
      startKnopf: {
        fontSize: '13px', fontFamily: 'inherit', padding: '7px 14px',
        borderRadius: '6px', border: '1px solid var(--board-akzent, var(--dsw-alias-brand-primary))',
        background: 'var(--board-akzent, var(--dsw-alias-brand-primary))',
        color: 'var(--dsw-alias-label-primary-inverted)', cursor: 'pointer',
      },
      startZweit: {
        fontSize: '12px', fontFamily: 'inherit', padding: '6px 12px',
        borderRadius: '6px', border: '1px solid var(--dsw-alias-border-l1)',
        background: 'transparent', color: 'var(--dsw-alias-label-secondary)', cursor: 'pointer',
      },
      startTrenner: {
        margin: '18px 0 12px', paddingTop: '14px', fontSize: '12px',
        borderTop: '1px solid var(--dsw-alias-border-l1)',
        color: 'var(--dsw-alias-label-secondary)',
      },
      // Der Hinweis auf zwei verschiedene Programmfassungen: sichtbar, aber
      // nicht lauter als der Stand des Abgleichs darunter.
      formatWarnung: {
        margin: '8px 0 0', padding: '7px 10px', borderRadius: '6px',
        border: '1px solid var(--dsw-alias-state-warn-primary)',
        background: 'color-mix(in srgb, var(--dsw-alias-state-warn-primary) 10%, transparent)',
        color: 'var(--dsw-alias-state-warn-label)',
        fontSize: '12px', lineHeight: 1.45,
      },
      // Ein öffentliches Ding verweist auf ein privates: dieselbe Form wie die
      // Formatwarnung, nur in der Farbe eines Fehlers.
      sichtbarkeitWarnung: {
        margin: '6px 0 0', padding: '6px 9px', borderRadius: '6px',
        border: '1px solid var(--dsw-alias-state-error-primary)',
        background: 'color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent)',
        color: 'var(--dsw-alias-state-error-primary)',
        fontSize: '12px', lineHeight: 1.45,
      },
      // Die Befehle zum Kopieren, wenn kein Token da ist.
      befehle: {
        margin: '6px 0', padding: '7px 9px', borderRadius: '6px',
        background: 'var(--dsw-alias-bg-layer-1)',
        border: '1px solid var(--dsw-alias-border-l1)',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: '12px', lineHeight: 1.5, whiteSpace: 'pre-wrap',
        wordBreak: 'break-all', color: 'var(--dsw-alias-label-primary)',
      },
      // Die Ports sitzen mittig auf der Titelzeile; ihr Mittelpunkt liegt genau
      // auf dem Rand der Kiste (12px breit, 6px außen), damit die Schnur dort
      // ansetzt, wo der Punkt sitzt.
      portEin: {
        position: 'absolute', left: '-6px', top: '14px', width: '12px', height: '12px',
        boxSizing: 'border-box', borderRadius: '50%',
        border: '2px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-1)',
      },
      portAus: {
        position: 'absolute', right: '-6px', top: '14px', width: '12px', height: '12px',
        boxSizing: 'border-box', borderRadius: '50%',
        border: '2px solid var(--board-akzent, var(--dsw-alias-brand-primary))',
        background: 'var(--dsw-alias-bg-layer-1)', cursor: 'crosshair', touchAction: 'none',
      },
      // Der Knopf sitzt seit der neuen Kopfzeile rechts neben der Suche.
      // Geblieben ist „Alles zeigen“; die Reiter für Bibliothek und Verlauf
      // gibt es nicht mehr — sie stehen in der Schiene links.
      reiter: {
        fontSize: '12px', fontFamily: 'inherit', padding: '4px 10px',
        borderRadius: '6px', border: '1px solid transparent', background: 'transparent',
        color: 'var(--dsw-alias-label-secondary)', cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', gap: '6px',
      },
      // Der Körper der Seite: links die Schiene, daneben das offene Dock, der
      // Rest gehört der Fläche. `minHeight: 0` lässt den Inhalt darin rollen,
      // statt die Seite zu strecken; die Höhe ändert sich nicht mit dem Dock.
      koerper: { display: 'flex', flex: 1, minHeight: 0 },
      // Die Schiene: zwei Orte, immer sichtbar. Sie nimmt ihre Höhe aus dem
      // Körper und bleibt stehen, während die Fläche rechts rollt.
      schiene: {
        width: '72px', flex: 'none', boxSizing: 'border-box',
        display: 'flex', flexDirection: 'column', gap: '4px', padding: '6px 4px',
        borderRight: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-1)',
      },
      schienenKnopf: {
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
        padding: '8px 2px', borderRadius: '6px', border: '1px solid transparent',
        background: 'transparent',
        fontFamily: 'inherit', fontSize: '12px', cursor: 'pointer',
      },
      // Der offene Ort ist abgesetzt, nicht nur eingefärbt: der Hintergrund
      // nimmt ihm die Fläche der Schiene, die Schrift tritt hervor.
      schienenKnopfAktiv: {
        borderColor: 'var(--dsw-alias-border-l1)',
        background: 'color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent)',
      },
      // Die Suche nach einer Station: ein schmales Feld in der Kopfzeile, die
      // Treffer liegen als Liste darunter. Das Label bleibt für Vorleser da,
      // nimmt aber keine Höhe weg.
      stationsSuche: { position: 'relative', flex: '0 1 auto', minWidth: 0 },
      nurVorleser: {
        position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px',
        overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0,
      },
      stationsListe: {
        position: 'absolute', top: '100%', left: 0, zIndex: 20, width: '240px',
        marginTop: '4px', padding: '4px', boxSizing: 'border-box',
        display: 'flex', flexDirection: 'column', gap: '2px',
        border: '1px solid var(--dsw-alias-border-l1)', borderRadius: '8px',
        background: 'var(--dsw-alias-bg-layer-1)',
        boxShadow: 'var(--dsw-elevation-panel)',
      },
      stationsTreffer: {
        display: 'block', width: '100%', boxSizing: 'border-box', textAlign: 'left',
        font: 'inherit', fontSize: '12px', padding: '6px 8px', borderRadius: '6px',
        border: '1px solid transparent', background: 'transparent',
        color: 'var(--dsw-alias-label-primary)', cursor: 'pointer',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      },
      stationsLeer: {
        padding: '6px 8px', fontSize: '12px',
        color: 'var(--dsw-alias-label-secondary)',
      },
      // Das Dock steht neben der Schiene, nicht über der Fläche: 360 px breit,
      // bei schmalem Fenster auf `100vw - 124px` begrenzt (2 × 26 Seitenrand
      // und die 72 px der Schiene). Volle Höhe, nur eine Kante trennt. Der
      // Inhalt rollt in `bibInhalt`, der Kopf bleibt stehen. Kein `position`,
      // kein `margin`, kein Radius — die Kante ist die Trennung.
      dock: {
        width: 'min(360px, calc(100vw - 124px))', flex: 'none', minHeight: 0,
        boxSizing: 'border-box', display: 'flex', flexDirection: 'column',
        padding: '10px 12px',
        borderRight: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-1)',
      },
      // Das eine rechte Dock: Es zeigt die offene Station, das Gespräch oder
      // beide. 380 px Vorgabe, bei schmalem Fenster begrenzt; die Breite im
      // Aufbau setzt `spaltenBreite`. Volle Höhe, nur eine Kante trennt.
      // Kein `position`, kein `margin`, kein Radius.
      dockRechts: {
        // 133 = 72 px Schiene + 9 px Griff + 2 × 26 px Seitenrand. Damit
        // endet 72 + 9 + (100vw - 133) genau bei 100vw - 52, also vor dem
        // rechten Rand; der 9-px-Griff liegt in der Reserve.
        width: 'min(380px, calc(100vw - 133px))', flex: 'none', minHeight: 0,
        boxSizing: 'border-box', display: 'flex', flexDirection: 'column',
        padding: '10px 12px',
        borderLeft: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-1)',
      },
      // Der Kopf des Stationsdocks: Name und Fassung stehen nebeneinander.
      dockTitel: {
        display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '6px',
        margin: 0, fontSize: '14px', fontWeight: 600, lineHeight: 1.3,
        color: 'var(--dsw-alias-label-primary)',
      },
      // Die Fassung neben dem Namen — auf der Karte und im Dock dieselbe.
      fassung: {
        flex: 'none', alignSelf: 'center', fontSize: '12px', lineHeight: 1.2,
        color: 'var(--dsw-alias-label-secondary)',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      },
      bibInhalt: { flex: 1, minHeight: 0, overflow: 'auto' },
      bibKopf: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' },
      bibReihe: { display: 'flex', gap: '8px', alignItems: 'stretch', flexWrap: 'wrap' },
      // Die Bibliothek zeigt dieselbe Kiste in klein: oben der Name, darunter
      // die Fläche. Was darin liegt, sagt die zweite Zeile.
      bibKarte: {
        display: 'flex', flexDirection: 'column', width: '132px', boxSizing: 'border-box',
        borderRadius: '8px', border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-1)', cursor: 'grab',
        overflow: 'hidden', boxShadow: 'var(--dsw-elevation-soft)',
      },
      bibReiter: {
        display: 'block', width: '100%', boxSizing: 'border-box', textAlign: 'left',
        padding: '4px 7px', border: 'none',
        borderBottom: '1px solid var(--dsw-alias-border-l1)',
        background: 'color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent)', fontFamily: 'inherit',
        fontSize: '12px', fontWeight: 600, lineHeight: '1.3',
        color: 'var(--dsw-alias-label-primary)', cursor: 'pointer',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      },
      bibFlaeche: {
        flex: 1, minHeight: '26px', boxSizing: 'border-box', padding: '4px 7px',
        fontSize: '12px', lineHeight: '1.3', cursor: 'grab',
        color: 'var(--dsw-alias-label-secondary)',
      },
      // Die Bibliothek der Fassung 2: drei Abschnitte, je eine Reihe Karten.
      // Ein Klick öffnet die Einzelheit unter dem Abschnitt.
      bibAbschnitt: { marginTop: '14px' },
      bibAbschnittKopf: {
        display: 'flex', alignItems: 'baseline', gap: '8px', margin: '0 0 6px',
      },
      bibAbschnittTitel: {
        fontSize: '12px', fontWeight: 700, letterSpacing: '0.05em',
        textTransform: 'uppercase', color: 'var(--dsw-alias-label-secondary)',
      },
      bibKarteKlick: {
        display: 'flex', flexDirection: 'column', width: '184px', boxSizing: 'border-box',
        borderRadius: '8px', border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-1)', cursor: 'pointer',
        overflow: 'hidden', boxShadow: 'var(--dsw-elevation-soft)',
        textAlign: 'left', fontFamily: 'inherit', padding: 0,
      },
      bibKarteOffen: { borderColor: 'var(--board-akzent, var(--dsw-alias-brand-primary))' },
      bibEinzelheit: {
        marginTop: '8px', padding: '10px 12px', maxWidth: '760px',
        border: '1px solid var(--dsw-alias-border-l1)', borderRadius: '8px',
        background: 'var(--dsw-alias-bg-layer-1)',
      },
      bibEinzelheitKopf: {
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: '10px', marginBottom: '6px',
      },
      bibEinzelheitTitel: { fontSize: '13px', fontWeight: 600 },
      bibFeld: { fontSize: '12px', lineHeight: 1.5 },
      bibPfad: {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: '12px', lineHeight: 1.45, wordBreak: 'break-all',
      },
      bibDateien: {
        margin: '2px 0 0', padding: 0, listStyle: 'none',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: '12px', lineHeight: 1.5, maxHeight: '120px', overflow: 'auto',
        color: 'var(--dsw-alias-label-secondary)',
      },
      // Eine Kiste hat zwei Teile: oben die Titelzeile mit dem Namen, unten
      // die Fläche für das, was gerade darin liegt. Die Trennlinie macht den
      // Unterschied sichtbar, auch wenn unten nichts liegt.
      karte: {
        boxSizing: 'border-box',
        display: 'flex', flexDirection: 'column',
        borderRadius: '12px', minHeight: '240px',
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-1)',
        boxShadow: 'var(--dsw-elevation-soft)',
      },
      karteKopf: {
        display: 'flex', alignItems: 'flex-start', gap: '6px',
        minHeight: '34px', boxSizing: 'border-box',
        padding: '7px 10px', borderBottom: '1px solid var(--dsw-alias-border-l1)',
        background: 'color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent)', userSelect: 'none',
        borderTopLeftRadius: '12px', borderTopRightRadius: '12px',
      },
      // Der Name steht auf der Fläche, deren Kartenhöhe KARTEN_HOEHE rechnet:
      // eng gesetzt und auf zwei Zeilen begrenzt, damit auch ein langer Name
      // die Titelzeile nicht sprengt.
      karteName: {
        flex: '0 1 auto', minWidth: 0, padding: 0, margin: 0, border: 'none',
        background: 'transparent', fontFamily: 'inherit', fontSize: '13px',
        fontWeight: 600, lineHeight: '1.2', maxHeight: '2.4em',
        textAlign: 'left', cursor: 'pointer',
        overflow: 'hidden', color: 'var(--dsw-alias-label-primary)',
      },
      karteNameAktiv: { color: 'var(--board-akzent, var(--dsw-alias-brand-primary))' },
      // Der Griff: die freie Fläche der Titelzeile neben dem Namen. Hier zieht
      // die Kiste, hier öffnet ein Klick nichts — das ist der Unterschied
      // zwischen Bewegen und Bearbeiten.
      griff: {
        flex: 1, alignSelf: 'stretch', display: 'flex', alignItems: 'center',
        minWidth: '20px', margin: '-7px 0', cursor: 'grab', touchAction: 'none',
      },
      griffPunkte: { display: 'block', color: 'var(--dsw-alias-label-secondary)', opacity: 0.5 },
      // Die Fläche unter der Titelzeile: Klick auf eine leere Stelle öffnet
      // den Schritt, Klick auf ein Vorhaben zeigt dessen Stand.
      karteKoerper: {
        display: 'flex', flexDirection: 'column', gap: '6px', flex: 1,
        minHeight: '200px', boxSizing: 'border-box', padding: '10px',
        borderBottomLeftRadius: '12px', borderBottomRightRadius: '12px',
        cursor: 'pointer',
      },
      // Die Einstellungen in der aufgeblähten Station: Beschriftung über Feld.
      formular: { display: 'flex', flexDirection: 'column', gap: '8px' },
      feldBlock: { display: 'flex', flexDirection: 'column', gap: '3px' },
      feldTitel: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary)' },
      // Die geöffnete Station zeigt zuerst, was eingestellt ist: dieselbe
      // Beschriftung wie im Formular, darunter der Wert statt eines Feldes.
      anzeige: { display: 'flex', flexDirection: 'column', gap: '10px' },
      anzeigeWert: {
        fontSize: '13px', lineHeight: '1.45', whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere', color: 'var(--dsw-alias-label-primary)',
      },
      anzeigeFuss: {
        display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px',
        marginTop: '4px', paddingTop: '10px',
        borderTop: '1px solid var(--dsw-alias-border-l1)',
      },
      wahl: {
        fontSize: '12px', fontFamily: 'inherit', padding: '4px 9px', borderRadius: '6px',
        border: '1px solid var(--dsw-alias-border-l1)', background: 'transparent',
        color: 'var(--dsw-alias-label-secondary)', cursor: 'pointer',
      },
      wahlAktiv: {
        borderColor: 'var(--board-akzent, var(--dsw-alias-brand-primary))',
        color: 'var(--board-akzent, var(--dsw-alias-brand-primary))',
        background: 'color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent)', fontWeight: 600,
      },
      settingHinweis: {
        fontSize: '12px', color: 'var(--dsw-alias-label-secondary)', marginTop: '6px',
      },
      // Der Verlauf des Boards: eine Fassung je Zeile, die neueste oben.
      fassungen: {
        marginTop: '8px', maxHeight: '220px', overflowY: 'auto',
        display: 'flex', flexDirection: 'column',
      },
      fassungZeile: {
        padding: '5px 0', borderBottom: '1px solid var(--dsw-alias-border-l1)',
      },
      fassungKopf: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary)' },
      fassungWas: {
        fontSize: '12px', lineHeight: '1.35', color: 'var(--dsw-alias-label-primary)',
      },
      // Das Ziel beim Ziehen eines Schritts: ein Plus mitten auf der Station,
      // darunter das eine Wort, das die Richtung sagt. Es fängt keine Maus ab —
      // das Ablegen gilt der Station, auf der es liegt.
      kartePlusZiel: {
        position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
        width: '58px', height: '58px', boxSizing: 'border-box', borderRadius: '50%',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: '1px', zIndex: 5, pointerEvents: 'none',
        background: 'var(--board-akzent, var(--dsw-alias-brand-primary))',
        color: 'var(--dsw-alias-label-primary-inverted)',
        boxShadow: 'var(--dsw-elevation-prominent)',
        fontSize: '22px', lineHeight: 1, fontWeight: 700,
      },
      kartePlusZielText: { fontSize: '12px', fontWeight: 600, opacity: 0.9, lineHeight: 1 },
      kartePlus: {
        fontSize: '12px', fontFamily: 'inherit', padding: '4px 10px', borderRadius: '6px',
        border: '1px dashed var(--dsw-alias-border-l2)', background: 'transparent',
        color: 'var(--dsw-alias-label-secondary)', cursor: 'pointer',
      },
      leer: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary)', opacity: 0.5 },
      // Die leere Fläche: ein Satz in ihrer Mitte, kein Knopf — der Weg steht
      // im Satz. `pointerEvents` aus, damit der Satz kein Ablegen abfängt.
      leerFlaeche: {
        position: 'absolute', inset: 0, display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: '24px',
        pointerEvents: 'none',
      },
      leerSatz: {
        maxWidth: '440px', margin: 0, textAlign: 'center',
        fontSize: '14px', lineHeight: '1.5',
        color: 'var(--dsw-alias-label-secondary)',
      },
      chip: {
        display: 'block', width: '100%', boxSizing: 'border-box', textAlign: 'left',
        marginBottom: '4px', padding: '5px 9px', borderRadius: '6px',
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)',
        cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit', lineHeight: 1.35,
      },
      mini: {
        width: '22px', minHeight: '20px', padding: 0, marginRight: '4px', lineHeight: 1,
        fontSize: '12px', fontFamily: 'inherit', borderRadius: '6px', cursor: 'pointer',
        border: '1px solid var(--dsw-alias-border-l1)', background: 'transparent',
        color: 'var(--dsw-alias-label-secondary)',
      },
      miniAus: { opacity: 0.35, cursor: 'default' },
      // Grün, wenn der Schritt sein Ergebnis hat: gefüllt, damit der Unterschied
      // in hellem und dunklem Theme gleich deutlich ist.
      miniGruen: {
        background: 'var(--dsw-alias-state-success-primary)',
        borderColor: 'var(--dsw-alias-state-success-primary)',
        color: 'var(--dsw-alias-label-primary-foreground)', fontWeight: 600,
      },
      klein: {
        fontSize: '12px', fontFamily: 'inherit', padding: '4px 9px', minHeight: '28px',
        borderRadius: '6px',
        cursor: 'pointer', border: '1px solid var(--dsw-alias-border-l1)',
        background: 'transparent', color: 'var(--dsw-alias-label-secondary)',
      },
      form: {
        margin: '0 0 10px', padding: '8px', borderRadius: '6px',
        border: '1px dashed var(--dsw-alias-border-l2)',
      },
      knoepfeKlein: { display: 'flex', alignItems: 'center', margin: '0 0 8px' },
      // Die Herkunft am Vorhaben: „Zweig von …“ und „Fork von …“. Der Name des
      // Ursprungs ist ein Knopf, wenn der Ursprung sichtbar ist.
      herkunftZeile: {
        margin: '0 0 6px', fontSize: '12px', lineHeight: 1.45,
        color: 'var(--dsw-alias-label-secondary)',
      },
      herkunftLink: {
        padding: 0, margin: 0, border: 'none', background: 'transparent',
        font: 'inherit', color: 'var(--board-akzent, var(--dsw-alias-brand-primary))',
        textDecoration: 'underline', cursor: 'pointer',
      },
      schliessen: {
        flex: 'none', width: '24px', height: '24px', padding: 0, lineHeight: 1,
        fontSize: '14px', fontFamily: 'inherit', borderRadius: '6px', cursor: 'pointer',
        border: '1px solid var(--dsw-alias-border-l1)', background: 'transparent',
        color: 'var(--dsw-alias-label-secondary)',
      },
      meta: {
        fontSize: '12px', fontWeight: 400,
        color: 'var(--dsw-alias-label-secondary)', margin: '0 0 8px',
      },
      button: {
        fontSize: '13px', fontFamily: 'inherit', padding: '5px 11px', minHeight: '30px',
        borderRadius: '6px',
        border: '1px solid var(--dsw-alias-border-l1)', background: 'var(--dsw-alias-bg-layer-1)',
        color: 'var(--dsw-alias-label-primary)', cursor: 'pointer',
      },
      input: {
        fontSize: '12px', fontFamily: 'inherit', padding: '4px 8px', width: '150px',
        borderRadius: '6px', border: '1px solid var(--board-akzent, var(--dsw-alias-brand-primary))',
        background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)',
      },
      zeilePlus: {
        fontSize: '12px', fontFamily: 'inherit', padding: '4px 10px', borderRadius: '6px',
        border: '1px dashed var(--dsw-alias-border-l2)', background: 'transparent',
        color: 'var(--dsw-alias-label-secondary)', cursor: 'pointer',
      },
      marke: {
        fontSize: '12px', color: 'var(--dsw-alias-label-secondary)', paddingTop: '5px',
        whiteSpace: 'nowrap',
      },
      feld: {
        fontSize: '12px', fontFamily: 'inherit', padding: '5px 8px', width: '100%',
        boxSizing: 'border-box', borderRadius: '6px',
        border: '1px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)',
      },
      flaeche: {
        fontSize: '12px', fontFamily: 'inherit', padding: '6px 8px', width: '100%',
        boxSizing: 'border-box', minHeight: '58px', resize: 'vertical', lineHeight: 1.5,
        borderRadius: '6px', border: '1px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)',
      },
      hinweis: {
        fontSize: '12px', color: 'var(--dsw-alias-label-secondary)', marginTop: '4px',
        lineHeight: 1.4,
      },
      knoepfe: { display: 'flex', gap: '8px', alignItems: 'center' },
      bestaetigung: {
        margin: '0 0 12px', padding: '10px 12px', borderRadius: '8px',
        border: '1px solid var(--board-akzent, var(--dsw-alias-brand-primary))',
        background: 'var(--dsw-alias-bg-layer-1)',
      },
      dateiKnopf: {
        display: 'block', width: '100%', boxSizing: 'border-box', textAlign: 'left',
        marginTop: '6px', padding: '5px 9px', borderRadius: '6px', cursor: 'pointer',
        border: '1px solid', background: 'transparent', fontWeight: 600,
        fontSize: '12px', wordBreak: 'break-all',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      },
      // Ein Dateiname im Satz: Schreibmaschinenschrift, damit er sich vom
      // deutschen Text unterscheidet — so sind zwei fast gleiche Namen zu sehen.
      codeName: {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: '12px', wordBreak: 'break-all',
      },
      // Die Namen, die in einem Dateifeld stehen: einzeln zu sehen, einzeln
      // zu entfernen. Darunter, was sich anbietet.
      feldChips: {
        display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px', alignItems: 'center',
      },
      feldChip: {
        display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 6px',
        borderRadius: '6px', border: '1px solid var(--dsw-alias-border-l1)',
        background: 'transparent', color: 'var(--dsw-alias-label-secondary)',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: '12px',
      },
      feldFolgt: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary)', opacity: 0.75 },
      feldAngebote: { display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' },
      feldAngebot: {
        display: 'inline-flex', alignItems: 'baseline', gap: '5px', padding: '2px 7px',
        borderRadius: '6px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '12px',
        border: '1px dashed var(--dsw-alias-border-l1)', background: 'transparent',
        color: 'var(--dsw-alias-label-secondary)',
      },
      // Die Übergabe zwischen zwei Stationen: was ankommt, was hinausgeht.
      uebergabe: { display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '4px' },
      uebergabeZeile: {
        fontSize: '12px', color: 'var(--dsw-alias-label-secondary)', lineHeight: 1.45,
      },
      uebergabeWarn: { fontSize: '12px', color: 'var(--dsw-alias-state-warn-label)', lineHeight: 1.45 },
      karteWarnung: {
        marginTop: '8px', padding: '5px 8px', borderRadius: '6px',
        border: '1px solid var(--dsw-alias-state-warn-primary)',
        background: 'color-mix(in srgb, var(--dsw-alias-state-warn-primary) 10%, transparent)',
        color: 'var(--dsw-alias-state-warn-label)', fontSize: '12px', lineHeight: 1.4,
      },
      leser: {
        display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0,
        border: '1px solid var(--dsw-alias-border-l1)', borderRadius: '8px',
        background: 'var(--dsw-alias-bg-layer-1)',
      },
      leserUnten: { flex: '0 0 44%' },
      leserRechts: { flex: '0 0 460px' },
      leserKopf: {
        flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: '10px', padding: '8px 12px',
        borderBottom: '1px solid var(--dsw-alias-border-l1)',
      },
      leserTitel: {
        display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0,
        fontSize: '12px', fontWeight: 600,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      },
      // Wo die Datei liegt: das Vorhaben und die Station. Kleiner und in
      // normaler Schrift — es ist die Auskunft über die Datei, nicht sie selbst.
      leserOrt: {
        fontSize: '12px', fontWeight: 400, fontFamily: 'inherit',
        color: 'var(--dsw-alias-label-secondary)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      },
      leserInhalt: { flex: 1, minHeight: 0, overflow: 'auto', padding: '14px 18px' },
      // Die Dateien eines Vorhabens: eine Spalte neben der Fläche. Sie bleibt
      // offen, während ein Dokument im Leser steht.
      dateien: {
        flex: '0 0 300px', display: 'flex', flexDirection: 'column', minHeight: 0,
        border: '1px solid var(--dsw-alias-border-l1)', borderRadius: '8px',
        background: 'var(--dsw-alias-bg-layer-1)',
      },
      dateienKopf: {
        flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: '8px', padding: '8px 10px',
        borderBottom: '1px solid var(--dsw-alias-border-l1)',
      },
      dateienTitel: {
        fontSize: '12px', fontWeight: 600, minWidth: 0,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      },
      dateienListe: { flex: 1, minHeight: 0, overflow: 'auto', padding: '6px 4px' },
      dateiZeile: {
        display: 'block', width: '100%', boxSizing: 'border-box', textAlign: 'left',
        padding: '4px 8px', border: 'none', borderRadius: '6px',
        background: 'transparent', cursor: 'pointer',
        color: 'var(--dsw-alias-label-primary)', fontSize: '12px',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      },
      // Der Zweig, der hier beginnt: ein ruhiger Bogen, keine Eile.
      zweig: { display: 'flex', flexDirection: 'column', maxWidth: '640px' },
      // Der Vergleich zweier Fassungen: gleiche Zeilen ruhig, Änderungen farbig.
      diff: {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: '12px', lineHeight: 1.5,
        border: '1px solid var(--dsw-alias-border-l1)', borderRadius: '8px', overflow: 'hidden',
      },
      diffZeile: { padding: '0 8px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
      diffWeg: { background: 'color-mix(in srgb, var(--dsw-alias-state-error-primary) 14%, transparent)' },
      diffDazu: { background: 'color-mix(in srgb, var(--dsw-alias-state-success-primary) 16%, transparent)' },
      diffLuecke: {
        color: 'var(--dsw-alias-label-secondary)', fontStyle: 'italic', fontSize: '12px',
        padding: '2px 8px',
      },
      // Der Körper des Gesprächs im rechten Dock. Er zeigt Fragen und
      // Antworten — dasselbe, was später im Transkript steht, nur während es
      // entsteht. Breite und Kante gehören dem Dock, nicht dem Inhalt.
      gespraech: {
        display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0,
      },
      // Der Breitengriff am linken Rand des rechten Docks. Er zieht Dock und
      // Gespräch gemeinsam; einen eigenen Griff der Chatspalte gibt es nicht
      // mehr.
      dockBreiteGriff: {
        flex: 'none', width: '9px', alignSelf: 'stretch', cursor: 'col-resize',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        touchAction: 'none', userSelect: 'none',
      },
      dockBreiteStrich: {
        width: '3px', height: '44px', borderRadius: '6px',
        background: 'var(--dsw-alias-border-l2)',
      },
      // Die Reiterleiste des rechten Docks: sie steht nur, wenn Station und
      // Gespräch gleichzeitig offen sind. Der aktive Reiter trägt die Fläche
      // des Docks, der andere bleibt ruhig.
      dockReiter: {
        flex: 'none', display: 'flex', gap: '2px', marginBottom: '6px',
        borderBottom: '1px solid var(--dsw-alias-border-l1)',
      },
      dockReiterKnopf: {
        display: 'inline-flex', alignItems: 'center', padding: '4px 10px',
        marginBottom: '-1px', border: '1px solid transparent',
        borderBottom: '1px solid transparent', borderRadius: '6px',
        background: 'transparent', fontFamily: 'inherit', fontSize: '12px',
        color: 'var(--dsw-alias-label-secondary)', cursor: 'pointer',
      },
      dockReiterAktiv: {
        color: 'var(--dsw-alias-label-primary)', fontWeight: 600,
        borderColor: 'var(--dsw-alias-border-l1)',
        borderBottomColor: 'var(--dsw-alias-bg-layer-1)',
        background: 'var(--dsw-alias-bg-layer-1)',
      },
      // Der Kopf des rechten Docks. Er gehört dem aktiven Reiter; beide
      // Reiter teilen sich dieselbe Form.
      gespraechKopf: {
        flex: 'none', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: '8px', padding: '8px 10px',
        borderBottom: '1px solid var(--dsw-alias-border-l1)',
      },
      gespraechTitel: {
        fontSize: '12px', fontWeight: 600, wordBreak: 'break-word',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      },
      gespraechInhalt: { flex: 1, minHeight: 0, overflow: 'auto', padding: '10px 12px' },
      gespraechBlock: { margin: '0 0 10px' },
      gespraechFrage: {
        fontSize: '12px', lineHeight: 1.5, padding: '6px 9px', borderRadius: '6px',
        border: '1px solid var(--dsw-alias-border-l1)', whiteSpace: 'pre-wrap',
        wordBreak: 'break-word', color: 'var(--dsw-alias-label-primary)',
      },
      gespraechAntwort: {
        fontSize: '12px', lineHeight: 1.55, wordBreak: 'break-word',
        color: 'var(--dsw-alias-label-primary)',
      },
      // Ein Skill ist in der Werkstatt entstanden: hier steht er zum Eintragen.
      gespraechNeu: {
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px',
        margin: '8px 0 0', padding: '8px 9px', borderRadius: '8px',
        border: '1px dashed var(--dsw-alias-border-l2)',
      },
      gespraechFuss: {
        flex: 'none', padding: '8px 10px',
        borderTop: '1px solid var(--dsw-alias-border-l1)',
      },
      gespraechFeld: {
        width: '100%', boxSizing: 'border-box', resize: 'none',
        padding: '7px 9px', marginBottom: '6px',
        fontFamily: 'inherit', fontSize: '12px', lineHeight: 1.5,
        borderRadius: '6px', border: '1px solid var(--dsw-alias-border-l2)',
        background: 'transparent', color: 'var(--dsw-alias-label-primary)',
      },
      gespraechGriff: {
        height: '12px', margin: '-8px 0 2px', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        cursor: 'ns-resize', touchAction: 'none', userSelect: 'none',
      },
      gespraechGriffStrich: {
        width: '32px', height: '3px', borderRadius: '6px',
        background: 'var(--dsw-alias-border-l2)',
      },
      editor: {
        width: '100%', height: '100%', boxSizing: 'border-box', resize: 'none',
        padding: 0, border: 'none', background: 'transparent',
        color: 'var(--dsw-alias-label-primary)', fontSize: '12px', lineHeight: 1.55,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      },
      mdH1: { fontSize: '18px', margin: '0 0 10px', fontWeight: 600 },
      mdH2: { fontSize: '14px', margin: '16px 0 8px', fontWeight: 600 },
      mdH3: { fontSize: '13px', margin: '14px 0 6px', fontWeight: 600 },
      mdP: { fontSize: '13px', lineHeight: 1.6, margin: '0 0 10px' },
      mdListe: { fontSize: '13px', lineHeight: 1.6, margin: '0 0 10px', paddingLeft: '20px' },
      mdZitat: {
        margin: '0 0 10px', paddingLeft: '10px',
        borderLeft: '2px solid var(--dsw-alias-border-l2)',
        color: 'var(--dsw-alias-label-secondary)', fontSize: '13px', lineHeight: 1.6,
      },
      mdCode: {
        margin: '0 0 12px', padding: '10px 12px', overflow: 'auto', whiteSpace: 'pre-wrap',
        background: 'var(--dsw-alias-bg-layer-2)', borderRadius: '6px',
        fontSize: '12px', lineHeight: 1.5,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      },
      mdKopf: {
        margin: '0 0 14px', padding: '8px 10px', borderRadius: '6px',
        background: 'var(--dsw-alias-bg-layer-2)', fontSize: '12px',
        display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '2px 10px',
        color: 'var(--dsw-alias-label-secondary)',
      },
      mdTrenner: {
        border: 'none', borderTop: '1px solid var(--dsw-alias-border-l1)', margin: '16px 0',
      },
      codeInline: {
        padding: '1px 4px', borderRadius: '6px', fontSize: '12px',
        background: 'var(--dsw-alias-bg-layer-2)',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      },
      link: { color: 'var(--board-akzent, var(--dsw-alias-brand-primary))' },
      mdTabelle: { borderCollapse: 'collapse', fontSize: '12px', margin: '0 0 12px' },
      mdTh: {
        textAlign: 'left', padding: '4px 8px', fontWeight: 600,
        color: 'var(--dsw-alias-label-secondary)',
        borderBottom: '1px solid var(--dsw-alias-border-l1)',
      },
      mdTd: {
        padding: '4px 8px', verticalAlign: 'top',
        borderBottom: '1px solid var(--dsw-alias-border-l1)',
      },
    };

    // --- Stationen und Farben ----------------------------------------------

    // Wie wird an einer Station gearbeitet, und wie kommt das Vorhaben weiter?
    const WIE = [
      { wert: 'skill', text: 'Skill' },
      { wert: 'skript', text: 'Skript' },
      { wert: 'textfeld', text: 'Textfeld' },
      { wert: 'chat', text: 'Chat' },
      { wert: 'datei', text: 'Datei öffnen' },
    ];

    const WEITER = [
      { wert: 'freigabe', text: 'Freigabe' },
      { wert: 'automatisch', text: 'Automatisch, wenn die Ausgabedatei erzeugt ist' },
    ];

    // Zehn Farbtöne, je vier Stufen von zart bis tief. Die Auswahl ist bewusst
    // groß: fein genug, um den eigenen Ton zu treffen, und mit genug zarten
    // Tönen, dass nicht alles kräftig sein muss.
    const FARB_NAMEN = ['Violett', 'Indigo', 'Blau', 'Türkis', 'Petrol',
      'Grün', 'Limettengrün', 'Ocker', 'Orange', 'Rosé'];
    const FARB_STUFEN = ['zartes', 'helles', 'kräftiges', 'tiefes'];
    const PALETTE = [
      ['#c4b5fd', '#a78bfa', '#8b5cf6', '#6d28d9'],
      ['#a5b4fc', '#818cf8', '#6366f1', '#4338ca'],
      ['#93c5fd', '#60a5fa', '#3b82f6', '#1d4ed8'],
      ['#67e8f9', '#22d3ee', '#06b6d4', '#0e7490'],
      ['#5eead4', '#2dd4bf', '#14b8a6', '#0f766e'],
      ['#86efac', '#4ade80', '#22c55e', '#15803d'],
      ['#bef264', '#a3e635', '#84cc16', '#4d7c0f'],
      ['#fde68a', '#fbbf24', '#f59e0b', '#b45309'],
      ['#fdba74', '#fb923c', '#f97316', '#c2410c'],
      ['#fda4af', '#fb7185', '#f43f5e', '#be123c'],
    ];
    const FARBEN_ALLE = PALETTE.flat();

    /** Der deutsche Name einer Farbe aus der Palette. */
    const farbName = (hex) => {
      const i = FARBEN_ALLE.indexOf(hex);
      if (i < 0) return uebersetze('Farbe');
      return uebersetze('{0} {1}', [
        uebersetze(FARB_STUFEN[i % FARB_STUFEN.length]),
        uebersetze(FARB_NAMEN[Math.floor(i / FARB_STUFEN.length)]),
      ]);
    };

    // Ein Vorhaben ohne eigene Farbe bekommt der Reihe nach einen hellen Ton.
    const FARBEN = PALETTE.map((stufen) => stufen[1]);

    /** Die Farbe für ein Vorhaben ohne eigene, reihum aus der Palette. */
    const farbeVon = (index) => FARBEN[((index % FARBEN.length) + FARBEN.length) % FARBEN.length];

    // Eine Farbe als Schrift: mit der Textfarbe des Themas gemischt, damit auch
    // ein zarter Ton hell wie dunkel lesbar bleibt.
    /** Eine Farbe als Schrift, gemischt mit der Textfarbe des Themas. */
    const alsText = (farbe) => 'color-mix(in oklab, ' + farbe + ' 60%, var(--dsw-alias-label-primary))';

    // --- Kleine Helfer -----------------------------------------------------

    // Alles, was am Zeiger hängt, wird gesammelt und höchstens einmal je Bild
    // gezeichnet. Ein Zeiger meldet sich oft hundertmal in der Sekunde; ohne
    // das würde jedes Mal neu gezeichnet, und das ruckelt sichtbar.
    /** Führt eine Zeichenarbeit höchstens einmal je Bild aus. */
    function jeFrame(fn) {
      let geplant = false;
      let werte = [];
      return (...neu) => {
        werte = neu;
        if (geplant) return;
        geplant = true;
        const lauf = () => { geplant = false; fn(...werte); };
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(lauf);
        else setTimeout(lauf, 16);
      };
    }

    /** Eine Liste als Text mit Kommas; alles andere wird leer. */
    const listen = (wert) => (Array.isArray(wert) ? wert.join(', ') : '');

    // --- Daten der Fläche --------------------------------------------------

    /**
     * Die eigene Fläche: die Person mit `ich`, sonst die erste. `/board/data`
     * liefert eine Fläche je Person; die alten Felder `workflow` und `schritte`
     * bleiben lesbar, weil schreibende Routen sie noch in ihrer Antwort tragen.
     */
    function eigeneFlaeche(data) {
      const liste = data && Array.isArray(data.workflows) ? data.workflows : [];
      return liste.find((p) => p && p.ich) || liste[0] || null;
    }

    /** Der Workflow der eigenen Fläche, sonst der alte `workflow` der Antwort. */
    function eigenerWorkflow(data) {
      const eigene = eigeneFlaeche(data);
      if (eigene && Array.isArray(eigene.workflows) && eigene.workflows[0]) {
        return eigene.workflows[0];
      }
      if (data && data.workflow) {
        return { ...data.workflow, schritte: data.schritte || [] };
      }
      return null;
    }

    /** Die Stationen des eigenen Workflows als Liste. */
    function schritteVonFlaeche(data) {
      const workflow = eigenerWorkflow(data);
      return (workflow && workflow.schritte) || [];
    }

    /** Die Positionen des eigenen Workflows als Liste. */
    function positionenVon(data) {
      const workflow = eigenerWorkflow(data);
      return (workflow && workflow.positionen) || [];
    }

    // --- Die automatische Anordnung ------------------------------------------
    // Eine Spalte ist ein Schritt im Workflow, eine Zeile ist eine Linie. Eine
    // Abzweigung ist eine Weiche: die alte Linie gibt ein Drittel der Zeile
    // nach, die Abzweigung steigt zwei Drittel hoch. Die alte bleibt die
    // ruhigere Linie, steht aber nicht still. Wo eine Linie schon steht, weicht
    // die nächste nach oben aus — so überdeckt sich nichts.
    //
    // Gerechnet wird eine Lage, keine gespeicherte: seine eigene Anordnung
    // bleibt in den Daten und ist beim Zurückschalten unverändert da.
    const LAGE_SPALTE = 400; // von einer Spalte zur nächsten
    const LAGE_ZEILE = 420; // von einer Linie zur nächsten
    const LAGE_WEICHE = Math.round(LAGE_ZEILE / 3); // so weit gibt die alte Linie nach
    const LAGE_RAND = 40;

    /** Rechnet aus Stationen und Kanten eine Lage, ohne sie zu speichern. */
    function automatischeLage(positionen, kanten, hoehe) {
      const kartenHoehe = hoehe || 240;
      const lage = {};
      if (!positionen.length) return lage;

      const nach = new Map();
      const vor = new Map();
      positionen.forEach((p) => { nach.set(p.id, []); vor.set(p.id, 0); });
      (kanten || []).forEach((k) => {
        if (!nach.has(k.von) || !nach.has(k.nach) || k.von === k.nach) return;
        nach.get(k.von).push(k.nach);
        vor.set(k.nach, vor.get(k.nach) + 1);
      });

      // Spalte: der längste Weg von einem Anfang her. Was in einem Kreis hängt,
      // erreicht keinen Anfang — es kommt in die erste Spalte statt zu fehlen.
      const spalte = new Map();
      const rest = new Map();
      const schlange = [];
      positionen.forEach((p) => {
        rest.set(p.id, vor.get(p.id));
        if (vor.get(p.id) === 0) { spalte.set(p.id, 0); schlange.push(p.id); }
      });
      while (schlange.length) {
        const id = schlange.shift();
        nach.get(id).forEach((n) => {
          spalte.set(n, Math.max(spalte.get(n) || 0, spalte.get(id) + 1));
          rest.set(n, rest.get(n) - 1);
          if (rest.get(n) === 0) schlange.push(n);
        });
      }
      positionen.forEach((p) => { if (!spalte.has(p.id)) spalte.set(p.id, 0); });

      // Wie weit reicht, was an einer Station hängt? Eine Linie belegt nicht
      // nur ihre eigene Spalte, sondern alles, was hinter ihr liegt.
      const bis = new Map();
      const bandEnde = (id) => {
        if (bis.has(id)) return bis.get(id);
        const eigene = spalte.get(id) || 0;
        bis.set(id, eigene); // gegen Kreise: erst merken, dann weiterlaufen
        let max = eigene;
        (nach.get(id) || []).forEach((k) => { max = Math.max(max, bandEnde(k)); });
        bis.set(id, max);
        return max;
      };

      // Zwei Karten überdecken sich nur in derselben Spalte — der Abstand
      // zwischen den Spalten ist größer als eine Karte.
      let belegt = new Map();
      const frei = (von, ende, y) => {
        for (let c = von; c <= ende; c += 1) {
          const werte = belegt.get(c);
          if (!werte) continue;
          for (let i = 0; i < werte.length; i += 1) {
            if (Math.abs(werte[i] - y) < kartenHoehe) return false;
          }
        }
        return true;
      };

      const besucht = new Set();
      let untergrenze = null;

      // Ein Anfang und alles, was daran hängt. Ein zweiter Anfang ohne
      // Verbindung beginnt unter dem ersten.
      /** Legt eine zusammenhängende Gruppe von Stationen auf die Fläche. */
      const gruppe = (wurzel) => {
        const ids = [];
        let tiefste = 0;
        belegt = new Map();
        /** Legt eine Station samt ihrer Nachfahren in die nächste freie Lage. */
        const legen = (id, y) => {
          if (besucht.has(id)) return;
          besucht.add(id);
          ids.push(id);
          const c0 = spalte.get(id) || 0;
          let yWert = y;
          while (!frei(c0, bandEnde(id), yWert)) yWert -= LAGE_ZEILE;
          lage[id] = { x: LAGE_RAND + c0 * LAGE_SPALTE, y: yWert };
          if (!belegt.has(c0)) belegt.set(c0, []);
          belegt.get(c0).push(yWert);
          if (yWert > tiefste) tiefste = yWert;
          const kinder = nach.get(id) || [];
          kinder.forEach((kind, i) => {
            if (besucht.has(kind)) return;
            // Die alte Linie senkt sich an jeder Weiche um ein Drittel; die
            // Abzweigung steigt zwei Drittel hoch.
            legen(kind, i === 0
              ? yWert + (kinder.length > 1 ? LAGE_WEICHE : 0)
              : yWert - 2 * LAGE_WEICHE);
          });
        };
        legen(wurzel, 0);

        const minY = Math.min(...ids.map((id) => lage[id].y));
        const versatz = untergrenze === null
          ? 0
          : untergrenze + (LAGE_ZEILE - kartenHoehe) - minY;
        if (versatz) ids.forEach((id) => { lage[id].y += versatz; });
        untergrenze = versatz + tiefste + kartenHoehe;
      };

      // Ein Einzelgänger ist hereingezogen und noch an nichts angeschlossen.
      const haengt = (id) => (vor.get(id) || 0) > 0 || (nach.get(id) || []).length > 0;
      const einzelne = positionen.filter((p) => !haengt(p.id));

      positionen.forEach((p) => { if (haengt(p.id) && vor.get(p.id) === 0) gruppe(p.id); });
      // Was übrig bleibt, hängt in einem Kreis — es wird trotzdem gelegt.
      positionen.forEach((p) => { if (haengt(p.id) && !besucht.has(p.id)) gruppe(p.id); });

      // Ein Einzelgänger macht keine neue Zeile auf: er kommt rechts an das
      // Ende der Linie, die am weitesten reicht — dieselbe Höhe, eine Spalte
      // weiter. Dort bleibt er stehen, und wird er angeschlossen, steht er
      // genau dort, wo die Rechnung ihn ohnehin hinstellen würde.
      if (einzelne.length) {
        let freie = 0;
        let rechtester = null;
        positionen.forEach((p) => {
          if (!haengt(p.id)) return;
          freie = Math.max(freie, (spalte.get(p.id) || 0) + 1);
          if (!rechtester || (spalte.get(p.id) || 0) > (spalte.get(rechtester) || 0)) {
            rechtester = p.id;
          }
        });
        const reihe = rechtester ? lage[rechtester].y : 0;
        einzelne.forEach((p, i) => {
          lage[p.id] = { x: LAGE_RAND + (freie + i) * LAGE_SPALTE, y: reihe };
        });
      }

      const minY = Math.min(...positionen.map((p) => lage[p.id].y));
      const hoch = LAGE_RAND - minY;
      positionen.forEach((p) => { lage[p.id].y += hoch; });
      return lage;
    }

    /** Die bearbeitbaren Werte einer Station als Entwurf für das Formular. */
    function schrittEntwurf(data, schrittId) {
      const s = schritteVonFlaeche(data).find((x) => x.id === schrittId);
      if (!s) return null;
      return {
        name: s.name || '',
        inhalt: s.inhalt || '',
        eingang: listen(s.eingang),
        ausgabe: listen(s.ausgabe),
        wieArt: (s.wie && s.wie.art) || 'textfeld',
        wieWert: (s.wie && s.wie.wert) || '',
        weiter: s.weiter || 'freigabe',
      };
    }

    // --- Kleiner Markdown-Renderer -------------------------------------------
    // Reicht für die Dokumente dieses Projekts: Überschriften, Absätze, Listen,
    // Zitate, Code, Trennlinien, fett, kursiv, Code im Text, Links und den
    // Statuskopf aus YAML-Zeilen.

    // Der Pfad eines Links, soweit er in das Vorhaben führt. Anders als
    // `linkName` behält er die Ordner: `produkt/README.md` ist eine Datei im
    // Ordner, nicht eine Datei „README.md“ daneben.
    /** Der Pfad eines Links, soweit er in das Vorhaben führt; behält die Ordner. */
    function linkPfad(ziel) {
      const roh = String(ziel || '').trim();
      if (!roh || roh.startsWith('#') || /^mailto:/i.test(roh)) return '';
      let pfad = roh;
      if (/^file:\/\//i.test(roh)) {
        try { pfad = new URL(roh).pathname; } catch { pfad = roh.slice(7); }
      } else if (/^[a-z][a-z0-9+.-]*:/i.test(roh)) {
        try {
          const u = new URL(roh, window.location.href);
          if (u.origin !== new URL(window.location.href).origin) return '';
          pfad = u.pathname;
        } catch { return ''; }
      }
      pfad = pfad.split('#')[0].split('?')[0];
      let teile;
      try {
        teile = decodeURIComponent(pfad).split('/');
      } catch {
        teile = pfad.split('/');
      }
      const sauber = [];
      for (const teil of teile) {
        const t = teil.trim();
        if (!t || t === '.') continue;
        if (t === '..') { sauber.pop(); continue; }
        sauber.push(t);
      }
      const name = sauber[sauber.length - 1] || '';
      return /\.[A-Za-z0-9]{1,8}$/.test(name) ? sauber.join('/') : '';
    }

    /**
     * Der Dateiname aus einem Link, wenn er auf eine Datei zeigt.
     * Externe Adressen und Sprungmarken ergeben einen leeren Namen — sie
     * öffnet der Browser. `file://` und gleiche Adresse wie die Seite gelten
     * als Datei; der Rest der Adresse ist egal, es zählt der letzte Teil.
     */
    function linkName(ziel) {
      const roh = String(ziel || '').trim();
      if (!roh || roh.startsWith('#') || /^mailto:/i.test(roh)) return '';
      let pfad = roh;
      if (/^file:\/\//i.test(roh)) {
        try { pfad = new URL(roh).pathname; } catch { pfad = roh.slice(7); }
      } else if (/^[a-z][a-z0-9+.-]*:/i.test(roh)) {
        try {
          const u = new URL(roh, window.location.href);
          if (u.origin !== new URL(window.location.href).origin) return '';
          pfad = u.pathname;
        } catch { return ''; }
      }
      pfad = pfad.split('#')[0].split('?')[0];
      let name = '';
      try { name = decodeURIComponent(pfad.split('/').pop() || ''); } catch { name = pfad.split('/').pop() || ''; }
      return /\.[A-Za-z0-9]{1,8}$/.test(name) ? name.trim() : '';
    }

    // --- Vergleich zweier Fassungen ------------------------------------------
    // Reines Zeilen-LCS; für die Größe eines Dokuments reicht das, und es
    // braucht keine Bibliothek.

    /** Zwei Texte zeilenweise vergleichen und die Unterschiede als Folgen liefern. */
    function diffZeilen(altText, neuText) {
      const altRoh = String(altText == null ? '' : altText);
      const neuRoh = String(neuText == null ? '' : neuText);
      if (!altRoh && !neuRoh) return [];
      if (!altRoh) return neuRoh.split('\n').map((t) => ({ art: 'dazu', text: t }));
      if (!neuRoh) return altRoh.split('\n').map((t) => ({ art: 'weg', text: t }));
      const a = altRoh.split('\n');
      const b = neuRoh.split('\n');
      const m = a.length;
      const n = b.length;
      if (m * n > 1500000) {
        return a.map((t) => ({ art: 'weg', text: t }))
          .concat(b.map((t) => ({ art: 'dazu', text: t })));
      }
      const dp = [];
      for (let i = 0; i <= m; i += 1) dp.push(new Uint32Array(n + 1));
      for (let i = m - 1; i >= 0; i -= 1) {
        for (let j = n - 1; j >= 0; j -= 1) {
          dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
      }
      const raus = [];
      let i = 0;
      let j = 0;
      while (i < m && j < n) {
        if (a[i] === b[j]) { raus.push({ art: 'gleich', text: a[i] }); i += 1; j += 1; }
        else if (dp[i + 1][j] >= dp[i][j + 1]) { raus.push({ art: 'weg', text: a[i] }); i += 1; }
        else { raus.push({ art: 'dazu', text: b[j] }); j += 1; }
      }
      while (i < m) { raus.push({ art: 'weg', text: a[i] }); i += 1; }
      while (j < n) { raus.push({ art: 'dazu', text: b[j] }); j += 1; }
      return raus;
    }

    // Lange unveränderte Strecken werden zusammengeklappt — sonst besteht die
    // Ansicht zum größten Teil aus Text, der sich nicht geändert hat.
    /** Die Unterschiede als sichtbare Zeilen, lange gleiche Strecken zusammengeklappt. */
    function diffAnzeige(zeilen) {
      const raus = [];
      let i = 0;
      while (i < zeilen.length) {
        if (zeilen[i].art !== 'gleich') { raus.push(zeilen[i]); i += 1; continue; }
        let j = i;
        while (j < zeilen.length && zeilen[j].art === 'gleich') j += 1;
        const anzahl = j - i;
        if (anzahl > 8) {
          raus.push(zeilen[i], zeilen[i + 1], zeilen[i + 2]);
          raus.push({ art: 'luecke', text: uebersetze('… {0} Zeilen unverändert', [anzahl - 6]) });
          raus.push(zeilen[j - 3], zeilen[j - 2], zeilen[j - 1]);
        } else {
          for (let k = i; k < j; k += 1) raus.push(zeilen[k]);
        }
        i = j;
      }
      return raus;
    }

    /** Fett, kursiv, Code und Links einer Zeile in React-Knoten übersetzen. */
    function inlineText(text, praefix, beiLink) {
      const teile = [];
      const muster = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\n]+\*|\[[^\]]+\]\([^)\s]+\))/g;
      let letzte = 0;
      let treffer;
      let nummer = 0;
      while ((treffer = muster.exec(text)) !== null) {
        if (treffer.index > letzte) teile.push(text.slice(letzte, treffer.index));
        const stueck = treffer[0];
        const key = praefix + '-' + (nummer += 1);
        if (stueck.startsWith('**')) {
          teile.push(h('strong', { key }, stueck.slice(2, -2)));
        } else if (stueck.startsWith('`')) {
          teile.push(h('code', { key, style: S.codeInline }, stueck.slice(1, -1)));
        } else if (stueck.startsWith('[')) {
          const m = stueck.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
          teile.push(h('a', {
            key,
            href: m[2],
            target: '_blank',
            rel: 'noreferrer',
            style: S.link,
            ...(beiLink ? { onClick: (ev) => { if (beiLink(m[2])) ev.preventDefault(); } } : {}),
          }, m[1]));
        } else {
          teile.push(h('em', { key }, stueck.slice(1, -1)));
        }
        letzte = treffer.index + stueck.length;
      }
      if (letzte < text.length) teile.push(text.slice(letzte));
      return teile;
    }

    const MD_UEBERSCHRIFT = /^(#{1,6})\s+(.*)$/;
    const MD_LISTE = /^\s*([-*]|\d+\.)\s+/;
    const MD_ZITAT = /^\s*>\s?/;
    const MD_TRENNER = /^\s*(---+|\*\*\*+)\s*$/;

    /** Einen Markdown-Text in die React-Knoten der Ansicht übersetzen. */
    function markdown(text, beiLink) {
      const zeilen = String(text || '').replace(/\r\n/g, '\n').split('\n');
      const bloecke = [];
      let i = 0;
      let nummer = 0;
      const key = () => 'md' + (nummer += 1);

      if (zeilen.length && zeilen[0].trim() === '---') {
        const ende = zeilen.indexOf('---', 1);
        if (ende > 0) {
          const felder = [];
          for (const z of zeilen.slice(1, ende)) {
            const m = z.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
            if (m) felder.push([m[1], m[2]]);
          }
          if (felder.length) {
            bloecke.push(h('div', { key: key(), style: S.mdKopf },
              felder.map(([k, v]) => h('div', { key: k, style: { display: 'contents' } },
                h('span', { style: { opacity: 0.7 } }, k),
                h('span', null, v)))));
          }
          i = ende + 1;
        }
      }

      while (i < zeilen.length) {
        const z = zeilen[i];
        if (!z.trim()) { i += 1; continue; }

        if (z.trim().startsWith('```')) {
          i += 1;
          const code = [];
          while (i < zeilen.length && !zeilen[i].trim().startsWith('```')) {
            code.push(zeilen[i]); i += 1;
          }
          i += 1;
          bloecke.push(h('pre', { key: key(), style: S.mdCode }, code.join('\n')));
          continue;
        }

        const ueberschrift = z.match(MD_UEBERSCHRIFT);
        if (ueberschrift) {
          const stufe = ueberschrift[1].length;
          const stil = stufe === 1 ? S.mdH1 : stufe === 2 ? S.mdH2 : S.mdH3;
          bloecke.push(h('div', { key: key(), style: stil },
            inlineText(ueberschrift[2], 'h' + i, beiLink)));
          i += 1;
          continue;
        }

        if (MD_TRENNER.test(z)) {
          bloecke.push(h('hr', { key: key(), style: S.mdTrenner }));
          i += 1;
          continue;
        }

        if (MD_ZITAT.test(z)) {
          const zitat = [];
          while (i < zeilen.length && MD_ZITAT.test(zeilen[i])) {
            zitat.push(zeilen[i].replace(MD_ZITAT, '')); i += 1;
          }
          bloecke.push(h('div', { key: key(), style: S.mdZitat },
            inlineText(zitat.join(' '), 'q' + i, beiLink)));
          continue;
        }

        if (z.trim().startsWith('|')) {
          const roh = [];
          while (i < zeilen.length && zeilen[i].trim().startsWith('|')) {
            roh.push(zeilen[i].trim()); i += 1;
          }
          const zellen = (z2) => z2.replace(/^\|/, '').replace(/\|$/, '')
            .split('|').map((c) => c.trim());
          const kopfZeile = zellen(roh[0]);
          const rumpf = roh.slice(1).filter((z2) => !/^\|[\s:|-]+\|$/.test(z2));
          bloecke.push(h('table', { key: key(), style: S.mdTabelle },
            h('thead', null, h('tr', null, kopfZeile.map((c, ci) => h('th', {
              key: ci, style: S.mdTh,
            }, inlineText(c, 'th' + ci, beiLink))))),
            h('tbody', null, rumpf.map((rz, ri) => h('tr', { key: ri },
              zellen(rz).map((c, ci) => h('td', { key: ci, style: S.mdTd },
                inlineText(c, 'td' + ri + ci, beiLink))))))));
          continue;
        }

        if (MD_LISTE.test(z)) {
          const geordnet = /^\s*\d+\.\s+/.test(z);
          const punkte = [];
          while (i < zeilen.length && MD_LISTE.test(zeilen[i])) {
            punkte.push(h('li', { key: 'li' + i },
              inlineText(zeilen[i].replace(MD_LISTE, ''), 'li' + i, beiLink)));
            i += 1;
          }
          bloecke.push(h(geordnet ? 'ol' : 'ul', { key: key(), style: S.mdListe }, punkte));
          continue;
        }

        const absatz = [];
        while (i < zeilen.length && zeilen[i].trim()
          && !MD_UEBERSCHRIFT.test(zeilen[i])
          && !MD_LISTE.test(zeilen[i])
          && !MD_ZITAT.test(zeilen[i])
          && !MD_TRENNER.test(zeilen[i])
          && !zeilen[i].trim().startsWith('```')
          && !zeilen[i].trim().startsWith('|')) {
          absatz.push(zeilen[i]); i += 1;
        }
        bloecke.push(h('p', { key: key(), style: S.mdP }, inlineText(absatz.join(' '), 'p' + i, beiLink)));
      }

      if (!bloecke.length) {
        bloecke.push(h('p', { key: 'leer', style: S.meta }, uebersetze('Die Datei ist leer.')));
      }
      return bloecke;
    }

    // --- Was die Ansicht behält --------------------------------------------

    // Was die Ansicht eingestellt hat, überlebt den Wechsel zum Chat: das
    // Plugin bleibt geladen, nur die Seite wird ab- und wieder aufgebaut.
    // Ohne das stünde nach jedem Wechsel wieder das leere Board da. Und was
    // er gerade offen hat, bleibt offen — die Station samt ihrer Bearbeitung,
    // die Gesprächsspalte, ein angefangener Satz. Weggehen ist keine
    // Entscheidung über das, was er gerade tut.
    const gemerkt = {
      data: null,
      auswahl: null,
      leser: null,
      // Der geöffnete Beitrag: Notiz und vorgeschlagene Fassungen. Er bleibt
      // beim Wechsel zum Chat offen wie der Leser daneben.
      beitrag: null,
      lage: 'unten',
      gespraechZu: null,
      // Die geöffnete Station im Bearbeiten, mit dem, was noch nicht
      // gespeichert ist.
      stationEdit: false,
      stationEntwurf: null,
      // Das Gespräch im rechten Dock: dieselbe Sitzung, dieselben Zeilen.
      gespraech: null,
      // Welcher Reiter im rechten Dock vorne steht: „station“ oder
      // „gespraech“. Nur bei zwei offenen Reitern entscheidet er; ist nur
      // einer da, zeigt das Dock ihn.
      rechtsReiter: null,
      // Ein Eingriff des Modells, der noch nicht gespeichert ist — damit
      // „Zurücknehmen“ auch nach einem Wechsel noch möglich bleibt.
      eingriff: null,
      // Welcher Ort in der Schiene offen ist: keiner, „Bibliothek“ oder
      // „Verlauf“. Auch das bleibt beim Wechsel zum Chat stehen.
      leiste: null,
      // Was er gerade tippt: der Auftrag an das Modell, der Name einer neuen
      // Station, eines neuen Vorhabens, einer Person.
      aenderung: '',
      neuerSchritt: null,
      editVorhaben: null,
      projektEdit: null,
      personEdit: null,
      feldHoehe: 72,
      spaltenBreite: 380,
      scroll: { links: 0, oben: 0 },
      entwurf: null,
    };

    // --- Übersetzung und Sprache -------------------------------------------

    /**
     * Die Sprache des Dashboards gilt auch fürs Board. Die Texte liegen als
     * Wörterbuch neben dem Plugin (`texte/<sprache>.json`); fehlt ein
     * Eintrag, bleibt der deutsche Ausgangstext stehen. So ist nie eine
     * Stelle leer, und eine halb übersetzte Sprache mischt sich nicht mit
     * leerem Text.
     */
    const sprache = {
      aktiv: 'de',
      texte: {},
      hoerer: new Set(),
      hoere(fn) { this.hoerer.add(fn); return () => this.hoerer.delete(fn); },
      melde() {
        for (const fn of [...this.hoerer]) {
          try { fn(); } catch { /* Ein Hörer darf die anderen nicht blockieren. */ }
        }
      },
      async lade(id) {
        const ziel = String(id || 'de').toLowerCase() || 'de';
        this.aktiv = ziel;
        try {
          const antwort = await fetch('/board/sprache?id=' + encodeURIComponent(ziel), {
            headers: { accept: 'application/json' },
          });
          if (!antwort.ok) throw new Error('HTTP ' + antwort.status);
          const d = await antwort.json();
          this.texte = d && d.texte && typeof d.texte === 'object' ? d.texte : {};
        } catch {
          this.texte = {};
        }
        this.melde();
      },
    };

    /**
     * Ein Text in der Sprache des Dashboards. `{0}`, `{1}` … sind die Werte;
     * fehlt die Übersetzung, steht der deutsche Ausgangstext da.
     */
    function uebersetze(text, werte) {
      const ausgang = String(text == null ? '' : text);
      const roh = sprache.texte[ausgang] || ausgang;
      if (!Array.isArray(werte) || !werte.length) return roh;
      return roh.replace(/\{(\d+)\}/g, (treffer, nummer) => {
        const wert = werte[Number(nummer)];
        return wert == null ? treffer : String(wert);
      });
    }

    /** Der Sprachcode für Datum und Zahlen; Chinesisch braucht die Region. */
    function sprachTag() {
      return sprache.aktiv === 'zh' ? 'zh-CN' : (sprache.aktiv || 'de');
    }

    /** Die Seite neu zeichnen, wenn die Sprache gewechselt hat. */
    function useSprache() {
      const [, setRunde] = React.useState(0);
      React.useEffect(() => sprache.hoere(() => setRunde((n) => n + 1)), []);
    }

    // --- Theme und Akzent --------------------------------------------------

    /**
     * Die Darstellung: die Akzentfarbe des Boards. Sie ist persönlich, gilt
     * für alle Boards und liegt im Zuhause — nicht in `board.json`. Der
     * kleine Speicher hält sie für die Fläche und die Einstellungen bereit;
     * beide Seiten hören auf Änderungen.
     */
    const darstellung = {
      akzent: 'marke',
      gestartet: false,
      hoerer: new Set(),
      lies() { return this.akzent; },
      melde() { for (const hoerer of [...this.hoerer]) hoerer(this.akzent); },
      hoere(fn) { this.hoerer.add(fn); return () => this.hoerer.delete(fn); },
      setze(akzent) {
        const wert = String(akzent || 'marke');
        if (wert === this.akzent) return;
        this.akzent = wert;
        this.melde();
      },
      async lade() {
        if (this.gestartet) return this.akzent;
        this.gestartet = true;
        try {
          const antwort = await fetch('/board/darstellung', {
            headers: { accept: 'application/json' },
          });
          if (!antwort.ok) throw new Error('HTTP ' + antwort.status);
          const d = await antwort.json();
          this.setze(String((d && d.darstellung && d.darstellung.akzent) || 'marke'));
        } catch {
          this.gestartet = false;
        }
        return this.akzent;
      },
      async speichere(akzent) {
        const antwort = await fetch('/board/darstellung', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ akzent }),
        });
        const d = await antwort.json().catch(() => null);
        if (!antwort.ok) {
          throw new Error(String((d && d.error) || ('HTTP ' + antwort.status)));
        }
        this.setze(String((d && d.darstellung && d.darstellung.akzent) || akzent));
        return this.akzent;
      },
    };

    /**
     * Die Akzente: hell und dunkel getrennt; `marke` ist die Farbe des
     * Dashboards. Die Namen sind die Schlüssel der Wörterbücher; die
     * Beschriftung führt sie beim Zeichnen durch `uebersetze`.
     */
    const AKZENTE = [
      { id: 'marke', name: uebersetze('Standard'), hell: 'var(--dsw-alias-brand-primary)', dunkel: 'var(--dsw-alias-brand-primary)' },
      { id: 'violett', name: uebersetze('Violett'), hell: '#6d28d9', dunkel: '#c4b5fd' },
      { id: 'tuerkis', name: uebersetze('Türkis'), hell: '#0f766e', dunkel: '#5eead4' },
      { id: 'bernstein', name: uebersetze('Bernstein'), hell: '#b45309', dunkel: '#fbbf24' },
      { id: 'rose', name: uebersetze('Rose'), hell: '#be123c', dunkel: '#fda4af' },
      { id: 'indigo', name: uebersetze('Indigo'), hell: '#4338ca', dunkel: '#a5b4fc' },
    ];
    const AKZENT_FARBE = Object.fromEntries(AKZENTE.map((e) => [e.id, e]));

    /**
     * Die Akzentfarbe wird nicht am Element gesetzt, sondern über ein
     * Merkmal: so kann dieselbe Farbe in beiden Modi richtig sein, ohne dass
     * die Seite das Farbschema lesen muss.
     */
    const AKZENT_STIL = AKZENTE
      .map((e) => '[data-board-akzent="' + e.id + '"] { --board-akzent: ' + e.hell + '; }\n'
        + 'body[data-ds-dark-theme] [data-board-akzent="' + e.id + '"]'
        + ' { --board-akzent: ' + e.dunkel + '; }')
      .join('\n')
      // Die Fläche liegt im hellen Modus auf Weiß: ein eigener Ton, der in
      // beiden Modi etwas dunkler ist als die Karten. Die erste Zeile ist der
      // Rückfall für Browser ohne `color-mix`, die zweite der Ton.
      + '\n.board-flaeche { background: var(--dsw-alias-bg-layer-2);'
      + ' background: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 94%,'
      + ' var(--dsw-static-neutral-bluish-950) 6%); }'
      // Feinschliff (Schritt 85b): nur Klassen und vorhandene Token, keine
      // Maße. Alles steht unter `.board-seite`, damit das Dashboard unberührt
      // bleibt. Der Balken und der Fokus tragen den gewählten Akzent.
      + '\n.board-seite .board-karte { transition: filter .14s ease; }'
      + '\n.board-seite .board-karte:hover { filter: brightness(1.04); }'
      + '\n.board-seite .board-karte:focus-visible {'
      + ' outline: 2px solid var(--board-akzent); outline-offset: 2px; }'
      + '\n.board-seite :is(button, input, textarea, select, [tabindex]):focus-visible {'
      + ' outline: 2px solid var(--board-akzent); outline-offset: 2px; }'
      + '\n.board-seite .board-schiene-knopf {'
      + ' position: relative; color: var(--dsw-alias-label-secondary); }'
      + '\n.board-seite .board-schiene-knopf[aria-pressed="true"] {'
      + ' color: var(--dsw-alias-label-primary); }'
      + '\n.board-seite .board-schiene-knopf:hover {'
      + ' color: var(--dsw-alias-label-primary); }'
      + '\n.board-seite .board-schiene-knopf[aria-pressed="true"]::before {'
      + ' content: ""; position: absolute; left: 0; top: 6px; bottom: 6px;'
      + ' width: 2px; border-radius: 1px; background: var(--board-akzent); }'
      + '\n.board-seite .board-begleiter {'
      + ' color: var(--dsw-alias-label-secondary); }'
      + '\n.board-seite .board-begleiter-auge {'
      + ' transform-box: fill-box; transform-origin: center;'
      + ' animation: board-blinz 6s ease-in-out infinite; }'
      + '\n@keyframes board-blinz {'
      + ' 0%, 88%, 100% { transform: scaleY(1); }'
      + ' 91%, 94% { transform: scaleY(0.1); }'
      + ' 97% { transform: scaleY(1); } }'
      + '\n@media (prefers-reduced-motion: reduce) {'
      + ' .board-seite *, .board-seite *::before, .board-seite *::after {'
      + ' transition: none !important; animation: none !important; } }';

    /** Der Akzent als React-Zustand: folgt dem Speicher. */
    function useDarstellung() {
      const [akzent, setAkzent] = React.useState(darstellung.lies());
      React.useEffect(() => darstellung.hoere(setAkzent), []);
      React.useEffect(() => { darstellung.lade(); }, []);
      return akzent;
    }

    /** Änderungen aus den Einstellungen erreichen die Fläche ohne Neuladen. */
    const boardAenderungen = {
      hoerer: new Set(),
      hoere(fn) { this.hoerer.add(fn); return () => this.hoerer.delete(fn); },
      melde() {
        for (const fn of [...this.hoerer]) {
          try { fn(); } catch { /* Ein Hörer darf die anderen nicht blockieren. */ }
        }
      },
    };

    // --- Stile der Einstellungsseite (E) -----------------------------------

    // Die Maße der Einstellungsseite: eine Spalte aus Karten, ruhig und
    // großzügig — dieselbe Sprache wie das Einstellungsfenster des Dashboards.
    const E = {
      seite: {
        display: 'flex', flexDirection: 'column', gap: '12px',
        maxWidth: '720px', fontFamily: 'var(--dsw-font-family)',
        color: 'var(--dsw-alias-label-primary)',
      },
      kopf: { display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '4px' },
      titel: { fontSize: '18px', fontWeight: 600, lineHeight: 1.3 },
      unter: {
        margin: 0, fontSize: '13px', lineHeight: 1.5,
        color: 'var(--dsw-alias-label-secondary)',
      },
      karte: {
        padding: '14px 16px', borderRadius: '12px',
        border: '1px solid var(--dsw-alias-settings-card-stroke)',
        background: 'var(--dsw-alias-settings-card-fill)',
        display: 'flex', flexDirection: 'column', gap: '10px',
      },
      zeile: {
        display: 'flex', flexDirection: 'column', gap: '6px',
        paddingTop: '10px', borderTop: '1px solid var(--dsw-alias-border-l1)',
      },
      zeileErst: { paddingTop: 0, borderTop: 0 },
      zeileKopf: {
        display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
      },
      zeileTitel: { fontSize: '13px', fontWeight: 600, lineHeight: 1.4 },
      hinweis: {
        margin: 0, fontSize: '12px', lineHeight: 1.5,
        color: 'var(--dsw-alias-label-secondary)',
      },
      fehler: {
        margin: 0, fontSize: '12px', lineHeight: 1.5,
        color: 'var(--dsw-alias-state-error-primary)',
      },
      wahl: {
        padding: '7px 12px', minHeight: '32px', borderRadius: '8px', cursor: 'pointer',
        border: '1px solid var(--dsw-alias-border-l2)',
        background: 'transparent', color: 'var(--dsw-alias-label-primary)',
        font: 'inherit', fontSize: '13px', lineHeight: 1.3,
      },
      wahlAktiv: {
        borderColor: 'var(--board-akzent, var(--board-akzent, var(--dsw-alias-brand-primary)))',
        background: 'color-mix(in srgb, var(--board-akzent, var(--board-akzent, var(--dsw-alias-brand-primary))) 10%, transparent)',
        fontWeight: 600,
      },
      farben: { display: 'flex', gap: '10px', flexWrap: 'wrap' },
      farbe: {
        width: '28px', height: '28px', borderRadius: '999px', cursor: 'pointer',
        padding: 0, border: '2px solid transparent',
        boxShadow: 'inset 0 0 0 1px var(--dsw-alias-border-l2)',
      },
      farbeAktiv: { borderColor: 'var(--dsw-alias-label-primary)' },
      feld: {
        padding: '8px 10px', minHeight: '34px', borderRadius: '8px',
        border: '1px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-1)',
        color: 'var(--dsw-alias-label-primary)', font: 'inherit', fontSize: '13px',
      },
      knopf: {
        padding: '7px 12px', minHeight: '32px', borderRadius: '8px', cursor: 'pointer',
        border: '1px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-button-elevated-fill)',
        color: 'var(--dsw-alias-label-primary)',
        font: 'inherit', fontSize: '13px', lineHeight: 1.3,
      },
    };

    // --- Bausteine ----------------------------------------------------------
    // Sie tragen die vorhandenen Stellen, ohne sie umzubauen: Aussehen,
    // Maße und Texte kommen von der aufrufenden Seite.

    /**
     * Ein Knopf: immer `type="button"`. `stil` liegt über dem Grundstil, damit
     * die vorhandenen Stellen ihr Aussehen behalten (`S.klein`, `S.wahl`,
     * `E.knopf` …). Ein `symbol` wird zum Namen für Vorlesehilfen und — ohne
     * eigenen `title` — auch zum Titel; ohne Kinder ist es zugleich der
     * sichtbare Text (der Schließen-Knopf des Panels sagt so „Schließen“, ohne
     * dass eine Fläche den Text noch einmal übersetzt). `art` bleibt vorerst
     * ohne Wirkung auf die Farbe; Schritt 63 vereinheitlicht sie.
     */
    function Knopf({
      art = 'zweit', klein, symbol, stil, title, disabled, onClick, children, ...rest
    }) {
      const beschriftung = symbol ? uebersetze(symbol) : undefined;
      return h('button', {
        ...rest,
        type: 'button',
        style: { ...(klein ? S.klein : null), ...stil },
        'aria-label': rest['aria-label'] || beschriftung,
        title: title || beschriftung,
        disabled: Boolean(disabled),
        onClick,
      }, children == null ? beschriftung : children);
    }

    /**
     * Ein Feld mit Beschriftung: das erste echte `<label>` im Client. Die
     * Kennung vergibt die aufrufende Stelle. Hinweis und Fehler bekommen
     * eigene Kennungen und hängen über `aria-describedby` am Eingabefeld.
     */
    function Feld({
      id, label, labelStil, wert, onEingabe, hinweis, fehler, mehrzeilig,
      behindert, stil, ...rest
    }) {
      const beschrieben = [hinweis ? id + '-hinweis' : '', fehler ? id + '-fehler' : '']
        .filter(Boolean).join(' ');
      const eingabe = {
        id,
        value: wert == null ? '' : wert,
        onChange: onEingabe,
        disabled: Boolean(behindert),
        'aria-describedby': beschrieben || undefined,
        'aria-invalid': fehler ? true : undefined,
        style: { ...(mehrzeilig ? S.flaeche : S.feld), ...stil },
        ...rest,
      };
      return h('div', { style: S.feldBlock },
        h('label', { htmlFor: id, style: { ...S.feldTitel, ...labelStil } }, uebersetze(label)),
        mehrzeilig ? h('textarea', eingabe) : h('input', eingabe),
        hinweis
          ? h('p', { id: id + '-hinweis', style: S.hinweis }, uebersetze(hinweis))
          : null,
        fehler
          ? h('p', { id: id + '-fehler', style: S.boardFehler, role: 'alert' }, uebersetze(fehler))
          : null);
    }

    /**
     * Ein Panel: Kopf mit Überschrift, optionalem Untertitel und Schließen,
     * darunter der Inhalt, optional ein Fuß. `titelStil` und `schliessenStil`
     * kommen von der Fläche, damit Größe, Farbe und Abstand ihres Kopfes
     * bleiben; `kopfRechts` ist, was neben dem Schließen steht (die Handlungen
     * des Lesers und des Chats), `kopfEigenschaften` gehört auf die Kopfzeile
     * (das Ziehen des Lesers). `fuss` ist der feste Abschluss unter dem Inhalt
     * (die Eingabe des Chats).
     *
     * Escape schließt jedes Panel mit `onSchliessen` — nicht nur einen Dialog;
     * `stopPropagation` lässt ein inneres Panel allein schließen. Ein Feld,
     * das Escape selbst behandelt, bleibt zuerst am Zug (`defaultPrevented`).
     * `fokus` merkt sich, wo der Fokus war, holt ihn herein und gibt ihn beim
     * Verschwinden zurück.
     *
     * Die Hülle bleibt im Fenster: `maxWidth` begrenzt jede Fläche auf die
     * Fensterbreite weniger den Rand, `boxSizing` rechnet Rahmen und Polster
     * ein. Eine Fläche, die ein eigenes Maximum mitbringt (Chat, Board-Liste),
     * behält es.
     */
    function Panel({
      titel, untertitel, id, rolle = 'abschnitt', fokus, onSchliessen,
      kopfStil, seiteStil, seiteEigenschaften, titelStil, schliessenStil,
      schliessenTitel, kopfRechts, kopfEigenschaften, oben, fuss, kinder, ...rest
    }) {
      const flaeche = React.useRef(null);
      // Der eine Name des Schließens: er steht nur hier, die Flächen leihen
      // ihn sich über `schliessenTitel` (der Chat sagt, was das Schließen tut).
      const schliessenName = schliessenTitel || uebersetze('Schließen');

      React.useEffect(() => {
        if (!fokus || typeof document === 'undefined') return undefined;
        // Der Knoten wird gemerkt: beim Abbau ist `flaeche.current` unter
        // Umständen schon leer, und die Rückgabe braucht ihn noch.
        const knoten = flaeche.current;
        const vorher = document.activeElement;
        if (knoten && typeof knoten.focus === 'function') knoten.focus();
        return () => {
          if (!vorher || typeof vorher.focus !== 'function') return;
          if (typeof document.contains === 'function' && !document.contains(vorher)) return;
          // Wer den Fokus inzwischen selbst woandershin gesetzt hat — etwa auf
          // den nächsten Eintrag der Schiene —, behält ihn. Sonst reißt das
          // Schließen den Fokus zu einem Ort zurück, an dem niemand mehr ist.
          const jetzt = document.activeElement;
          if (jetzt && jetzt !== document.body && knoten && !knoten.contains(jetzt)) return;
          vorher.focus();
        };
      }, [fokus]);

      const dialog = rolle === 'dialog';
      const gemeinsam = {
        style: {
          maxWidth: 'calc(100vw - 16px)',
          boxSizing: 'border-box',
          ...seiteStil,
          ...seiteEigenschaften,
        },
        'aria-labelledby': id,
        ...(fokus ? { tabIndex: -1, ref: flaeche } : null),
        ...(onSchliessen
          ? {
            onKeyDown: (ev) => {
              if (ev.key !== 'Escape' || ev.defaultPrevented) return;
              ev.preventDefault();
              ev.stopPropagation();
              onSchliessen();
            },
          }
          : null),
        ...rest,
      };
      const kopf = h('div', { style: kopfStil, ...kopfEigenschaften },
        h('div', {
          style: {
            flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px',
          },
        },
          h('h2', { id, style: { margin: 0, ...E.titel, ...titelStil } }, titel),
          untertitel ? h('p', { style: { margin: 0, ...E.unter } }, untertitel) : null),
        kopfRechts || onSchliessen
          ? h('div', {
            style: {
              display: 'flex', alignItems: 'center', gap: '6px', flex: 'none',
            },
          },
          kopfRechts || null,
          onSchliessen
            ? h(Knopf, {
              title: schliessenName,
              'aria-label': schliessenName,
              stil: schliessenStil || S.schliessen,
              onClick: onSchliessen,
            }, uebersetze('✕'))
            : null)
          : null);
      return dialog
        ? h('div', { ...gemeinsam, role: 'dialog', 'aria-modal': 'true' },
          oben || null, kopf, kinder, fuss || null)
        : h('section', { ...gemeinsam, role: 'region' },
          oben || null, kopf, kinder, fuss || null);
    }

    /**
     * Eine Meldung mit Zustand: `laeuft` (…), `fertig` (✓) oder `fehler` (!).
     * Sie wird vorgelesen und verschwindet nicht von selbst.
     */
    function Meldung({ zustand, text, ...rest }) {
      if (!zustand || !text) return null;
      const fehler = zustand === 'fehler';
      const zeichen = zustand === 'laeuft' ? '…' : fehler ? '!' : '✓';
      return h('p', {
        role: fehler ? 'alert' : 'status',
        'aria-live': fehler ? 'assertive' : 'polite',
        'aria-atomic': 'true',
        style: { margin: 0 },
        ...rest,
      }, zeichen + ' ' + String(text));
    }

    // --- Einstellungen -----------------------------------------------------

    /**
     * Die Einstellungen des Boards als Abschnitt im Einstellungsfenster des
     * Dashboards. Was das Board ausmacht, steht hier; was das Dashboard
     * betrifft — Theme, Sprache, Schriften — bleibt bei ihm.
     */
    function BoardEinstellungen() {
      const rtl = sprache.aktiv === 'ar';
      const [stand, setStand] = React.useState({ zustand: 'laedt', daten: null, fehler: '' });
      const [laeuft, setLaeuft] = React.useState('');
      const [status, setStatus] = React.useState(null);
      const melde = (text) => setStatus({ art: 'fertig', text });
      const fehler = (text) => setStatus({ art: 'fehler', text });
      const statusWeg = () => setStatus(null);
      const [eigentuemerFeld, setEigentuemerFeld] = React.useState(null);
      const akzent = useDarstellung();
      useSprache();

      const laden = React.useCallback(async () => {
        try {
          const antwort = await fetch('/board/data', {
            headers: { accept: 'application/json' },
          });
          if (!antwort.ok) throw new Error('HTTP ' + antwort.status);
          const daten = await antwort.json();
          setStand({ zustand: 'ok', daten, fehler: '' });
        } catch (e) {
          setStand({ zustand: 'fehler', daten: null, fehler: String((e && e.message) || e) });
        }
      }, []);

      React.useEffect(() => { laden(); }, [laden]);

      const daten = stand.daten || {};
      const schreibbar = Boolean(daten.darf);
      const workflow = eigenerWorkflow(daten) || {};
      const anordnung = workflow.layout === 'auto' ? 'auto' : 'frei';
      const mausrad = daten.einstellungen && daten.einstellungen.mausrad === 'auf-ab'
        ? 'auf-ab' : 'seitwaerts';
      const gesetzter = daten.einstellungen ? daten.einstellungen.eigentuemer : '';
      const eigentuemerWert = eigentuemerFeld === null
        ? String(gesetzter == null ? '' : gesetzter)
        : eigentuemerFeld;
      const eigentuemerName = typeof daten.eigentuemer === 'string' ? daten.eigentuemer : '';

      const poste = async (pfad, koerper) => {
        const antwort = await fetch(pfad, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(koerper),
        });
        const wert = await antwort.json().catch(() => null);
        if (!antwort.ok) {
          throw new Error(String((wert && wert.error) || ('HTTP ' + antwort.status)));
        }
        return wert;
      };

      /** Eine Änderung, die das offene Board betrifft: speichern und melden. */
      async function setze(art, wert) {
        if (laeuft) return;
        setLaeuft(art);
        statusWeg();
        try {
          if (art === 'akzent') {
            await darstellung.speichere(wert);
            melde(uebersetze('Akzentfarbe gespeichert.'));
            return;
          }
          if (art === 'anordnung') await poste('/board/layout', { modus: wert });
          else await poste('/board/einstellung', { name: art, wert });
          await laden();
          boardAenderungen.melde();
          melde(uebersetze('Gespeichert.'));
        } catch (e) {
          fehler(uebersetze('Nicht gespeichert: {0}', [String((e && e.message) || e)]));
        } finally {
          setLaeuft('');
        }
      }

      const wahlKnopf = (aktiv, text, onClick, titel) => React.createElement('button', {
        type: 'button',
        style: { ...E.wahl, ...(aktiv ? E.wahlAktiv : null) },
        'aria-pressed': aktiv,
        title: titel,
        disabled: !schreibbar || Boolean(laeuft),
        onClick,
      }, text);

      const zeile = (titel, inhalt, hinweis, erst) => React.createElement('div', {
        style: { ...E.zeile, ...(erst ? E.zeileErst : null) },
      },
      React.createElement('div', { style: E.zeileKopf },
        React.createElement('span', { style: E.zeileTitel }, titel),
        inhalt),
      hinweis ? React.createElement('p', { style: E.hinweis }, hinweis) : null);

      const meldungsKnoten = status
        ? h(Meldung, {
          key: 'meldung',
          zustand: status.art,
          text: status.text,
          style: status.art === 'fehler' ? E.fehler : E.hinweis,
        })
        : null;
      const kopfUnter = uebersetze('Was nur das Board betrifft. Theme, Sprache und Schriften stehen in den Einstellungen des Dashboards und gelten auch hier.');

      if (stand.zustand === 'fehler') {
        return h(Panel, {
          id: 'board-einstellungen',
          rolle: 'abschnitt',
          titel: PRODUKT_NAME,
          untertitel: kopfUnter,
          seiteStil: E.seite,
          kopfStil: E.kopf,
          'data-board-akzent': akzent,
          ...(rtl ? { dir: 'rtl' } : null),
          kinder: [
            h(Meldung, {
              key: 'fehler',
              zustand: 'fehler',
              text: uebersetze('Die Einstellungen ließen sich nicht laden: {0}', [stand.fehler]),
              style: E.fehler,
            }),
            h('div', { key: 'nochmal', style: { display: 'flex' } },
              h(Knopf, {
                stil: E.knopf,
                onClick: () => laden(),
              }, uebersetze('Nochmal'))),
          ],
        });
      }

      return h(Panel, {
        id: 'board-einstellungen',
        rolle: 'abschnitt',
        titel: PRODUKT_NAME,
        untertitel: kopfUnter,
        seiteStil: E.seite,
        kopfStil: E.kopf,
        'data-board-akzent': akzent,
        ...(rtl ? { dir: 'rtl' } : null),
        kinder: [
          stand.zustand === 'laedt'
            ? h('p', { key: 'laedt', style: E.hinweis }, uebersetze('Wird geladen …'))
            : null,
          h('div', { key: 'akzent', style: E.karte },
            zeile(uebersetze('Akzentfarbe'),
              React.createElement('div', { style: E.farben },
                AKZENTE.map((eintrag) => React.createElement('button', {
                  key: eintrag.id,
                  type: 'button',
                  style: {
                    ...E.farbe,
                    ...(akzent === eintrag.id ? E.farbeAktiv : null),
                    background: 'var(--board-akzent, var(--board-akzent, var(--dsw-alias-brand-primary)))',
                  },
                  'data-board-akzent': eintrag.id,
                  'aria-pressed': akzent === eintrag.id,
                  'aria-label': uebersetze('Akzentfarbe {0}', [uebersetze(eintrag.name)]),
                  title: uebersetze(eintrag.name),
                  disabled: Boolean(laeuft),
                  onClick: () => setze('akzent', eintrag.id),
                }))),
              uebersetze('Gilt für Hervorhebungen im Board. Der Rest des Dashboards behält seine Farbe.'),
              true),
            zeile(uebersetze('Anordnung'),
              React.createElement('span', { style: { display: 'inline-flex', gap: '6px' } },
                wahlKnopf(anordnung === 'frei', uebersetze('Frei'),
                  () => setze('anordnung', 'frei'), uebersetze('Die Stationen stehen, wo du sie hinziehst')),
                wahlKnopf(anordnung === 'auto', uebersetze('Automatisch'),
                  () => setze('anordnung', 'auto'), uebersetze('Das Board ordnet die Stationen in Linien an'))),
              anordnung === 'auto'
                ? uebersetze('Das Board ordnet an — verschieben geht im Modus „Frei“.')
                : uebersetze('Die Stationen stehen, wo du sie hinziehst.'))),
          h('div', { key: 'mausrad', style: E.karte },
            zeile(uebersetze('Mausrad'),
              React.createElement('span', { style: { display: 'inline-flex', gap: '6px' } },
                wahlKnopf(mausrad === 'seitwaerts', uebersetze('Seitwärts'),
                  () => setze('mausrad', 'seitwaerts'), uebersetze('Das Rad schiebt das Board seitwärts')),
                wahlKnopf(mausrad === 'auf-ab', uebersetze('Auf und ab'),
                  () => setze('mausrad', 'auf-ab'), uebersetze('Das Rad schiebt das Board auf und ab'))),
              mausrad === 'seitwaerts'
                ? uebersetze('Das Rad schiebt nach links und rechts; mit Shift nach oben und unten.')
                : uebersetze('Das Rad schiebt nach oben und unten; mit Shift nach links und rechts.'),
              true),
            h('div', { key: 'eigentuemer', style: E.zeile },
              h('div', {
                style: {
                  display: 'flex', alignItems: 'flex-end', gap: '6px', flexWrap: 'wrap',
                },
              },
                h('div', { style: { flex: 'none', width: '220px', maxWidth: '100%' } },
                  h(Feld, {
                    id: 'board-eigentuemer',
                    label: uebersetze('Eigentümer'),
                    wert: eigentuemerWert,
                    onEingabe: (ev) => setEigentuemerFeld(ev.target.value),
                    behindert: !schreibbar || Boolean(laeuft),
                    stil: { ...E.feld, width: '100%' },
                    placeholder: uebersetze('GitHub-Login oder Organisation'),
                    title: uebersetze('Eigentümer neuer Stationen und Vorhaben'),
                    spellCheck: false,
                    autoComplete: 'off',
                    onKeyDown: (ev) => {
                      if (ev.key !== 'Enter') return;
                      ev.preventDefault();
                      setze('eigentuemer', eigentuemerWert.trim());
                    },
                  })),
                h(Knopf, {
                  stil: E.knopf,
                  disabled: !schreibbar || Boolean(laeuft),
                  onClick: () => setze('eigentuemer', eigentuemerWert.trim()),
                }, laeuft === 'eigentuemer' ? uebersetze('Speichert …') : uebersetze('Speichern'))),
              schreibbar
                ? h('p', { style: E.hinweis }, uebersetze('Neue Stationen und Vorhaben entstehen unter {0}.', [
                  eigentuemerName || eigentuemerWert || uebersetze('noch keinem Namen'),
                ]))
                : stand.zustand === 'laedt'
                  ? null
                  : h('p', { style: E.hinweis },
                    uebersetze(String(daten.darfGrund
                      || 'Für dieses Board fehlt das Schreibrecht.')))),
          ),
          h(BoardKonto, { key: 'konto' }),
          meldungsKnoten,
        ],
      });
    }

    // --- Konto und GitHub --------------------------------------------------

    /**
     * Identität und GitHub: persönliche Angaben und die Verbindung, die für
     * alle Boards gelten. Sie stehen im Einstellungsfenster — in der
     * Board-Leiste wechselt man Boards, hier richtet man sie ein.
     */
    function BoardKonto() {
      const [ident, setIdent] = React.useState(null);
      const [github, setGithub] = React.useState({
        stand: null, token: '', repo: '', pruefung: null, laeuft: false, fehler: '',
      });
      const [status, setStatus] = React.useState(null);
      const melde = (text) => setStatus({ art: 'fertig', text });
      const fehler = (text) => setStatus({ art: 'fehler', text });
      const laeuft = (text) => setStatus({ art: 'laeuft', text });

      React.useEffect(() => {
        let lebendig = true;
        fetch('/board/identitaet', { headers: { accept: 'application/json' } })
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
          .then((d) => {
            if (!lebendig) return;
            setIdent({
              name: String((d.identitaet && d.identitaet.name) || ''),
              github: String((d.identitaet && d.identitaet.github) || ''),
              farbe: String((d.identitaet && d.identitaet.farbe) || FARBEN[0]),
              laeuft: false, fehler: '',
            });
          })
          .catch(() => {
            if (!lebendig) return;
            setIdent({ name: '', github: '', farbe: FARBEN[0], laeuft: false, fehler: '' });
          });
        fetch('/board/github/stand', { headers: { accept: 'application/json' } })
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
          .then((d) => { if (lebendig) setGithub((alt) => ({ ...alt, stand: d })); })
          .catch(() => {});
        return () => { lebendig = false; };
      }, []);

      async function poste(pfad, koerper) {
        const antwort = await fetch(pfad, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(koerper),
        });
        const wert = await antwort.json().catch(() => null);
        if (!antwort.ok) {
          throw new Error(String((wert && wert.error) || ('HTTP ' + antwort.status)));
        }
        return wert;
      }

      /** Speichert Name, GitHub-Name und Farbe der eigenen Person. */
      async function identitaetSpeichern() {
        if (!ident || ident.laeuft) return;
        const name = String(ident.name || '').trim();
        if (!name) {
          setIdent({ ...ident, fehler: uebersetze('Bitte deinen Namen eintragen.') });
          return;
        }
        setIdent({ ...ident, laeuft: true, fehler: '' });
        try {
          await poste('/board/identitaet', {
            name,
            github: String(ident.github || '').trim(),
            farbe: ident.farbe,
          });
          setIdent({ ...ident, laeuft: false, fehler: '' });
          melde(uebersetze('Name gespeichert: {0}.', [name]));
          boardAenderungen.melde();
        } catch (e) {
          setIdent({ ...ident, laeuft: false, fehler: String((e && e.message) || e) });
        }
      }

      /** Nimmt den GitHub-Token an und prüft ihn über die Route. */
      async function githubVerbinden() {
        if (github.laeuft) return;
        const token = String(github.token || '').trim();
        if (!token) {
          setGithub({ ...github, fehler: uebersetze('Bitte den Token eintragen.') });
          return;
        }
        setGithub({ ...github, laeuft: true, fehler: '' });
        laeuft(uebersetze('Speichert …'));
        try {
          const antwort = await poste('/board/github/token', { token });
          setGithub({
            ...github,
            stand: { verbunden: true, login: antwort.login, grenze: null },
            token: '', pruefung: null, laeuft: false, fehler: '',
          });
          melde(uebersetze('GitHub verbunden: {0}.', [antwort.login || '']));
        } catch (e) {
          setGithub({
            ...github, laeuft: false,
            fehler: uebersetze('GitHub: {0}', [String((e && e.message) || e)]),
          });
          fehler(uebersetze('Nicht gespeichert: {0}', [String((e && e.message) || e)]));
        }
      }

      async function githubLoeschen() {
        if (github.laeuft) return;
        setGithub({ ...github, laeuft: true, fehler: '' });
        try {
          await poste('/board/github/token', { loeschen: true });
          setGithub({
            ...github,
            stand: { verbunden: false, login: null, grenze: null },
            token: '', pruefung: null, laeuft: false, fehler: '',
          });
          melde(uebersetze('Token gelöscht.'));
        } catch (e) {
          setGithub({
            ...github, laeuft: false,
            fehler: uebersetze('GitHub: {0}', [String((e && e.message) || e)]),
          });
        }
      }

      async function githubPruefen() {
        const repoFrage = String(github.repo || '').trim();
        if (!repoFrage) {
          setGithub({ ...github, fehler: uebersetze('Bitte owner/name eintragen.') });
          return;
        }
        setGithub({ ...github, laeuft: true, fehler: '', pruefung: null });
        try {
          const antwort = await fetch('/board/github/stand?repo='
            + encodeURIComponent(repoFrage), { headers: { accept: 'application/json' } });
          const wert = await antwort.json();
          if (!antwort.ok) throw new Error((wert && wert.error) || ('HTTP ' + antwort.status));
          setGithub((alt) => ({ ...alt, pruefung: wert, laeuft: false }));
        } catch (e) {
          setGithub((alt) => ({
            ...alt, laeuft: false,
            fehler: uebersetze('Prüfung: {0}', [String((e && e.message) || e)]),
          }));
        }
      }

      const stand = github.stand;
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
        h('div', { style: E.karte },
          h('span', { style: E.zeileTitel }, uebersetze('Deine Identität')),
          h('p', { style: E.hinweis }, uebersetze('Gilt für alle Boards.')),
          ident === null
            ? h('p', { style: E.hinweis }, uebersetze('Wird geladen …'))
            : h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
              h('input', {
                style: { ...E.feld, width: '100%', boxSizing: 'border-box' },
                value: ident.name,
                placeholder: uebersetze('Dein Name'),
                'aria-label': uebersetze('Dein Name'),
                onChange: (ev) => setIdent({ ...ident, name: ev.target.value, fehler: '' }),
              }),
              h('input', {
                style: { ...E.feld, width: '100%', boxSizing: 'border-box' },
                value: ident.github,
                placeholder: uebersetze('GitHub-Name (freiwillig)'),
                'aria-label': uebersetze('GitHub-Name (freiwillig)'),
                title: uebersetze('Damit dich öffentliche Boards wiederfinden'),
                onChange: (ev) => setIdent({ ...ident, github: ev.target.value, fehler: '' }),
              }),
              h('div', { style: S.farbGitter },
                FARBEN_ALLE.map((f) => h('button', {
                  key: f,
                  type: 'button',
                  title: farbName(f),
                  'aria-label': farbName(f),
                  'aria-pressed': ident.farbe === f,
                  style: {
                    ...S.farbPunkt,
                    background: f,
                    borderColor: ident.farbe === f
                      ? 'var(--dsw-alias-label-primary)' : 'transparent',
                  },
                  onClick: () => setIdent({ ...ident, farbe: f }),
                }))),
              ident.fehler ? h('p', { style: E.fehler }, ident.fehler) : null,
              h('div', null,
                h('button', {
                  type: 'button',
                  style: E.knopf,
                  disabled: ident.laeuft,
                  onClick: identitaetSpeichern,
                }, ident.laeuft ? uebersetze('Einen Moment …') : uebersetze('Speichern'))))),
        h('div', { style: E.karte },
          h('span', { style: E.zeileTitel }, uebersetze('GitHub')),
          h('p', { style: E.hinweis },
            stand == null
              ? uebersetze('Status wird geladen …')
              : stand.verbunden
                ? uebersetze('verbunden als {0}', [stand.login || '…'])
                : uebersetze('nicht verbunden')),
          stand && stand.fehler ? h('p', { style: E.fehler }, stand.fehler) : null,
          stand && stand.verbunden && stand.grenze
            ? h('p', { style: E.hinweis },
              uebersetze('Noch {0} Abfragen bis zur Grenze.', [stand.grenze.rest]))
            : null,
          h('input', {
            style: { ...E.feld, width: '100%', boxSizing: 'border-box' },
            type: 'password',
            value: github.token,
            placeholder: uebersetze('Token (nur zum Schreiben nötig)'),
            'aria-label': uebersetze('Token (nur zum Schreiben nötig)'),
            autoComplete: 'off',
            onChange: (ev) => setGithub({ ...github, token: ev.target.value, fehler: '' }),
            onKeyDown: (ev) => {
              if (ev.key === 'Enter') { ev.preventDefault(); githubVerbinden(); }
            },
          }),
          h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
            h('button', {
              type: 'button', style: E.knopf, disabled: github.laeuft,
              onClick: githubVerbinden,
            }, github.laeuft ? uebersetze('Einen Moment …') : uebersetze('Verbinden')),
            h('button', {
              type: 'button', style: E.knopf, disabled: github.laeuft,
              onClick: githubLoeschen,
            }, uebersetze('Token löschen'))),
          h('p', { style: E.hinweis },
            uebersetze('Ohne Token bleiben Lesen und Prüfen möglich; Schreibknöpfe erscheinen erst mit Token.')),
          h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
            h('input', {
              style: { ...E.feld, flex: 1, minWidth: '160px' },
              value: github.repo,
              placeholder: uebersetze('Repository (owner/name)'),
              'aria-label': uebersetze('Repository (owner/name)'),
              onChange: (ev) => setGithub({ ...github, repo: ev.target.value, fehler: '' }),
              onKeyDown: (ev) => {
                if (ev.key === 'Enter') { ev.preventDefault(); githubPruefen(); }
              },
            }),
            h('button', {
              type: 'button', style: E.knopf, disabled: github.laeuft,
              onClick: githubPruefen,
            }, uebersetze('Prüfen'))),
          github.pruefung
            ? h('p', {
              style: github.pruefung.fehler ? E.fehler : E.hinweis,
            }, github.pruefung.fehler
              ? uebersetze('GitHub: {0}', [github.pruefung.fehler])
              : uebersetze('★ {0} · Fassung {1}', [github.pruefung.sterne == null
                ? '—' : github.pruefung.sterne, github.pruefung.fassung || '—']))
            : null,
          github.fehler ? h('p', { style: E.fehler }, github.fehler) : null),
        status ? h('p', { style: E.hinweis, role: 'status' }, status.text) : null);
    }

    // --- Beiträge ----------------------------------------------------------

    /**
     * Die Beiträge eines Dings: die Pull Requests an seinem Repository.
     * Gelesen wird beim Öffnen; ein zusammengeführter bleibt sichtbar, und
     * der nächste Blick liest den neuen Stand. Mit Token stehen ein Knopf
     * und ein kleines Formular da; ohne Token führt der Weg über GitHub.
     * Fehlt ein Repository, bleibt der Abschnitt weg — es gibt nichts zu
     * verlinken.
     *
     * `start` öffnet das Formular gleich mit Titel und Notiz — der Leser
     * braucht das, wenn ein fremder Text als Beitrag angeboten wird.
     * `textLabel` benennt das Feld, in dem die Notiz zum Beitrag steht.
     */
    function BeitraegeFlaeche({ repo, start = null, textLabel = 'Text' }) {
      const [stand, setStand] = React.useState({ zustand: 'laedt', daten: null, fehler: '' });
      const [offen, setOffen] = React.useState(Boolean(start));
      const [form, setForm] = React.useState({
        titel: String((start && start.titel) || ''),
        text: String((start && start.text) || ''),
        head: String((start && start.head) || ''),
        base: String((start && start.base) || 'main'),
      });
      const [arbeitet, setArbeitet] = React.useState(false);
      const [status, setStatus] = React.useState(null);
      const melde = (text) => setStatus({ art: 'fertig', text });
      const fehler = (text) => setStatus({ art: 'fehler', text });
      const laeuft = (text) => setStatus({ art: 'laeuft', text });
      const statusWeg = () => setStatus(null);
      const [runde, setRunde] = React.useState(0);
      const ort = String(repo == null ? '' : repo).trim();

      React.useEffect(() => {
        let lebendig = true;
        if (!ort) {
          setStand({ zustand: 'leer', daten: null, fehler: '' });
          return () => { lebendig = false; };
        }
        setStand({ zustand: 'laedt', daten: null, fehler: '' });
        fetch('/board/github/beitraege?repo=' + encodeURIComponent(ort), {
          headers: { accept: 'application/json' },
        })
          .then(async (antwort) => {
            const d = await antwort.json().catch(() => null);
            if (!antwort.ok) {
              throw new Error(String((d && (d.error || d.hinweis))
                || ('HTTP ' + antwort.status)));
            }
            return d;
          })
          .then((d) => { if (lebendig) setStand({ zustand: 'ok', daten: d, fehler: '' }); })
          .catch((fehler) => {
            if (lebendig) {
              setStand({
                zustand: 'fehler',
                daten: null,
                fehler: String((fehler && fehler.message) || fehler),
              });
            }
          });
        return () => { lebendig = false; };
      }, [ort, runde]);

      if (!ort) return null;

      const daten = stand.zustand === 'ok' && stand.daten ? stand.daten : {};
      const liste = Array.isArray(daten.beitraege) ? daten.beitraege : [];
      const kann = daten.kann === true;
      const adresse = String(daten.adresse || '');
      const zustandWort = (beitrag) => {
        if (beitrag && beitrag.zusammenGefuehrt) return uebersetze('zusammengeführt');
        if (beitrag && beitrag.zustand === 'geschlossen') return uebersetze('geschlossen');
        return uebersetze('offen');
      };

      /** Legt aus dem Formular einen Pull Request an. */
      async function anlegen() {
        if (arbeitet) return;
        setArbeitet(true);
        laeuft(uebersetze('Wird gesendet …'));
        try {
          const antwort = await fetch('/board/github/beitrag', {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({
              repo: ort,
              titel: form.titel,
              text: form.text,
              head: form.head,
              base: form.base,
            }),
          });
          const d = await antwort.json().catch(() => null);
          if (!antwort.ok) {
            throw new Error(String((d && (d.error || d.hinweis))
              || ('HTTP ' + antwort.status)));
          }
          melde(uebersetze('Beitrag #{0} angelegt', [d.nummer]));
          setOffen(false);
          setForm({ titel: '', text: '', head: '', base: 'main' });
          setRunde((n) => n + 1);
        } catch (e) {
          fehler(String((e && e.message) || e));
        } finally {
          setArbeitet(false);
        }
      }

      // Ein Feld des Formulars: Beschriftung darüber, darunter das Feld. Der
      // Text ist mehrzeilig, die drei anderen sind einzeilig.
      const feldZeile = (titel, wert, aendern, mehrzeilig) => h('div', {
        style: S.feldBlock,
      },
      h('span', { style: S.feldTitel }, titel),
      mehrzeilig
        ? h('textarea', {
          style: { ...S.flaeche, minHeight: '48px' },
          value: wert,
          onChange: aendern,
        })
        : h('input', { style: S.feld, value: wert, onChange: aendern }));

      return h('div', {
        style: {
          display: 'flex', flexDirection: 'column', gap: '6px',
          borderTop: '1px solid var(--dsw-alias-border-l1)', paddingTop: '10px',
        },
      },
      h('span', { style: { ...S.feldTitel, fontWeight: 600 } }, uebersetze('Beiträge')),
      stand.zustand === 'laedt'
        ? h('div', { style: S.hinweis }, uebersetze('werden gelesen …'))
        : null,
      stand.zustand === 'fehler'
        ? h('div', { style: S.sichtbarkeitWarnung },
          uebersetze('Beiträge nicht gelesen: {0}', [stand.fehler]))
        : null,
      daten.hinweis
        ? h('div', { style: S.hinweis }, String(daten.hinweis))
        : null,
      stand.zustand === 'ok' && !liste.length && !daten.hinweis
        ? h('div', { style: { ...S.anzeigeWert, ...S.leer } }, uebersetze('noch kein Beitrag'))
        : null,
      liste.map((beitrag, i) => {
        const nummer = Number(beitrag && beitrag.nummer) || 0;
        return h('div', {
          key: 'beitrag-' + (nummer || i),
          style: { display: 'flex', alignItems: 'flex-start', gap: '8px', flexWrap: 'wrap' },
        },
        h('span', { style: { ...S.anzeigeWert, flex: 1 } },
          uebersetze('#{0} · {1}', [nummer, String((beitrag && beitrag.titel) || uebersetze('ohne Titel'))])),
        h('span', { style: { ...S.hinweis, marginTop: 0 } }, zustandWort(beitrag)),
        String((beitrag && beitrag.adresse) || '')
          ? h('a', {
            href: String(beitrag.adresse),
            target: '_blank',
            rel: 'noreferrer',
            style: { fontSize: '12px', color: 'var(--board-akzent, var(--dsw-alias-brand-primary))' },
          }, uebersetze('Ansehen'))
          : null);
      }),
      status ? h('div', { style: S.hinweis }, status.text) : null,
      kann
        ? (offen
          ? h('div', { style: S.form },
            feldZeile('Titel', form.titel, (ev) => setForm({
              ...form, titel: ev.target.value,
            })),
            feldZeile(textLabel, form.text, (ev) => setForm({
              ...form, text: ev.target.value,
            }), true),
            feldZeile('Quellzweig', form.head, (ev) => setForm({
              ...form, head: ev.target.value,
            })),
            feldZeile('Zielzweig', form.base, (ev) => setForm({
              ...form, base: ev.target.value,
            })),
            h('div', { style: { ...S.knoepfe, marginTop: '6px' } },
              h('button', {
                type: 'button', style: S.klein, disabled: arbeitet, onClick: anlegen,
              }, arbeitet ? uebersetze('Einen Moment …') : uebersetze('Anlegen')),
              h('button', {
                type: 'button',
                style: S.klein,
                onClick: () => { setOffen(false); statusWeg(); },
              }, uebersetze('Abbrechen'))))
          : h('div', null,
            h('button', {
              type: 'button',
              style: S.klein,
              onClick: () => { statusWeg(); setOffen(true); },
            }, uebersetze('Pull Request öffnen'))))
        : (adresse
          ? h('a', {
            href: adresse,
            target: '_blank',
            rel: 'noreferrer',
            style: { fontSize: '12px', color: 'var(--board-akzent, var(--dsw-alias-brand-primary))' },
          }, uebersetze('Auf GitHub beitragen'))
          : null));
    }

    // --- Fragen ------------------------------------------------------------

    /**
     * Die Fragen eines Dings: Issues an seinem Repository, ohne Pull Requests.
     * Daneben steht der Fork: mit Token lässt er sich hier anlegen, ohne Token
     * führt der Weg über GitHub. Beides bleibt bei GitHub — das Board legt
     * nichts ein zweites Mal ab.
     */
    function FragenFlaeche({ repo }) {
      const [stand, setStand] = React.useState({ zustand: 'laedt', daten: null, fehler: '' });
      const [offen, setOffen] = React.useState(false);
      const [form, setForm] = React.useState({ titel: '', text: '' });
      const [arbeitet, setArbeitet] = React.useState(false);
      const [status, setStatus] = React.useState(null);
      const melde = (text) => setStatus({ art: 'fertig', text });
      const fehler = (text) => setStatus({ art: 'fehler', text });
      const laeuft = (text) => setStatus({ art: 'laeuft', text });
      const statusWeg = () => setStatus(null);
      const [runde, setRunde] = React.useState(0);
      const [fork, setFork] = React.useState(null);
      const [forkLaeuft, setForkLaeuft] = React.useState(false);
      const ort = String(repo == null ? '' : repo).trim();

      React.useEffect(() => {
        let lebendig = true;
        if (!ort) {
          setStand({ zustand: 'leer', daten: null, fehler: '' });
          return () => { lebendig = false; };
        }
        setStand({ zustand: 'laedt', daten: null, fehler: '' });
        fetch('/board/github/fragen?repo=' + encodeURIComponent(ort), {
          headers: { accept: 'application/json' },
        })
          .then(async (antwort) => {
            const d = await antwort.json().catch(() => null);
            if (!antwort.ok) {
              throw new Error(String((d && (d.error || d.hinweis))
                || ('HTTP ' + antwort.status)));
            }
            return d;
          })
          .then((d) => { if (lebendig) setStand({ zustand: 'ok', daten: d, fehler: '' }); })
          .catch((fehler) => {
            if (lebendig) {
              setStand({
                zustand: 'fehler',
                daten: null,
                fehler: String((fehler && fehler.message) || fehler),
              });
            }
          });
        return () => { lebendig = false; };
      }, [ort, runde]);

      if (!ort) return null;

      const daten = stand.zustand === 'ok' && stand.daten ? stand.daten : {};
      const fragen = Array.isArray(daten.fragen) ? daten.fragen : [];
      const kann = daten.kann === true;
      const adresse = String(daten.adresse || '');

      /** Legt aus dem Formular eine Frage (ein Issue) an. */
      async function anlegen() {
        if (arbeitet) return;
        setArbeitet(true);
        laeuft(uebersetze('Wird gesendet …'));
        try {
          const antwort = await fetch('/board/github/frage', {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({ repo: ort, titel: form.titel, text: form.text }),
          });
          const d = await antwort.json().catch(() => null);
          if (!antwort.ok) {
            throw new Error(String((d && (d.error || d.hinweis))
              || ('HTTP ' + antwort.status)));
          }
          melde(uebersetze('Frage #{0} angelegt', [d.nummer]));
          setOffen(false);
          setForm({ titel: '', text: '' });
          setRunde((n) => n + 1);
        } catch (e) {
          fehler(String((e && e.message) || e));
        } finally {
          setArbeitet(false);
        }
      }

      /** Legt über die Route einen Fork des Repositories an. */
      async function forken() {
        if (forkLaeuft) return;
        setForkLaeuft(true);
        laeuft(uebersetze('Lege an …'));
        try {
          const antwort = await fetch('/board/github/fork', {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({ repo: ort }),
          });
          const d = await antwort.json().catch(() => null);
          if (!antwort.ok) {
            throw new Error(String((d && (d.error || d.hinweis))
              || ('HTTP ' + antwort.status)));
          }
          setFork(d.fork || null);
          melde(uebersetze('Fork angelegt.'));
        } catch (e) {
          fehler(uebersetze('Forken nicht möglich: {0}', [String((e && e.message) || e)]));
        } finally {
          setForkLaeuft(false);
        }
      }

      const feldZeile = (titel, wert, aendern, mehrzeilig) => h('div', {
        style: S.feldBlock,
      },
      h('span', { style: S.feldTitel }, titel),
      mehrzeilig
        ? h('textarea', {
          style: { ...S.flaeche, minHeight: '48px' },
          value: wert,
          onChange: aendern,
        })
        : h('input', { style: S.feld, value: wert, onChange: aendern }));

      const verweisStil = { fontSize: '12px', color: 'var(--board-akzent, var(--dsw-alias-brand-primary))' };

      return h('div', {
        style: {
          display: 'flex', flexDirection: 'column', gap: '6px',
          borderTop: '1px solid var(--dsw-alias-border-l1)', paddingTop: '10px',
        },
      },
      h('span', { style: { ...S.feldTitel, fontWeight: 600 } }, uebersetze('Fragen')),
      stand.zustand === 'laedt'
        ? h('div', { style: S.hinweis }, uebersetze('werden gelesen …'))
        : null,
      stand.zustand === 'fehler'
        ? h('div', { style: S.sichtbarkeitWarnung },
          uebersetze('Fragen nicht gelesen: {0}', [stand.fehler]))
        : null,
      daten.hinweis
        ? h('div', { style: S.hinweis }, String(daten.hinweis))
        : null,
      stand.zustand === 'ok' && !fragen.length && !daten.hinweis
        ? h('div', { style: { ...S.anzeigeWert, ...S.leer } }, uebersetze('noch keine Frage'))
        : null,
      fragen.map((frage, i) => {
        const nummer = Number(frage && frage.nummer) || 0;
        const zustand = frage && frage.zustand === 'geschlossen'
          ? 'geschlossen' : 'offen';
        return h('div', {
          key: 'frage-' + (nummer || i),
          style: { display: 'flex', alignItems: 'flex-start', gap: '8px', flexWrap: 'wrap' },
        },
        h('span', { style: { ...S.anzeigeWert, flex: 1 } },
          uebersetze('#{0} · {1}', [nummer, String((frage && frage.titel) || uebersetze('ohne Titel'))])),
        h('span', { style: { ...S.hinweis, marginTop: 0 } }, uebersetze(zustand)),
        String((frage && frage.adresse) || '')
          ? h('a', {
            href: String(frage.adresse),
            target: '_blank',
            rel: 'noreferrer',
            style: verweisStil,
          }, uebersetze('Ansehen'))
          : null);
      }),
      status ? h('div', { style: S.hinweis }, status.text) : null,
      kann
        ? (offen
          ? h('div', { style: S.form },
            feldZeile('Titel', form.titel, (ev) => setForm({
              ...form, titel: ev.target.value,
            })),
            feldZeile('Text', form.text, (ev) => setForm({
              ...form, text: ev.target.value,
            }), true),
            h('div', { style: { ...S.knoepfe, marginTop: '6px' } },
              h('button', {
                type: 'button', style: S.klein, disabled: arbeitet, onClick: anlegen,
              }, arbeitet ? uebersetze('Einen Moment …') : uebersetze('Frage stellen')),
              h('button', {
                type: 'button',
                style: S.klein,
                onClick: () => { setOffen(false); statusWeg(); },
              }, uebersetze('Abbrechen'))))
          : h('div', null,
            h('button', {
              type: 'button',
              style: S.klein,
              onClick: () => { statusWeg(); setOffen(true); },
            }, uebersetze('Frage stellen'))))
        : (adresse
          ? h('a', {
            href: adresse + '/issues/new',
            target: '_blank',
            rel: 'noreferrer',
            style: verweisStil,
          }, uebersetze('Auf GitHub fragen'))
          : null),
      // Daneben der Fork: mit Token als Handlung, danach als Verweis auf die
      // eigene Kopie; ohne Token als Weg zu GitHub.
      h('div', {
        style: {
          display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap',
          marginTop: '2px', paddingTop: '8px',
          borderTop: '1px dashed var(--dsw-alias-border-l1)',
        },
      },
      h('span', { style: S.feldTitel }, uebersetze('Fork')),
      fork && fork.adresse
        ? h('span', { style: S.hinweis },
          uebersetze('Deine Kopie: '),
          h('a', {
            href: String(fork.adresse),
            target: '_blank',
            rel: 'noreferrer',
            style: verweisStil,
          }, String(fork.vollerName || fork.adresse)))
        : (kann
          ? h('button', {
            type: 'button',
            style: S.klein,
            disabled: forkLaeuft,
            onClick: forken,
          }, forkLaeuft ? uebersetze('Einen Moment …') : uebersetze('Forken'))
          : (adresse
            ? h('a', {
              href: adresse,
              target: '_blank',
              rel: 'noreferrer',
              style: verweisStil,
            }, uebersetze('Auf GitHub forken'))
            : null))));
    }

    // --- Teams -------------------------------------------------------------

    /**
     * Die Teams der Organisation: Name, Schlüssel und Mitglieder. Gelesen
     * wird beim Öffnen der Bibliothek. Ohne Token bleibt der Abschnitt stehen
     * und sagt, dass Teams nur mit Token zu sehen sind.
     */
    function TeamsFlaeche() {
      const [stand, setStand] = React.useState({
        zustand: 'laedt', daten: null, fehler: '',
      });
      React.useEffect(() => {
        let lebendig = true;
        setStand({ zustand: 'laedt', daten: null, fehler: '' });
        fetch('/board/github/teams', { headers: { accept: 'application/json' } })
          .then(async (antwort) => {
            const d = await antwort.json().catch(() => null);
            if (!antwort.ok) {
              throw new Error(String((d && (d.error || d.hinweis))
                || ('HTTP ' + antwort.status)));
            }
            return d;
          })
          .then((d) => { if (lebendig) setStand({ zustand: 'ok', daten: d, fehler: '' }); })
          .catch((fehler) => {
            if (lebendig) {
              setStand({
                zustand: 'fehler',
                daten: null,
                fehler: String((fehler && fehler.message) || fehler),
              });
            }
          });
        return () => { lebendig = false; };
      }, []);
      const daten = stand.zustand === 'ok' && stand.daten ? stand.daten : {};
      const teams = Array.isArray(daten.teams) ? daten.teams : [];
      return h('div', { style: S.bibAbschnitt },
        h('div', { style: S.bibAbschnittKopf },
          h('span', { style: S.bibAbschnittTitel }, uebersetze('Teams')),
          h('span', { style: { ...S.hinweis, marginTop: 0 } },
            teams.length === 1 ? uebersetze('1 Team') : uebersetze('{0} Teams', [teams.length]))),
        stand.zustand === 'laedt'
          ? h('div', { style: S.hinweis }, uebersetze('Teams werden gelesen …'))
          : null,
        stand.zustand === 'fehler'
          ? h('div', { style: S.sichtbarkeitWarnung },
            uebersetze('Teams nicht gelesen: {0}', [stand.fehler]))
          : null,
        stand.zustand === 'ok' && daten.hinweis
          ? h('div', { style: S.hinweis }, String(daten.hinweis))
          : null,
        teams.length
          ? h('div', { style: S.bibReihe },
            teams.map((team, i) => {
              const name = String((team && team.name) || (team && team.key) || uebersetze('ohne Namen'));
              const schluessel = String((team && (team.schluessel || team.key)) || '');
              const mitglieder = Array.isArray(team && team.mitglieder)
                ? team.mitglieder.map(String).filter(Boolean) : [];
              return h('div', {
                key: schluessel || name || String(i),
                style: { ...S.bibKarteKlick, cursor: 'default' },
              },
              h('span', { style: S.bibReiter }, name),
              h('div', { style: { ...S.bibFlaeche, cursor: 'default' } },
                h('span', { style: { display: 'block' } },
                  uebersetze('Schlüssel: {0}', [schluessel || uebersetze('ohne Schlüssel')])),
                h('span', { style: { display: 'block' } },
                  uebersetze('Mitglieder: {0}', [mitglieder.length
                    ? mitglieder.join(', ')
                    : uebersetze('ohne Mitglieder')]))));
            }))
          : null);
    }

    // --- BoardPage ---------------------------------------------------------

    /** Die ganze Board-Seite: Zustand, Fläche, Leser und Chat an einem Ort. */
    function BoardPage(ctx) {
      // --- Zustand und Laden -------------------------------------------------
      const akzent = useDarstellung();
      useSprache();
      const rtl = sprache.aktiv === 'ar';
      const [data, setData] = React.useState(gemerkt.data);
      const [ladefehler, setLadefehler] = React.useState(null);
      const [auswahl, setAuswahl] = React.useState(gemerkt.auswahl); // { art:'schritt'|'vorhaben', id }
      const [status, setStatus] = React.useState(null);
      const melde = (text) => setStatus({ art: 'fertig', text });
      const fehler = (text) => setStatus({ art: 'fehler', text });
      const laeuft = (text) => setStatus({ art: 'laeuft', text });
      const statusWeg = () => setStatus(null);
      const [editPos, setEditPos] = React.useState(null); // { before, wert }
      const [editVorhaben, setEditVorhaben] = React.useState(gemerkt.editVorhaben);
      // Ein Vorhaben im Bearbeiten: Name und Farbe an einer Stelle.
      const [projektEdit, setProjektEdit] = React.useState(gemerkt.projektEdit); // { id, name, farbe }
      const [zurueck, setZurueck] = React.useState(null); // { id, nach, grund }
      // Ein Vorhaben weitergeben: Zielstation und nächste verantwortliche Person.
      const [weiter, setWeiter] = React.useState(null); // { id, nach, person }
      // Ein gemerkter Verlauf wird beim Zurückkommen zum Lesen — die Fassungen
      // selbst werden nicht gemerkt, also gäbe es nichts anzuzeigen.
      const [leser, setLeser] = React.useState(gemerkt.leser
        && (gemerkt.leser.modus === 'verlauf' || gemerkt.leser.modus === 'abzweig'
          || gemerkt.leser.modus === 'beitragen')
        ? {
          ...gemerkt.leser,
          modus: gemerkt.leser.modus === 'beitragen' ? 'bearbeiten' : 'lesen',
        }
        : gemerkt.leser); // Datei: { art:'datei', … } · Transkript: { art:'transkript', … }
      // Was der Leser als Beitrag anbietet: Titel und Notiz für das Formular.
      // Der geänderte Text bleibt im Leser; ein Pull Request braucht den Zweig
      // bei GitHub, nicht eine zweite Ablage.
      const [beitragStart, setBeitragStart] = React.useState(null);
      // Ein Zweig, der gerade angelegt wird: wohin er geht und wie er heißt.
      const [zweig, setZweig] = React.useState(null); // { ziel, name, laeuft, fehler }
      // Der geöffnete alte Beitrag: Notiz und Namen der vorgeschlagenen Fassungen.
      const [beitrag, setBeitrag] = React.useState(gemerkt.beitrag);
      // Die Dateien eines Vorhabens als Baum: was in einem Ordner liegt, wird
      // erst geholt, wenn er aufgeklappt wird — ein Produkt kann groß sein.
      const [dateien, setDateien] = React.useState(null);
      // { vorhaben, titel, offen: {pfad:true}, eintraege: {pfad:[…]}, mehr: {pfad:n}, laedt: {} }
      const [transkript, setTranskript] = React.useState(null); // { zustand, laeufe }
      const [laufWahl, setLaufWahl] = React.useState(0);
      const [lage, setLage] = React.useState(gemerkt.lage); // unten | rechts
      const [tick, setTick] = React.useState(0);
      const [skills, setSkills] = React.useState([]);
      const [bestaetigen, setBestaetigen] = React.useState(null); // Position, die gelöscht werden soll
      const [zeiger, setZeiger] = React.useState(null);
      const [entwurf, setEntwurf] = React.useState(gemerkt.stationEntwurf);
      // Die geöffnete Station ist erst eine Anzeige; geändert wird auf Klick.
      const [stationEdit, setStationEdit] = React.useState(gemerkt.stationEdit);
      // Das Vertrauensbild einer Station (Fassung 2): einmal je Station geholt
      // und unter ihrer Kennung gemerkt.
      const [stationAngaben, setStationAngaben] = React.useState({});
      const stationGeholt = React.useRef(new Set());
      const [verlauf, setVerlauf] = React.useState(null); // { id, zustand, schritte }
      const [ziehen, setZiehen] = React.useState(null); // Vorhaben, das gerade gezogen wird
      const [ziel, setZiel] = React.useState(null); // Station unter dem Zeiger
      const [verschieben, setVerschieben] = React.useState(null); // { id, nach } wartet auf Bestätigung
      // Der letzte Eingriff des Modells am Text: Rechtschreibung oder eine
      // Überarbeitung nach seiner Anweisung. Bis zum Speichern liegt das
      // Original daneben, damit er zurück kann.
      const [eingriff, setEingriff] = React.useState(gemerkt.eingriff); // { art, laeuft?, original, fehler? }
      // Was beim Überarbeiten anders werden soll. Bleibt stehen, bis er die
      // Datei wechselt — mehrmals am selben Text ist die Regel.
      const [aenderung, setAenderung] = React.useState(gemerkt.aenderung || '');
      // Der Verlauf einer Datei: die Fassungen und die gewählte zum Vergleich.
      const [historie, setHistorie] = React.useState(null);
      // Wird der Leser gerade am Kopf gezogen? `ziel` ist die Fläche darunter.
      const [leserZiehen, setLeserZiehen] = React.useState(null);
      // Das Gespräch, das im Board läuft: eine ganz normale Sitzung, die
      // hier nur gezeigt und weitergeführt wird. `null` heißt: keine Spalte.
      // Beim Zurückkommen steht dieselbe Spalte wieder da; nur ein Sendevorgang
      // von vorhin wird nicht weitergeführt — der Stand kommt vom Server.
      const [gespraech, setGespraech] = React.useState(gemerkt.gespraech
        ? { ...gemerkt.gespraech, sendet: false, seit: null }
        : null);
      // Was er selbst zugemacht hat, öffnet sich nicht von allein wieder.
      const [gespraechZu, setGespraechZu] = React.useState(gemerkt.gespraechZu);
      // Höhe des Eingabefelds im Gespräch; ziehbar am Griff darüber.
      const [feldHoehe, setFeldHoehe] = React.useState(gemerkt.feldHoehe);
      // Breite des rechten Docks; ziehbar am Griff an seinem linken Rand.
      // Unter 300 px wird es nicht schmaler, 380 px sind die Vorgabe.
      const [spaltenBreite, setSpaltenBreite] = React.useState(
        Math.max(300, Number(gemerkt.spaltenBreite) || 380),
      );
      // Der Reiter, der im rechten Dock vorne steht. Er überlebt den Wechsel
      // zum Chat wie die Auswahl und die Sitzung selbst.
      const [rechtsReiter, setRechtsReiter] = React.useState(gemerkt.rechtsReiter || null);
      // Bibliothek: der Name, der gerade getippt wird; der Schritt, der gerade
      // gezogen wird; die Fläche darunter; die Rückfrage vor dem Löschen.
      // Bibliothek, Einstellungen und Verlauf klappen über dem Board auf;
      // zugeklappt gehört die Fläche ganz dem Board.
      const [leiste, setLeiste] = React.useState(gemerkt.leiste);
      // Die Suche nach einer Station: der getippte Text und ob die Treffer-
      // liste offen ist. Welche Stationen passen, wird aus den Karten
      // gerechnet — dafür gibt es keinen zweiten Stand.
      const [stationsSuche, setStationsSuche] = React.useState('');
      const [stationsOffen, setStationsOffen] = React.useState(false);
      // Die Bibliothek der Fassung 2: welche Einzelheit unter ihrem Abschnitt
      // offen ist — ein Workflow oder ein Vorhaben. Sie bleibt beim Wechsel
      // zum Chat nicht stehen; der offene Ort der Schiene schon.
      const [bibOffen, setBibOffen] = React.useState(null); // { art, id }
      // Neben der Bibliothek der Katalog des Hauptboards: der Umschalter, der
      // Suchtext und was zuletzt geholt wurde. Der Katalog ist keine zweite
      // Bibliothek; er zeigt die öffentlichen Dinge mit Sternen und Verweis.
      const [bibAnsicht, setBibAnsicht] = React.useState('bibliothek');
      const [katalogSuche, setKatalogSuche] = React.useState('');
      const [katalog, setKatalog] = React.useState(null);
      const [katalogLaedt, setKatalogLaedt] = React.useState(false);
      const [katalogFehler, setKatalogFehler] = React.useState('');
      // Jeder ausdrückliche Blick in den Katalog zählt hier hoch und geht an
      // GitHub vorbei am Zwischenspeicher. Nach dem Anlegen soll das Neue
      // sofort dastehen und nicht erst nach Ablauf der Frist.
      const [katalogFrisch, setKatalogFrisch] = React.useState(0);
      // Das Probeprojekt lässt sich aus dem Katalog in ein eigenes Board
      // übernehmen. `uebernahme` hält den offenen Vorgang: den Eintrag, das
      // Formular für den Namen und den Lauf.
      const [uebernahme, setUebernahme] = React.useState(null);
      // Ein Workflow, der ins Board übernommen wird: der geöffnete Eintrag mit
      // dem Ordner oder der Adresse und ob die Route gerade läuft.
      const [workflowNeu, setWorkflowNeu] = React.useState(null);
      const [workflowLaeuft, setWorkflowLaeuft] = React.useState(false);
      // Eine Station, die gerade angelegt wird: Name, Beschreibung, ein
      // laufender Versuch und der Fehler, der im Formular stehen bleibt.
      const [stationNeu, setStationNeu] = React.useState(null);
      // Die zuletzt angelegte Station: Name, Repository und der Weg in den
      // Katalog. Sie bleibt als Bestätigung stehen, bis er sie schließt.
      const [stationAngelegt, setStationAngelegt] = React.useState(null);
      // Ein Vorhaben, das an einer Station angelegt wird: die Station im
      // Workflow, der Name, ein laufender Versuch und der Fehler im Formular.
      const [vorhabenNeu, setVorhabenNeu] = React.useState(null);
      // Der Verlauf des Boards: die Fassungen, die jede Speicherung anlegt.
      const [fassungen, setFassungen] = React.useState(null);
      const [neuerSchritt, setNeuerSchritt] = React.useState(gemerkt.neuerSchritt);
      const [schrittZug, setSchrittZug] = React.useState(null);
      const [schrittZiel, setSchrittZiel] = React.useState(null);
      const [bestaetigenSchritt, setBestaetigenSchritt] = React.useState(null);
      // Der Verweis, der gerade herausgenommen werden soll. Er ist nur die
      // Stelle im eigenen Workflow — der fremde Schritt bleibt, wo er ist.
      const [bestaetigenVerweis, setBestaetigenVerweis] = React.useState(null);
      // Die Fläche: gezogene Kiste, gezogene Verbindung, gewählte Verbindung.
      // Der Mensch, dessen Name und Farbe gerade bearbeitet werden.
      const [personEdit, setPersonEdit] = React.useState(gemerkt.personEdit);
      // Das Verzeichnis der Boards und das Formular für ein neues. Solange
      // keines verbunden ist, trägt die Startseite die Identität ein.
      const [boardOffen, setBoardOffen] = React.useState(false);
      // Ein Wechsel läuft: die Kennung des Ziels, sonst null. Solange er
      // läuft, bleiben die Knöpfe gesperrt; die Seite selbst bleibt stehen.
      const [boardWechselt, setBoardWechselt] = React.useState(null);
      const [boardNeu, setBoardNeu] = React.useState(null);
      const [boardWeg, setBoardWeg] = React.useState(null);
      const [boardMeldung, setBoardMeldung] = React.useState('');
      // Der Weg zum Schreiben auf der Fläche selbst: das Token-Feld der
      // ersten Sitzung. Es lebt nur hier — kein Merker, keine Ablage.
      const [tokenWeg, setTokenWeg] = React.useState(null); // { offen, token, laeuft, fehler }
      // Das Hauptboard wurde beim Start nicht geholt. Der Knopf in der
      // Board-Leiste holt es erneut; solange er läuft, bleibt er gesperrt.
      const [hauptboardLaeuft, setHauptboardLaeuft] = React.useState(false);
      const [hauptboardMeldung, setHauptboardMeldung] = React.useState('');
      // Der Weg zum Veröffentlichen: ohne Token stehen hier die Befehle zum
      // Kopieren; mit Token lief die Route und meldet ihr Ergebnis.
      const [veroeffentlichen, setVeroeffentlichen] = React.useState(null);
      // Die Anzeige kommt aus `GET /board/boards`: Besitzer, Stand und Zahl
      // der Verweise stehen dort, nicht in `/board/data`. Sie wird beim
      // Aufklappen geholt; die Identität reist in derselben Antwort mit.
      const [boardAnzeige, setBoardAnzeige] = React.useState(null);
      const [boardLaedt, setBoardLaedt] = React.useState(false);
      // Der Eigentümer neuer Repositories: das Feld hält den getippten Wert;
      // `null` heißt, es zeigt den gesetzten Wert aus `/board/data`.
      const [eigentuemerFeld, setEigentuemerFeld] = React.useState(null);
      const [start, setStart] = React.useState({
        name: '', github: '', farbe: '#8b5cf6',
        boardName: '', adresse: '', laeuft: false, fehler: '',
      });
      // Der zuletzt aus einem Skill übernommene Ausgang. Steht im Feld noch
      // dieser Vorschlag, darf ein anderer Skill ihn ersetzen; was er selbst
      // getippt hat, bleibt stehen.
      const autoAusgang = React.useRef('');
      const [zug, setZug] = React.useState(null); // { id, x, y }
      const [kanteWahl, setKanteWahl] = React.useState(null); // { von, nach }
      // Welcher fremde Schritt gerade offen ist: sein Ein- und Ausgang stehen
      // dann an seiner Karte. Es gibt dort nichts zu ändern — gelesen wird nur.
      const [fremdOffen, setFremdOffen] = React.useState(null);
      const flaecheRef = React.useRef(null);
      // Die Trefferliste der Suche: dorthin wandern die Pfeiltasten.
      const stationsListeRef = React.useRef(null);
      // Die ganze Arbeitsfläche unter dem Titel — Bezug für die Ablageflächen.
      const raumRef = React.useRef(null);
      const scrollGesetzt = React.useRef(false);
      const inhaltRef = React.useRef(null);
      // Solange er unten ist, wandert die Spalte mit. Scrollt er selbst nach
      // oben, bleibt sie stehen, bis er wieder ganz unten ist.
      const amEnde = React.useRef(true);
      // Welche Datei gerade offen ist — ein Modellaufruf, der währenddessen
      // zurückkommt, darf seinen Text nicht in eine andere Datei schreiben.
      const offenRef = React.useRef(null);
      // Was beim Aufbau der Seite schon offen war, ist kein neues Öffnen: der
      // Bearbeiten-Stand und ein angefangener Satz bleiben dann stehen.
      const wahlRef = React.useRef(auswahl ? auswahl.art + ':' + auswahl.id : null);
      // Der Stand des offenen Boards: jede Antwort trägt die Nummer mit, unter
      // der sie geholt wurde. Nach einem Wechsel zählt eine neue; was vorher
      // unterwegs war, fällt weg.
      const datenLauf = React.useRef(0);
      const dateiRef = React.useRef(leser && leser.art === 'datei'
        ? leser.vorhaben + '/' + leser.datei
        : null);

      React.useEffect(() => {
        let lebendig = true;
        fetch('/board/data', { headers: { accept: 'application/json' } })
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
          .then((d) => { if (lebendig) { gemerkt.data = d; setData(d); } })
          .catch((e) => { if (lebendig) setLadefehler(String((e && e.message) || e)); });
        return () => { lebendig = false; };
      }, []);

      React.useEffect(() => {
        let lebendig = true;
        fetch('/board/skills')
          .then((r) => (r.ok ? r.json() : { skills: [] }))
          .then((d) => { if (lebendig) setSkills((d && d.skills) || []); })
          .catch(() => {});
        return () => { lebendig = false; };
      }, [tick]);

      // Der Katalog wird erst geholt, wenn er offen ist; die Suche geht an den
      // Host, damit dieselbe Regel gilt wie dort. Kurz warten, damit nicht
      // jeder Tastendruck eine Anfrage auslöst. Ein ausdrücklicher Blick
      // (`katalogFrisch`) geht an GitHub vorbei am Zwischenspeicher.
      React.useEffect(() => {
        if (leiste !== 'bibliothek' || bibAnsicht !== 'katalog') return undefined;
        let lebendig = true;
        setKatalogLaedt(true);
        setKatalogFehler('');
        const frisch = katalogFrisch > 0;
        const warten = setTimeout(() => {
          fetch('/board/katalog?suche=' + encodeURIComponent(katalogSuche)
            + (frisch ? '&frisch=1' : ''), {
            headers: { accept: 'application/json' },
          })
            .then(async (antwort) => {
              const d = await antwort.json().catch(() => null);
              if (!antwort.ok) {
                throw new Error(String((d && d.error) || ('HTTP ' + antwort.status)));
              }
              return d;
            })
            .then((d) => {
              if (!lebendig) return;
              setKatalog(d);
              setKatalogLaedt(false);
            })
            .catch((fehler) => {
              if (!lebendig) return;
              setKatalogFehler(String((fehler && fehler.message) || fehler));
              setKatalogLaedt(false);
            });
        }, 150);
        return () => { lebendig = false; clearTimeout(warten); };
      }, [leiste, bibAnsicht, katalogSuche, katalogFrisch]);

      // Der frische Blick gilt dem nächsten Öffnen, nicht jedem späteren: ist
      // der Katalog zu, fällt die Marke weg.
      React.useEffect(() => {
        if (leiste !== 'bibliothek' || bibAnsicht !== 'katalog') setKatalogFrisch(0);
      }, [leiste, bibAnsicht]);

      // Beim Aufklappen der Board-Leiste die Kennzahlen holen. Die Antwort
      // trägt die Identität mit; die Formularfelder entstehen daraus.
      React.useEffect(() => {
        if (!boardOffen) return undefined;
        let lebendig = true;
        setBoardLaedt(true);
        holeBoards()
          .then((d) => {
            if (!lebendig) return;
            setBoardAnzeige(d);
            setBoardLaedt(false);
          })
          .catch((e) => {
            if (!lebendig) return;
            setBoardMeldung(uebersetze('Boards nicht geladen: {0}', [String((e && e.message) || e)]));
            setBoardLaedt(false);
          });
        return () => { lebendig = false; };
      }, [boardOffen]);

      const art = auswahl ? auswahl.art : null;
      const auswahlId = auswahl ? auswahl.id : null;
      // Ob dieses Board beschrieben werden darf. Der Host setzt `darf`; fehlt
      // es (Fassung 1), bleibt es beim bisherigen Weg. Ohne Schreibrecht
      // bietet die Seite keine Knöpfe an, die schreiben.
      const schreibbar = !data || data.darf !== false;
      // Wohin das Mausrad schiebt. Ohne Eintrag seitwärts: das Board ist
      // breiter als hoch, und senkrecht gibt es meist nichts zu holen.
      const mausrad = data && data.einstellungen && data.einstellungen.mausrad === 'auf-ab'
        ? 'auf-ab'
        : 'seitwaerts';
      // Der gesetzte Eigentümer steht in den Einstellungen des Boards; der
      // aufgelöste Name und seine Quelle kommen fertig aus `/board/data`.
      const gesetzterEigentuemer = data && data.einstellungen
        && typeof data.einstellungen.eigentuemer === 'string'
        ? data.einstellungen.eigentuemer
        : '';
      const eigentuemerWert = eigentuemerFeld === null
        ? gesetzterEigentuemer
        : eigentuemerFeld;
      const eigentuemerQuelle = (data && data.eigentuemerQuelle) || '';
      const eigentuemerName = data && typeof data.eigentuemer === 'string'
        ? data.eigentuemer
        : '';

      React.useEffect(() => {
        // Wer die Station öffnet, will sie erst lesen: jede andere Station und
        // das Verlassen beenden das Ändern. Neue Daten tun es nicht — sie
        // kommen auch, während nebenan ein Gespräch läuft. Und der Aufbau der
        // Seite nach einem Wechsel ist kein Öffnen: dann bleibt die Station
        // samt dem, was noch nicht gespeichert ist, offen.
        const jetzt = auswahl ? auswahl.art + ':' + auswahl.id : null;
        const gewechselt = jetzt !== wahlRef.current;
        wahlRef.current = jetzt;
        if (gewechselt) {
          setStationEdit(false);
          setBestaetigen(null);
        }
        if (!data || art !== 'schritt' || !auswahlId) {
          if (gewechselt) setEntwurf(null);
          return;
        }
        if (gewechselt) setEntwurf(schrittEntwurf(data, auswahlId));
      }, [art, auswahlId]);

      // Neue Daten: der Entwurf folgt ihnen, solange niemand daran tippt.
      React.useEffect(() => {
        if (!data || art !== 'schritt' || !auswahlId || stationEdit) return;
        setEntwurf(schrittEntwurf(data, auswahlId));
      }, [data]);

      // Das Vertrauensbild einer geöffneten Station: einmal je Station holen,
      // danach aus dem Zwischenspeicher zeigen. Fassung 1 kennt die Route
      // nicht und bleibt bei seinem bisherigen Bild.
      React.useEffect(() => {
        if (!data || data.format !== 2 || art !== 'schritt' || !auswahlId) return;
        const id = String(auswahlId);
        if (stationGeholt.current.has(id)) return;
        stationGeholt.current.add(id);
        setStationAngaben((alt) => (alt[id] ? alt : { ...alt, [id]: { zustand: 'laedt' } }));
        fetch('/board/station?station=' + encodeURIComponent(id), {
          headers: { accept: 'application/json' },
        })
          .then(async (antwort) => {
            const d = await antwort.json().catch(() => null);
            if (!antwort.ok) {
              throw new Error(String((d && d.error) || ('HTTP ' + antwort.status)));
            }
            return d;
          })
          .then((d) => {
            setStationAngaben((alt) => ({ ...alt, [id]: { zustand: 'ok', daten: d } }));
          })
          .catch((fehler) => {
            // Ein Fehler wird beim nächsten Öffnen erneut versucht.
            stationGeholt.current.delete(id);
            setStationAngaben((alt) => ({
              ...alt,
              [id]: { zustand: 'fehler', fehler: String((fehler && fehler.message) || fehler) },
            }));
          });
      }, [data, art, auswahlId]);

      React.useEffect(() => {
        if (!data || art !== 'vorhaben' || !auswahlId) { setVerlauf(null); return undefined; }
        let lebendig = true;
        setVerlauf({ id: auswahlId, zustand: 'laedt', schritte: [] });
        fetch('/board/verlauf?vorhaben=' + encodeURIComponent(auswahlId))
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
          .then((v) => {
            if (lebendig) {
              setVerlauf({ id: auswahlId, zustand: 'ok', schritte: (v && v.schritte) || [] });
            }
          })
          .catch(() => { if (lebendig) setVerlauf({ id: auswahlId, zustand: 'fehler', schritte: [] }); });
        return () => { lebendig = false; };
      }, [data, art, auswahlId, tick]);

      // Der Verlauf des Boards: nur holen, wenn er offen ist — und nach jeder
      // Speicherung neu, damit die eigene Fassung sofort dasteht.
      React.useEffect(() => {
        if (leiste !== 'verlauf') return undefined;
        let lebendig = true;
        setFassungen({ zustand: 'laedt', liste: [] });
        fetch('/board/fassungen')
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
          .then((d) => {
            if (lebendig) setFassungen({ zustand: 'ok', liste: (d && d.fassungen) || [] });
          })
          .catch(() => { if (lebendig) setFassungen({ zustand: 'fehler', liste: [] }); });
        return () => { lebendig = false; };
      }, [leiste, tick, data]);

      // Ansicht und Scrollstand für den nächsten Besuch der Seite merken.
      React.useEffect(() => { gemerkt.auswahl = auswahl; }, [auswahl]);
      React.useEffect(() => { gemerkt.leser = leser; }, [leser]);
      React.useEffect(() => { gemerkt.beitrag = beitrag; }, [beitrag]);
      // Andere Datei, neuer Auftrag: die Anweisung gehört zu dem Text, den er
      // gerade vor sich hat. Beim Aufbau der Seite bleibt sie stehen.
      const dateiJetzt = leser && leser.art === 'datei' ? leser.vorhaben + '/' + leser.datei : null;
      React.useEffect(() => {
        offenRef.current = dateiJetzt;
        if (dateiRef.current === dateiJetzt) return;
        dateiRef.current = dateiJetzt;
        setAenderung('');
      }, [dateiJetzt]);
      // Ein Transkript im Leser wird beim Aufbau neu geholt: die Läufe selbst
      // werden nicht gemerkt, nur dass das Transkript offen war.
      const transkriptOrt = leser && leser.art === 'transkript'
        ? leser.vorhaben + '/' + leser.position
        : null;
      React.useEffect(() => {
        if (!transkriptOrt || transkript) return;
        ladeTranskript(leser.vorhaben, leser.position);
      }, [transkriptOrt]);
      React.useEffect(() => { gemerkt.lage = lage; }, [lage]);
      React.useEffect(() => { gemerkt.gespraechZu = gespraechZu; }, [gespraechZu]);
      React.useEffect(() => { gemerkt.feldHoehe = feldHoehe; }, [feldHoehe]);
      React.useEffect(() => { gemerkt.spaltenBreite = spaltenBreite; }, [spaltenBreite]);
      React.useEffect(() => { gemerkt.rechtsReiter = rechtsReiter; }, [rechtsReiter]);
      React.useEffect(() => { gemerkt.stationEdit = stationEdit; }, [stationEdit]);
      React.useEffect(() => {
        gemerkt.stationEntwurf = art === 'schritt' ? entwurf : null;
      }, [entwurf, art]);
      React.useEffect(() => { gemerkt.gespraech = gespraech; }, [gespraech]);
      React.useEffect(() => { gemerkt.leiste = leiste; }, [leiste]);
      React.useEffect(() => {
        gemerkt.eingriff = eingriff && !eingriff.laeuft ? eingriff : null;
      }, [eingriff]);
      React.useEffect(() => { gemerkt.aenderung = aenderung; }, [aenderung]);
      React.useEffect(() => { gemerkt.neuerSchritt = neuerSchritt; }, [neuerSchritt]);
      React.useEffect(() => { gemerkt.editVorhaben = editVorhaben; }, [editVorhaben]);
      React.useEffect(() => { gemerkt.projektEdit = projektEdit; }, [projektEdit]);
      React.useEffect(() => { gemerkt.personEdit = personEdit; }, [personEdit]);
      // Anderes Vorhaben, anderes Gespräch: wieder unten anfangen.
      React.useEffect(() => { amEnde.current = true; }, [auswahlId]);

      // Neue Zeilen: wenn er unten ist, mitwandern; sonst in Ruhe lassen.
      React.useEffect(() => {
        const el = inhaltRef.current;
        if (!el || !amEnde.current) return;
        el.scrollTop = el.scrollHeight;
      }, [gespraech, feldHoehe, spaltenBreite, rechtsReiter]);
      // Ein halb getippter Satz überlebt den Wechsel zum Chat auch.
      React.useEffect(() => {
        if (!gespraech) return;
        gemerkt.entwurf = { session: gespraech.session || null, text: gespraech.text || '' };
      }, [gespraech]);

      // Das Mausrad: eine Richtung ohne Taste, die andere mit Shift. Der
      // Zuhörer hängt nativ am Element — React reicht Rad-Ereignisse nur
      // passiv durch, und dann ließe sich das Standardverhalten nicht ersetzen.
      const flaecheBereit = !!data;
      React.useEffect(() => {
        const el = flaecheRef.current;
        if (!el) return undefined;
        const rad = (ev) => {
          if (ev.ctrlKey || ev.metaKey) return; // Zoom bleibt dem Browser
          const roh = Math.abs(ev.deltaX) > Math.abs(ev.deltaY) ? ev.deltaX : ev.deltaY;
          if (!roh) return;
          // Waagerechtes Wischen ohne Shift ist eine eigene Geste; die darf
          // der Browser selbst schieben.
          if (!ev.shiftKey && Math.abs(ev.deltaX) > Math.abs(ev.deltaY)) return;
          // Senkrecht ohne Taste ist genau das, was der Browser ohnehin tut.
          if (mausrad === 'auf-ab' && !ev.shiftKey) return;
          const waagerecht = mausrad === 'seitwaerts' ? !ev.shiftKey : ev.shiftKey;
          const einheit = ev.deltaMode === 1 ? 16
            : ev.deltaMode === 2 ? (waagerecht ? el.clientWidth : el.clientHeight)
              : 1;
          if (waagerecht) el.scrollLeft += roh * einheit;
          else el.scrollTop += roh * einheit;
          ev.preventDefault();
        };
        el.addEventListener('wheel', rad, { passive: false });
        return () => el.removeEventListener('wheel', rad);
      }, [mausrad, flaecheBereit]);

      // Einmal beim Aufbau: der Stand von vorhin.
      React.useEffect(() => {
        if (!data || scrollGesetzt.current) return;
        const el = flaecheRef.current;
        if (!el) return;
        el.scrollLeft = gemerkt.scroll.links || 0;
        el.scrollTop = gemerkt.scroll.oben || 0;
        scrollGesetzt.current = true;
      }, [data]);

      // Jeder Schritt hat sein eigenes Gespräch. Gezeigt wird das des Schritts,
      // an dem das Vorhaben steht: zieht es weiter, verschwindet die Spalte,
      // beim Zurückziehen ist sie wieder da.
      React.useEffect(() => {
        if (!auswahlId || art !== 'vorhaben') return;
        const v = ((data && data.vorgaenge) || []).find((x) => x.id === auswahlId);
        if (!v) return;
        const g = (Array.isArray(v.gespraeche) ? v.gespraeche : [])
          .find((x) => x && x.session && x.position === v.position);
        if (!g) {
          // Kein Gespräch an diesem Schritt. Läuft gerade eins (noch nicht
          // eingetragen), bleibt die Spalte stehen.
          setGespraech((alt) => (alt && alt.position !== v.position ? null : alt));
          return;
        }
        // `true` heißt: ohne Sitzung geschlossen. Kommt die Sitzung nach dem
        // ersten Senden an, darf sie den Chat nicht von allein wieder öffnen.
        if (gespraechZu === true || gespraechZu === g.session) return;
        setGespraech((alt) => (alt && alt.session === g.session
          ? (alt.vorhaben ? alt : { ...alt, vorhaben: v.id })
          : {
            art: 'vorhaben',
            vorhaben: v.id,
            session: g.session,
            position: g.position,
            skill: g.skill || '',
            eintraege: [],
            laeuft: false,
            fehler: '',
            text: entwurfText(g.session),
            seit: null,
            sendet: false,
          }));
      }, [data, art, auswahlId, gespraechZu]);

      // Eine Werkstatt, deren erste Nachricht beim Weggehen noch unterwegs war:
      // die Sitzung steht inzwischen im Board, nur die Spalte wusste es nicht.
      React.useEffect(() => {
        if (!data || !gespraech || gespraech.session || gespraech.art !== 'werkstatt') return;
        const roh = schritteVonFlaeche(data).find((s) => s.id === gespraech.schritt);
        const s = roh && roh.werkstatt && roh.werkstatt.session;
        if (!s) return;
        setGespraech((alt) => (alt && !alt.session ? { ...alt, session: s } : alt));
      }, [data, gespraech]);

      // Solange die Spalte offen ist, fragt sie den Stand ab. Sie zeigt nur
      // Fragen und Antworten; Werkzeuge und Zwischenschritte bleiben im Chat.
      // Jedes Gespräch hat seine eigene Adresse: das eines Vorhabens an einer
      // Station und das der Station selbst (die Werkstatt, in der ihr Skill
      // entsteht).
      const sitzungAktiv = gespraech && gespraech.session ? gespraech.session : null;
      const gespraechArt = gespraech ? (gespraech.art || 'vorhaben') : null;
      const gespraechOrt = gespraech ? (gespraech.art === 'werkstatt'
        ? gespraech.schritt
        : (gespraech.position || '')) : null;
      // Das Gespräch kennt sein Vorhaben selbst. Die Auswahl kann inzwischen
      // eine Station sein; nur alte Zustände fallen auf sie zurück.
      const gespraechVorhaben = gespraech
        ? (gespraech.art === 'werkstatt'
          ? ''
          : (gespraech.vorhaben || (art === 'vorhaben' ? auswahlId : '')))
        : '';
      React.useEffect(() => {
        if (!sitzungAktiv) return undefined;
        let lebendig = true;
        const adresse = gespraechArt === 'werkstatt'
          ? '/board/werkstatt/stand?schritt=' + encodeURIComponent(gespraechOrt || '')
          : '/board/gespraech/stand?vorhaben=' + encodeURIComponent(gespraechVorhaben)
            + '&position=' + encodeURIComponent(gespraechOrt || '');
        const frage = () => {
          fetch(adresse)
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => {
              if (!lebendig || !d || d.session !== sitzungAktiv) return;
              setGespraech((alt) => {
                if (!alt) return alt;
                const eintraege = d.eintraege || [];
                const gleich = alt.laeuft === !!d.laeuft
                  && alt.fehler === (d.fehler || '')
                  && JSON.stringify(alt.eintraege) === JSON.stringify(eintraege);
                // Läuft etwas, wird bei jeder Antwort neu gezeichnet — sonst
                // bliebe die Sekundenanzeige stehen.
                if (gleich && !alt.laeuft) return alt;
                return { ...alt, eintraege, laeuft: !!d.laeuft, fehler: d.fehler || '' };
              });
            })
            .catch(() => {});
        };
        frage();
        const uhr = setInterval(frage, 1500);
        return () => { lebendig = false; clearInterval(uhr); };
      }, [sitzungAktiv, gespraechArt, gespraechOrt, gespraechVorhaben]);

      // Ein Zug ist zu Ende: in der Zwischenzeit können Dateien entstanden und
      // Skills angelegt worden sein — das Board holt sie sich einmal.
      const gespraechLaeuft = !!(gespraech && gespraech.laeuft);
      React.useEffect(() => {
        if (gespraechLaeuft || !sitzungAktiv) return;
        ladeBoard().catch(() => {});
        setTick((n) => n + 1);
      }, [gespraechLaeuft, sitzungAktiv]);

      // Das Board neu holen: nach einem neuen Gespräch oder nach dem Verwerfen
      // stimmt sonst die gemerkte Liste der Gespräche nicht mehr — und nach
      // einem Board-Wechsel gehört die Fläche dem neuen Board.
      async function ladeBoard() {
        const lauf = datenLauf.current;
        const antwort = await fetch('/board/data', {
          headers: { accept: 'application/json' },
          // Eine hängende Antwort darf die Seite nicht dauerhaft sperren.
          signal: AbortSignal.timeout(30000),
        });
        if (!antwort.ok) throw new Error('HTTP ' + antwort.status);
        const d = await antwort.json();
        // Ein Wechsel dazwischen: dieses Bild gehört zum alten Board.
        if (datenLauf.current !== lauf) return d;
        gemerkt.data = d;
        setData(d);
        return d;
      }

      // Die Liste der Boards samt Identität. Sie steht in der Board-Leiste und
      // wird nach einem Wechsel neu gelesen, damit „offen“ am richtigen steht.
      async function holeBoards() {
        const antwort = await fetch('/board/boards', {
          headers: { accept: 'application/json' },
          signal: AbortSignal.timeout(20000),
        });
        if (!antwort.ok) throw new Error('HTTP ' + antwort.status);
        return antwort.json();
      }

      // Was in den Einstellungen gespeichert wurde, gilt auch auf der Fläche:
      // sie holt ihr Bild neu, ohne dass jemand sie neu aufbaut.
      React.useEffect(() => boardAenderungen.hoere(() => {
        ladeBoard().catch(() => {});
      }), []);

      async function poste(pfad, koerper, grenzeMs) {
        const antwort = await fetch(pfad, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(koerper),
          ...(grenzeMs ? { signal: AbortSignal.timeout(grenzeMs) } : {}),
        });
        const wert = await antwort.json();
        if (!antwort.ok) {
          // Status und Körper bleiben am Fehler: bei 409 braucht der Editor
          // den neuen Stand, um ihn zeigen und als Beitrag anbieten zu können.
          const fehler = new Error((wert && wert.error) || ('HTTP ' + antwort.status));
          fehler.status = antwort.status;
          fehler.wert = wert;
          throw fehler;
        }
        return wert;
      }

      async function sende(pfad, koerper) {
        const lauf = datenLauf.current;
        const wert = await poste(pfad, koerper);
        // Antworten von vor einem Board-Wechsel gehören zum alten Board; sie
        // überschreiben die neue Fläche nicht.
        if (datenLauf.current === lauf) setData(wert);
        return wert;
      }

      /** Schreibt den Text des Lesers mit seiner Basis zurück in die Datei. */
      async function dateiSpeichern() {
        if (!leser) return;
        const ziel = vorhaben.find((v) => v.id === leser.vorhaben);
        if (ziel && !(ziel.darf && ziel.darf.aendern)) {
          melde(uebersetze('Dieses Vorhaben verantwortet jemand anderes — „Beitragen“ öffnet einen Pull Request.'));
          return;
        }
        let text = leser.text;
        try {
          // Eine neu geschriebene Datei bekommt den Statuskopf, den jedes
          // Projektartefakt trägt — einmal, beim Anlegen.
          if (leser.vorhanden === false && leser.titel) {
            const heute = new Date().toLocaleDateString('sv-SE');
            text = '---\netage: ' + leser.titel + '\nstatus: in Arbeit\noffene_fragen: 0\nstand: '
              + heute + '\n---\n\n# ' + leser.titel + '\n\n' + text.replace(/^\s+/, '');
          }
          // Kam die Fassung aus dem Überarbeiten, steht das im Verlauf —
          // gespeichert hat er, geschrieben das Modell.
          const herkunft = eingriff && eingriff.art === 'ueberarbeitet'
            && !eingriff.fehler && eingriff.original !== leser.text ? 'modell' : '';
          const antwort = await poste('/board/doc/schreiben', {
            vorhaben: leser.vorhaben, datei: leser.datei, text,
            // Die Basis geht mit: hat jemand anders die Datei inzwischen
            // geändert, schreibt der Host nicht, sondern antwortet 409.
            ...(leser.basis !== undefined ? { basis: leser.basis } : {}),
            ...(herkunft ? { herkunft } : {}),
          });
          melde(uebersetze('„{0}" gespeichert.', [leser.datei]));
          setLeser({
            ...leser,
            text,
            vorhanden: true,
            modus: 'lesen',
            basis: antwort && antwort.basis !== undefined ? antwort.basis : leser.basis,
            konflikt: undefined,
          });
          setEingriff(null);
          setTick((n) => n + 1);
        } catch (e) {
          // 409: der Stand ist neuer. Nichts wurde geschrieben; der eigene
          // Text bleibt im Editor und kann als Beitrag angeboten werden.
          const neu = e && e.status === 409 && e.wert && e.wert.neu;
          if (neu) {
            setLeser({
              ...leser,
              konflikt: {
                text: String(neu.text == null ? '' : neu.text),
                basis: neu.basis == null ? null : neu.basis,
                eigener: text,
              },
              notiz: leser.notiz || '',
            });
            fehler(uebersetze('Der Stand ist neuer — nichts wurde geschrieben. Dein Text bleibt; lege ihn als Pull Request an oder übernimm den neuen Stand.'));
            return;
          }
          fehler(uebersetze('Konnte nicht speichern: {0}', [String((e && e.message) || e)]));
        }
      }

      // Das Repository, gegen das ein Beitrag geht: der Ordner des Vorhabens.
      // Die Route löst ihn über seinen GitHub-Remote zur Adresse auf; ein
      // Vorhaben ohne Remote hat keinen Ort für einen Pull Request.
      function repoDesLesers() {
        if (!leser) return '';
        const ziel = vorhaben.find((v) => v.id === leser.vorhaben) || null;
        return String((ziel && (ziel.repo || ziel.ordner)) || '').trim();
      }

      // Bei einem überholten Stand bleibt der eigene Text der Ausgangspunkt:
      // er wird als Pull Request angeboten, die Datei im Vorhaben bleibt
      // unverändert. Der eigene Text bleibt im Editor stehen.
      function konfliktAlsBeitrag() {
        if (!leser || !leser.konflikt) return;
        const repo = repoDesLesers();
        if (!repo) {
          fehler(uebersetze('Für dieses Vorhaben ist kein Repository verknüpft — ein Beitrag ist ein Pull Request.'));
          return;
        }
        statusWeg();
        setBeitragStart({
          titel: uebersetze('Änderung an „{0}“', [leser.datei]),
          text: String(leser.notiz || '').trim(),
        });
        setLeser({ ...leser, modus: 'beitragen' });
      }

      // Den neuen Stand in den Leser holen; der eigene Text ist damit bewusst
      // aufgegeben. Gespeichert wird dabei nichts.
      function konfliktNeuenStand() {
        if (!leser || !leser.konflikt) return;
        const konflikt = leser.konflikt;
        setLeser({
          ...leser,
          text: konflikt.text,
          basis: konflikt.basis,
          konflikt: undefined,
          modus: 'lesen',
        });
        melde(uebersetze('Der neue Stand steht im Leser.'));
      }

      // In ein fremdes Vorhaben wird nicht geschrieben: „Beitragen“ führt zum
      // Pull Request. Der eigene Text bleibt im Leser; der Quellzweig muss bei
      // GitHub schon liegen, entschieden wird dort.
      function beitragSpeichern() {
        if (!leser || leser.art !== 'datei') return;
        const repo = repoDesLesers();
        if (!repo) {
          fehler(uebersetze('Für dieses Vorhaben ist kein Repository verknüpft — ein Beitrag ist ein Pull Request.'));
          return;
        }
        statusWeg();
        setBeitragStart({
          titel: uebersetze('Änderung an „{0}“', [leser.datei]),
          text: String(leser.notiz || '').trim(),
        });
        setLeser({ ...leser, modus: 'beitragen' });
      }

      // Ein alter Beitrag wird nur noch gelesen. Entschieden wird über ihn
      // nicht mehr im Board: neue Beiträge sind Pull Requests bei GitHub.
      // --- Der Verlauf einer Datei -------------------------------------------
      // Jede Speicherung liegt als Fassung im lokalen Repository. Gezeigt wird,
      // wer gespeichert hat, wann, und was sich geändert hat.

      function wann(iso) {
        const d = new Date(String(iso || ''));
        if (Number.isNaN(d.getTime())) return String(iso || '');
        return d.toLocaleString(sprachTag(), { dateStyle: 'medium', timeStyle: 'short' });
      }

      function wer(autor) {
        return autor === 'Mensch' ? uebersetze('Du') : (autor || uebersetze('unbekannt'));
      }

      function oeffneVerlauf() {
        if (!leser || leser.art !== 'datei') return;
        statusWeg();
        setLeser({ ...leser, modus: 'verlauf' });
        ladeVersionen(leser.vorhaben, leser.datei);
      }

      async function ladeVersionen(vorhabenId, datei) {
        setHistorie({ zustand: 'laedt', liste: [], wahl: 0, version: null, frage: false, fehler: '' });
        try {
          const antwort = await fetch('/board/versionen?vorhaben=' + encodeURIComponent(vorhabenId)
            + '&datei=' + encodeURIComponent(datei));
          if (!antwort.ok) throw new Error('HTTP ' + antwort.status);
          const d = await antwort.json();
          const liste = (d && d.versionen) || [];
          setHistorie({ zustand: 'ok', liste, wahl: 0, version: null, frage: false, fehler: '' });
          if (liste.length) ladeVersion(vorhabenId, datei, liste[0].hash);
        } catch (e) {
          setHistorie({
            zustand: 'fehler', liste: [], wahl: 0, version: null, frage: false,
            fehler: String((e && e.message) || e),
          });
        }
      }

      async function ladeVersion(vorhabenId, datei, hash) {
        setHistorie((alt) => (alt ? { ...alt, version: { zustand: 'laedt' }, frage: false } : alt));
        try {
          const antwort = await fetch('/board/version?vorhaben=' + encodeURIComponent(vorhabenId)
            + '&datei=' + encodeURIComponent(datei) + '&hash=' + encodeURIComponent(hash));
          if (!antwort.ok) throw new Error('HTTP ' + antwort.status);
          const d = await antwort.json();
          setHistorie((alt) => (alt ? { ...alt, version: { zustand: 'ok', ...d } } : alt));
        } catch (e) {
          setHistorie((alt) => (alt
            ? { ...alt, version: { zustand: 'fehler', fehler: String((e && e.message) || e) } }
            : alt));
        }
      }

      function waehleVersion(index) {
        if (!leser || !historie || !historie.liste[index]) return;
        setHistorie((alt) => (alt ? { ...alt, wahl: index } : alt));
        ladeVersion(leser.vorhaben, leser.datei, historie.liste[index].hash);
      }

      /** Setzt die Datei auf die gewählte alte Fassung zurück. */
      async function zurueckAufStand() {
        if (!leser || leser.art !== 'datei' || !historie || !historie.version) return;
        const v = historie.version;
        if (v.zustand !== 'ok' || typeof v.neu !== 'string') return;
        try {
          const antwort = await poste('/board/doc/schreiben', {
            vorhaben: leser.vorhaben,
            datei: leser.datei,
            text: v.neu,
            herkunft: 'zurueck',
            // Auch das Zurücksetzen prüft die Basis; sonst überschriebe es
            // einen inzwischen geänderten Stand.
            ...(leser.basis !== undefined ? { basis: leser.basis } : {}),
          });
          melde(uebersetze('„{0}“ steht wieder auf dem Stand vom {1}.', [leser.datei, wann(v.datum)]));
          setLeser({
            ...leser,
            modus: 'lesen',
            text: v.neu,
            vorhanden: true,
            basis: antwort && antwort.basis !== undefined ? antwort.basis : leser.basis,
          });
          setHistorie(null);
          setEingriff(null);
          setTick((n) => n + 1);
        } catch (e) {
          const neu = e && e.status === 409 && e.wert && e.wert.neu;
          if (neu) {
            fehler(uebersetze('Der Stand ist neuer — nichts wurde zurückgesetzt. Der neue Stand steht im Leser.'));
            setLeser({
              ...leser,
              text: String(neu.text == null ? '' : neu.text),
              basis: neu.basis == null ? null : neu.basis,
              modus: 'lesen',
            });
            setHistorie(null);
            setEingriff(null);
            setTick((n) => n + 1);
            return;
          }
          fehler(uebersetze('Konnte nicht zurücksetzen: {0}', [String((e && e.message) || e)]));
        }
      }

      // Korrigiert nur die Rechtschreibung — der Text bleibt seiner, bis er
      // speichert. Das Original liegt bis zum Speichern daneben.
      /** Bittet das Modell um Rechtschreibung, ohne zu speichern. */
      async function korrigiere() {
        if (!leser || leser.art !== 'datei' || (eingriff && eingriff.laeuft)) return;
        const original = leser.text;
        const ziel = offenRef.current;
        setEingriff({ art: 'korrektur', laeuft: true, original });
        try {
          const wert = await poste('/board/korrigieren', { text: original }, 45000);
          if (offenRef.current !== ziel) return;
          setLeser((alt) => (alt ? { ...alt, text: wert.text } : alt));
          setEingriff({ art: 'korrektur', original });
        } catch (e) {
          const roh = String((e && e.message) || e);
          if (offenRef.current !== ziel) return;
          setEingriff({
            art: 'korrektur',
            original,
            fehler: /abort|timeout/i.test(roh)
              ? uebersetze('Die Korrektur hat zu lange gedauert. Nichts wurde geändert.')
              : roh,
          });
        }
      }

      // Überarbeiten ist ein Vorschlag, kein Speichern: das Modell schreibt
      // eine neue Fassung nach seiner Anweisung, er liest sie im Editor und
      // entscheidet dann. Bis dahin liegt das Original daneben.
      /** Bittet das Modell um eine neue Fassung nach der Anweisung, ohne zu speichern. */
      async function ueberarbeiten() {
        if (!leser || leser.art !== 'datei' || (eingriff && eingriff.laeuft)) return;
        const was = String(aenderung || '').trim();
        if (!was) return;
        const original = leser.text;
        const ziel = offenRef.current;
        setEingriff({ art: 'ueberarbeitet', laeuft: true, original });
        try {
          const wert = await poste('/board/ueberarbeiten', {
            text: original, anweisung: was,
          }, 70000);
          if (offenRef.current !== ziel) return;
          setLeser((alt) => (alt ? { ...alt, text: wert.text } : alt));
          setEingriff({ art: 'ueberarbeitet', original });
        } catch (e) {
          const roh = String((e && e.message) || e);
          if (offenRef.current !== ziel) return;
          setEingriff({
            art: 'ueberarbeitet',
            original,
            fehler: /abort|timeout/i.test(roh)
              ? uebersetze('Das Überarbeiten hat zu lange gedauert. Nichts wurde geändert.')
              : roh,
          });
        }
      }

      // Ein Transkript wird nicht geschrieben, sondern aus der Sitzung geholt:
      // Fragen und Antworten, ohne Werkzeuge. Ob es eines gibt, sagt der Verlauf.
      async function ladeTranskript(vorhabenId, positionId) {
        setTranskript({ zustand: 'laedt', laeufe: [] });
        try {
          const antwort = await fetch('/board/transkript?vorhaben='
            + encodeURIComponent(vorhabenId) + '&position=' + encodeURIComponent(positionId));
          if (!antwort.ok) throw new Error('HTTP ' + antwort.status);
          const d = await antwort.json();
          setTranskript({ zustand: 'ok', laeufe: (d && d.laeufe) || [] });
        } catch {
          setTranskript({ zustand: 'fehler', laeufe: [] });
        }
      }

      function oeffneTranskript(positionId, titel) {
        if (!gewaehltesVorhaben) return;
        statusWeg();
        setEingriff(null);
        setLaufWahl(0);
        setLeser({
          art: 'transkript',
          vorhaben: gewaehltesVorhaben.id,
          position: positionId,
          titel,
        });
        ladeTranskript(gewaehltesVorhaben.id, positionId);
      }

      // Einen alten Beitrag öffnen: Notiz, Station und die Namen der
      // vorgeschlagenen Fassungen stehen in `/board/data`. Neue Beiträge sind
      // Pull Requests; im Board wird über alte Beiträge nicht mehr entschieden.
      function beitragOeffnen(eintrag) {
        if (!eintrag || !eintrag.id) return;
        statusWeg();
        setEingriff(null);
        setBeitrag({
          ...eintrag,
          laedt: false,
          fehler: '',
          dateien: (Array.isArray(eintrag.dateien) ? eintrag.dateien : [])
            .map((d) => (d && typeof d === 'object' && d.name ? d : { name: String(d) })),
        });
        setLeser({
          art: 'beitrag',
          beitrag: eintrag.id,
          vorhaben: eintrag.vorhaben,
          position: eintrag.schritt,
          titel: eintrag.von,
        });
      }

      // Eine Datei im Wurzelordner öffnen und ihre `basis` mitnehmen: nur so
      // merkt der Editor beim Speichern, dass jemand anders sie inzwischen
      // geändert hat. Gelesen wird dieselbe Route wie im Leser.
      /** Öffnet eine Datei im Leser und nimmt ihre Basis für den Konfliktfall mit. */
      function oeffneDateiMitBasis(vorhabenId, name, positionId) {
        fetch('/board/doc?vorhaben=' + encodeURIComponent(vorhabenId)
          + '&datei=' + encodeURIComponent(name))
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => {
            if (!d) { fehler(uebersetze('Die Datei „{0}“ ließ sich nicht lesen.', [name])); return; }
            if (!d.exists) {
              fehler(uebersetze('Die Datei „{0}“ gibt es in diesem Vorhaben nicht.', [name]));
              return;
            }
            statusWeg();
            setEingriff(null);
            setLeser({
              art: 'datei',
              vorhaben: vorhabenId,
              datei: name,
              ...(positionId ? { position: positionId } : {}),
              text: d.text || '',
              basis: d.basis == null ? null : d.basis,
              vorhanden: true,
              modus: 'lesen',
            });
          })
          .catch(() => fehler(uebersetze('Die Datei „{0}“ ließ sich nicht lesen.', [name])));
      }

      // Ein Link auf eine Datei öffnet den Leser — genauso, wie ein Klick auf
      // dem Board die Datei öffnet. Gibt es sie nicht, steht das da; ein
      // leerer Leser wäre ein Versprechen, das nicht stimmt.
      /** Öffnet einen Link aus dem Dokument im Leser, wenn er in das Vorhaben führt. */
      function oeffneLink(ziel) {
        const pfad = linkPfad(ziel);
        if (!pfad || !gewaehltesVorhaben) return false;
        // Ein Link in einen Ordner wird an seiner Stelle geöffnet — sonst
        // öffnete „produkt/README.md" die Datei „README.md" daneben.
        if (pfad.includes('/')) {
          const vorhabenId = gewaehltesVorhaben.id;
          const teile = pfad.split('/');
          const name = teile[teile.length - 1];
          const ordner = teile.slice(0, -1).join('/');
          fetch('/board/datei?vorhaben=' + encodeURIComponent(vorhabenId)
            + '&pfad=' + encodeURIComponent(pfad))
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => {
              if (!d || !d.exists) {
                fehler(uebersetze('Die Datei „{0}“ gibt es in diesem Vorhaben nicht.', [pfad]));
                return;
              }
              statusWeg();
              setEingriff(null);
              setLeser({
                art: 'datei',
                vorhaben: vorhabenId,
                datei: name,
                pfad,
                ordner,
                text: d.text || '',
                vorhanden: true,
                binaer: !!d.binaer,
                modus: 'lesen',
              });
            })
            .catch(() => fehler(uebersetze('Die Datei „{0}“ ließ sich nicht lesen.', [pfad])));
          return true;
        }
        oeffneDateiMitBasis(gewaehltesVorhaben.id, pfad, null);
        return true;
      }

      // Eine Datei, die es noch nicht gibt, wird hier nicht angekündigt —
      // sie wird geschrieben. Der Leser öffnet sich leer und speichert beim
      // ersten Speichern mit Statuskopf.
      function oeffneSchreiben(datei, titel, positionId) {
        if (!gewaehltesVorhaben) return;
        // Ein fremdes Vorhaben bekommt kein leeres Blatt zum Schreiben.
        if (!(gewaehltesVorhaben.darf && gewaehltesVorhaben.darf.aendern)) return;
        statusWeg();
        setEingriff(null);
        setLeser({
          art: 'datei',
          vorhaben: gewaehltesVorhaben.id,
          datei,
          position: positionId,
          text: '',
          // Eine noch nicht gefasste Datei hat keine Basis; entsteht sie
          // inzwischen woanders, antwortet das Speichern mit 409.
          basis: null,
          vorhanden: false,
          modus: 'bearbeiten',
          titel,
        });
      }

      // --- Ein Zweig von hier aus ------------------------------------------
      //
      // Die Datei bleibt, wo sie ist, und das Vorhaben auch. Was entsteht, ist
      // ein zweites Vorhaben: es nimmt die Dateien bis zu dieser Station mit
      // und beginnt dort, wohin von hier eine Schnur führt. Damit kann
      // dieselbe Idee zwei Wege gehen, ohne dass einer den anderen verdrängt.

      // Die Stationen von Anfang bis hierher — sie bestimmen, was mitkommt.
      function stationenBis(ziel) {
        const gesehen = new Set();
        const offen = [ziel];
        while (offen.length) {
          const id = offen.pop();
          if (!id || gesehen.has(id)) continue;
          const p = positionen.find((x) => x.id === id);
          if (!p) continue;
          gesehen.add(id);
          ((p.abgeleitet || {}).vorgaenger || []).forEach((v) => offen.push(v));
        }
        return positionen.filter((p) => gesehen.has(p.id));
      }

      // Wohin ein Zweig von dieser Station aus gehen kann: die Stationen, zu
      // denen eine Schnur führt. Eine ohne Schnur wäre kein Weg, sondern ein
      // Sprung.
      function zweigZiele(positionId) {
        const p = positionen.find((x) => x.id === positionId);
        return (p && p.abgeleitet.nachfolger) || [];
      }

      function zweigMit(positionId) {
        const namen = [];
        stationenBis(positionId).forEach((p) => {
          eigeneDateien(p).forEach((d) => {
            if (d.exists && !namen.includes(d.name)) namen.push(d.name);
          });
        });
        return namen;
      }

      function zweigVorschlag(vorhabenId, zielId) {
        const v = vorhaben.find((x) => x.id === vorhabenId);
        return (v ? v.name : 'Zweig') + ' — ' + positionsName(zielId);
      }

      function zweigBeginnen() {
        if (!leser || leser.art !== 'datei' || !leser.position) return;
        const ziele = zweigZiele(leser.position);
        if (!ziele.length) return;
        statusWeg();
        setZweig({
          ziel: ziele[0],
          name: zweigVorschlag(leser.vorhaben, ziele[0]),
          laeuft: false,
          fehler: null,
        });
        setLeser({ ...leser, modus: 'abzweig' });
      }

      // Die Wahl der Station nimmt den Vorschlag mit. Einen Namen, den er
      // selbst geschrieben hat, lässt sie stehen.
      function zweigZielWaehlen(ziel) {
        if (!leser || !zweig) return;
        const war = zweigVorschlag(leser.vorhaben, zweig.ziel);
        setZweig({
          ...zweig,
          ziel,
          ...(zweig.name === war ? { name: zweigVorschlag(leser.vorhaben, ziel) } : {}),
        });
      }

      /** Legt den Zweig an der gewählten Station an und öffnet ihn. */
      async function zweigAnlegen() {
        if (!leser || leser.art !== 'datei' || !zweig || zweig.laeuft) return;
        const name = String(zweig.name || '').trim();
        if (!name) { setZweig({ ...zweig, fehler: uebersetze('Der Zweig braucht einen Namen.') }); return; }
        setZweig({ ...zweig, laeuft: true, fehler: null });
        try {
          const wert = await sende('/board/vorhaben/abzweigen', {
            id: leser.vorhaben,
            station: leser.position,
            ziel: zweig.ziel,
            name,
          });
          const mit = (wert && wert.mit) || [];
          const zielName = positionsName(zweig.ziel);
          setLeser(null);
          setZweig(null);
          setAuswahl({ art: 'vorhaben', id: wert.neu });
          melde(uebersetze('Zweig „{0}“ liegt jetzt bei „{1}“{2}.', [name, zielName, mit.length ? ' — mit ' + mit.join(', ') : '']));
        } catch (e) {
          setZweig({ ...zweig, laeuft: false, fehler: String((e && e.message) || e) });
        }
      }

      // Der Auftrag, mit dem ein Skill an einem Schritt beginnt.
      function auftragFuer(skill, positionId) {
        if (!gewaehltesVorhaben) return '';
        const schritt = positionen.find((p) => p.id === positionId);
        const ordner = 'vorgaenge/' + (gewaehltesVorhaben.ordner || gewaehltesVorhaben.id);
        return 'Führe den Skill „' + skill + '" für das Vorhaben „'
          + gewaehltesVorhaben.name + '" aus.\n\n'
          + 'Ordner: /workspace/projekte/board/' + ordner + '/\n'
          + 'Station: ' + (schritt ? schritt.name : positionId) + '\n\n'
          + 'Lies die Anleitung des Skills und beginne mit dem Gespräch.';
      }

      // Das Gespräch läuft im Board: rechts öffnet sich die Spalte, und der
      // Auftrag geht mit dem Klick sofort hinaus. Der Klick ist die Freigabe;
      // die Sitzung entsteht dabei. Kein Modelllauf ohne diesen Klick.
      //
      // Gibt es an diesem Schritt schon ein Gespräch, wird es wieder
      // aufgeschlagen statt ein zweites zu beginnen. Ein neues will er
      // ausdrücklich: erst verwerfen, dann starten.
      function entwurfText(session) {
        return gemerkt.entwurf && session && gemerkt.entwurf.session === session
          ? gemerkt.entwurf.text
          : '';
      }

      /** Öffnet das Gespräch an einer Station oder schlägt ein vorhandenes wieder auf. */
      async function gespraechBeginnen(skill, positionId) {
        statusWeg();
        setGespraechZu(null);
        amEnde.current = true;
        // Ein Seitenpanel zur Zeit: das Gespräch öffnet sich im rechten Dock
        // und nimmt der linken Leiste den Platz.
        setLeiste(null);
        const vorhanden = gewaehltesVorhaben
          && (Array.isArray(gewaehltesVorhaben.gespraeche) ? gewaehltesVorhaben.gespraeche : [])
            .find((g) => g && g.session && g.position === positionId);
        if (vorhanden) {
          setGespraech({
            art: 'vorhaben',
            vorhaben: gewaehltesVorhaben.id,
            session: vorhanden.session,
            position: vorhanden.position,
            skill: vorhanden.skill || skill,
            eintraege: [],
            laeuft: false,
            fehler: '',
            text: entwurfText(vorhanden.session),
            seit: null,
            sendet: false,
          });
          setRechtsReiter('gespraech');
          nachRender(() => fokusRechts('gespraech'));
          return;
        }
        const auftrag = auftragFuer(skill, positionId);
        if (!auftrag) return;
        // Der Klick ist die Freigabe: der Auftrag geht sofort hinaus, das
        // Modell beginnt zu fragen. Kein Text zum Abschicken mehr im Feld.
        const entwurf = {
          art: 'vorhaben',
          vorhaben: gewaehltesVorhaben.id,
          session: null,
          position: positionId,
          skill,
          eintraege: [],
          laeuft: false,
          fehler: '',
          text: '',
          seit: null,
          sendet: true,
        };
        setGespraech(entwurf);
        setRechtsReiter('gespraech');
        nachRender(() => fokusRechts('gespraech'));
        await sendenFuer(entwurf, auftrag);
      }

      // Wohin ein Gespräch gehört: an ein Vorhaben an dieser Station oder an
      // die Werkstatt der Station. Beides hat seine eigene Route. Das
      // Vorhaben steht im Gespräch selbst; die Auswahl ist nur der Rückfall
      // für alte Zustände, denn sie kann inzwischen eine Station sein.
      function gespraechZiel(stand) {
        if (stand && stand.art === 'werkstatt') {
          return { pfad: '/board/werkstatt', koerper: { schritt: stand.schritt } };
        }
        const vorhabenId = (stand && stand.vorhaben)
          || (gewaehltesVorhaben ? gewaehltesVorhaben.id : null);
        if (!vorhabenId) return null;
        return {
          pfad: '/board/gespraech',
          koerper: { vorhaben: vorhabenId, position: stand.position },
        };
      }

      /** Schickt einen Text in das laufende Gespräch und wartet auf den Stand. */
      async function sendenFuer(stand, text) {
        const ziel = gespraechZiel(stand);
        if (!ziel) {
          // Ohne Ziel darf „sendet …“ nicht stehen bleiben.
          setGespraech((alt) => (alt ? { ...alt, sendet: false } : alt));
          return;
        }
        try {
          const wert = await poste(ziel.pfad + '/senden', {
            ...ziel.koerper,
            ...(stand.art === 'werkstatt' ? {} : { skill: stand.skill }),
            text,
          });
          setGespraech((alt) => (alt
            ? {
              ...alt, session: wert.session, text: '', sendet: false, laeuft: true, seit: Date.now(),
            }
            : alt));
          // Beim ersten Senden entsteht die Sitzung — jetzt steht sie im Board.
          ladeBoard().catch(() => {});
        } catch (e) {
          setGespraech((alt) => (alt
            ? { ...alt, sendet: false, fehler: uebersetze('Nicht gesendet: ') + String((e && e.message) || e) }
            : alt));
        }
      }

      async function gespraechSenden() {
        if (!gespraech) return;
        const text = String(gespraech.text || '').trim();
        if (!text || gespraech.sendet || gespraech.laeuft) return;
        amEnde.current = true;
        setGespraech({ ...gespraech, sendet: true, fehler: '' });
        await sendenFuer(gespraech, text);
      }

      async function gespraechStoppen() {
        const ziel = gespraech ? gespraechZiel(gespraech) : null;
        if (!ziel) return;
        try {
          await poste(ziel.pfad + '/stopp', ziel.koerper);
        } catch (e) {
          setGespraech((alt) => (alt
            ? { ...alt, fehler: uebersetze('Stopp nicht möglich: ') + String((e && e.message) || e) }
            : alt));
        }
      }

      // Verwerfen heißt: die Sitzung ins Archiv legen und die Spalte schließen.
      // Die Dateien, die dabei entstanden sind, bleiben — sie gehören dem Schritt.
      async function gespraechVerwerfen() {
        const ziel = gespraech ? gespraechZiel(gespraech) : null;
        if (!ziel) return;
        try {
          await sende(ziel.pfad + '/verwerfen', ziel.koerper);
          setGespraech(null);
          setGespraechZu(null);
          if (stationImDock) {
            setRechtsReiter('station');
            nachRender(() => fokusRechts('station'));
          }
          melde(uebersetze('Gespräch verworfen. Die Sitzung liegt im Archiv.'));
          setTick((n) => n + 1);
        } catch (e) {
          fehler(uebersetze('Konnte nicht verwerfen: {0}', [String((e && e.message) || e)]));
        }
      }

      // Die Werkstatt hat einen Skill angelegt: er steht im Ordner, das Board
      // trägt ihn an der Station ein. Gefragt wird nicht — der Klick ist die
      // Freigabe, und der Name steht daneben.
      async function skillEintragen(name) {
        if (!gespraech || gespraech.art !== 'werkstatt' || !name) return;
        try {
          await sende('/board/skill/eintragen', { schritt: gespraech.schritt, skill: name });
          setGespraech((alt) => (alt
            ? { ...alt, vorher: [...(alt.vorher || []), name] }
            : alt));
          // Steht das Formular offen, zeigt es den neuen Skill gleich an;
          // sonst würde ein späteres Speichern ihn wieder überschreiben.
          setEntwurf((alt) => (alt && alt.wieArt === 'skill' ? { ...alt, wieWert: name } : alt));
          setTick((n) => n + 1);
          melde(uebersetze('Skill „{0}“ an der Station „{1}“ eingetragen.', [name, gespraech.titel || '']));
        } catch (e) {
          fehler(uebersetze('Nicht eingetragen: {0}', [String((e && e.message) || e)]));
        }
      }

      function chatOeffnen(session) {
        const ui = ctx && typeof ctx.get === 'function' ? ctx.get('uiWorkspace') : undefined;
        if (!ui || typeof ui.openSession !== 'function') {
          fehler(uebersetze('Von hier lässt sich kein Chat öffnen.'));
          return;
        }
        ui.openSession(session);
      }

      // Ein Schritt entsteht in der Bibliothek; erst das Ziehen auf die Fläche
      // setzt ihn in den Workflow. Dort ist er nur ein Verweis — bearbeitet
      // wird immer der Schritt selbst.
      async function schrittAnlegen() {
        const name = String(neuerSchritt || '').trim();
        if (!name) { setNeuerSchritt(null); return; }
        try {
          await sende('/board/schritt', { name });
          setNeuerSchritt(null);
          melde(uebersetze('Station „{0}“ angelegt. Zieh sie aus der Bibliothek auf die Fläche.', [name]));
        } catch (e) {
          fehler(uebersetze('Konnte nicht anlegen: {0}', [String((e && e.message) || e)]));
        }
      }

      // Einen Schritt in den Workflow setzen. Fällt er auf eine Station („nach“),
      // hängt er gleich hinter ihr: der Host legt die Verbindung mit an. Kennt
      // ein älterer Host das Feld nicht, legt das Board sie nach — so bleibt es
      // bei einer Verbindung, gleich wer sie schreibt.
      async function schrittEinfuegen(schrittId, x, y, nach) {
        const vorher = new Set(positionenVon(data).map((p) => p.id));
        try {
          const neu = await sende('/board/positions', { schritt: schrittId, x, y, nach });
          if (!nach) {
            melde(uebersetze('Station in den Workflow gesetzt.'));
            return;
          }
          const kanten = (eigenerWorkflow(neu) || {}).kanten || [];
          const stelle = positionenVon(neu).find((p) => !vorher.has(p.id));
          if (stelle && !kanten.some((k) => k.von === nach && k.nach === stelle.id)) {
            await sende('/board/kante', { von: nach, nach: stelle.id });
          }
          melde(uebersetze('Station eingesetzt und gleich danach angeschlossen.'));
        } catch (e) {
          fehler(uebersetze('Konnte nicht einsetzen: {0}', [String((e && e.message) || e)]));
        }
      }

      // Eine Station aus der Bibliothek in den Workflow stellen. Der Host
      // schreibt den Verweis, eine neue Position und, wo es passt, die Kante;
      // die Antwort ist das neue Board und ersetzt den bisherigen Stand.
      async function stationInWorkflow(station) {
        const id = String((station && station.id) || '').trim();
        if (!id) {
          fehler(uebersetze('Diese Station lässt sich nicht in den Workflow stellen.'));
          return;
        }
        try {
          await sende('/board/workflow/station', { station: id });
          melde(uebersetze('Station „{0}“ steht im Workflow.', [(station && station.name) || id]));
        } catch (e) {
          fehler(uebersetze('Nicht in den Workflow gestellt: {0}', [String((e && e.message) || e)]));
        }
      }

      // Eine Station auf ihren neuesten Tag ziehen. Der Host schreibt nur den
      // einen Verweis im Workflow und antwortet mit dem neuen Bild; danach
      // wird das Stationsbild neu gelesen, damit die neue Fassung dasteht.
      async function fassungNachziehen(id) {
        const kennung = String(id || '').trim();
        if (!kennung) return;
        try {
          stationGeholt.current.delete(kennung);
          await sende('/board/workflow/nachziehen', { station: kennung });
          melde(uebersetze('Fassung nachgezogen.'));
        } catch (e) {
          fehler(uebersetze('Nicht nachgezogen: {0}', [String((e && e.message) || e)]));
        }
      }

      // Eine Station anlegen: der Host baut das Repository im Zwischenspeicher
      // und trägt den Verweis ins Board ein; die Antwort ersetzt den Stand.
      // Der Erfolg bleibt als Bestätigung stehen — mit Repository und dem Weg
      // in den Katalog; dort steht sie auf anderen Boards. Ein Fehler bleibt
      // im Formular stehen, damit er dort gelesen wird.
      /** Legt eine Station an und lässt die Bestätigung stehen. */
      async function stationAnlegen() {
        if (!stationNeu || stationNeu.laeuft) return;
        const name = String(stationNeu.name || '').trim();
        if (!name) {
          setStationNeu({ ...stationNeu, fehler: uebersetze('Ein Name fehlt.') });
          return;
        }
        setStationNeu({ ...stationNeu, laeuft: true, fehler: '' });
        laeuft(uebersetze('Lege an …'));
        try {
          const antwort = await sende('/board/station', {
            name,
            beschreibung: String(stationNeu.beschreibung || ''),
          });
          const neu = antwort && antwort.station ? antwort.station : null;
          setStationNeu(null);
          setBibOffen(null);
          setStationAngelegt(neu
            ? { ...neu }
            : { name, owner: '', repo: '' });
          melde(neu
            ? uebersetze('Station „{0}“ angelegt: {1}/{2}. Auf anderen Boards findest du sie im Katalog.', [name, neu.owner, neu.repo])
            : uebersetze('Station „{0}“ angelegt.', [name]));
        } catch (e) {
          const grund = String((e && e.message) || e);
          setStationNeu((alt) => (alt
            ? { ...alt, laeuft: false, fehler: grund }
            : alt));
          fehler(uebersetze('Konnte nicht anlegen: {0}', [grund]));
        }
      }

      // Einen Workflow aus einem lokalen Ordner ins Board übernehmen. Der Host
      // schreibt den Verweis in `board.json` und antwortet mit dem neuen Board;
      // die Seite ersetzt ihren Stand damit und öffnet den neuen Workflow.
      /** Übernimmt einen Workflow aus einem Ordner ins Board. */
      async function workflowUebernehmen() {
        const ordner = String(workflowNeu || '').trim();
        if (!ordner) { setWorkflowNeu(null); return; }
        if (workflowLaeuft) return;
        // Was vorher schon im Board stand, damit der neue Eintrag zu erkennen
        // ist — seine Kennung kommt vom Host, nicht aus der Eingabe.
        const vorher = new Set();
        for (const person of (Array.isArray(data && data.workflows) ? data.workflows : [])) {
          for (const workflow of ((person && person.workflows) || [])) {
            vorher.add(String(person.id) + '/' + String(workflow.id));
          }
        }
        setWorkflowLaeuft(true);
        try {
          const neu = await sende('/board/workflow/verbinden', { repo: ordner });
          const flaechen = Array.isArray(neu && neu.workflows) ? neu.workflows : [];
          let neuerSchluessel = '';
          let anzahl = 0;
          for (const person of flaechen) {
            for (const workflow of ((person && person.workflows) || [])) {
              anzahl += 1;
              const schluessel = String(person.id) + '/' + String(workflow.id);
              if (!vorher.has(schluessel)) neuerSchluessel = schluessel;
            }
          }
          setWorkflowNeu(null);
          if (neuerSchluessel) setBibOffen({ art: 'workflow', id: neuerSchluessel });
          melde(anzahl === 1
            ? uebersetze('Workflow übernommen — das Board hat jetzt einen Workflow.')
            : uebersetze('Workflow übernommen — das Board hat jetzt {0} Workflows.', [anzahl]));
        } catch (e) {
          fehler(uebersetze('Nicht übernommen: {0}', [String((e && e.message) || e)]));
        } finally {
          setWorkflowLaeuft(false);
        }
      }

      // Das Probeprojekt aus dem Katalog in ein eigenes Board übernehmen.
      // Fehlt der eigene Name, steht zuerst das kleine Formular da; danach
      // führt derselbe Knopf die Übernahme aus. Das Original wird nur gelesen.
      /** Bereitet die Übernahme aus dem Katalog vor; ohne Namen fragt sie zuerst danach. */
      async function uebernehmenOeffnen(eintrag) {
        const repo = String((eintrag && eintrag.repo) || '').trim();
        if (!repo || (uebernahme && uebernahme.laeuft)) return;
        let id = { name: '', github: '', farbe: '#8b5cf6' };
        try {
          const antwort = await fetch('/board/identitaet', {
            headers: { accept: 'application/json' },
          });
          if (antwort.ok) {
            const d = await antwort.json();
            const roh = (d && d.identitaet) || {};
            id = {
              name: String(roh.name || ''),
              github: String(roh.github || ''),
              farbe: /^#[0-9a-f]{6}$/i.test(String(roh.farbe || ''))
                ? String(roh.farbe) : '#8b5cf6',
            };
          }
        } catch { /* ohne Antwort fragt das Formular */ }
        const stand = {
          repo, ...id, form: !id.name.trim(), laeuft: false, fehler: '',
        };
        if (!stand.form) { await uebernehmenAusfuehren(stand); return; }
        setUebernahme(stand);
      }

      /** Übernimmt das Probeprojekt aus dem Katalog in ein eigenes Board. */
      async function uebernehmenAusfuehren(kandidat) {
        const stand = kandidat || uebernahme;
        if (!stand || stand.laeuft) return;
        const name = String(stand.name || '').trim();
        if (!name) {
          setUebernahme({ ...stand, form: true, fehler: uebersetze('Bitte einen Namen angeben.') });
          return;
        }
        setUebernahme({ ...stand, laeuft: true, fehler: '' });
        try {
          // Fehlte der Name, wird die Identität zuerst eingetragen; sie gilt
          // für alle Boards und trägt GitHub-Name und Farbe mit.
          if (stand.form) {
            await poste('/board/identitaet', {
              name,
              github: String(stand.github || '').trim(),
              farbe: stand.farbe,
            });
          }
          await poste('/board/uebernehmen', {
            repo: stand.repo,
            ...(stand.form ? { name } : null),
          });
          // Das neue Board ist offen; die Seite baut sich auf ihm auf, ohne
          // den Weg über den Chat.
          await neuAufbauen({ zuruecksetzen: true });
          setUebernahme(null);
          setLeiste(null);
          melde(uebersetze('Board geöffnet: {0}.', [name]));
        } catch (e) {
          setUebernahme({
            ...stand,
            laeuft: false,
            form: stand.form
              || Boolean(e && e.status === 409 && e.wert && e.wert.fehlt === 'name'),
            fehler: String((e && e.message) || e),
          });
        }
      }

      async function schrittLoeschen() {
        if (!bestaetigenSchritt) return;
        try {
          await sende('/board/schritt/loeschen', { id: bestaetigenSchritt });
          setBestaetigenSchritt(null);
          setAuswahl(null);
          melde(uebersetze('Station gelöscht.'));
        } catch (e) {
          setBestaetigenSchritt(null);
          fehler(uebersetze('Konnte nicht löschen: {0}', [String((e && e.message) || e)]));
        }
      }

      // Einen fremden Schritt aus seiner Fläche in den eigenen Workflow
      // stellen. Er wird nicht kopiert: der Host schreibt einen Verweis in die
      // eigene Datei, die Datei des Hosts bleibt, wie sie ist.
      async function fremdAnstellen(ref) {
        if (!ref) return;
        try {
          await sende('/board/fremd/anstellen', { ref });
          melde(uebersetze('Der Schritt steht jetzt in deinem Workflow — als Verweis auf „{0}“.', [ref]));
        } catch (e) {
          fehler(uebersetze('Nicht angestellt: {0}', [String((e && e.message) || e)]));
        }
      }

      // Den Verweis wieder herausnehmen. Der fremde Schritt selbst bleibt.
      async function verweisEntfernen(ref) {
        if (!ref) return;
        try {
          await sende('/board/fremd/entfernen', { ref });
          setBestaetigenVerweis(null);
          setAuswahl(null);
          melde(uebersetze('Verweis herausgenommen. Der Schritt bleibt bei seinem Host.'));
        } catch (e) {
          setBestaetigenVerweis(null);
          fehler(uebersetze('Konnte den Verweis nicht herausnehmen: {0}', [String((e && e.message) || e)]));
        }
      }

      async function vorhabenAnlegen() {
        const wert = String(editVorhaben || '').trim();
        if (!wert) { setEditVorhaben(null); return; }
        laeuft(uebersetze('Lege an …'));
        try {
          const neu = await sende('/board/vorhaben', { name: wert });
          const angelegt = (neu.vorgaenge || []).find((v) => v.name === wert);
          melde(uebersetze('Vorhaben „{0}" angelegt.', [wert]));
          setEditVorhaben(null);
          if (angelegt) setAuswahl({ art: 'vorhaben', id: angelegt.id });
        } catch (e) {
          fehler(uebersetze('Konnte nicht speichern: {0}', [String((e && e.message) || e)]));
        }
      }

      // Ein Vorhaben an einer Station anlegen. Die Station ist die Position im
      // Workflow, an der die Karte erscheinen soll; die Antwort ersetzt den
      // Stand, ein Fehler bleibt im Formular der Karte stehen.
      async function vorhabenAnStationAnlegen(position) {
        if (!vorhabenNeu || vorhabenNeu.laeuft || !position) return;
        const name = String(vorhabenNeu.name || '').trim();
        if (!name) {
          setVorhabenNeu({ ...vorhabenNeu, fehler: uebersetze('Ein Name fehlt.') });
          return;
        }
        setVorhabenNeu({ ...vorhabenNeu, laeuft: true, fehler: '' });
        laeuft(uebersetze('Lege an …'));
        try {
          await sende('/board/vorhaben', { name, station: position.id });
          setVorhabenNeu(null);
          melde(uebersetze('Vorhaben „{0}“ angelegt.', [name]));
        } catch (e) {
          const grund = String((e && e.message) || e);
          setVorhabenNeu((alt) => (alt
            ? { ...alt, laeuft: false, fehler: grund }
            : alt));
          fehler(uebersetze('Konnte nicht anlegen: {0}', [grund]));
        }
      }

      async function verschiebenNach(id, positionId) {
        const v = (data.vorgaenge || []).find((x) => x.id === id);
        const p = positionenVon(data).find((x) => x.id === positionId);
        try {
          await sende('/board/vorhaben/verschieben', { id, position: positionId });
          melde(uebersetze('„{0}" ist jetzt bei {1}.', [v ? v.name : id, p ? p.name : positionId]));
        } catch (e) {
          fehler(uebersetze('Konnte nicht verschieben: {0}', [String((e && e.message) || e)]));
        }
      }

      // Ein Vorhaben wandert entlang einer Verbindung. Gibt es mehrere, wählt
      // er; die Kante ist die Reihenfolge. Der Pfeil schiebt sofort — er nennt
      // die Station, ein Klick genügt; gefragt wird nur beim Ziehen, wo ein
      // Griff danebengehen kann.
      async function vorhabenNach(id, nach) {
        if (!nach) return;
        const v = (data.vorgaenge || []).find((x) => x.id === id);
        if (!v || v.position === nach) return;
        statusWeg();
        await verschiebenNach(id, nach);
      }

      async function projektSpeichern() {
        if (!projektEdit) return;
        const name = String(projektEdit.name || '').trim();
        if (!name) { fehler(uebersetze('Das Vorhaben braucht einen Namen.')); return; }
        try {
          await sende('/board/vorhaben/aendern', {
            id: projektEdit.id,
            name,
            farbe: projektEdit.farbe,
          });
          setProjektEdit(null);
          statusWeg();
        } catch (e) {
          fehler(uebersetze('Konnte nicht speichern: {0}', [String((e && e.message) || e)]));
        }
      }

      async function personAendern() {
        if (!personEdit) return;
        try {
          const ich = ((data && data.personen) || []).find((p) => p.ich);
          await sende('/board/person/aendern', {
            id: personEdit.id,
            name: personEdit.name,
            farbe: personEdit.farbe,
            ...(ich && ich.id === personEdit.id
              ? { github: String(personEdit.github || '') }
              : {}),
          });
          setPersonEdit(null);
          statusWeg();
        } catch (e) {
          fehler(uebersetze('Name oder Farbe nicht gespeichert: {0}', [String((e && e.message) || e)]));
        }
      }

      // Was zum alten Board gehörte, fällt bei einem Wechsel weg: die Auswahl,
      // der Leser, das Gespräch, offene Formulare, Entwürfe und der gemerkte
      // Scrollstand. Was zum Menschen gehört — Name, Farbe, Spaltenbreite —
      // bleibt. Der Katalog bleibt auch: er zeigt das Hauptboard, nicht das
      // offene Board.
      /** Räumt beim Board-Wechsel alles ab, was zum alten Board gehörte. */
      function boardZuruecksetzen() {
        setAuswahl(null);
        setLeser(null);
        setBeitrag(null);
        setBeitragStart(null);
        setZweig(null);
        setDateien(null);
        setTranskript(null);
        setVerlauf(null);
        setFassungen(null);
        setHistorie(null);
        setEditPos(null);
        setEditVorhaben(null);
        setProjektEdit(null);
        setPersonEdit(null);
        setZurueck(null);
        setWeiter(null);
        setVerschieben(null);
        setZiehen(null);
        setZiel(null);
        setZeiger(null);
        setLeserZiehen(null);
        setBestaetigen(null);
        setBestaetigenSchritt(null);
        setBestaetigenVerweis(null);
        setSchrittZug(null);
        setSchrittZiel(null);
        setKanteWahl(null);
        setFremdOffen(null);
        setNeuerSchritt(null);
        setEingriff(null);
        setAenderung('');
        setStationEdit(false);
        setEntwurf(null);
        setStationAngaben({});
        setStationNeu(null);
        setStationAngelegt(null);
        setVorhabenNeu(null);
        setWorkflowNeu(null);
        setUebernahme(null);
        setBibOffen(null);
        setGespraech(null);
        setGespraechZu(null);
        setRechtsReiter(null);
        setLaufWahl(0);
        setVeroeffentlichen(null);
        setBoardWeg(null);
        setEigentuemerFeld(null);
        statusWeg();
        setBoardMeldung('');
        // Auch das Gemerkte fällt weg: sonst käme beim nächsten Aufbau die
        // Auswahl oder ein halb getippter Satz des alten Boards zurück.
        datenLauf.current += 1;
        gemerkt.auswahl = null;
        gemerkt.leser = null;
        gemerkt.beitrag = null;
        gemerkt.gespraech = null;
        gemerkt.entwurf = null;
        gemerkt.stationEdit = false;
        gemerkt.stationEntwurf = null;
        gemerkt.eingriff = null;
        // Die Fläche des neuen Boards beginnt oben links, nicht dort, wo die
        // alte stand.
        gemerkt.scroll = { links: 0, oben: 0 };
        scrollGesetzt.current = false;
        stationGeholt.current = new Set();
        wahlRef.current = null;
        autoAusgang.current = '';
        amEnde.current = true;
      }

      // Die Seite mit ihrem Board neu füllen, ohne sie zu verlassen: das Bild,
      // die Liste der Boards und die Identität. Ein Neuladen wirft aus dem
      // Board in den Chat — bei jedem Wechsel, Verbinden und Entfernen falsch.
      async function neuAufbauen({ zuruecksetzen = false } = {}) {
        if (zuruecksetzen) boardZuruecksetzen();
        await ladeBoard();
        const liste = await holeBoards();
        setBoardAnzeige(liste);
        return liste;
      }

      // Ein anderes Board öffnen: die Fläche wird mit ihm neu gefüllt, die
      // Seite bleibt stehen. Ein Neuladen würde aus dem Board in den Chat
      // werfen, weil die Ansicht nicht an der Adresse hängt.
      /** Öffnet ein anderes Board, ohne die Seite zu verlassen. */
      async function boardWechseln(id) {
        if (!data || id === data.aktiv) { setBoardOffen(false); return; }
        if (boardWechselt) return;
        const eintrag = ((boardAnzeige && boardAnzeige.boards) || [])
          .find((b) => b && b.id === id);
        const name = (eintrag && eintrag.name) || id;
        setBoardMeldung('');
        setBoardWechselt(id);
        try {
          await poste('/board/boards/wechsel', { id });
        } catch (e) {
          setBoardMeldung(uebersetze('Board nicht gewechselt: {0}', [String((e && e.message) || e)]));
          setBoardWechselt(null);
          return;
        }
        // Der Wechsel ist geschehen; alles, was zum alten Board gehörte, fällt
        // weg — auch dann, wenn das neue Bild gleich nicht ankommt.
        try {
          await neuAufbauen({ zuruecksetzen: true });
          setBoardOffen(false);
          melde(uebersetze('Board gewechselt: {0}.', [name]));
        } catch (e) {
          fehler(uebersetze('Board gewechselt — die Fläche ließ sich nicht laden: {0}. Öffne die Board-Leiste und wähle beim selben Board noch einmal „Öffnen“; der Wechsel wird dann nur wiederholt.', [String((e && e.message) || e)]));
        } finally {
          setBoardWechselt(null);
        }
      }

      // Vom Anlegen in den Katalog: der Name steht schon in der Suche, und der
      // Blick geht an GitHub vorbei am Zwischenspeicher. Dort steht die
      // Station als gefunden — mit Herkunft, Host und Fassung.
      function katalogZeigen(name) {
        statusWeg();
        // Ein Seitenpanel zur Zeit: der Katalog öffnet die linke Leiste und
        // schließt das rechte Dock — Station und Gespräch. Ein Vorhaben
        // bleibt gewählt; sein Gespräch lässt sich wieder öffnen.
        leisteOeffnen();
        setBibOffen(null);
        setBibAnsicht('katalog');
        setLeiste('bibliothek');
        setKatalogSuche(String(name || ''));
        setKatalogFrisch((n) => n + 1);
      }

      /** Verbindet ein neues Board und baut die Seite darauf auf. */
      async function boardVerbinden() {
        if (!boardNeu || boardNeu.laeuft) return;
        const name = String(boardNeu.name || '').trim();
        const adresse = String(boardNeu.adresse || '').trim();
        if (!adresse && !name) {
          setBoardNeu({ ...boardNeu, fehler: uebersetze('Bitte einen Namen angeben.') });
          return;
        }
        setBoardNeu({ ...boardNeu, laeuft: true, fehler: '' });
        try {
          await poste('/board/boards', { name, adresse });
          // Das neue Board ist offen; die Seite baut sich auf ihm auf, ohne
          // den Weg über den Chat.
          await neuAufbauen({ zuruecksetzen: true });
          setBoardNeu(null);
          setBoardOffen(false);
          melde(uebersetze('Board verbunden: {0}.', [name || adresse]));
        } catch (e) {
          setBoardNeu({
            ...boardNeu, laeuft: false, fehler: String((e && e.message) || e),
          });
        }
      }

      /**
       * Nimmt den Token der ersten Sitzung an: die vorhandene Route prüft ihn
       * und legt ihn außerhalb des Clients ab. Danach wird das Board neu
       * geladen; mit dem Schreibrecht verschwindet der Hinweis. Ein Fehler
       * bleibt am offenen Feld stehen, der Token bleibt darin.
       */
      async function tokenSpeichern() {
        if (!tokenWeg || tokenWeg.laeuft) return;
        const token = String(tokenWeg.token || '').trim();
        setTokenWeg({ ...tokenWeg, laeuft: true, fehler: '' });
        laeuft(uebersetze('Speichert …'));
        try {
          await poste('/board/github/token', { token });
          await ladeBoard();
          setTokenWeg(null);
          melde(uebersetze('Gespeichert.'));
        } catch (e) {
          const grund = String((e && e.message) || e);
          setTokenWeg({
            ...tokenWeg, laeuft: false, fehler: grund,
          });
          fehler(uebersetze('Nicht gespeichert: {0}', [grund]));
        }
      }

      async function boardEntfernen(id) {
        const altes = ((boardAnzeige && boardAnzeige.boards) || [])
          .find((b) => b && b.id === id);
        try {
          await poste('/board/boards/entfernen', { id });
          // War es das offene Board, ist jetzt ein anderes offen oder keines;
          // sonst bleibt die Fläche, wie sie ist.
          await neuAufbauen({ zuruecksetzen: Boolean(altes && altes.aktiv) });
          melde(uebersetze('Board entfernt: {0}.', [(altes && altes.name) || id]));
        } catch (e) {
          setBoardMeldung(uebersetze('Nicht aus der Liste genommen: {0}', [String((e && e.message) || e)]));
        }
      }

      // Das Hauptboard wurde beim Start nicht geholt — ohne Netz zum Beispiel.
      // Der Knopf in der Board-Leiste versucht es erneut; gelingt es, wird die
      // Seite mit seinen Stationen und dem Workflow neu aufgebaut.
      async function hauptboardWiederholen() {
        if (hauptboardLaeuft) return;
        setHauptboardLaeuft(true);
        setHauptboardMeldung('');
        laeuft(uebersetze('Wird geladen …'));
        try {
          const antwort = await poste('/board/hauptboard/holen', {}, 180000);
          if (antwort && antwort.fehler) {
            setHauptboardMeldung(uebersetze('Weiterhin nicht geholt. Später noch einmal versuchen.'));
            setHauptboardLaeuft(false);
            fehler(uebersetze('Weiterhin nicht geholt. Später noch einmal versuchen.'));
            return;
          }
          await neuAufbauen();
          setHauptboardLaeuft(false);
          melde(uebersetze('Hauptboard geholt.'));
        } catch (e) {
          setHauptboardMeldung(uebersetze('Nicht geholt: {0}', [String((e && e.message) || e)]));
          setHauptboardLaeuft(false);
          fehler(uebersetze('Nicht geholt: {0}', [String((e && e.message) || e)]));
        }
      }

      // Dieses Board unter der Organisation veröffentlichen. Mit Token legt
      // die Route die Repositories an, setzt die Remotes und schickt sie.
      // Ohne Token antwortet sie mit den Befehlen; die stehen dann zum
      // Kopieren in der Anzeige. Fremde Repositories lässt die Route aus;
      // ihre Namen stehen in `ausgelassen` und werden mitgenannt.
      /** Veröffentlicht die Repositories des Boards unter der Organisation. */
      async function boardVeroeffentlichen(board) {
        if (!board) return;
        setBoardMeldung('');
        setVeroeffentlichen(null);
        laeuft(uebersetze('Wird gesendet …'));
        try {
          const antwort = await poste(
            '/board/github/veroeffentlichen', { board: board.id }, 180000,
          );
          const anzahl = Array.isArray(antwort.veroeffentlicht)
            ? antwort.veroeffentlicht.length : 0;
          const weg = Array.isArray(antwort.ausgelassen) ? antwort.ausgelassen : [];
          setBoardMeldung((anzahl === 1
            ? uebersetze('Ein Repository veröffentlicht.')
            : uebersetze('{0} Repositories veröffentlicht.', [anzahl]))
            + (weg.length
              ? uebersetze(' Ausgelassen: {0} — {1}.', [
                weg.map((e) => e.repo).join(', '),
                String(weg[0].grund || uebersetze('gehört nicht zu diesem Board')),
              ])
              : ''));
          melde(anzahl === 1
            ? uebersetze('Ein Repository veröffentlicht.')
            : uebersetze('{0} Repositories veröffentlicht.', [anzahl]));
        } catch (e) {
          const wert = e && e.wert ? e.wert : null;
          if (wert && Array.isArray(wert.befehle) && wert.befehle.length) {
            setVeroeffentlichen({
              id: board.id,
              organisation: String(wert.organisation || ''),
              befehle: wert.befehle.map(String),
              ausgelassen: Array.isArray(wert.ausgelassen)
                ? wert.ausgelassen.map((eintrag) => ({
                  repo: String(eintrag.repo || ''),
                  grund: String(eintrag.grund || ''),
                }))
                : [],
            });
            fehler(uebersetze('Veröffentlichen: {0}', [String((e && e.message) || e)]));
            return;
          }
          setBoardMeldung(uebersetze('Veröffentlichen: {0}', [String((e && e.message) || e)]));
          fehler(uebersetze('Veröffentlichen: {0}', [String((e && e.message) || e)]));
        }
      }

      // „Adresse“: was ein anderer braucht, um dieses Board aufzunehmen — der
      // Remote, sonst der Ordner auf diesem Rechner. Die Zwischenablage gibt
      // es nicht in jedem Kontext; ein unsichtbares Feld hilft dann.
      /** Kopiert einen Text in die Zwischenablage, mit Rückfall für alte Browser. */
      function kopiereText(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          return navigator.clipboard.writeText(text);
        }
        return new Promise((erfuellt, abgelehnt) => {
          try {
            const feld = document.createElement('textarea');
            feld.value = text;
            feld.setAttribute('readonly', '');
            feld.style.position = 'fixed';
            feld.style.opacity = '0';
            document.body.appendChild(feld);
            feld.select();
            const kopiert = document.execCommand('copy');
            document.body.removeChild(feld);
            if (kopiert) erfuellt();
            else abgelehnt(new Error('Kopieren nicht möglich'));
          } catch (fehler) {
            abgelehnt(fehler);
          }
        });
      }

      async function boardAdresseKopieren(board) {
        const adresse = String((board && (board.remote || board.repo)) || '');
        if (!adresse) {
          setBoardMeldung(uebersetze('Für dieses Board gibt es keine Adresse.'));
          return;
        }
        try {
          await kopiereText(adresse);
          setBoardMeldung(uebersetze('Adresse kopiert: {0}', [adresse]));
        } catch {
          // Ohne Zwischenablage bleibt die Adresse zum Abschreiben stehen.
          setBoardMeldung(uebersetze('Adresse: {0}', [adresse]));
        }
      }

      // Ohne Board: zuerst die Identität, dann das erste Board. `art` ist
      // `hauptboard` (das öffentliche), `verbinden` (Adresse) oder `eigenes`.
      /** Legt die Identität an und verbindet oder eröffnet das erste Board. */
      async function startBoard(art) {
        if (start.laeuft) return;
        const name = start.name.trim();
        if (!name) {
          setStart({ ...start, fehler: uebersetze('Bitte deinen Namen eintragen.') });
          return;
        }
        let boardName = start.boardName.trim();
        let adresse = '';
        if (art === 'hauptboard') {
          boardName = 'Hauptboard';
          adresse = String((data && data.hauptboard) || '');
        } else if (art === 'verbinden') {
          adresse = start.adresse.trim();
          if (!adresse) {
            setStart({ ...start, fehler: uebersetze('Bitte die Adresse oder den Ordner eintragen.') });
            return;
          }
          boardName = boardName || 'Board';
        } else {
          boardName = boardName || uebersetze('Mein Board');
        }
        setStart({ ...start, laeuft: true, fehler: '' });
        try {
          await poste('/board/identitaet', {
            name, github: start.github.trim(), farbe: start.farbe,
          });
          await poste('/board/boards', { name: boardName, adresse });
          // Das erste Board ist offen; die Startseite wird zur Fläche.
          await neuAufbauen({ zuruecksetzen: true });
          setStart({ ...start, laeuft: false, fehler: '' });
          melde(uebersetze('Board angelegt: {0}.', [boardName]));
        } catch (e) {
          setStart({ ...start, laeuft: false, fehler: String((e && e.message) || e) });
        }
      }

      async function zurueckschicken() {
        if (!zurueck) return;
        const grund = String(zurueck.grund || '').trim();
        if (!grund) { fehler(uebersetze('Bitte den offenen Punkt benennen.')); return; }
        try {
          await sende('/board/vorhaben/zurueckschicken', {
            id: zurueck.id, nach: zurueck.nach, grund,
          });
          const ziel = positionenVon(data).find((p) => p.id === zurueck.nach);
          melde(uebersetze('Zurückgeschickt nach „{0}".', [ziel ? ziel.name : zurueck.nach]));
          setZurueck(null);
        } catch (e) {
          fehler(uebersetze('Konnte nicht zurückschicken: {0}', [String((e && e.message) || e)]));
        }
      }

      // Weitergeben ist ein Verschieben mit einer nächsten verantwortlichen
      // Person: der Host trägt sie an der Zielstation ein und prüft `darf`.
      async function weitergebenAktion() {
        if (!weiter) return;
        const v = (data.vorgaenge || []).find((x) => x.id === weiter.id);
        try {
          await sende('/board/vorhaben/verschieben', {
            id: weiter.id, position: weiter.nach, person: weiter.person,
          });
          const ziel = positionenVon(data).find((p) => p.id === weiter.nach);
          melde(uebersetze('„{0}“ an „{1}“ weitergegeben — verantwortet von {2}.', [v ? v.name : weiter.id, ziel ? ziel.name : weiter.nach, personName(weiter.person)]));
          setWeiter(null);
        } catch (e) {
          fehler(uebersetze('Konnte nicht weitergeben: {0}', [String((e && e.message) || e)]));
        }
      }

      async function schrittSpeichern() {
        if (art !== 'schritt' || !entwurf) return;
        try {
          await sende('/board/schritt/aendern', {
            id: auswahlId,
            name: entwurf.name,
            inhalt: entwurf.inhalt,
            eingang: entwurf.eingang,
            ausgabe: entwurf.ausgabe,
            wie: { art: entwurf.wieArt, wert: entwurf.wieWert },
            weiter: entwurf.weiter,
          });
          setStationEdit(false);
          melde(uebersetze('Station gespeichert.'));
        } catch (e) {
          fehler(uebersetze('Konnte nicht speichern: {0}', [String((e && e.message) || e)]));
        }
      }

      // Der Auftrag für die Werkstatt. Er beschreibt das Board so, wie es
      // gerade eingerichtet ist — die Station, ihre Dateien, ihre Nachbarn,
      // die Ablageorte —, damit die Anweisung zu diesem Workflow passt und
      // nicht zu einem erdachten. Geschrieben wird sie in die Ablage, nicht in
      // den Harness: dort liegt sie nur für die Dauer eines Laufs.
      /** Formuliert den Auftrag für die Werkstatt aus dem Stand dieses Workflows. */
      function werkstattAuftrag() {
        const roh = schritteVonFlaeche(data).find((s) => s.id === gewaehlt.id) || {};
        const titel = (eigenerWorkflow(data) || {}).titel || 'Workflow';
        const stelle = positionen.find((p) => p.schritt === gewaehlt.id);
        const ab = (stelle && stelle.abgeleitet) || { eingang: [], ausgabe: [] };
        const eingang = (roh.eingang && roh.eingang.length) ? roh.eingang : (ab.eingang || []);
        const ausgabe = (roh.ausgabe && roh.ausgabe.length) ? roh.ausgabe : (ab.ausgabe || []);
        const namen = (ids) => (ids || [])
          .map((id) => (positionen.find((p) => p.id === id) || {}).name || id).join(', ');
        const host = gewaehlt.host || (ich && ich.id) || 'p1';
        const laufName = host + '-' + gewaehlt.id;
        const anweisung = 'skills/' + host + '/' + gewaehlt.id + '.md';
        const andere = skills
          .filter((s) => s.name !== laufName)
          .map((s) => '- ' + (s.titel ? s.titel + ' (`' + s.name + '`)' : '`' + s.name + '`')
            + (s.beschreibung ? ': ' + s.beschreibung : ''))
          .join('\n');

        return [
          'Wir stehen im Board an der Station „' + gewaehlt.name + '“ (Workflow „' + titel + '“).',
          'Ich möchte dafür einen Skill bauen, und ich will ihn mit dir zusammen entwickeln.',
          '',
          'So ist das Board gebaut: Ein Workflow ist eine Kette von Stationen. Ein Vorhaben',
          'wandert von Station zu Station; jede Station liest die Dateien, die die Station davor',
          'erzeugt hat, und legt ihre eigene Ausgabedatei im Ordner des Vorhabens ab',
          '(/workspace/projekte/board/vorgaenge/<vorhaben>/). Ein Skill ist die Anleitung für',
          'eine Station: was dort entsteht, wie vorgegangen wird und woran das Ergebnis zu',
          'erkennen ist.',
          '',
          'Diese Station:',
          '- Host: ' + (personName(gewaehlt.host) || uebersetze('niemand')),
          '- Beschreibung: ' + (String(e.inhalt || '').trim() || 'keine'),
          '- Eingang: ' + (eingang.join(', ') || 'nichts'),
          '- Ausgang: ' + (ausgabe.join(', ') || 'noch keiner eingetragen — dann gilt die Regel des'
            + ' Boards: der Stationsname als Dateiname, klein und mit Bindestrichen'),
          '- Ablage: die Ausgabedatei landet im Ordner des Vorhabens',
          '- Weiterreichung: ' + (e.weiter === 'automatisch'
            ? 'automatisch, wenn die Ausgabedatei erzeugt ist'
            : 'Freigabe'),
          '- Station davor: ' + (namen(ab.vorgaenger) || 'Anfang'),
          '- Station danach: ' + (namen(ab.nachfolger) || 'Ende'),
          '',
          'Die Anweisungen der Schritte liegen in der Ablage, nicht im Harness:',
          '/workspace/projekte/board/' + anweisung,
          'Ihre Kopfzeile trägt name (' + laufName + '), description und whenToUse.',
          'Was es an Anweisungen schon gibt:',
          andere || '(noch keine)',
          'Schau bei Bedarf in eine davon hinein — sie zeigen den Ton und den Aufbau.',
          '',
          'Aufgerufen wird die Anweisung, wenn ein Vorhaben an dieser Station steht. Sie führt',
          'dann das Gespräch mit mir und legt die Ausgabedatei an. Die Dateien der Station',
          '(Eingang, Ausgang) bleiben, wie sie sind — die Anweisung arbeitet mit ihnen.',
          '',
          'Aufgabe: Erarbeite mit mir die Anweisung für diese Station. Frag mich, was hier',
          'entstehen soll, woran ich merke, dass der Schritt fertig ist, was der Skill selbst',
          'entscheiden darf und was er fragen muss, und was dabei schon schiefgegangen ist.',
          'Eine Frage pro Zug, in meiner Sprache, ohne Fachjargon. Wenn wir einig sind, schreib',
          'die Anweisung auf Deutsch mit Kopfzeile (name: ' + laufName + ', description,',
          'whenToUse) nach /workspace/projekte/board/' + anweisung + '. Am Board änderst du',
          'nichts — ich trage sie danach an der Station ein.',
          '',
          'Sag mir zum Schluss, was die Anweisung tut.',
        ].join('\n');
      }

      // „Skill kreieren“: rechts öffnet sich das Gespräch, in dem der Skill
      // entsteht, und der Auftrag geht mit dem Klick sofort hinaus. Gibt es
      // die Werkstatt dieses Schritts schon, wird sie aufgeschlagen.
      /** Öffnet die Werkstatt zu dieser Station und schickt den Auftrag. */
      async function werkstattStarten() {
        if (art !== 'schritt' || !gewaehlt) return;
        statusWeg();
        setGespraechZu(null);
        amEnde.current = true;
        setLeiste(null);
        const roh = schritteVonFlaeche(data).find((s) => s.id === gewaehlt.id) || {};
        const vorhanden = (roh.werkstatt && roh.werkstatt.session) || null;
        const gemeinsam = {
          art: 'werkstatt', schritt: gewaehlt.id, titel: gewaehlt.name,
          position: null, skill: '',
          // Was es an Skills schon gab: der neue ist der, der danach kommt.
          vorher: skills.map((sk) => sk.name),
        };
        if (vorhanden) {
          setGespraech({
            ...gemeinsam,
            session: vorhanden,
            eintraege: [],
            laeuft: false,
            fehler: '',
            text: entwurfText(vorhanden),
            seit: null,
            sendet: false,
          });
          setRechtsReiter('gespraech');
          nachRender(() => fokusRechts('gespraech'));
          return;
        }
        const entwurf = {
          ...gemeinsam,
          session: null,
          eintraege: [],
          laeuft: false,
          fehler: '',
          text: '',
          seit: null,
          sendet: true,
        };
        setGespraech(entwurf);
        setRechtsReiter('gespraech');
        nachRender(() => fokusRechts('gespraech'));
        await sendenFuer(entwurf, werkstattAuftrag());
      }

      async function positionLoeschen() {
        if (!bestaetigen) return;
        try {
          await sende('/board/position/loeschen', { id: bestaetigen });
          setBestaetigen(null);
          setAuswahl(null);
          melde(uebersetze('Station aus dem Workflow genommen. Sie bleibt in der Bibliothek.'));
        } catch (e) {
          setBestaetigen(null);
          fehler(uebersetze('Konnte nicht löschen: {0}', [String((e && e.message) || e)]));
        }
      }

      if (ladefehler) {
        return h('div', { style: S.page }, h('div', { style: S.title }, PRODUKT_NAME),
          h('p', { style: S.sub }, uebersetze('Die Daten konnten nicht geladen werden: {0}', [ladefehler])));
      }
      if (!data) {
        return h('div', { style: S.page }, h('div', { style: S.title }, PRODUKT_NAME),
          h('p', { style: S.sub }, uebersetze('Lade …')));
      }

      // --- Startseite --------------------------------------------------------

      // Ohne Board steht hier der Anfang: die eigene Identität und das erste
      // Board. Das Hauptboard ist öffentlich — was dort entsteht, sieht jeder.
      if (data.leer) {
        return h('div', { style: S.startSeite },
          h('div', { style: S.startKarte },
            h('div', { style: S.startTitel }, uebersetze('Willkommen im Board')),
            h('p', { style: S.startText },
              uebersetze('Das Board ist eine öffentliche Werkstatt. Menschen legen ihre Projekte an, arbeiten an ihnen und sehen, was die anderen tun — von der ersten Idee an. Verbinde das Hauptboard, um dabei zu sein, oder lege ein eigenes an.')),
            h('div', { style: S.startFeld },
              h('span', { style: S.startMarke }, uebersetze('Dein Name')),
              h('input', {
                style: { ...S.input, width: '100%' },
                value: start.name,
                placeholder: uebersetze('Wie du im Board heißt'),
                autoFocus: true,
                onChange: (ev) => setStart({ ...start, name: ev.target.value, fehler: '' }),
              })),
            h('div', { style: S.startFeld },
              h('span', { style: S.startMarke }, uebersetze('GitHub-Name (freiwillig)')),
              h('input', {
                style: { ...S.input, width: '100%' },
                value: start.github,
                placeholder: uebersetze('dein-name auf GitHub'),
                onChange: (ev) => setStart({ ...start, github: ev.target.value, fehler: '' }),
              }),
              h('p', { style: S.boardHinweis },
                uebersetze('Damit findet dein Board dich auf öffentlichen Boards wieder, auch wenn dein Name sich ändert.'))),
            h('div', { style: S.startFeld },
              h('span', { style: S.startMarke }, uebersetze('Deine Farbe')),
              h('div', { style: S.farbGitter },
                FARBEN_ALLE.map((f) => h('button', {
                  key: f,
                  type: 'button',
                  title: farbName(f),
                  style: {
                    ...S.farbPunkt,
                    background: f,
                    borderColor: start.farbe === f
                      ? 'var(--dsw-alias-label-primary)'
                      : 'transparent',
                  },
                  onClick: () => setStart({ ...start, farbe: f }),
                })))),
            h('div', { style: S.startReihe },
              h('button', {
                type: 'button',
                style: { ...S.startKnopf, opacity: start.laeuft ? 0.6 : 1 },
                disabled: start.laeuft,
                onClick: () => startBoard('hauptboard'),
              }, start.laeuft ? uebersetze('Einen Moment …') : uebersetze('Hauptboard verbinden'))),
            h('p', { style: { ...S.boardHinweis, marginTop: '8px' } },
              uebersetze('Das Hauptboard ist öffentlich: Projekte, Dateien und der Weg dorthin sind für alle sichtbar.')),
            h('div', { style: S.startTrenner }, uebersetze('Oder ein eigenes Board')),
            h('div', { style: S.startFeld },
              h('span', { style: S.startMarke }, uebersetze('Name des Boards')),
              h('input', {
                style: { ...S.input, width: '100%' },
                value: start.boardName,
                placeholder: uebersetze('z. B. Mein Projekt'),
                onChange: (ev) => setStart({ ...start, boardName: ev.target.value, fehler: '' }),
              })),
            h('div', { style: S.startReihe },
              h('button', {
                type: 'button',
                style: S.startZweit,
                onClick: () => startBoard('eigenes'),
              }, uebersetze('Eigenes Board anlegen')),
              h('input', {
                style: { ...S.input, flex: 1, minWidth: '180px' },
                value: start.adresse,
                placeholder: uebersetze('GitHub-Adresse oder Ordner'),
                onChange: (ev) => setStart({ ...start, adresse: ev.target.value, fehler: '' }),
              }),
              h('button', {
                type: 'button',
                style: S.startZweit,
                onClick: () => startBoard('verbinden'),
              }, uebersetze('Verbinden'))),
            start.fehler ? h('p', { style: { ...S.boardFehler, marginTop: '10px' } },
              start.fehler) : null));
      }

      const positionen = positionenVon(data);
      const vorhaben = data.vorgaenge || [];
      // Neue Vorhaben entstehen an einer Station; der Knopf steht nur da,
      // wenn die Antwort das Anlegen erlaubt.
      const anlegenDarf = !!(data && data.anlegen && data.anlegen.darf === true);
      // Beiträge fremder und eigener Vorhaben: sie stehen an ihrer Station und
      // werden dort mit dem Namen dessen gezeigt, der sie geschrieben hat.
      const beitraege = Array.isArray(data.beitraege) ? data.beitraege : [];
      const schritte = schritteVonFlaeche(data);
      // Wer ist am Board? Jeder Mensch hat eine Farbe; sie tragen alle
      // Stationen, deren Host er ist. Fehlt der Host, bleibt die Station grau.
      const personen = (data && data.personen) || [];
      const ich = personen.find((p) => p.ich) || personen[0] || null;
      const OHNE_FARBE = '#8a8a8a';
      const personVon = (id) => personen.find((p) => p.id === id) || null;
      const personFarbe = (id) => {
        const p = personVon(id);
        return p && /^#[0-9a-f]{6}$/i.test(p.farbe) ? p.farbe : OHNE_FARBE;
      };
      const personName = (id) => {
        const p = personVon(id);
        if (!p) return 'niemand';
        return p.name || (p.ich ? uebersetze('Du') : uebersetze('ohne Namen'));
      };
      // Für die Bibliothek: der Name einer Person, sonst ihre Kennung. Ein
      // leerer Wert bleibt leer — die Stelle sagt dann „ohne Host“ statt einen
      // Namen zu erfinden.
      const personAnzeige = (id) => {
        const kennung = String(id == null ? '' : id).trim();
        if (!kennung) return '';
        const p = personVon(kennung);
        return (p && String(p.name || '').trim()) || kennung;
      };
      // Wer ein Vorhaben verantwortet, steht je Station in der Ablage. Die
      // Komposition reicht die Angabe als `verantwortlicheJeStation` durch;
      // fehlt sie (ältere Antwort), gilt das Feld `verantwortliche`. Beide
      // werden nur gelesen — ist an der Stelle nichts eingetragen, bleibt die
      // Liste leer, und die Karte sagt das.
      const verantwortlicheVon = (v, position) => {
        const stelle = String(position == null
          ? ((v && v.position) || '')
          : position);
        const feld = v && v.verantwortlicheJeStation
          && typeof v.verantwortlicheJeStation === 'object'
          && !Array.isArray(v.verantwortlicheJeStation)
          ? v.verantwortlicheJeStation
          : (v && v.verantwortliche && typeof v.verantwortliche === 'object'
            && !Array.isArray(v.verantwortliche) ? v.verantwortliche : null);
        const liste = feld ? feld[stelle] : null;
        return Array.isArray(liste) ? liste.map(String).filter(Boolean) : [];
      };
      // Wer würde an einer Zielstation verantworten? Der Host ihres Schritts.
      const hostVonPosition = (id) => {
        const p = positionen.find((x) => x.id === id);
        const s = p ? schritte.find((x) => x.id === p.schritt) : null;
        return (s && s.host) || (ich ? ich.id : '');
      };
      const farbeFuerSchritt = (schrittId) => {
        const s = schritte.find((x) => x.id === schrittId);
        return personFarbe(s && s.host);
      };
      // Ein Vorhaben trägt seine eigene Farbe; ohne eigene gilt die aus der
      // Reihenfolge.
      const vorhabenFarbe = (v) => (v && typeof v.farbe === 'string'
        && /^#[0-9a-f]{6}$/i.test(v.farbe)
        ? v.farbe
        : farbeVon(vorhaben.indexOf(v)));

      // Ein ausgewählter Schritt ist das Ding selbst, nicht seine Stelle im
      // Workflow. Darum gilt eine Änderung an jeder Stelle, an der er steht.
      // Eine Station aus der Bibliothek, die noch in keinem Workflow steht,
      // öffnet sich im selben Feld — nur zu lesen.
      const gewaehlterSchritt = (art === 'schritt' && auswahlId)
        ? (() => {
          const schritt = schritte.find((x) => x.id === auswahlId);
          const bibliothek = !schritt && data && data.format === 2
            && Array.isArray(data.stationen)
            ? data.stationen.find((s) => s && String(s.id) === String(auswahlId))
            : null;
          const quelle = schritt || bibliothek;
          if (!quelle) return null;
          const stellen = positionen.filter((p) => p.schritt === quelle.id);
          const erste = stellen[0] || null;
          const wie = erste && erste.abgeleitet
            ? erste.abgeleitet.wie
            : {
              art: (quelle.wie && quelle.wie.art) || 'textfeld',
              wert: (quelle.wie && quelle.wie.wert) || '',
            };
          return {
            id: quelle.id,
            name: quelle.name,
            host: quelle.host || '',
            // Ein Verweis oder eine Station aus der Bibliothek wird nur
            // gelesen. Geändert wird sie in ihrem eigenen Repository.
            fremd: bibliothek ? true : (quelle.fremd === true
              || !!(ich && quelle.host && quelle.host !== ich.id)),
            ref: typeof quelle.ref === 'string' ? quelle.ref : null,
            fehlt: quelle.fehlt === true,
            bibliothek: !!bibliothek,
            fassung: bibliothek ? String(quelle.fassung == null ? '' : quelle.fassung) : '',
            repo: bibliothek ? String(quelle.repo == null ? '' : quelle.repo) : '',
            stellen: stellen.length,
            abgeleitet: erste && erste.abgeleitet
              ? erste.abgeleitet
              : {
                eingang: [], ausgabe: [], eingangEigener: false, ausgabeEigene: false, wie,
              },
          };
        })()
        : null;

      const gewaehlt = auswahl
        ? (auswahl.art === 'schritt'
          ? gewaehlterSchritt
          : vorhaben.find((v) => v.id === auswahl.id))
        : null;

      // Das rechte Dock zeigt die offene Station, das Gespräch oder beide.
      // `rechtsReiter` entscheidet nur, wenn beide da sind; verschwindet der
      // eine, zeigt das Dock den anderen, und erst ohne beide schließt es.
      const stationImDock = !!(auswahl && auswahl.art === 'schritt' && gewaehlt);
      const gespraechImDock = !!gespraech;
      const rechtsAktiv = !stationImDock && !gespraechImDock
        ? null
        : !stationImDock
          ? 'gespraech'
          : !gespraechImDock
            ? 'station'
            : (rechtsReiter === 'gespraech' ? 'gespraech' : 'station');

      // Der Fokus gehört in die `section` des Docks, nicht in ihre
      // Überschrift: `board-station` sitzt an der h2, `board-chat` am
      // Gesprächsinhalt. Beide finden über `closest('section')` das Panel.
      function fokusRechts(art) {
        if (typeof document === 'undefined') return;
        const knoten = document.getElementById(art === 'station' ? 'board-station' : 'board-chat');
        const dock = knoten && typeof knoten.closest === 'function'
          ? knoten.closest('section')
          : null;
        if (dock && typeof dock.focus === 'function') dock.focus();
      }

      // Nach dem Rendern: der nächste Zustand steht, dann erst lässt sich
      // der richtige Knoten fokussieren.
      function nachRender(fn) {
        if (typeof window !== 'undefined'
          && typeof window.requestAnimationFrame === 'function') {
          window.requestAnimationFrame(fn);
        } else {
          fn();
        }
      }

      // Das rechte Dock schließt die Station; der Fokus kehrt auf den Namen
      // ihrer Karte zurück (`data-karten-name`). Für eine Station, die noch
      // nicht auf der Fläche steht, gibt es keinen Namen — dann bleibt es bei
      // der Rückgabe des Panels. Bleibt das Gespräch offen, gehört das Dock
      // ihm und der Fokus geht in seinen Inhalt.
      function stationSchliessen() {
        const schrittId = gewaehlt ? gewaehlt.id : null;
        setAuswahl(null);
        if (gespraechImDock) {
          setRechtsReiter('gespraech');
          nachRender(() => fokusRechts('gespraech'));
          return;
        }
        if (!schrittId || typeof document === 'undefined') return;
        const raum = flaecheRef.current;
        if (!raum) return;
        const stelle = positionen.find((p) => p.schritt === schrittId);
        if (!stelle) return;
        const name = Array.from(raum.querySelectorAll('[data-karten-name]'))
          .find((el) => el.getAttribute('data-karten-name') === String(stelle.id));
        if (name && typeof name.focus === 'function') name.focus();
      }

      // Das Gespräch schließen; die Sitzung läuft im Chat weiter. Bleibt die
      // Station offen, steht das Dock weiter und der Fokus geht dorthin;
      // sonst fällt das Dock ganz weg.
      function gespraechSchliessen() {
        if (!gespraech) return;
        setGespraechZu(gespraech.session || true);
        setGespraech(null);
        if (stationImDock) {
          setRechtsReiter('station');
          nachRender(() => fokusRechts('station'));
        }
      }

      // Die ✕-Taste und Escape schließen den aktiven Reiter.
      function rechtsSchliessen() {
        if (rechtsAktiv === 'station') stationSchliessen();
        else if (rechtsAktiv === 'gespraech') gespraechSchliessen();
      }

      // Die linke Leiste öffnet sich: ein Seitenpanel zur Zeit, also fällt
      // das rechte Dock weg — die Station und das Gespräch. Das Gespräch
      // selbst läuft auf dem Host weiter und lässt sich wieder öffnen.
      function leisteOeffnen() {
        setAuswahl((alt) => (alt && alt.art === 'schritt' ? null : alt));
        if (gespraech) {
          setGespraechZu(gespraech.session || true);
          setGespraech(null);
        }
      }

      // Alle Dateinamen, die im Board schon vorkommen — als Ausgang oder als
      // Eingang. Das ist die Liste zum Anbieten; alles andere tippt er.
      const bekannteDateien = Array.from(new Set(
        positionen.flatMap((p) => ((p.abgeleitet && p.abgeleitet.ausgabe) || [])
          .concat((p.abgeleitet && p.abgeleitet.eingang) || [])),
      )).sort();

      const gewaehltesVorhaben = art === 'vorhaben' && gewaehlt && gewaehlt.position ? gewaehlt : null;
      const farbe = gewaehltesVorhaben ? vorhabenFarbe(gewaehltesVorhaben) : null;
      const bisIndex = gewaehltesVorhaben
        ? positionen.findIndex((p) => p.id === gewaehltesVorhaben.position)
        : -1;
      const verlaufBereit = verlauf && verlauf.zustand === 'ok' && verlauf.id === auswahlId;

      const verschiebenVorhaben = verschieben
        ? vorhaben.find((v) => v.id === verschieben.id)
        : null;
      const positionsName = (id) => {
        const p = positionen.find((x) => x.id === id);
        return p ? p.name : id;
      };
      // Die Station eines Vorhabens über alle Flächen: sie kann in einem
      // Workflow stehen, der nicht der eigene ist. Fehlt sie überall, bleibt
      // die Kennung stehen — kein Name wird erfunden.
      const stationNameVon = (v) => {
        if (!v) return '';
        const eigen = positionen.find((x) => x.id === v.position);
        if (eigen) return eigen.name || eigen.id;
        for (const person of (data.workflows || [])) {
          for (const workflow of (person.workflows || [])) {
            const stelle = (workflow.positionen || []).find((x) => x.id === v.position);
            if (!stelle) continue;
            const schritt = (workflow.schritte || []).find((x) => x.id === stelle.schritt);
            return (schritt && schritt.name) || stelle.name || stelle.id;
          }
        }
        return String(v.position || '');
      };
      const verschiebenPanel = verschiebenVorhaben ? h('div', { style: S.bestaetigung },
        h('div', { style: { fontSize: '12px' } },
          uebersetze('„{0}“ von „{1}“ nach „{2}“ verschieben?', [verschiebenVorhaben.name, positionsName(verschiebenVorhaben.position), positionsName(verschieben.nach)])),
        h('div', { style: { display: 'flex', gap: '6px', marginTop: '8px' } },
          h('button', {
            type: 'button',
            style: S.klein,
            onClick: async () => {
              const auftrag = verschieben;
              setVerschieben(null);
              await verschiebenNach(auftrag.id, auftrag.nach);
            },
          }, uebersetze('Verschieben')),
          h('button', {
            type: 'button',
            style: S.klein,
            onClick: () => setVerschieben(null),
          }, uebersetze('Abbrechen')))) : null;

      function eingabe(wert, setzen, fertig) {
        return h('input', {
          autoFocus: true,
          value: wert,
          style: S.input,
          onChange: (e) => setzen(e.target.value),
          onKeyDown: (e) => {
            if (e.key === 'Enter') { e.preventDefault(); fertig(); }
            if (e.key === 'Escape') { e.preventDefault(); setEditPos(null); setEditVorhaben(null); }
          },
          onBlur: () => { if (!String(wert || '').trim()) { setEditPos(null); setEditVorhaben(null); } },
        });
      }

      // Ein Schritt öffnet sich über seinen Namen — er sieht wie eine
      // Überschrift aus, und das Öffnen zeigt ihn, statt ihn zu ändern.
      // `oeffnen` lässt ihn offen, auch wenn er schon offen ist: die Suche
      // springt zu ihm, statt ihn mit einem zweiten Klick zuzumachen.
      function schrittWaehlen(id, oeffnen) {
        statusWeg();
        // Ein Seitenpanel zur Zeit: die offene Station schließt die linke
        // Leiste, damit bei schmalem Fenster nicht beide Docks Platz nehmen.
        setLeiste(null);
        const schonOffen = !!(auswahl && auswahl.art === 'schritt' && auswahl.id === id);
        const zumachen = schonOffen && !oeffnen;
        setAuswahl(zumachen ? null : { art: 'schritt', id });
        if (zumachen) return;
        // Die Station öffnet ihren Reiter; das Gespräch daneben bleibt offen.
        setRechtsReiter('station');
        nachRender(() => fokusRechts('station'));
      }

      // --- Was zwischen zwei Stationen übergeben wird -------------------------
      //
      // Jede Verbindung trägt eine Übergabe: der Ausgang der einen Station ist
      // der Eingang der nächsten. Das Board vergleicht beide Seiten und zeigt,
      // wo sie nicht zusammenpassen — ein Tippfehler im Dateinamen fällt so
      // auf, statt still zu verschwinden.

      // Zwei Namen, die sich nur in wenigen Zeichen unterscheiden: einer ist
      // vermutlich ein Tippfehler des anderen.
      function abstand(a, b) {
        const x = a.toLowerCase(); const y = b.toLowerCase();
        if (Math.abs(x.length - y.length) > 2) return 99;
        let vorher = Array.from({ length: y.length + 1 }, (_, i) => i);
        for (let i = 1; i <= x.length; i += 1) {
          const jetzt = [i];
          for (let j = 1; j <= y.length; j += 1) {
            jetzt[j] = Math.min(
              vorher[j] + 1,
              jetzt[j - 1] + 1,
              vorher[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1),
            );
          }
          vorher = jetzt;
        }
        return vorher[y.length];
      }

      function aehnlich(name, kandidaten) {
        let best = null; let bester = 99;
        for (const k of kandidaten) {
          if (k === name) continue;
          const d = abstand(name, k);
          if (d < bester) { bester = d; best = k; }
        }
        return bester <= 2 ? best : null;
      }

      // Der Vergleich an den Verbindungen: was hier gilt, gegen das, was der
      // Nachbar gibt oder erwartet. `fehlt` sind die Namen, die auf der einen
      // Seite stehen und an der Verbindung nicht vorkommen.
      //
      // Ein Vorhaben trägt aber alle Dokumente mit, nicht nur die des direkten
      // Nachbarn: eine Station darf auch lesen, was drei Schritte vorher
      // entstanden ist. Fehlt ein Name nur beim Nachbarn, steht er weiter oben
      // — das ist keine Lücke. Eine Lücke ist, was im ganzen Weg nicht
      // vorkommt: dann heißt eine der beiden Seiten anders.
      /** Vergleicht Ein- und Ausgang einer Station mit denen ihrer Nachbarn. */
      function vergleich(p, eingang, ausgabe) {
        const nachbar = (id) => positionen.find((x) => x.id === id) || null;
        const weg = (id, richtung) => {
          const gesehen = new Set();
          const offen = [id];
          while (offen.length) {
            const hier = nachbar(offen.pop());
            const weiter = (hier && hier.abgeleitet && hier.abgeleitet[richtung]) || [];
            weiter.forEach((v) => { if (!gesehen.has(v)) { gesehen.add(v); offen.push(v); } });
          }
          return [...gesehen].map(nachbar).filter(Boolean);
        };
        const namen = (liste, feld) => liste.reduce((alle, x) => alle
          .concat((x.abgeleitet && x.abgeleitet[feld]) || []), []);

        const eingehend = ((p.abgeleitet && p.abgeleitet.vorgaenger) || [])
          .map(nachbar).filter(Boolean).map((q) => {
            const gibt = (q.abgeleitet && q.abgeleitet.ausgabe) || [];
            const frueher = namen(weg(q.id, 'vorgaenger'), 'ausgabe');
            return {
              q, gibt, fehlt: eingang.filter((n) => !gibt.includes(n) && !frueher.includes(n)),
            };
          });
        const ausgehend = ((p.abgeleitet && p.abgeleitet.nachfolger) || [])
          .map(nachbar).filter(Boolean).map((r) => {
            const will = (r.abgeleitet && r.abgeleitet.eingang) || [];
            const spaeter = namen(weg(r.id, 'nachfolger'), 'eingang');
            return {
              r, will, fehlt: ausgabe.filter((n) => !will.includes(n) && !spaeter.includes(n)),
            };
          });
        return { eingehend, ausgehend };
      }

      // Ein Dateiname im Satz.
      const namenStueck = (liste, key) => h('span', { key, style: S.codeName },
        liste.join(', '));

      const uebergabeZeile = (key, teile, warn) => h('div', {
        key, style: warn ? S.uebergabeWarn : S.uebergabeZeile,
      }, teile);

      // Die Übergabe als Zeilen — in der geöffneten Station und im Formular,
      // dort mit den Werten, die gerade getippt werden.
      /** Die Übergabe an den Verbindungen als lesbare Zeilen. */
      function uebergabeZeilen(p, eingang, ausgabe, schluessel) {
        const u = vergleich(p, eingang, ausgabe);
        const zeilen = [];

        u.eingehend.forEach(({ q, gibt, fehlt }, i) => {
          const key = schluessel + '-ein-' + i;
          if (!fehlt.length) {
            const da = eingang.filter((n) => gibt.includes(n));
            if (!da.length) return;
            zeilen.push(uebergabeZeile(key, [
              'Von „' + q.name + '“: ', namenStueck(da, 'n'), ' — passt.',
            ], false));
            return;
          }
          zeilen.push(uebergabeZeile(key, [
            'Von „' + q.name + '“: ', namenStueck(fehlt, 'n'),
            fehlt.length > 1 ? ' kommen nicht — dort steht ' : ' kommt nicht — dort steht ',
            namenStueck(gibt.length ? gibt : ['nichts'], 'g'),
            '.',
          ], true));
          const rat = fehlt.length === 1 ? aehnlich(fehlt[0], gibt) : null;
          if (rat) {
            zeilen.push(uebergabeZeile(key + '-rat', [
              'Meintest du ', namenStueck([rat], 'r'), '?',
            ], false));
          }
        });

        u.ausgehend.forEach(({ r, will, fehlt }, i) => {
          const key = schluessel + '-aus-' + i;
          if (!fehlt.length) {
            const geht = ausgabe.filter((n) => will.includes(n));
            if (!geht.length) return;
            zeilen.push(uebergabeZeile(key, [
              'An „' + r.name + '“: ', namenStueck(geht, 'n'), ' — passt.',
            ], false));
            return;
          }
          zeilen.push(uebergabeZeile(key, [
            'An „' + r.name + '“: ', namenStueck(fehlt, 'n'),
            fehlt.length > 1 ? ' enden hier' : ' endet hier',
            ' — erwartet wird ',
            namenStueck(will.length ? will : ['nichts'], 'w'),
            '.',
          ], true));
          const rat = fehlt.length === 1 ? aehnlich(fehlt[0], will) : null;
          if (rat) {
            zeilen.push(uebergabeZeile(key + '-rat', [
              'Meintest du ', namenStueck([rat], 'r'), '?',
            ], false));
          }
        });

        // Das Ende der Kette: was hier entsteht, übernimmt keine Station mehr.
        // Es ist kein Fehler — es soll nur zu sehen sein.
        if (!u.ausgehend.length && ausgabe.length) {
          zeilen.push(uebergabeZeile(schluessel + '-ende', [
            'Nach dieser Station kommt keine — ', namenStueck(ausgabe, 'a'),
            ausgabe.length > 1 ? ' enden hier.' : ' endet hier.',
          ], false));
        }

        return zeilen;
      }

      // Ein Dateifeld: der Name zum Tippen, darunter die Namen als Chips und
      // die, die sich anbieten. Angeboten wird, was Sinn macht — das, was die
      // Station davor gibt, beziehungsweise was die Station danach erwartet.
      /** Ein Feld für Eingang oder Ausgang, mit Chips und Vorschlägen. */
      function dateiFeld(art) {
        const istEingang = art === 'eingang';
        const feld = istEingang ? 'eingang' : 'ausgabe';
        const eigen = String((istEingang ? e.eingang : e.ausgabe) || '');
        const abgeleitet = (istEingang ? ab.eingang : ab.ausgabe) || [];
        const getippt = eigen.trim().length > 0;
        const namen = getippt
          ? eigen.split(',').map((x) => x.trim()).filter(Boolean)
          : abgeleitet.slice();

        const nachbarn = (istEingang ? ab.vorgaenger : ab.nachfolger) || [];
        const angebote = [];
        const merken = (name, warum) => {
          if (!name || namen.includes(name) || angebote.some((x) => x.name === name)) return;
          angebote.push({ name, warum });
        };
        nachbarn.forEach((id) => {
          const q = positionen.find((x) => x.id === id);
          if (!q) return;
          const ihre = ((istEingang ? q.abgeleitet.ausgabe : q.abgeleitet.eingang) || []);
          ihre.forEach((n) => merken(n, istEingang
            ? uebersetze('kommt von „{0}“', [q.name])
            : uebersetze('wird von „{0}“ erwartet', [q.name])));
        });
        const weitere = bekannteDateien.filter((n) => !namen.includes(n)
          && !angebote.some((x) => x.name === n));

        const setzen = (liste) => setEntwurf({ ...e, [feld]: liste.join(', ') });

        return h('div', { style: S.feldBlock },
          h('span', { style: S.feldTitel }, istEingang ? uebersetze('Eingang') : uebersetze('Ausgang')),
          h('input', {
            style: { ...S.feld, width: '100%', boxSizing: 'border-box' },
            value: eigen,
            placeholder: abgeleitet.join(', '),
            onChange: (ev) => setEntwurf({ ...e, [feld]: ev.target.value }),
          }),

          namen.length
            ? h('div', { style: S.feldChips },
              namen.map((n) => h('span', { key: n, style: S.feldChip },
                n,
                getippt
                  ? h('button', {
                    type: 'button',
                    title: uebersetze('Diesen Namen aus dem Feld nehmen'), 'aria-label': uebersetze('Diesen Namen aus dem Feld nehmen'),
                    style: {
                      border: 0, background: 'transparent', cursor: 'pointer',
                      padding: 0, color: 'inherit', fontSize: '12px', lineHeight: 1,
                    },
                    onClick: () => setzen(namen.filter((x) => x !== n)),
                  }, uebersetze('✕'))
                  : null)),
              getippt ? null : h('span', { style: S.feldFolgt }, uebersetze('folgt automatisch')))
            : null,

          angebote.length || weitere.length
            ? h('div', null,
              // Was der Nachbar gibt oder erwartet, steht zuoberst: das ist
              // der Name, der an diese Verbindung gehört.
              angebote.length
                ? h('div', { style: S.feldAngebote },
                  angebote.map((a) => h('button', {
                    key: 'a-' + a.name,
                    type: 'button',
                    style: S.feldAngebot,
                    title: uebersetze('Diesen Namen ins Feld nehmen'),
                    onClick: () => setzen(namen.concat([a.name])),
                  }, uebersetze('+ {0}', [a.name]), h('span', { key: 'w', style: { opacity: 0.7 } }, a.warum))))
                : null,
              // Was sonst im Board vorkommt, ist schwächer: kein Vorschlag für
              // diese Verbindung, nur ein Name, den es gibt.
              weitere.length
                ? h('div', { style: S.feldAngebote },
                  angebote.length
                    ? h('span', { key: 'trend', style: S.feldFolgt }, uebersetze('auch im Board:'))
                    : null,
                  weitere.map((n) => h('button', {
                    key: 'w-' + n,
                    type: 'button',
                    style: { ...S.feldAngebot, opacity: 0.7 },
                    title: uebersetze('Diesen Namen ins Feld nehmen'),
                    onClick: () => setzen(namen.concat([n])),
                  }, uebersetze('+ {0}', [n]))))
                : null)
            : null);
      }

      /** Ein Vorhaben als Karte auf der Fläche, mit seinen Handlungen. */
      function chipFuer(v) {
        const aktiv = art === 'vorhaben' && auswahlId === v.id;
        // Was die eigene Person an diesem Vorhaben darf. Ohne Antwort gibt es
        // keine Handlung — lieber nichts anbieten als falsch. Und nur, wenn die
        // Identität an dieser Station verantwortlich ist: ein fremder
        // GitHub-Name sieht die Schreibknöpfe nicht. Ohne GitHub-Namen gilt
        // der lokale Besitzer als verantwortlich.
        const verantwortlich = data && data.format === 2 ? (() => {
          const feld = v.verantwortlicheJeStation
            && typeof v.verantwortlicheJeStation === 'object'
            && !Array.isArray(v.verantwortlicheJeStation)
            ? v.verantwortlicheJeStation
            : (v.verantwortliche && typeof v.verantwortliche === 'object'
              ? v.verantwortliche : null);
          const login = String((data && data.identitaet
            && data.identitaet.github) || '').trim().toLowerCase();
          if (!login) return true;
          const liste = feld ? feld[v.position] : null;
          return Array.isArray(liste)
            && liste.some((id) => String(id).toLowerCase() === login);
        })() : true;
        const darf = verantwortlich ? (v.darf || {}) : {};
        const vFarbe = vorhabenFarbe(v);
        const p = positionen.find((x) => x.id === v.position) || null;
        const vorgaenger = (p && p.abgeleitet.vorgaenger) || [];
        const nachfolger = (p && p.abgeleitet.nachfolger) || [];

        const offen = (Array.isArray(v.rueckkehr) ? v.rueckkehr : []).filter((r) => !r.erledigt);
        // Die Herkunft kommt fertig aus `/board/data`: Name, Station und ob der
        // Ursprung sichtbar ist. Nachschlagen muss die Seite nichts.
        const herkunft = v.herkunft || {};
        const zweigHerkunft = herkunft.zweig || null;
        const forkHerkunft = herkunft.fork || null;
        const nameVon = (id) => {
          const p = positionen.find((x) => x.id === id);
          return p ? p.name : id;
        };
        const fertig = ergebnisLiegt(v);
        /** Ein Knopf für ein einzelnes Ziel, eine Auswahl bei mehreren. */
        const wahl = (liste, zeichen, titel, gruen) => {
          if (liste.length === 1) {
            return h('button', {
              type: 'button',
              style: gruen ? { ...S.mini, ...S.miniGruen } : S.mini,
              title: titel,
              onClick: () => vorhabenNach(v.id, liste[0]),
            }, zeichen);
          }
          return h('select', {
            style: { ...S.feld, width: 'auto', padding: '0 2px', fontSize: '12px', minHeight: '20px' },
            value: '',
            title: titel,
            onChange: (e) => {
              const z = e.target.value;
              e.target.value = '';
              if (z) vorhabenNach(v.id, z);
            },
          },
          h('option', { value: '' }, zeichen),
          liste.map((id) => h('option', { key: id, value: id }, nameVon(id))));
        };

        return h('div', { key: v.id },
          h('button', {
            type: 'button',
            style: aktiv
              ? {
                ...S.chip,
                borderColor: vFarbe,
                color: alsText(vFarbe),
                background: vFarbe + '1f',
                fontWeight: 500,
              }
              : S.chip,
            title: uebersetze('Dateien dieses Vorhabens zeigen'),
            draggable: darf.verschieben === true,
            onDragStart: (e) => {
              if (!darf.verschieben) { e.preventDefault(); return; }
              setZiehen(v.id);
              try {
                e.dataTransfer.setData('text/plain', v.id);
                e.dataTransfer.effectAllowed = 'move';
              } catch { /* ohne dataTransfer zieht es nicht */ }
            },
            onDragEnd: () => { setZiehen(null); setZiel(null); },
            onClick: () => {
              statusWeg();
              setZurueck(null);
              setWeiter(null);
              setLeser(null);
              setAuswahl((alt) => (alt && alt.art === 'vorhaben' && alt.id === v.id
                ? null : { art: 'vorhaben', id: v.id }));
            },
          }, v.name + (offen.length ? ' ↩' : '')),

          // Wer das Vorhaben an dieser Position verantwortet — an jeder Karte,
          // nicht erst im geöffneten Zustand. Die Angabe kommt aus
          // `vorhaben.json` (die Komposition reicht sie als
          // `verantwortlicheJeStation` durch). Fehlt sie, steht das an der
          // Karte; die Zeile verschwindet nicht.
          (() => {
            const anDieserStelle = verantwortlicheVon(v);
            const namen = anDieserStelle.map(personAnzeige).filter(Boolean);
            const verantwortet = namen.length
              ? namen.join(', ')
              : String(v.verantwortet == null ? '' : v.verantwortet).trim();
            return h('div', {
              style: {
                margin: '0 0 6px', fontSize: '12px', lineHeight: 1.4,
                color: 'var(--dsw-alias-label-secondary)',
              },
            }, verantwortet
              ? uebersetze('verantwortet von {0}', [verantwortet])
              : uebersetze('ohne Verantwortliche — die Angabe fehlt'));
          })(),

          // Woher das Vorhaben kommt: „Zweig von … ab …“ und „Fork von …“.
          // Ist der Ursprung sichtbar, führt sein Name dorthin.
          zweigHerkunft || forkHerkunft
            ? h('div', { style: S.herkunftZeile },
              zweigHerkunft
                ? h('div', { key: 'zweig' },
                  uebersetze('Zweig von '),
                  zweigHerkunft.sichtbar
                    ? h('button', {
                      type: 'button',
                      style: S.herkunftLink,
                      title: uebersetze('Zum Ursprung „{0}“', [zweigHerkunft.name || zweigHerkunft.von]),
                      onClick: () => herkunftOeffnen(zweigHerkunft.von),
                    }, zweigHerkunft.name || zweigHerkunft.von)
                    : (zweigHerkunft.name || zweigHerkunft.von),
                  uebersetze(' ab {0}', [zweigHerkunft.stationName || zweigHerkunft.station]))
                : null,
              forkHerkunft
                ? h('div', { key: 'fork' },
                  uebersetze('Fork von '),
                  forkHerkunft.sichtbar
                    ? h('button', {
                      type: 'button',
                      style: S.herkunftLink,
                      title: uebersetze('Zum Ursprung „{0}“', [forkHerkunft.name || forkHerkunft.von]),
                      onClick: () => herkunftOeffnen(forkHerkunft.von),
                    }, forkHerkunft.name || forkHerkunft.von)
                    : (forkHerkunft.name || forkHerkunft.von))
                : null)
            : null,

          // Ein offener Rücksprung steht am Vorhaben, bis es wieder an seiner
          // Zielstation vorbei ist: Ziel und Grund kommen fertig aus
          // `/board/data`. Ein erledigter Eintrag verschwindet aus der Anzeige,
          // nicht aus der Datei.
          offen.length
            ? h('div', {
              style: {
                margin: '0 0 6px', fontSize: '12px', lineHeight: 1.45, color: alsText(vFarbe),
              },
            }, offen.map((r, i) => h('div', { key: i },
              uebersetze('↩ zurück nach „{0}“: „{1}“', [r.nachName || nameVon(r.nach), r.grund || uebersetze('ohne Angabe')]),
              h('span', { style: { opacity: 0.75 } },
                uebersetze(' — von {0}, {1}', [r.vonName || nameVon(r.von), r.seit])))))
            : null,

          aktiv && (darf.verschieben || darf.aendern || darf.weitergeben
            || darf.zurueckschicken)
            ? h('div', { style: S.knoepfeKlein },
              darf.verschieben
                ? (vorgaenger.length
                  ? wahl(vorgaenger, '◀', vorgaenger.length === 1 ? uebersetze('Zurück') : uebersetze('Zurück — wohin?'), false)
                  : h('button', {
                    type: 'button',
                    style: { ...S.mini, ...S.miniAus },
                    title: uebersetze('Keine Station davor'),
                    disabled: true,
                  }, uebersetze('◀')))
                : null,
              darf.verschieben
                ? (nachfolger.length
                  ? wahl(nachfolger, '▶', nachfolger.length === 1
                    ? (fertig ? uebersetze('Weiter — das Ergebnis dieser Station liegt vor') : uebersetze('Weiter'))
                    : uebersetze('Weiter — wohin?'), fertig)
                  : h('button', {
                    type: 'button',
                    style: { ...S.mini, ...S.miniAus },
                    title: uebersetze('Keine Station danach'),
                    disabled: true,
                  }, uebersetze('▶')))
                : null,
              darf.weitergeben
                ? h('button', {
                  type: 'button',
                  style: nachfolger.length ? S.mini : { ...S.mini, ...S.miniAus },
                  title: nachfolger.length
                    ? uebersetze('Weitergeben: Zielstation und nächste verantwortliche Person nennen')
                    : uebersetze('Keine Station danach'),
                  disabled: !nachfolger.length,
                  onClick: () => {
                    statusWeg();
                    setZurueck(null);
                    setProjektEdit(null);
                    const ziel = nachfolger.length ? nachfolger[0] : '';
                    setWeiter({
                      id: v.id,
                      nach: ziel,
                      person: ziel ? hostVonPosition(ziel) : (ich ? ich.id : ''),
                    });
                  },
                }, uebersetze('Weitergeben'))
                : null,
              darf.aendern
                ? h('button', {
                  type: 'button',
                  style: projektEdit && projektEdit.id === v.id
                    ? { ...S.mini, borderColor: 'var(--board-akzent, var(--dsw-alias-brand-primary))' }
                    : S.mini,
                  title: uebersetze('Bearbeiten: Name und Farbe'), 'aria-label': uebersetze('Bearbeiten: Name und Farbe'),
                  onClick: () => {
                    statusWeg();
                    setWeiter(null);
                    setProjektEdit(projektEdit && projektEdit.id === v.id
                      ? null
                      : { id: v.id, name: v.name, farbe: vFarbe });
                  },
                }, uebersetze('✎'))
                : null,
              darf.zurueckschicken
                ? h('button', {
                  type: 'button',
                  style: vorgaenger.length ? S.mini : { ...S.mini, ...S.miniAus },
                  title: uebersetze('Zurückschicken: etwas ist offen'), 'aria-label': uebersetze('Zurückschicken: etwas ist offen'),
                  disabled: !vorgaenger.length,
                  onClick: () => {
                    statusWeg();
                    setProjektEdit(null);
                    setWeiter(null);
                    setZurueck({
                      id: v.id,
                      nach: vorgaenger.length ? vorgaenger[0] : v.position,
                      grund: '',
                    });
                  },
                }, uebersetze('↩'))
                : null)
            : null,

          // Ein fremdes Vorhaben lässt sich lesen: seine Dateien sind einen
          // Klick entfernt. Geändert wird dort nichts.
          aktiv && !darf.aendern
            ? h('div', { style: S.knoepfeKlein },
              h('button', {
                type: 'button',
                style: S.mini,
                title: uebersetze('Die Dateien dieses Vorhabens ansehen'),
                onClick: () => dateienOeffnen('', v),
              }, uebersetze('Dateien')))
            : null,

          // Bearbeiten: Name und Farbe an einer Stelle — und nur hier.
          projektEdit && projektEdit.id === v.id
            ? h('div', { style: S.projektForm },
              h('input', {
                style: { ...S.input, width: '100%', boxSizing: 'border-box' },
                value: projektEdit.name,
                autoFocus: true,
                onChange: (ev) => setProjektEdit({ ...projektEdit, name: ev.target.value }),
                onKeyDown: (ev) => {
                  if (ev.key === 'Enter') { ev.preventDefault(); projektSpeichern(); }
                  if (ev.key === 'Escape') { ev.preventDefault(); setProjektEdit(null); }
                },
              }),
              h('div', { style: S.farbGitter },
                FARBEN_ALLE.map((f) => h('button', {
                  key: f,
                  type: 'button',
                  title: farbName(f),
                  style: {
                    ...S.farbPunkt,
                    background: f,
                    borderColor: projektEdit.farbe === f
                      ? 'var(--dsw-alias-label-primary)'
                      : 'transparent',
                  },
                  onClick: () => setProjektEdit({ ...projektEdit, farbe: f }),
                }))),
              h('div', { style: { display: 'flex', gap: '6px' } },
                h('button', { type: 'button', style: S.klein, onClick: projektSpeichern }, uebersetze('Speichern')),
                h('button', {
                  type: 'button', style: S.klein, onClick: () => setProjektEdit(null),
                }, uebersetze('Abbrechen'))))
            : null,

          aktiv && zurueck && zurueck.id === v.id
            ? h('div', { style: S.form },
              h('select', {
                style: { ...S.feld, fontSize: '12px', marginBottom: '6px' },
                value: zurueck.nach,
                onChange: (e) => setZurueck({ ...zurueck, nach: e.target.value }),
              }, positionen.map((p) => h('option', { key: p.id, value: p.id }, p.name))),
              h('input', {
                autoFocus: true,
                style: { ...S.feld, fontSize: '12px', marginBottom: '6px' },
                placeholder: uebersetze('Was ist offen?'),
                value: zurueck.grund,
                onChange: (e) => setZurueck({ ...zurueck, grund: e.target.value }),
                onKeyDown: (e) => {
                  if (e.key === 'Enter') { e.preventDefault(); zurueckschicken(); }
                  if (e.key === 'Escape') { e.preventDefault(); setZurueck(null); }
                },
              }),
              h('div', { style: { display: 'flex', gap: '6px' } },
                h('button', { type: 'button', style: S.klein, onClick: zurueckschicken },
                  uebersetze('Zurückschicken')),
                h('button', {
                  type: 'button', style: S.klein, onClick: () => setZurueck(null),
                }, uebersetze('Abbrechen'))))
            : null,

          // Weitergeben: Zielstation und nächste verantwortliche Person. Der
          // Eintrag an der Zielstation entsteht mit der Handlung, das Vorhaben
          // wandert dorthin. Ohne genannte Person bleibt es beim Abgebenden.
          aktiv && weiter && weiter.id === v.id
            ? h('div', { style: S.form },
              h('div', { style: { fontSize: '12px', marginBottom: '4px' } },
                uebersetze('Weitergeben an')),
              h('select', {
                style: { ...S.feld, fontSize: '12px', marginBottom: '6px' },
                value: weiter.nach,
                onChange: (e) => {
                  const ziel = e.target.value;
                  setWeiter({ ...weiter, nach: ziel, person: hostVonPosition(ziel) });
                },
              }, nachfolger.map((id) => h('option', { key: id, value: id }, nameVon(id)))),
              h('div', { style: { fontSize: '12px', marginBottom: '4px' } },
                uebersetze('Nächste verantwortliche Person')),
              h('select', {
                style: { ...S.feld, fontSize: '12px', marginBottom: '6px' },
                value: weiter.person,
                onChange: (e) => setWeiter({ ...weiter, person: e.target.value }),
              }, personen.map((p) => h('option', { key: p.id, value: p.id },
                p.name || (p.ich ? uebersetze('Du') : p.id)))),
              h('div', { style: { display: 'flex', gap: '6px' } },
                h('button', { type: 'button', style: S.klein, onClick: weitergebenAktion },
                  uebersetze('Weitergeben')),
                h('button', {
                  type: 'button', style: S.klein, onClick: () => setWeiter(null),
                }, uebersetze('Abbrechen'))))
            : null);
      }

      // Ein Schritt ist entweder ein Prozess („A → B", mit Skill) oder ein
      // Dokument. Der Prozess zeigt seinen Skill im Feld, das Dokument erscheint
      // bei der Station danach. Nur der letzte Prozess zeigt seine Dateien selbst,
      // weil kein Dokument mehr folgt.
      function istProzess(p) {
        const wie = p && p.abgeleitet && p.abgeleitet.wie;
        return !!(wie && wie.wert);
      }

      // --- Schritte, Dateien und Verbindungen --------------------------------
      // Alles hängt am Schritt, nicht an einer Spalte. Der grüne Pfeil heißt:
      // dieser Schritt hat sein Ergebnis erzeugt.
      function verlaufFuer(positionId) {
        return ((verlauf && verlauf.schritte) || [])
          .find((s) => s.positionId === positionId) || null;
      }

      function eigeneDateien(p) {
        const schritt = verlaufFuer(p.id);
        return (schritt && schritt.dateien) || [];
      }

      // Folgt auf einen Prozess eine Station, die die Arbeit nicht selbst tut
      // (Vision, Fachkonzept, Architekturplan), steht das Ergebnis dort — das
      // Dokument erscheint bei der Station danach. Folgt ihm wieder ein Prozess,
      // bleibt die Datei bei ihm; sonst wäre sie nirgends zu sehen.
      function folgtErgebnisSpalte(p) {
        const nach = p.abgeleitet.nachfolger || [];
        if (!nach.length) return false;
        return nach.every((id) => {
          const q = positionen.find((x) => x.id === id);
          return q && !istProzess(q);
        });
      }

      // Was einer Station zugeht: die Datei, die der Prozess davor erzeugt hat.
      function eingangDateien(p) {
        const liste = [];
        const namen = new Set();
        (p.abgeleitet.vorgaenger || []).forEach((id) => {
          const q = positionen.find((x) => x.id === id);
          if (!q || !istProzess(q)) return;
          eigeneDateien(q).forEach((d) => {
            if (namen.has(d.name)) return;
            namen.add(d.name);
            liste.push(d);
          });
        });
        return liste;
      }

      function dateienFuer(p) {
        if (!gewaehltesVorhaben || !verlaufBereit) return [];
        if (istProzess(p)) return folgtErgebnisSpalte(p) ? [] : eigeneDateien(p);
        const liste = eingangDateien(p);
        const namen = new Set(liste.map((d) => d.name));
        eigeneDateien(p).forEach((d) => {
          if (namen.has(d.name)) return;
          namen.add(d.name);
          liste.push(d);
        });
        return liste;
      }

      // Voraussetzung für den nächsten Schritt ist das Ergebnis dieses Schritts:
      // beim Prozess seine Ausgabedatei, an der Ergebnis-Station das, was dort
      // steht. Notizen dazu sind freiwillig und zählen nicht mit — sonst bliebe
      // der Pfeil grau, obwohl die Arbeit getan ist.
      function ergebnisLiegt(v) {
        if (!gewaehltesVorhaben || !verlaufBereit || !verlauf) return false;
        const p = positionen.find((x) => x.id === v.position);
        if (!p) return false;
        const datei = (istProzess(p) ? eigeneDateien(p) : dateienFuer(p))[0];
        return !!(datei && datei.exists);
      }

      function skillFuer(p) {
        if (!gewaehltesVorhaben || !verlaufBereit) return null;
        const wie = p.abgeleitet.wie;
        if (wie.art !== 'skill') return null;
        const schritt = verlaufFuer(p.id);
        if (!schritt || !(schritt.transkripte || []).length) return null;
        return h('button', {
          key: 'skill-' + p.id,
          type: 'button',
          title: uebersetze('Transkript der Sitzung öffnen'),
          style: {
            ...S.dateiKnopf, borderStyle: 'dashed', borderColor: farbe, color: alsText(farbe),
          },
          onClick: () => oeffneTranskript(p.id, p.name),
        }, uebersetze('◆ {0}', [wie.wert]));
      }

      function startFuer(p) {
        if (!gewaehltesVorhaben || p.id !== gewaehltesVorhaben.position) return null;
        // Ein Lauf schreibt ein Transkript in den Vorhabenordner: nur bei einem
        // Vorhaben, das die eigene Person verantwortet.
        if (!(gewaehltesVorhaben.darf && gewaehltesVorhaben.darf.aendern)) return null;
        if (!istProzess(p)) return null;
        const wie = p.abgeleitet.wie;
        if (wie.art !== 'skill') return null;
        // Ein Verweis-Schritt ist hier kein Sonderfall: seine Anweisung liegt
        // in der Ablage seines Hosts, eingesetzt wird sie als `<host>-<schritt>`,
        // und das Transkript bleibt beim eigenen Vorhaben. `fremd` schließt den
        // Start deshalb nicht aus — die Anweisung kommt mit der Ablage.
        return h('button', {
          key: 'start-' + p.id,
          type: 'button',
          title: uebersetze('Dieses Gespräch in einer Spalte rechts öffnen'),
          style: { ...S.dateiKnopf, borderColor: farbe, color: alsText(farbe) },
          onClick: () => gespraechBeginnen(wie.wert, p.id),
        }, uebersetze('▶ {0} starten', [wie.wert]));
      }

      // --- Der Baum der Dateien --------------------------------------------
      //
      // Ein Ordner ist ein Ergebnis wie eine Datei, nur mit unbekanntem
      // Inhalt. Gezeigt wird er als Baum: aufgeklappt wird, was er gerade
      // braucht, geholt — nicht der ganze Ordner auf einmal.

      // `wahl` ist das Vorhaben, dessen Ordner gezeigt wird. Ohne Angabe ist es
      // das ausgewählte — ein fremdes Vorhaben öffnet seine Dateien genauso.
      function dateienOeffnen(ordner, wahl) {
        const vorhabenWahl = wahl || gewaehltesVorhaben;
        if (!vorhabenWahl) return;
        const vorhabenId = vorhabenWahl.id;
        const anfang = String(ordner || '').replace(/\/+$/, '');
        setDateien({
          vorhaben: vorhabenId,
          titel: vorhabenWahl.name,
          offen: anfang ? { '': true, [anfang]: true } : { '': true },
          eintraege: {},
          mehr: {},
          laedt: {},
          fehler: null,
        });
        ladeEbene(vorhabenId, '');
        if (anfang) ladeEbene(vorhabenId, anfang);
      }

      // Ein fremdes Vorhaben öffnen: es wird ausgewählt, und seine Dateien
      // erscheinen links. Geändert wird dort nichts — der Leser bleibt beim
      // Lesen, und Handlungen bietet `darf` nicht an.
      function fremdesVorhabenOeffnen(v) {
        if (!v) return;
        statusWeg();
        setWeiter(null);
        setZurueck(null);
        setProjektEdit(null);
        setLeser(null);
        setAuswahl({ art: 'vorhaben', id: v.id });
        dateienOeffnen('', v);
      }

      // Die Herkunft öffnet ihren Ursprung: das Vorhaben wird ausgewählt. Ist
      // der Ursprung nicht sichtbar, gibt es diesen Weg nicht.
      function herkunftOeffnen(id) {
        const ziel = vorhaben.find((v) => v.id === id);
        if (!ziel) return;
        statusWeg();
        setWeiter(null);
        setZurueck(null);
        setProjektEdit(null);
        setLeser(null);
        setAuswahl({ art: 'vorhaben', id: ziel.id });
      }

      /** Holt die Einträge eines Ordners im Dateibaum nach. */
      function ladeEbene(vorhabenId, pfad) {
        setDateien((alt) => (alt ? { ...alt, laedt: { ...alt.laedt, [pfad]: true } } : alt));
        fetch('/board/dateien?vorhaben=' + encodeURIComponent(vorhabenId)
          + '&pfad=' + encodeURIComponent(pfad))
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
          .then((d) => {
            setDateien((alt) => (alt && alt.vorhaben === vorhabenId
              ? {
                ...alt,
                eintraege: { ...alt.eintraege, [pfad]: (d && d.eintraege) || [] },
                mehr: { ...alt.mehr, [pfad]: (d && d.mehr) || 0 },
                laedt: { ...alt.laedt, [pfad]: false },
                fehler: null,
              }
              : alt));
          })
          .catch((e) => {
            setDateien((alt) => (alt
              ? {
                ...alt,
                laedt: { ...alt.laedt, [pfad]: false },
                fehler: uebersetze('Der Ordner ließ sich nicht lesen: ') + String((e && e.message) || e),
              }
              : alt));
          });
      }

      function ordnerKlappen(pfad) {
        if (!dateien) return;
        const offen = !dateien.offen[pfad];
        setDateien((alt) => {
          if (!alt) return alt;
          const neu = { ...alt.offen };
          if (offen) neu[pfad] = true; else delete neu[pfad];
          return { ...alt, offen: neu };
        });
        if (offen && !dateien.eintraege[pfad] && !dateien.laedt[pfad]) {
          ladeEbene(dateien.vorhaben, pfad);
        }
      }

      // Ein Klick auf eine Datei im Baum öffnet sie im Leser. Was im
      // Wurzelordner liegt, lässt sich wie gewohnt bearbeiten; was tiefer
      // liegt, wird gelesen — bearbeitet wird dort, wo es entsteht.
      /** Öffnet eine Datei aus dem Baum im Leser. */
      function dateiOeffnen(pfad) {
        if (!dateien) return;
        const teile = String(pfad).split('/');
        const name = teile[teile.length - 1];
        const ordner = teile.slice(0, -1).join('/');
        const vorhabenId = dateien.vorhaben;
        statusWeg();
        setEingriff(null);
        fetch('/board/datei?vorhaben=' + encodeURIComponent(vorhabenId)
          + '&pfad=' + encodeURIComponent(pfad))
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
          .then((d) => {
            setLeser({
              art: 'datei',
              vorhaben: vorhabenId,
              datei: name,
              ...(ordner ? { pfad, ordner } : {}),
              text: (d && d.text) || '',
              vorhanden: !!(d && d.exists),
              binaer: !!(d && d.binaer),
              modus: 'lesen',
            });
          })
          .catch(() => fehler(uebersetze('Die Datei „{0}“ ließ sich nicht lesen.', [name])));
      }

      /** Die Zeilen eines Ordners im Dateibaum, aufgeklappte Ordner eingeschlossen. */
      function baumZeilen(pfad, tiefe) {
        if (!dateien) return null;
        const eintraege = dateien.eintraege[pfad] || [];
        const rand = { paddingLeft: (8 + tiefe * 14) + 'px' };
        const zeilen = eintraege.map((e) => {
          const unterpfad = pfad ? pfad + '/' + e.name : e.name;
          const istOrdner = e.art === 'ordner';
          const offen = !!dateien.offen[unterpfad];
          const zeile = h('button', {
            key: unterpfad,
            type: 'button',
            title: istOrdner
              ? uebersetze('{0} Einträge', [e.anzahl || 0])
              : (e.groesse || 0) + ' Bytes',
            style: { ...S.dateiZeile, ...rand },
            onClick: () => (istOrdner ? ordnerKlappen(unterpfad) : dateiOeffnen(unterpfad)),
          }, (istOrdner ? (offen ? '▾ ' : '▸ ') : '') + e.name + (istOrdner ? '/' : ''));
          if (!istOrdner) return zeile;
          return [
            zeile,
            offen
              ? (dateien.eintraege[unterpfad]
                ? baumZeilen(unterpfad, tiefe + 1)
                : h('div', { key: unterpfad + '-lade', style: { ...S.meta, ...rand } }, uebersetze('Lade …')))
              : null,
          ];
        });
        if (dateien.mehr[pfad]) {
          zeilen.push(h('div', { key: pfad + '-mehr', style: { ...S.meta, ...rand } },
            uebersetze('… und {0} weitere', [dateien.mehr[pfad]])));
        }
        return zeilen;
      }

      /** Der Knopf, mit dem an einer Station die Ausgabedatei entsteht. */
      function schreibFuer(p) {
        if (!gewaehltesVorhaben || p.id !== gewaehltesVorhaben.position) return null;
        // In ein fremdes Vorhaben wird nicht geschrieben — auch nicht an einer
        // Station, die auf der eigenen Fläche liegt.
        if (!(gewaehltesVorhaben.darf && gewaehltesVorhaben.darf.aendern)) return null;
        if (istProzess(p)) return null;
        // „Datei öffnen" schreibt nicht — dort steht, was der Schritt davor
        // erzeugt hat. Wer selbst schreiben will, wählt Textfeld.
        if (p.abgeleitet.wie && p.abgeleitet.wie.art === 'datei') return null;
        // Geschrieben wird die eigene Ausgabe dieser Station. Was von davor
        // hereinkommt, zählt nicht: auch an einer Station mit Eingang muss
        // sein Dokument entstehen können.
        if (!verlaufBereit) return null;
        if (eigeneDateien(p).filter((d) => d.exists).length) return null;
        const datei = (p.abgeleitet.ausgabe || [])[0];
        if (!datei) return null;
        // Ein Ordner entsteht dort, wo gebaut wird — nicht im Editor.
        if (String(datei).endsWith('/')) return null;
        return h('button', {
          key: 'schreiben-' + p.id,
          type: 'button',
          title: uebersetze('In den Ordner des Vorhabens schreiben'),
          style: { ...S.dateiKnopf, borderStyle: 'dotted', borderColor: farbe, color: alsText(farbe) },
          onClick: () => oeffneSchreiben(datei, p.name, p.id),
        }, uebersetze('✎ {0} schreiben', [p.name]));
      }

      // Was in den Einstellungen steht: die abgeleiteten Werte der Station und
      // der Entwurf, an dem gerade getippt wird.
      const ab = (gewaehlt && gewaehlt.abgeleitet)
        || { eingang: [], ausgabe: [], wie: {}, eingangEigener: false, ausgabeEigene: false };
      const e = (art === 'schritt' && gewaehlt && (entwurf || schrittEntwurf(data, gewaehlt.id)))
        || {
          name: '', inhalt: '', eingang: '', ausgabe: '',
          wieArt: 'textfeld', wieWert: '', weiter: 'freigabe',
        };

      // Die Namen, die an der Station gelten: die getippten; ist ein Feld leer,
      // gilt, was sich aus den Nachbarn ergibt. Ein leeres Feld heißt also
      // „folgt automatisch", nicht „nichts".
      function werte() {
        const liste = (text, abgeleitet) => (String(text || '').trim()
          ? text.split(',').map((x) => x.trim()).filter(Boolean)
          : (abgeleitet || []));
        return {
          eingang: liste(e.eingang, ab.eingang),
          ausgabe: liste(e.ausgabe, ab.ausgabe),
        };
      }

      // Ein Skill sagt in seiner Beschreibung, welche Datei er anlegt. Der
      // erste genannte Name wird zum Ausgang — von Hand änderbar.
      async function ausgangFuerSkill(name) {
        if (!name) return;
        try {
          const antwort = await fetch('/board/skill/dateien?name=' + encodeURIComponent(name));
          if (!antwort.ok) return;
          const d = await antwort.json();
          const datei = d && (d.dateien || [])[0];
          if (!datei) return;
          setEntwurf((alt) => {
            const jetzt = alt || e;
            const eigen = String(jetzt.ausgabe || '').trim();
            if (eigen && eigen !== autoAusgang.current) return jetzt;
            return { ...jetzt, ausgabe: datei };
          });
          autoAusgang.current = datei;
        } catch (err) { /* ohne Vorschlag bleibt das Feld, wie es ist */ }
      }

      // Was in der Anzeige steht: der Wert, und wenn keiner da ist, ein
      // Strich — nichts Erfundenes. Die Angaben aus dem Repository nennen
      // ihren Ersatz selbst („keine Angabe“).
      const anzeigeZeile = (titel, wert, ersatz) => {
        const text = String(wert || '').trim();
        return h('div', { style: S.feldBlock },
          h('span', { style: S.feldTitel }, titel),
          text
            ? h('div', { style: S.anzeigeWert }, text)
            : h('div', { style: { ...S.anzeigeWert, ...S.leer } },
              ersatz == null ? uebersetze('—') : ersatz));
      };

      // Wie an dieser Station gearbeitet wird — das Wort aus der Auswahl und,
      // wenn eines genannt ist, das gewählte Ding dazu.
      const aktionText = () => {
        const w = WIE.find((x) => x.wert === e.wieArt) || WIE[2];
        // Nur Skill und Skript tragen einen Namen; die anderen Arten sind
        // ohne Zusatz vollständig.
        if (!e.wieWert.trim() || w.wert === 'textfeld' || w.wert === 'chat'
          || w.wert === 'datei') return uebersetze(w.text);
        return uebersetze(w.text) + ': ' + e.wieWert.trim();
      };

      /** Kopiert den Repository-Pfad der Station in die Zwischenablage. */
      async function stationPfadKopieren(pfad) {
        try {
          await kopiereText(pfad);
          melde(uebersetze('Repository kopiert: {0}', [pfad]));
        } catch {
          // Ohne Zwischenablage bleibt der Pfad zum Abschreiben stehen.
          melde(uebersetze('Repository: {0}', [pfad]));
        }
      }

      // Das Vertrauensbild einer geöffneten Station: was in ihrem Repository
      // steht, welche Fassung gilt und wo sie verwendet wird. Was fehlt, steht
      // als fehlend da — nichts wird erfunden. Fassung 1 zeigt diesen Block
      // nicht; dort bleibt die Anzeige, wie sie war.
      /** Das Vertrauensbild einer Station aus ihrem Repository. */
      const stationVertrauen = () => {
        if (!(data && data.format === 2 && art === 'schritt' && gewaehlt)) return null;
        const stand = stationAngaben[String(gewaehlt.id)];
        if (!stand || stand.zustand === 'laedt') {
          return h('div', {
            style: {
              ...S.feldBlock,
              borderTop: '1px solid var(--dsw-alias-border-l1)',
              paddingTop: '10px',
            },
          },
          h('span', { style: S.feldTitel }, uebersetze('Aus dem Repository')),
          h('div', { style: { ...S.anzeigeWert, ...S.leer } }, uebersetze('wird gelesen …')));
        }
        if (stand.zustand === 'fehler') {
          return h('div', {
            style: {
              ...S.feldBlock,
              borderTop: '1px solid var(--dsw-alias-border-l1)',
              paddingTop: '10px',
            },
          },
          h('span', { style: S.feldTitel }, uebersetze('Aus dem Repository')),
          h('div', { style: { ...S.anzeigeWert, ...S.leer } },
            uebersetze('nicht zu lesen: {0}', [stand.fehler || 'unbekannter Grund'])));
        }
        const d = stand.daten || {};
        const beispiele = Array.isArray(d.beispiele) ? d.beispiele : [];
        const verwendung = Array.isArray(d.verwendung) ? d.verwendung : [];
        const pfad = String(d.repo || '').trim();
        const readme = String(d.readme == null ? '' : d.readme).trim();
        const adresse = String(d.adresse == null ? '' : d.adresse).trim()
          .replace(/\/+$/, '');
        const sterne = Number.isFinite(d.sterne) ? d.sterne : null;
        const freigaben = Array.isArray(d.freigaben) ? d.freigaben : null;
        const fragen = Number.isFinite(d.fragen) ? d.fragen : null;
        const beitraege = Number.isFinite(d.beitraege) ? d.beitraege : null;
        const geprueft = d.geprueft && typeof d.geprueft === 'object'
          ? d.geprueft : null;
        const hinweis = String(d.hinweis == null ? '' : d.hinweis).trim();
        const auf = (pfadTeil) => (adresse ? adresse + pfadTeil : '');
        const verweisStil = {
          fontSize: '12px', color: 'var(--board-akzent, var(--dsw-alias-brand-primary))',
          marginLeft: '6px',
        };
        const zahl = (wert) => (Number.isFinite(wert) ? String(wert) : '');
        // Eine Zahl mit ihrem Verweis; fehlt sie, steht „keine Angabe“ da.
        const zahlZeile = (titel, wert, pfadTeil, zusatz, verweisText) => h('div', {
          style: S.feldBlock,
        },
        h('span', { style: S.feldTitel }, titel),
        h('div', { style: { ...S.anzeigeWert, ...(zahl(wert) ? {} : S.leer) } },
          zahl(wert)
            ? h(React.Fragment, null,
              zahl(wert) + (zusatz ? ' ' + zusatz : ''),
              auf(pfadTeil)
                ? h('a', {
                  href: auf(pfadTeil),
                  target: '_blank',
                  rel: 'noreferrer',
                  style: verweisStil,
                }, verweisText)
                : null)
            : uebersetze('keine Angabe')));
        // Releases sind eine Liste; eine leere, aber gelesene Liste ist 0, eine
        // nicht gelesene bleibt „keine Angabe“.
        /** Die Releases einer Station als Zeile. */
        const freigabenZeile = (() => {
          if (freigaben === null) {
            return h('div', { style: S.feldBlock },
              h('span', { style: S.feldTitel }, uebersetze('Releases')),
              h('div', { style: { ...S.anzeigeWert, ...S.leer } }, uebersetze('keine Angabe')));
          }
          const tags = freigaben.map((eintrag) => String(
            (eintrag && (eintrag.tag || eintrag.name)) || '',
          ).trim()).filter(Boolean);
          const text = tags.length
            ? tags.join(', ')
            : (freigaben.length ? String(freigaben.length) : '0');
          return h('div', { style: S.feldBlock },
            h('span', { style: S.feldTitel }, uebersetze('Releases')),
            h('div', { style: S.anzeigeWert },
              text,
              auf('/releases')
                ? h('a', {
                  href: auf('/releases'),
                  target: '_blank',
                  rel: 'noreferrer',
                  style: verweisStil,
                }, uebersetze('Releases auf GitHub'))
                : null));
        })();
        const pruefText = geprueft
          ? [geprueft.von, geprueft.am]
            .map((wert) => String(wert == null ? '' : wert).trim())
            .filter(Boolean).join(' · ')
          : '';
        const geprueftZeile = h('div', { style: S.feldBlock },
          h('span', { style: S.feldTitel }, uebersetze('Geprüft')),
          h('div', {
            style: { ...S.anzeigeWert, ...(pruefText ? {} : S.leer) },
          }, pruefText || uebersetze('keine Angabe')));
        // Eine Liste: je Zeile ein Eintrag; ist sie leer, steht der Ersatz da.
        const liste = (titel, werte, ersatz) => h('div', { style: S.feldBlock },
          h('span', { style: S.feldTitel }, titel),
          werte.length
            ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '2px' } },
              werte.map((wert, i) => h('div', {
                key: String(i), style: S.anzeigeWert,
              }, wert)))
            : h('div', { style: { ...S.anzeigeWert, ...S.leer } }, ersatz));
        return h('div', {
          style: {
            display: 'flex', flexDirection: 'column', gap: '10px',
            borderTop: '1px solid var(--dsw-alias-border-l1)', paddingTop: '10px',
          },
        },
        h('span', { style: { ...S.feldTitel, fontWeight: 600 } }, uebersetze('Aus dem Repository')),
        anzeigeZeile('Name', d.name, 'keine Angabe'),
        // Die Fassung steht im Detail. Gibt es einen neueren Tag als die
        // eingetragene, lässt sie sich von hier nachziehen — eine eigene
        // Handlung; ohne neueren Tag bleibt der Knopf weg.
        (() => {
          const fassung = String(d.fassung == null ? '' : d.fassung).trim();
          const nachziehen = String(d.nachziehen == null ? '' : d.nachziehen).trim();
          return h('div', { style: S.feldBlock },
            h('span', { style: S.feldTitel }, uebersetze('Fassung')),
            h('div', {
              style: { ...S.anzeigeWert, ...(fassung ? {} : S.leer) },
            }, fassung || uebersetze('keine Angabe')),
            d.fassungFehlt
              ? h('div', { style: { ...S.hinweis, marginTop: '2px' } },
                uebersetze('Fassung {0} fehlt; gelesen wurde der aktuelle Stand.', [fassung]))
              : null,
            nachziehen
              ? h('button', {
                type: 'button',
                style: { ...S.klein, alignSelf: 'flex-start', marginTop: '4px' },
                title: uebersetze('Die Station auf „{0}“ ziehen — der Workflow gilt dann auf dieser Fassung', [nachziehen]),
                onClick: () => fassungNachziehen(gewaehlt.id),
              }, uebersetze('Fassung nachziehen'))
              : null);
        })(),
        anzeigeZeile('Reife', d.reife, 'keine Angabe'),
        anzeigeZeile('Lizenz', d.lizenz, 'keine Angabe'),
        anzeigeZeile('Beschreibung', d.beschreibung, 'keine Angabe'),
        // Das Vertrauen: Sterne, Releases, offene Fragen und Beiträge. Fehlt
        // ein Wert, steht „keine Angabe“ da — eine 0 nur, wenn sie gelesen ist.
        hinweis
          ? h('div', { style: S.hinweis }, hinweis)
          : null,
        zahlZeile('Sterne', sterne, '/stargazers', '', uebersetze('Sterne auf GitHub')),
        freigabenZeile,
        zahlZeile('Fragen', fragen, '/issues', 'offen', uebersetze('Issues auf GitHub')),
        zahlZeile(uebersetze('Beiträge'), beitraege, '/pulls', 'offen',
          uebersetze('Pull Requests auf GitHub')),
        geprueftZeile,
        liste('Beispiele', beispiele, 'kein Beispiel'),
        liste('Verwendung', verwendung.map((eintrag) => {
          const titel = String((eintrag && eintrag.titel) || '').trim() || uebersetze('ohne Titel');
          const fassung = String((eintrag && eintrag.fassung) == null
            ? '' : eintrag.fassung).trim();
          return titel + ' — Fassung ' + (fassung || uebersetze('ohne Fassung'));
        }), uebersetze('in keinem Workflow')),
        h('div', { style: S.feldBlock },
          h('span', { style: S.feldTitel }, uebersetze('Repository')),
          pfad
            ? h('div', {
              style: {
                display: 'flex', alignItems: 'flex-start', gap: '6px', flexWrap: 'wrap',
              },
            },
            h('span', { style: S.bibPfad }, pfad),
            h('button', {
              type: 'button',
              style: S.klein,
              title: uebersetze('Pfad kopieren'),
              onClick: () => stationPfadKopieren(pfad),
            }, uebersetze('kopieren')),
            auf('')
              ? h('a', {
                href: auf(''),
                target: '_blank',
                rel: 'noreferrer',
                style: { ...verweisStil, marginLeft: 0 },
              }, uebersetze('Repository auf GitHub'))
              : null)
            : h('div', { style: { ...S.anzeigeWert, ...S.leer } }, uebersetze('keine Angabe'))),
        h('div', { style: S.feldBlock },
          h('span', { style: S.feldTitel }, uebersetze('README')),
          readme
            ? h('div', {
              style: {
                ...S.anzeigeWert,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                fontSize: '12px',
                maxHeight: '180px',
                overflow: 'auto',
              },
            }, readme.length > 1400 ? uebersetze('{0} …', [readme.slice(0, 1400)]) : readme)
            : h('div', { style: { ...S.anzeigeWert, ...S.leer } }, uebersetze('kein README'))),
        // Die Beiträge zu dieser Station: Pull Requests an ihrem Repository.
        h(BeitraegeFlaeche, { repo: pfad }),
        // Die Fragen und der Fork zu dieser Station.
        h(FragenFlaeche, { repo: pfad }));
      };

      // Der eine Satz für einen fremden Schritt: er steht im Kopf des rechten
      // Docks, nicht doppelt im Inhalt darunter.
      const stationFremdHinweis = () => {
        if (!(art === 'schritt' && gewaehlt && gewaehlt.fremd)) return null;
        // Eine Station aus der Bibliothek sagt ihren eigenen Satz im Inhalt.
        if (gewaehlt.bibliothek) return null;
        return gewaehlt.ref
          ? uebersetze('Verweis auf „{0}“ — hier nur zu lesen.', [gewaehlt.ref])
          : uebersetze('Dieser Schritt gehört {0} — hier nur zu lesen.', [personName(gewaehlt.host)]);
      };

      // Die geöffnete Station, gelesen. Das Öffnen zeigt die Werte; erst
      // „Bearbeiten“ macht daraus Felder. Ein fremder Schritt bleibt beim
      // Lesen: geändert wird er in der Workflow-Datei seines Hosts. Eine
      // Station, die nur in der Bibliothek steht, zeigt Host, Fassung und
      // Repository — mehr weiß das Board von ihr nicht. In Fassung 2 kommt
      // das Vertrauensbild aus ihrem eigenen Repository dazu.
      /** Die geöffnete Station als Anzeige, nicht als Formular. */
      const stationAnzeige = () => {
        const vertrauen = stationVertrauen();
        const ausRepository = !!(gewaehlt
          && stationAngaben[String(gewaehlt.id)]
          && stationAngaben[String(gewaehlt.id)].zustand === 'ok');
        if (art === 'schritt' && gewaehlt && gewaehlt.bibliothek) {
          return h('div', { style: S.anzeige },
            h('div', { style: { ...S.hostZeile, marginBottom: 0 } },
              uebersetze('Host: {0}', [personName(gewaehlt.host)])),
            h('div', { style: S.fremdHinweis },
              uebersetze('Diese Station steht noch nicht im Workflow — hier nur zu lesen.')),
            vertrauen || h(React.Fragment, null,
              anzeigeZeile('Fassung', gewaehlt.fassung),
              anzeigeZeile('Repository', gewaehlt.repo)));
        }
        return (art === 'schritt' && gewaehlt) ? h('div', { style: S.anzeige },
          h('div', { style: { ...S.hostZeile, marginBottom: 0 } },
            gewaehlt.ref
              ? uebersetze('bei {0}', [personName(gewaehlt.host)])
              : uebersetze('Host: {0}{1}', [personName(gewaehlt.host), ich && gewaehlt.host === ich.id ? ' (du)' : ''])),

          // In Fassung 2 steht die Beschreibung im geladenen Vertrauensbild
          // darunter — dort, wo sie aus dem Repository der Station kommt.
          // Solange es nicht geladen ist, bleibt die bekannte Beschreibung da.
          data && data.format === 2 && ausRepository
            ? null : anzeigeZeile('Beschreibung', e.inhalt),
          anzeigeZeile('Eingang', e.eingang || ab.eingang.join(', ')),
          anzeigeZeile('Aktion', aktionText()),
          anzeigeZeile('Ausgang', e.ausgabe || ab.ausgabe.join(', ')),
          // Was an den Verbindungen übergeben wird: oben, was ankommt, unten,
          // was hinausgeht. Passt es nicht, stehen beide Namen da.
          (() => {
            const w = werte();
            const zeilen = uebergabeZeilen(gewaehlt, w.eingang, w.ausgabe, 'lesen');
            return zeilen.length
              ? h('div', { style: S.feldBlock },
                h('span', { style: S.feldTitel }, uebersetze('Übergabe')),
                h('div', { style: S.uebergabe }, zeilen))
              : null;
          })(),
          anzeigeZeile(uebersetze('Weiterreichung zur nächsten Station'), e.weiter === 'automatisch'
            ? uebersetze('Automatisch, wenn die Ausgabedatei erzeugt ist')
            : 'Freigabe'),
          vertrauen)
          : null;
      };

      // Nichts geändert: zurück zur Anzeige, mit den Werten, die gespeichert sind.
      function stationVerwerfen() {
        setStationEdit(false);
        setEntwurf(schrittEntwurf(data, auswahlId));
      }

      // Die Einstellungen einer Station zum Ändern. Dieselben Felder stehen in
      // der aufgeblähten Station auf der Fläche und — für eine Station, die noch
      // nicht dort liegt — im Feld unter dem Board (`imFeld`).
      const stationFormular = (imFeld) => (art === 'schritt' && gewaehlt && !gewaehlt.fremd) ? h('div', { style: S.formular },
        h('div', { style: { ...S.hostZeile, marginBottom: 0 } },
          uebersetze('Host: {0}{1}', [personName(gewaehlt.host), ich && gewaehlt.host === ich.id ? ' (du)' : ''])),

        // Der Name ist die Beschriftung der Station: er steht auf der Karte und
        // in den Nachbarlisten. Die Datei hängt nicht an ihm — beim Umbenennen
        // trägt das Board den bisherigen Dateinamen als Ausgang ein.
        h(Feld, {
          id: 'station-name',
          label: 'Name',
          wert: e.name || '',
          onEingabe: (ev) => setEntwurf({ ...e, name: ev.target.value }),
        }),

        h(Feld, {
          id: 'station-beschreibung',
          label: 'Beschreibung',
          wert: e.inhalt,
          onEingabe: (ev) => setEntwurf({ ...e, inhalt: ev.target.value }),
          mehrzeilig: true,
          stil: { minHeight: '54px', width: '100%' },
        }),

        // Der Eingang: das Feld und darunter, was sich anbietet. Kein eigener
        // Knopf — die Liste steht immer da, wo ein Dateiname stehen kann.
        dateiFeld('eingang'),

        h('div', { style: S.feldBlock },
          h('span', { style: S.feldTitel }, uebersetze('Aktion')),
          h('div', { style: { ...S.knoepfe, flexWrap: 'wrap' } },
            WIE.map((w) => h('button', {
              key: w.wert,
              type: 'button',
              style: e.wieArt === w.wert ? { ...S.wahl, ...S.wahlAktiv } : S.wahl,
              onClick: () => {
                setEntwurf({ ...e, wieArt: w.wert });
                if (w.wert === 'skill' && e.wieWert) ausgangFuerSkill(e.wieWert);
              },
            }, uebersetze(w.text))))),

        e.wieArt === 'skill'
          ? h('div', { style: { ...S.knoepfe, flexWrap: 'wrap' } },
            h('select', {
              style: { ...S.feld, flex: 1, minWidth: '140px' },
              value: e.wieWert,
              onChange: (ev) => {
                const name = ev.target.value;
                setEntwurf({ ...e, wieWert: name });
                ausgangFuerSkill(name);
              },
            },
            h('option', { value: '' }, uebersetze('— Skill wählen —')),
            skills.map((sk) => h('option', { key: sk.name, value: sk.name },
              (sk.titel ? sk.titel + ' — ' + sk.name : sk.name)
                + (sk.entwurf ? ' (Entwurf)' : '')))),
            h('button', { type: 'button', style: S.klein, onClick: werkstattStarten },
              uebersetze('Skill kreieren')))
          : null,

        e.wieArt === 'skript'
          ? h('input', {
            style: { ...S.feld, width: '100%', boxSizing: 'border-box' },
            value: e.wieWert,
            placeholder: uebersetze('Pfad des Skripts'),
            onChange: (ev) => setEntwurf({ ...e, wieWert: ev.target.value }),
          })
          : null,

        // Der Ausgang: dasselbe Feld, mit dem, was die Station danach erwartet.
        dateiFeld('ausgabe'),

        // Die Übergabe, an den Werten, die gerade getippt werden: so ist ein
        // Tippfehler zu sehen, bevor gespeichert wird.
        (() => {
          const w = werte();
          const zeilen = uebergabeZeilen(gewaehlt, w.eingang, w.ausgabe, 'form');
          return zeilen.length
            ? h('div', { style: S.feldBlock },
              h('span', { style: S.feldTitel }, uebersetze('Übergabe')),
              h('div', { style: S.uebergabe }, zeilen))
            : null;
        })(),

        h('div', { style: S.feldBlock },
          h('span', { style: S.feldTitel }, uebersetze('Weiterreichung zur nächsten Station')),
          h('div', { style: { ...S.knoepfe, flexWrap: 'wrap' } },
            WEITER.map((w) => h('button', {
              key: w.wert,
              type: 'button',
              style: e.weiter === w.wert ? { ...S.wahl, ...S.wahlAktiv } : S.wahl,
            }, uebersetze(w.text))))),

        h('div', { style: { ...S.knoepfe, marginTop: '2px' } },
          h('button', { type: 'button', style: S.button, onClick: schrittSpeichern }, uebersetze('Speichern')),
          imFeld
            ? h(Knopf, {
              symbol: 'Schließen', stil: S.klein, onClick: () => setAuswahl(null),
            })
            // In der Karte führt „Abbrechen“ zurück zur Anzeige — geschlossen
            // wird dort mit dem X.
            : h('button', {
              type: 'button', style: S.klein, title: uebersetze('Ohne Änderung zurück zur Anzeige'),
              onClick: stationVerwerfen,
            }, uebersetze('Abbrechen')),
          h('span', { style: { flex: 1 } }),
          // Löschen geht nur, solange die Station nirgends im Workflow steht.
          gewaehlt.stellen > 0
            ? null
            : bestaetigenSchritt === gewaehlt.id
              ? h('span', { style: S.knoepfe },
                h('button', { type: 'button', style: S.klein, onClick: schrittLoeschen },
                  uebersetze('Ja, löschen')),
                h('button', {
                  type: 'button', style: S.klein, onClick: () => setBestaetigenSchritt(null),
                }, uebersetze('Abbrechen')))
              : h('button', {
                type: 'button',
                style: S.klein,
                title: uebersetze('Diese Station aus der Bibliothek löschen'),
                onClick: () => { statusWeg(); setBestaetigenSchritt(gewaehlt.id); },
              }, uebersetze('Löschen'))))
        : null;

      // --- Fläche und Karten -------------------------------------------------
      const KARTEN_BREITE = 240;
      // Doppelt so hoch wie vorher: darunter ist Platz für die Dateien, die
      // eine Station zeigt, wenn ein Vorhaben gewählt ist.
      const KARTEN_HOEHE = 240;
      // Mitte der Titelzeile: drei Pixel Farbstreifen, sieben Pixel Rand,
      // dann die erste Zeile.
      const PORT_HOEHE = 20;
      // Die offene Station bleibt so klein wie jede andere Karte; ihre
      // Einstellungen stehen im rechten Dock. Die Lage rechnet deshalb für
      // alle Karten mit demselben Maß.
      const breiteFuer = (p) => KARTEN_BREITE;

      // Was in einer Station steht — die Karte auf der Fläche und das rechte
      // Dock bauen es aus derselben Funktion. Die Hülle auf der Fläche
      // (absolute Lage, Ports, Ziehen, Verbinden, Ablegen) bleibt außen; hier
      // entsteht nur der Inhalt. Der Basisinhalt gilt für beide; Anzeige,
      // Weg heraus und Formular kommen nur im Dock dazu (`imDock === true`),
      // damit die offene Karte den Dock-Inhalt nicht doppelt.
      function stationsInhalt(p, imDock) {
        // In der Spalte stehen alle Vorhaben an dieser Station — auch ein
        // weitergegebenes. Wer es verantwortet, sagt die Zeile darunter; die
        // Handlungen bietet erst `darf` an.
        const hier = vorhaben.filter((v) => v.position === p.id);
        const hierBeitraege = beitraege.filter((b) => b && b.schritt === p.id);
        const dateien = dateienFuer(p).filter((d) => d.exists);
        const start = startFuer(p);
        const schreiben = schreibFuer(p);
        const skill = skillFuer(p);
        // Ein Verweis trägt den Namen und die Dateien seines Ziels, gehört aber
        // seinem Host. Das steht an der Karte, auch ohne sie zu öffnen.
        const refSchritt = (() => {
          const s = schritte.find((x) => x.id === p.schritt);
          return s && typeof s.ref === 'string' ? s : null;
        })();

        // Was in der Station liegt: die Vorhaben, die gerade hier stehen, und
        // die Dateien, die es dazu gibt. Geschlossen und geöffnet dasselbe.
        const inhalt = [
          refSchritt
            ? h('div', { key: 'ref', style: S.fremdKarteFuss },
              uebersetze('bei {0} · Verweis', [personName(refSchritt.host)]),
              h('div', { key: 'ein' },
                uebersetze('Eingang: {0}', [(refSchritt.eingang || []).join(', ') || '—'])),
              h('div', { key: 'aus' },
                uebersetze('Ausgang: {0}', [(refSchritt.ausgabe || []).join(', ') || '—'])))
            : null,
          hier.map(chipFuer),
          // Ein Vorhaben entsteht an der Station, an der es stehen soll: der
          // Knopf steht an jeder Karte, das Formular nur an der gewählten.
          anlegenDarf
            ? (vorhabenNeu && vorhabenNeu.station === p.id
              ? h('div', {
                key: 'vorhaben-neu',
                style: {
                  ...S.form, width: '100%', boxSizing: 'border-box',
                },
              },
              h('div', { style: S.feldBlock },
                h('span', { style: S.feldTitel }, uebersetze('Name')),
                h('input', {
                  autoFocus: true,
                  value: vorhabenNeu.name,
                  placeholder: uebersetze('Name des Vorhabens'),
                  style: { ...S.input, width: '100%', boxSizing: 'border-box' },
                  onChange: (e) => setVorhabenNeu({
                    ...vorhabenNeu, name: e.target.value, fehler: '',
                  }),
                  onKeyDown: (e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      vorhabenAnStationAnlegen(p);
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      setVorhabenNeu(null);
                    }
                  },
                })),
              vorhabenNeu.fehler
                ? h('p', {
                  style: { ...S.boardFehler, marginTop: '5px' },
                }, vorhabenNeu.fehler)
                : null,
              h('div', { style: { ...S.knoepfe, marginTop: '5px' } },
                h('button', {
                  type: 'button',
                  style: S.klein,
                  disabled: vorhabenNeu.laeuft,
                  onClick: () => vorhabenAnStationAnlegen(p),
                }, vorhabenNeu.laeuft ? uebersetze('Anlegen …') : uebersetze('Anlegen')),
                h('button', {
                  type: 'button',
                  style: S.klein,
                  onClick: () => setVorhabenNeu(null),
                }, uebersetze('Abbrechen'))))
              : h('button', {
                key: 'vorhaben-anlegen',
                type: 'button',
                style: { ...S.kartePlus, width: '100%', marginTop: '4px' },
                title: uebersetze('Ein Vorhaben an dieser Station anlegen'),
                onClick: () => {
                  statusWeg();
                  setVorhabenNeu({
                    station: p.id, name: '', fehler: '', laeuft: false,
                  });
                },
              }, uebersetze('Vorhaben anlegen')))
            : null,
          // Beiträge stehen an der Station, an der sie gemacht wurden — mit dem
          // Namen dessen, der sie geschrieben hat. Ein Klick öffnet Notiz und
          // vorgeschlagene Fassungen; entschieden wird erst beim Verantwortlichen.
          hierBeitraege.map((b) => h('button', {
            key: 'beitrag-' + b.id,
            type: 'button',
            style: S.beitragKnopf,
            title: uebersetze('Beitrag öffnen — Notiz und vorgeschlagene Fassungen lesen'),
            onClick: () => beitragOeffnen(b),
          },
          h('div', { style: S.beitragKopf },
            uebersetze('Beitrag von {0}{1}', [b.von || '—', b.vorhabenName ? ' · ' + b.vorhabenName : ''])),
          b.notiz ? h('div', { style: S.beitragNotiz }, b.notiz) : null,
          Array.isArray(b.dateien) && b.dateien.length
            ? h('div', { style: S.beitragDateien }, b.dateien.join(', '))
            : null,
          b.entschieden
            ? h('div', { style: S.beitragDateien },
              uebersetze('{0} von {1}', [b.entschieden.art === 'angenommen' ? 'angenommen' : 'abgelehnt', personName(b.entschieden.von)]))
            : null)),
          start,
          schreiben,
          skill,
          dateien.map((d) => h('button', {
            key: d.name,
            type: 'button',
            title: d.art === 'ordner'
              ? uebersetze('Ordner öffnen — {0} Einträge', [d.anzahl || 0])
              : uebersetze('Dokument öffnen'),
            style: {
              ...S.dateiKnopf,
              borderColor: farbe,
              color: alsText(farbe),
              ...(d.art === 'ordner' ? { borderStyle: 'dashed' } : null),
            },
            onClick: () => {
              statusWeg();
              setEingriff(null);
              if (d.art === 'ordner') {
                dateienOeffnen(d.name);
                return;
              }
              // Über die Leserroute, damit die Basis der Datei mitkommt.
              oeffneDateiMitBasis(gewaehltesVorhaben.id, d.name, p.id);
            },
          }, d.art === 'ordner'
            ? uebersetze('{0} · {1}', [d.name, d.anzahl || 0])
            : d.name)),
          // Passt die Übergabe zu einem Nachbarn nicht, steht es an der Karte —
          // zu sehen, ohne die Station zu öffnen. Geöffnet steht es ausführlich
          // in der Anzeige, deshalb nur an der geschlossenen Karte.
          (() => {
            if (art === 'schritt' && auswahlId === p.schritt) return null;
            const u = vergleich(p,
              (p.abgeleitet && p.abgeleitet.eingang) || [],
              (p.abgeleitet && p.abgeleitet.ausgabe) || []);
            const zeilen = [];
            u.eingehend.forEach(({ q, fehlt }) => {
              if (!fehlt.length) return;
              zeilen.push('Von „' + q.name + '“ kommt ' + fehlt.join(', ') + ' nicht');
            });
            u.ausgehend.forEach(({ r, fehlt }) => {
              if (!fehlt.length) return;
              zeilen.push(fehlt.join(', ') + ' endet hier — „' + r.name + '“ will '
                + (((r.abgeleitet && r.abgeleitet.eingang) || []).join(', ') || 'nichts'));
            });
            if (!zeilen.length) return null;
            return h('div', { style: S.karteWarnung },
              zeilen.slice(0, 2).map((t, i) => h('div', { key: i }, uebersetze('⚠ {0}', [t]))),
              zeilen.length > 2
                ? h('div', { key: 'mehr' }, uebersetze('… und {0} weitere', [zeilen.length - 2]))
                : null);
          })(),
        ];

        if (imDock !== true) return inhalt;
        if (!(art === 'schritt' && auswahlId === p.schritt)) return inhalt;
        if (stationEdit) return stationFormular(false);

        // Herausnehmen löscht die Station nicht: sie bleibt in der Bibliothek.
        // Gefragt wird trotzdem — hier unten, wo sie geöffnet steht.
        // Ein fremder Schritt selbst bleibt beim Lesen: „Bearbeiten“ und der
        // Weg heraus fehlen. Ein Verweis dagegen ist ein Teil des eigenen
        // Workflows — er lässt sich hier wieder herausnehmen.
        const fremderSchritt = !!(gewaehlt && gewaehlt.fremd);
        const istVerweis = !!(gewaehlt && typeof gewaehlt.ref === 'string');
        const fuss = fremderSchritt && !istVerweis ? null : h('div', { style: S.anzeigeFuss },
          istVerweis
            ? (bestaetigenVerweis === gewaehlt.ref
              ? [
                h('span', { key: 'frage', style: S.feldTitel }, uebersetze('Verweis herausnehmen?')),
                h('button', {
                  key: 'ja', type: 'button', style: S.klein,
                  onClick: () => verweisEntfernen(gewaehlt.ref),
                }, uebersetze('Ja, herausnehmen')),
                h('button', {
                  key: 'nein', type: 'button', style: S.klein,
                  onClick: () => setBestaetigenVerweis(null),
                }, uebersetze('Nein')),
              ]
              : h('button', {
                key: 'nehmen',
                type: 'button',
                style: S.klein,
                title: uebersetze('Nur der Verweis verschwindet; der Schritt bleibt bei seinem Host'),
                onClick: () => { statusWeg(); setBestaetigenVerweis(gewaehlt.ref); },
              }, uebersetze('Verweis herausnehmen')))
            : bestaetigen === p.id
              ? [
                h('span', { key: 'frage', style: S.feldTitel }, uebersetze('Aus dem Workflow nehmen?')),
                h('button', {
                  key: 'ja', type: 'button', style: S.klein, onClick: positionLoeschen,
                }, uebersetze('Ja, herausnehmen')),
                h('button', {
                  key: 'nein', type: 'button', style: S.klein,
                  onClick: () => setBestaetigen(null),
                }, uebersetze('Nein')),
              ]
              : h('button', {
                key: 'nehmen',
                type: 'button',
                style: S.klein,
                title: uebersetze('Die Station bleibt in der Bibliothek'),
                onClick: () => { statusWeg(); setBestaetigen(p.id); },
              }, uebersetze('Aus dem Workflow nehmen')));
        return [stationAnzeige(), inhalt, fuss];
      }

      // Der Name, den die Karte zeigt: der Name der Station oder der Hinweis,
      // dass ihr Verweis fehlt. Die Suche zeigt denselben Text.
      const stationsName = (p) => String(p.name
        || (p.fehlt ? uebersetze('Verweis fehlt') : p.schritt) || '');

      // Wie die Stationen liegen: so, wie er sie hingezogen hat, oder so, wie
      // das Board sie ordnet. Geordnet wird nur gerechnet — seine Lagen bleiben
      // in den Daten und sind beim Zurückschalten unverändert da.
      const anordnung = (eigenerWorkflow(data) || {}).layout === 'auto' ? 'auto' : 'frei';
      const geordnet = anordnung === 'auto'
        ? automatischeLage(positionen, ((eigenerWorkflow(data) || {}).kanten) || [], KARTEN_HOEHE)
        : null;
      // Von hier an ist „positionen“ die Lage auf der Fläche: geordnet oder
      // seine eigene. Was in den Daten steht, rührt das nicht an.
      const karten = geordnet
        ? positionen.map((p) => (geordnet[p.id] ? { ...p, x: geordnet[p.id].x, y: geordnet[p.id].y } : p))
        : positionen;

      // Am Ende bleibt Platz: hinter der letzten Station liegen zwei Spalten
      // frei, darunter eine knappe Zeile. Ohne ihn hört die Fläche dort auf, wo
      // die letzte Station aufhört — und wer dort etwas anfügen will, hat
      // keinen Ort zum Ablegen.
      const flaechenBreite = Math.max(520,
        ...karten.map((p) => (p.x || 0) + breiteFuer(p) + 80)) + 2 * LAGE_SPALTE;
      // Jede Karte ist gleich hoch — auch die offene, deren Einstellungen im
      // Dock stehen. Die Fläche rechnet deshalb mit einem Maß.
      const flaechenHoehe = Math.max(360,
        ...karten.map((p) => (p.y || 0) + KARTEN_HOEHE + 60)) + 240;

      // Die Karten der ganzen Fläche, für „Alles zeigen“. Die Suche reicht
      // eine einzelne Karte herein; beide gehen durch dieselbe Rechnung.
      const alleKarten = karten;

      // „Alles zeigen“: die Fläche rollt auf den Mittelpunkt der Karten.
      // Gemeint ist die Mitte der äußeren Kanten — so liegt auch eine weit
      // entfernte Karte noch im Blick. Mehr als der scrollbare Bereich geht
      // nicht; ohne Karten gibt es nichts zu zeigen. Die Suche reicht über
      // das erste Argument genau eine Karte herein: dann rechnet dieselbe
      // Stelle für diese eine Karte.
      function allesZeigen() {
        const eine = Array.isArray(arguments[0]) && arguments[0].length
          ? arguments[0] : null;
        const karten = eine || alleKarten;
        const raum = flaecheRef.current;
        if (!raum || !karten.length) return;
        const links = Math.min(...karten.map((p) => p.x || 0));
        const oben = Math.min(...karten.map((p) => p.y || 0));
        const rechts = Math.max(...karten.map((p) => (p.x || 0) + breiteFuer(p)));
        const unten = Math.max(...karten.map((p) => (p.y || 0) + KARTEN_HOEHE));
        const mitteX = (links + rechts) / 2;
        const mitteY = (oben + unten) / 2;
        const hoechstLinks = Math.max(0, raum.scrollWidth - raum.clientWidth);
        const hoechstOben = Math.max(0, raum.scrollHeight - raum.clientHeight);
        raum.scrollLeft = Math.max(0, Math.min(hoechstLinks, mitteX - raum.clientWidth / 2));
        raum.scrollTop = Math.max(0, Math.min(hoechstOben, mitteY - raum.clientHeight / 2));
        gemerkt.scroll.links = raum.scrollLeft;
        gemerkt.scroll.oben = raum.scrollTop;
      }

      // Eine Station aus der Suche: ihre Karte kommt mittig in den Blick und
      // öffnet sich im rechten Dock. Den Fokus holt das Dock — beim Aufbau
      // über `Panel`, bei der schon offenen Station hier nach dem Rendern.
      // Beim Schließen kehrt er auf den Namen der Karte zurück.
      function springeZuStation(p) {
        if (!p) return;
        setStationsSuche('');
        setStationsOffen(false);
        schrittWaehlen(p.schritt, true);
        const zeigen = () => {
          const raum = flaecheRef.current;
          if (!raum) return;
          // Dieselbe Rechnung wie „Alles zeigen“ — für diese eine Karte.
          allesZeigen([p]);
          const kopf = typeof document !== 'undefined'
            ? document.getElementById('board-station')
            : null;
          // `board-station` ist die h2 im Panel-Kopf (für `aria-labelledby`);
          // fokussierbar ist die umschließende `section` mit `tabIndex: -1`.
          const dock = kopf && typeof kopf.closest === 'function'
            ? kopf.closest('section')
            : null;
          if (dock && typeof dock.focus === 'function') dock.focus();
        };
        if (typeof window !== 'undefined'
          && typeof window.requestAnimationFrame === 'function') {
          window.requestAnimationFrame(zeigen);
        } else {
          zeigen();
        }
      }

      // Escape und eine Auswahl leeren das Feld; der Fokus bleibt beim Tippen.
      function stationsSucheLeeren() {
        setStationsSuche('');
        setStationsOffen(false);
        if (typeof document !== 'undefined') {
          const feld = document.getElementById('board-stationssuche');
          if (feld && typeof feld.focus === 'function') feld.focus();
        }
      }

      const lageVon = (p) => (zug && zug.id === p.id
        ? { x: zug.x, y: zug.y }
        : { x: p.x || 0, y: p.y || 0 });

      // Eine gespannte Schnur zwischen zwei Ports: sie verlässt den Ausgang
      // und trifft am Eingang waagerecht auf, ohne durchzuhängen. Läuft sie
      // nach links zurück, holt sie weiter aus.
      function schnur(x1, y1, x2, y2) {
        const weite = Math.min(180, Math.max(40, Math.abs(x2 - x1) * 0.55));
        const r = (n) => Math.round(n);
        return 'M ' + r(x1) + ' ' + r(y1)
          + ' C ' + r(x1 + weite) + ' ' + r(y1)
          + ', ' + r(x2 - weite) + ' ' + r(y2)
          + ', ' + r(x2) + ' ' + r(y2);
      }

      function verbindung(a, b) {
        const pa = lageVon(a);
        const pb = lageVon(b);
        return schnur(pa.x + breiteFuer(a), pa.y + PORT_HOEHE, pb.x, pb.y + PORT_HOEHE);
      }

      async function platzieren(id, x, y) {
        try {
          await sende('/board/position/platzieren', { id, x, y });
          return true;
        } catch (e) {
          fehler(uebersetze('Lage nicht gespeichert: {0}', [String((e && e.message) || e)]));
          return false;
        }
      }

      async function kanteLegen(von, nach) {
        try {
          await sende('/board/kante', { von, nach });
          melde(uebersetze('Verbunden.'));
        } catch (e) {
          fehler(uebersetze('Nicht verbunden: {0}', [String((e && e.message) || e)]));
        }
      }

      async function kanteLoeschen() {
        if (!kanteWahl) return;
        try {
          await sende('/board/kante/loeschen', { von: kanteWahl.von, nach: kanteWahl.nach });
          setKanteWahl(null);
          melde(uebersetze('Verbindung gelöst.'));
        } catch (e) {
          setKanteWahl(null);
          fehler(uebersetze('Nicht gelöst: {0}', [String((e && e.message) || e)]));
        }
      }

      // Eine Kiste greifen: sie folgt dem Zeiger, rastet auf zehn Pixel und
      // wird beim Loslassen gespeichert.
      //
      // Während des Zuges zeichnet niemand das Board neu: die Kiste wandert per
      // transform, die Schnüre an ihr bekommen einen neuen Pfad, und das alles
      // höchstens einmal je Bild. Neu gezeichnet wird erst beim Loslassen — so
      // bleibt das Ziehen auch dann flüssig, wenn ein Dokument offen ist.
      /** Zieht eine Karte über die Fläche und speichert ihre neue Lage. */
      function kisteZiehen(p, ev) {
        if (ev.button !== 0) return;
        // Automatisch angeordnet gehört die Fläche dem Board: hier wird nichts
        // gegriffen.
        if (anordnung === 'auto') return;
        ev.preventDefault();
        const karte = ev.currentTarget && ev.currentTarget.closest
          ? ev.currentTarget.closest('[data-schritt]')
          : null;
        const raum = flaecheRef.current;
        zeigerFest('grabbing');
        if (karte) {
          // Eine Verschiebung von vorhin darf nicht mitwandern: die Lage kommt
          // aus den Daten. Bleibt ein Rest stehen, zieht die Kiste doppelt.
          karte.style.transform = '';
          karte.style.willChange = 'transform';
        }

        const start = { x: ev.clientX, y: ev.clientY };
        // Wo die Kiste wirklich steht, nicht wo die Daten sie vermuten: sonst
        // zieht ein zweiter Zug von der falschen Stelle aus los.
        const linksWert = karte ? parseFloat(karte.style.left) : NaN;
        const obenWert = karte ? parseFloat(karte.style.top) : NaN;
        const anfang = {
          x: Number.isFinite(linksWert) ? linksWert : (p.x || 0),
          y: Number.isFinite(obenWert) ? obenWert : (p.y || 0),
        };
        const lage = {};
        karten.forEach((q) => { lage[q.id] = { x: q.x || 0, y: q.y || 0 }; });
        const schnuere = raum
          ? Array.from(raum.querySelectorAll('path[data-von]')).filter((el) => {
            const von = el.getAttribute('data-von');
            const nach = el.getAttribute('data-nach');
            return von === p.id || nach === p.id;
          })
          : [];

        let aktiv = false;
        let fertig = false;
        let letzte = anfang;

        // Nur die Schnüre: sie folgen der Lage, ohne dass die Kiste selbst
        // verschoben wird.
        const schnuereZeichnen = () => {
          schnuere.forEach((el) => {
            const von = el.getAttribute('data-von');
            const nach = el.getAttribute('data-nach');
            const a = von === p.id ? letzte : lage[von];
            const b = nach === p.id ? letzte : lage[nach];
            if (!a || !b) return;
            el.setAttribute('d', schnur(
              a.x + breiteFuer(a), a.y + PORT_HOEHE, b.x, b.y + PORT_HOEHE));
          });
        };

        // Im Zug: die Kiste als Bild verschieben und die Schnüre nachziehen.
        // Ein noch offener Bildtakt darf nach dem Loslassen nichts mehr tun.
        const sparen = jeFrame(() => {
          if (fertig) return;
          if (karte) {
            karte.style.transform = 'translate('
              + (letzte.x - anfang.x) + 'px, ' + (letzte.y - anfang.y) + 'px)';
          }
          schnuereZeichnen();
        });

        const bewegen = (e) => {
          const dx = e.clientX - start.x;
          const dy = e.clientY - start.y;
          if (!aktiv && Math.abs(dx) + Math.abs(dy) < 5) return;
          aktiv = true;
          letzte = {
            x: Math.max(0, Math.round((anfang.x + dx) / 10) * 10),
            y: Math.max(0, Math.round((anfang.y + dy) / 10) * 10),
          };
          sparen();
        };

        /** Beendet den Zug, setzt die Karte fest und speichert ihre Lage. */
        const loslassen = () => {
          window.removeEventListener('pointermove', bewegen);
          window.removeEventListener('pointerup', loslassen);
          window.removeEventListener('pointercancel', loslassen);
          window.removeEventListener('blur', loslassen);
          zeigerFest(null);
          if (!aktiv) {
            if (karte) {
              karte.style.transform = '';
              karte.style.willChange = '';
            }
            return;
          }
          // Kein Bildtakt mehr: erst die feste Lage setzen, dann die
          // Verschiebung wegnehmen. In dieser Reihenfolge springt die Kiste
          // für kein Bild — und was danach noch geplant war, verfällt.
          fertig = true;
          if (karte) {
            karte.style.left = letzte.x + 'px';
            karte.style.top = letzte.y + 'px';
            karte.style.transform = '';
            karte.style.willChange = '';
          }
          schnuereZeichnen();
          setZug({ id: p.id, x: letzte.x, y: letzte.y });
          platzieren(p.id, letzte.x, letzte.y).then((gespeichert) => {
            // Nicht gespeichert: die Kiste gehört wieder dorthin, wo die
            // Daten sie haben — sonst stünde sie sichtbar falsch.
            if (!gespeichert && karte) {
              karte.style.left = anfang.x + 'px';
              karte.style.top = anfang.y + 'px';
            }
            setZug(null);
          });
        };

        window.addEventListener('pointermove', bewegen);
        window.addEventListener('pointerup', loslassen);
        window.addEventListener('pointercancel', loslassen);
        window.addEventListener('blur', loslassen);
      }

      // Vom Ausgang eine Verbindung ziehen. Wohin sie fällt, entscheidet der
      // Schritt unter dem Zeiger. Die Schnur hängt am Zeiger wie die Kiste:
      // sie wird direkt gezeichnet, nicht über einen neuen Aufbau der Seite.
      /** Zieht eine neue Verbindung von einem Ausgang. */
      function kanteZiehen(p, ev) {
        ev.preventDefault();
        ev.stopPropagation();
        const raum = flaecheRef.current;
        if (!raum) return;
        const bild = raum.querySelector('svg[data-kanten]');
        zeigerFest('crosshair');
        // Der Ursprung ist das Brett selbst: es liegt in der Karte der Person
        // hinter Kopf und Polster, das Rollfeld beginnt früher.
        const r = bild ? bild.getBoundingClientRect() : raum.getBoundingClientRect();
        const x0 = r.left;
        const y0 = r.top;

        const strich = bild && typeof document !== 'undefined'
          ? document.createElementNS('http://www.w3.org/2000/svg', 'path')
          : null;
        if (strich) {
          strich.setAttribute('fill', 'none');
          strich.setAttribute('stroke', farbeFuerSchritt(p.schritt));
          strich.setAttribute('stroke-width', '3.5');
          strich.setAttribute('stroke-linecap', 'round');
          strich.setAttribute('stroke-dasharray', '7 6');
          strich.setAttribute('pointer-events', 'none');
          strich.setAttribute('d', schnur(
            (p.x || 0) + breiteFuer(p), (p.y || 0) + PORT_HOEHE,
            (p.x || 0) + breiteFuer(p) + 1, (p.y || 0) + PORT_HOEHE));
          bild.appendChild(strich);
        }

        const zeichnen = (x, y) => {
          if (!strich) return;
          strich.setAttribute('d', schnur(
            (p.x || 0) + breiteFuer(p), (p.y || 0) + PORT_HOEHE, x, y));
        };
        const sparen = jeFrame(zeichnen);

        const bewegen = (e) => {
          sparen(Math.round(e.clientX - x0), Math.round(e.clientY - y0));
        };
        const loslassen = (e) => {
          window.removeEventListener('pointermove', bewegen);
          window.removeEventListener('pointerup', loslassen);
          window.removeEventListener('pointercancel', loslassen);
          window.removeEventListener('blur', loslassen);
          zeigerFest(null);
          if (strich && strich.parentNode) strich.parentNode.removeChild(strich);
          const ziel = e && e.target && e.target.closest
            ? e.target.closest('[data-schritt]')
            : null;
          const nach = ziel && ziel.getAttribute('data-schritt');
          if (nach && nach !== p.id) kanteLegen(p.id, nach);
        };
        window.addEventListener('pointermove', bewegen);
        window.addEventListener('pointerup', loslassen);
        window.addEventListener('pointercancel', loslassen);
        window.addEventListener('blur', loslassen);
      }

      const kantenBild = h('svg', {
        'data-kanten': 'ja',
        style: {
          position: 'absolute', left: 0, top: 0, width: flaechenBreite, height: flaechenHoehe,
          pointerEvents: 'none', overflow: 'visible',
        },
      },
      ((eigenerWorkflow(data) || {}).kanten || []).map((k) => {
        const a = karten.find((x) => x.id === k.von);
        const b = karten.find((x) => x.id === k.nach);
        if (!a || !b) return null;
        const d = verbindung(a, b);
        // Die Schnur trägt die Farbe des Schritts, aus dem sie kommt.
        const sFarbe = farbeFuerSchritt(a.schritt);
        return h('g', { key: k.von + '-' + k.nach },
          h('path', {
            d, fill: 'none', stroke: sFarbe, strokeOpacity: 0.75,
            strokeWidth: 3.5, strokeLinecap: 'round', strokeLinejoin: 'round',
            'data-von': k.von, 'data-nach': k.nach,
          }),
          h('path', {
            d, fill: 'none', stroke: 'transparent', strokeWidth: 18,
            'data-von': k.von, 'data-nach': k.nach,
            style: { pointerEvents: 'stroke', cursor: 'pointer' },
            onClick: () => { statusWeg(); setKanteWahl({ von: k.von, nach: k.nach }); },
          }));
      }));

      const flaeche = h('div', {
        className: 'board-flaeche',
        style: {
          position: 'relative', width: flaechenBreite + 'px', height: flaechenHoehe + 'px',
          // Der Ton der Fläche steht im Stil oben (`.board-flaeche`) — mit
          // Rückfall für Browser ohne `color-mix`. Das Punktraster bleibt die
          // Spur, an der sich Stationen ausrichten.
          borderRadius: '8px',
          backgroundImage: 'radial-gradient(var(--dsw-alias-border-l1) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
          // Die Fläche ist ein Bild für sich: beim Schieben wird sie verschoben
          // statt bei jedem Schritt neu gemalt.
          willChange: 'transform',
        },
        onDragOver: (ev) => {
          if (!schrittZug) return;
          ev.preventDefault();
          try { ev.dataTransfer.dropEffect = 'copy'; } catch { /* egal */ }
          // Liegt der Zeiger auf einer Station, leuchtet die Station — hier
          // leuchtet nur die freie Fläche.
          if (ev.target !== ev.currentTarget) return;
          if (schrittZiel !== 'flaeche') setSchrittZiel('flaeche');
        },
        onDragLeave: () => { if (schrittZiel === 'flaeche') setSchrittZiel(null); },
        onDrop: (ev) => {
          if (!schrittZug) return;
          ev.preventDefault();
          // Gemessen wird am Brett, nicht am Rollfeld: die Karte der Person
          // trägt Kopf und Polster, sonst landet die Station daneben.
          const r = ev.currentTarget.getBoundingClientRect();
          const x = Math.max(0, Math.round((ev.clientX - r.left - 20) / 10) * 10);
          const y = Math.max(0, Math.round((ev.clientY - r.top - 20) / 10) * 10);
          const id = schrittZug;
          setSchrittZug(null);
          setSchrittZiel(null);
          schrittEinfuegen(id, x, y);
        },
      },
      kantenBild,
      // Ist die Fläche leer, sagt sie, warum: Stationen entstehen in der
      // Bibliothek und werden von dort hierher gestellt. Kein Knopf — der Weg
      // steht als Satz da, und der Eintrag der Schiene ist der vorhandene Weg.
      !karten.length
        ? h('div', { style: S.leerFlaeche },
          h('p', { style: S.leerSatz },
            uebersetze('Noch keine Station auf dieser Fläche: Stationen entstehen in der Bibliothek — öffne sie links in der Leiste und stelle sie von dort auf die Fläche.')))
        : null,
      karten.map((p) => {
        const aktiv = art === 'schritt' && auswahlId === p.schritt;
        const lage = lageVon(p);
        const sFarbe = farbeFuerSchritt(p.schritt);
        const schrittHeiss = schrittZiel === 'karte-' + p.id;

        return h('div', {
          key: p.id,
          'data-schritt': p.id,
          className: aktiv ? 'board-karte board-karte-aktiv' : 'board-karte',
          // Die Karte ist keine Dialogfläche: sie trägt nur ihren Namen, damit
          // ein Vorleser sie benennen kann. Ist sie offen, macht Escape sie
          // klein und gibt den Fokus auf diesen Namen zurück.
          'aria-label': p.name || (p.fehlt ? uebersetze('Verweis fehlt') : p.schritt),
          role: 'group',
          onKeyDown: aktiv ? (ev) => {
            if (ev.key !== 'Escape' || ev.defaultPrevented) return;
            ev.preventDefault();
            ev.stopPropagation();
            const name = ev.currentTarget.querySelector('[data-karten-name]');
            if (name && typeof name.focus === 'function') name.focus();
            setAuswahl(null);
          } : null,
          style: {
            ...S.karte,
            width: breiteFuer(p) + 'px',
            minHeight: KARTEN_HOEHE + 'px',
            position: 'absolute', left: lage.x + 'px', top: lage.y + 'px',
            ...(aktiv
              // Offen trägt die Karte nur den Auswahlring; der Dock-Inhalt
              // bleibt draußen.
              ? { boxShadow: 'var(--dsw-elevation-prominent)', zIndex: 4 }
              : null),
            ...(zug && zug.id === p.id
              ? { boxShadow: 'var(--dsw-elevation-panel)', zIndex: 3 }
              : null),
            ...(schrittHeiss
              ? { outline: '2px dashed var(--board-akzent, var(--dsw-alias-brand-primary))', outlineOffset: '-2px' }
              : ziel === p.id && ziehen
                ? {
                  outline: '2px dashed ' + (farbe || 'var(--board-akzent, var(--dsw-alias-brand-primary))'),
                  outlineOffset: '-2px',
                }
                : null),
          },
          onDragOver: (ev) => {
            // Ein Schritt aus der Bibliothek: fällt er hierher, kommt er gleich
            // danach. Das Plus sagt das vorher.
            if (schrittZug) {
              ev.preventDefault();
              ev.stopPropagation();
              try { ev.dataTransfer.dropEffect = 'copy'; } catch { /* egal */ }
              if (schrittZiel !== 'karte-' + p.id) setSchrittZiel('karte-' + p.id);
              return;
            }
            if (!ziehen) return;
            ev.preventDefault();
            try { ev.dataTransfer.dropEffect = 'move'; } catch { /* egal */ }
            if (ziel !== p.id) setZiel(p.id);
          },
          onDragLeave: (ev) => {
            // Über ein Kind gewandert ist kein Verlassen: sonst blinkt das Ziel.
            const bleibt = ev && ev.relatedTarget && ev.currentTarget
              && ev.currentTarget.contains(ev.relatedTarget);
            if (bleibt) return;
            if (ziel === p.id) setZiel(null);
            if (schrittZiel === 'karte-' + p.id) setSchrittZiel(null);
          },
          onDrop: (ev) => {
            if (schrittZug) {
              ev.preventDefault();
              ev.stopPropagation();
              const schrittId = schrittZug;
              setSchrittZug(null);
              setSchrittZiel(null);
              statusWeg();
              // Die Lage ist die der Karte, die er getroffen hat: rechts
              // daneben. Geordnet rechnet das Board sie ohnehin selbst.
              schrittEinfuegen(schrittId, (p.x || 0) + breiteFuer(p) + 80, p.y || 0, p.id);
              return;
            }
            ev.preventDefault();
            const id = ziehen;
            setZiehen(null);
            setZiel(null);
            if (!id) return;
            const v = vorhaben.find((x) => x.id === id);
            if (!v || v.position === p.id) return;
            statusWeg();
            setVerschieben({ id, nach: p.id });
          },
        },
        h('div', {
          style: { ...S.portEin, borderColor: sFarbe + '99' },
          title: uebersetze('Eingang'),
        }),
        h('div', {
          style: { ...S.portAus, borderColor: sFarbe },
          title: uebersetze('Ausgang — ziehen, um mit einer anderen Station zu verbinden'),
          onPointerDown: (ev) => kanteZiehen(p, ev),
        }),
        // Hier fällt der Schritt hin: ein Plus, das gleich die Richtung sagt.
        schrittHeiss
          ? h('div', { key: 'plus', style: S.kartePlusZiel },
            h('span', null, uebersetze('＋')),
            h('span', { style: S.kartePlusZielText }, uebersetze('danach')))
          : null,
        h('div', {
          style: { ...S.karteKopf, borderTop: '3px solid ' + sFarbe, background: sFarbe + '14' },
        },
        h('button', {
          type: 'button',
          'data-karten-name': p.id,
          style: aktiv ? { ...S.karteName, ...S.karteNameAktiv } : S.karteName,
          title: aktiv ? uebersetze('Klein machen') : uebersetze('Station öffnen'),
          onClick: () => schrittWaehlen(p.schritt),
        }, p.name || (p.fehlt ? uebersetze('Verweis fehlt') : p.schritt)),
        // Die Fassung dieser Station klein neben dem Namen. Fehlt sie im
        // Repository, sagt der Titel es; gelesen wurde dann der aktuelle Stand.
        (() => {
          const schritt = schritte.find((x) => x.id === p.schritt);
          const fassung = String((schritt && schritt.fassung) || '').trim();
          if (!fassung) return null;
          return h('span', {
            style: S.fassung,
            title: schritt.fassungFehlt
              ? uebersetze('Fassung {0} fehlt; gelesen wurde der aktuelle Stand', [fassung])
              : uebersetze('Fassung {0}', [fassung]),
          }, fassung);
        })(),
        // Die freie Fläche neben dem Namen ist der Griff zum Bewegen: der
        // Zeiger wird zur Hand, ein Klick tut nichts. Automatisch angeordnet
        // gibt es nichts zu greifen — dann bleibt nur die Fläche übrig, die
        // den Namen nach links und die Knöpfe nach rechts hält.
        h('div', {
          style: anordnung === 'auto' ? { ...S.griff, cursor: 'default' } : S.griff,
          title: anordnung === 'auto' ? null : uebersetze('Ziehen verschiebt die Station'),
          onPointerDown: anordnung === 'auto' ? null : (ev) => kisteZiehen(p, ev),
        }),
        anordnung === 'auto'
          ? null
          : h('svg', {
            width: 10, height: 14, viewBox: '0 0 10 14',
            style: S.griffPunkte, 'aria-hidden': 'true',
          },
          [2, 7, 12].map((y) => h('circle', { key: 'l' + y, cx: 3, cy: y, r: 1.3, fill: 'currentColor' })),
          [2, 7, 12].map((y) => h('circle', { key: 'r' + y, cx: 7, cy: y, r: 1.3, fill: 'currentColor' })))),
        // Die Fläche unter der Trennlinie: hier liegt, was gerade im Schritt
        // ist — und wenn nichts darin liegt, bleibt sie leer und sichtbar.
        // Geöffnet zeigt die Karte weiter nur den Basisinhalt; Anzeige, Weg
        // heraus und Formular stehen im rechten Dock.
        h('div', {
          style: aktiv ? { ...S.karteKoerper, cursor: 'default' } : S.karteKoerper,
          title: aktiv ? null : uebersetze('Klick auf eine leere Stelle: Station öffnen'),
          role: aktiv ? undefined : 'button',
          tabIndex: aktiv ? undefined : 0,
          onClick: aktiv ? null : (ev) => {
            if (ev.target !== ev.currentTarget) return;
            statusWeg();
            schrittWaehlen(p.schritt);
          },
          onKeyDown: aktiv ? null : (ev) => {
            if (ev.key !== 'Enter' && ev.key !== ' ') return;
            if (ev.target !== ev.currentTarget) return;
            ev.preventDefault();
            statusWeg();
            schrittWaehlen(p.schritt);
          },
        },
          stationsInhalt(p)));
      }));

      // --- Kanten ------------------------------------------------------------

      // Eine Verbindung lösen: die Linie anklicken, dann bestätigen.
      const kantePanel = kanteWahl
        ? h('div', {
          style: {
            display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px',
            padding: '6px 10px', borderRadius: '8px',
            border: '1px solid var(--dsw-alias-border-l1)',
          },
        },
        h('span', { style: S.meta },
          uebersetze('Verbindung „{0}“ → „{1}“ löschen?', [positionsName(kanteWahl.von), positionsName(kanteWahl.nach)])),
        h('button', { type: 'button', style: S.klein, onClick: kanteLoeschen }, uebersetze('Ja, löschen')),
        h('button', {
          type: 'button', style: S.klein, onClick: () => setKanteWahl(null),
        }, uebersetze('Abbrechen')))
        : null;


      // In der Fassung 2 entsteht ein Vorhaben an seiner Station, nicht hier
      // ohne Ort. Die alte Ablage behält den Knopf an dieser Stelle.
      const neuesVorhaben = schreibbar && (!data || data.format !== 2)
        ? h('div', { style: { marginTop: '14px' } },
          editVorhaben === null
            ? h('button', {
              type: 'button',
              style: S.zeilePlus,
              title: uebersetze('Neues Vorhaben, beginnt an der ersten Position'),
              onClick: () => { statusWeg(); setEditVorhaben(''); },
            }, uebersetze('+ Neues Vorhaben'))
            : eingabe(editVorhaben, setEditVorhaben, vorhabenAnlegen))
        : null;

      // Die Bibliothek der Fassung 2: drei Abschnitte — Stationen, Workflows,
      // Vorhaben. Gelesen wird aus `/board/data`; was fehlt, steht als Lücke
      // da, kein Name wird erfunden. Der Anlege-Knopf entfällt: Stationen sind
      // Repositories, Schritt 08 stellt sie in den Workflow.
      const bibliothekFassung2 = data && data.format === 2 ? (() => {
        // Alle Stationen, auf die das Board verweist — auch die, die noch in
        // keinem Workflow stehen. `data.schritte` nennt nur die Stationen im
        // Workflow; die Bibliothek zeigt mehr.
        const stationen = Array.isArray(data.stationen)
          ? data.stationen
          : (Array.isArray(data.schritte) ? data.schritte : []);
        const flaechen = Array.isArray(data.workflows) ? data.workflows : [];
        const arbeitsFlows = [];
        for (const person of flaechen) {
          for (const workflow of (person.workflows || [])) {
            arbeitsFlows.push({
              person,
              workflow,
              schluessel: String(person.id) + '/' + String(workflow.id),
            });
          }
        }
        const vorhabenListe = Array.isArray(data.vorgaenge) ? data.vorgaenge : [];
        const istOffen = (art, id) => !!bibOffen
          && bibOffen.art === art && bibOffen.id === id;
        const waehle = (art, id) => setBibOffen((alt) => (alt
          && alt.art === art && alt.id === id ? null : { art, id }));
        const feld = (name, wert) => h('div', { style: S.bibFeld },
          h('span', { style: { color: 'var(--dsw-alias-label-secondary)' } }, uebersetze('{0}: ', [name])),
          typeof wert === 'string' || typeof wert === 'number'
            ? h('span', null, String(wert))
            : h('div', { style: { marginTop: '2px' } }, wert));
        const fassungText = (wert) => String(wert == null ? '' : wert).trim()
          || uebersetze('ohne Fassung');
        // Eine Karte ist ein Knopf: Name oben, darunter die Zeilen. Die
        // Einzelheit öffnet sich unter ihrem Abschnitt.
        const karte = (id, kopf, zeilen, aktiv, oeffnen) => h('button', {
          key: id,
          type: 'button',
          style: aktiv ? { ...S.bibKarteKlick, ...S.bibKarteOffen } : S.bibKarteKlick,
          onClick: oeffnen,
        },
        h('span', { style: S.bibReiter }, kopf),
        h('span', { style: { ...S.bibFlaeche, cursor: 'pointer' } },
          zeilen.map((zeile, i) => h('span', {
            key: i, style: { display: 'block' },
          }, zeile))));
        const abschnitt = (titel, anzahl, karten, einzelheit, werkzeug, unten) => h('div', {
          style: S.bibAbschnitt,
        },
        h('div', { style: S.bibAbschnittKopf },
          h('span', { style: S.bibAbschnittTitel }, titel),
          werkzeug || null,
          h('span', { style: { ...S.hinweis, marginTop: 0 } },
            anzahl === 1 ? uebersetze('1 Eintrag') : uebersetze('{0} Einträge', [anzahl]))),
        unten || null,
        anzahl
          ? h('div', { style: S.bibReihe }, karten)
          : h('div', { style: S.hinweis }, uebersetze('Noch keine {0}.', [titel])),
        einzelheit || null);

        // Stationen: der Klick auf den Namen öffnet die vorhandene
        // Stationsansicht; der kleine Knopf stellt die Station in den
        // Workflow. Der Knopf bleibt auch an einer Station, die dort schon
        // steht — eine zweite Position ist erlaubt.
        const stationKarten = stationen.map((station) => {
          const host = String(station.host == null ? '' : station.host).trim();
          const fehlt = station.fehlt === true || !station.id;
          const name = station.name || (station.fehlt ? uebersetze('Verweis fehlt') : station.id);
          return h('div', {
            key: String(station.id || station.repo || name),
            style: { ...S.bibKarteKlick, cursor: 'default' },
          },
          h('button', {
            type: 'button',
            style: S.bibReiter,
            title: fehlt ? uebersetze('Kein lesbarer Verweis') : uebersetze('Station öffnen'),
            disabled: fehlt,
            onClick: () => {
              if (fehlt) return;
              statusWeg();
              schrittWaehlen(station.id);
              setLeiste(null);
            },
          }, name),
          h('div', { style: { ...S.bibFlaeche, cursor: 'default' } },
            h('span', { style: { display: 'block' } },
              uebersetze('Host: {0}', [host ? personAnzeige(host) : uebersetze('ohne Host')])),
            h('span', { style: { display: 'block' } },
              uebersetze('Fassung: {0}{1}', [fassungText(station.fassung), station.fassungFehlt ? ' — fehlt, aktueller Stand gelesen' : ''])),
            schreibbar && !fehlt
              ? h('button', {
                type: 'button',
                style: { ...S.klein, marginTop: '5px' },
                title: uebersetze('Diese Station in den Workflow stellen; eine zweite Position ist erlaubt'),
                onClick: () => stationInWorkflow(station),
              }, uebersetze('+ Workflow'))
              : null));
        });

        // Workflows: je Person ihre Workflows, mit Titel, Autor, Fassung und
        // der Zahl ihrer Stationen.
        const workflowKarten = arbeitsFlows.map((eintrag) => {
          const workflow = eintrag.workflow || {};
          const anzahl = (workflow.schritte || []).length;
          const autor = String(workflow.autor == null ? '' : workflow.autor).trim();
          return karte(
            eintrag.schluessel,
            workflow.titel || uebersetze('ohne Titel'),
            [
              'Autor: ' + (autor ? personAnzeige(autor) : 'ohne Autor'),
              'Fassung: ' + fassungText(workflow.fassung),
              anzahl === 1 ? '1 Station' : anzahl + ' Stationen',
            ],
            istOffen('workflow', eintrag.schluessel),
            () => waehle('workflow', eintrag.schluessel),
          );
        });

        const offenerFlow = arbeitsFlows.find((eintrag) => istOffen(
          'workflow', eintrag.schluessel,
        )) || null;
        const workflowEinzelheit = offenerFlow ? (() => {
          const workflow = offenerFlow.workflow || {};
          const autor = String(workflow.autor == null ? '' : workflow.autor).trim();
          const stationenListe = (workflow.schritte || []).map((schritt) => {
            return schritt.name || (schritt.fehlt ? uebersetze('Verweis fehlt') : schritt.id);
          });
          return h('div', { style: S.bibEinzelheit },
            h('div', { style: S.bibEinzelheitKopf },
              h('span', { style: S.bibEinzelheitTitel },
                workflow.titel || uebersetze('ohne Titel')),
              h(Knopf, {
                symbol: 'Schließen',
                stil: S.schliessen,
                onClick: () => setBibOffen(null),
              }, '✕')),
            feld(uebersetze('Autor'), autor ? personAnzeige(autor) : 'ohne Autor'),
            feld(uebersetze('Fassung'), fassungText(workflow.fassung)),
            feld(uebersetze('Beschreibung'), workflow.beschreibung || uebersetze('ohne Beschreibung')),
            feld(uebersetze('Stationen'), stationenListe.length
              ? stationenListe.join(' · ')
              : 'keine Stationen'),
            feld(uebersetze('Repository'), h('span', { style: S.bibPfad },
              workflow.repo || uebersetze('ohne Pfad'))),
            h(BeitraegeFlaeche, { repo: workflow.repo || '' }),
            h(FragenFlaeche, { repo: workflow.repo || '' }));
        })() : null;

        // Eine Station entsteht unter dem Eigentümer: der Knopf steht nur da,
        // wenn die Antwort das Anlegen erlaubt. Die Wahl des Anlegewegs gibt es
        // in der Oberfläche nicht; sie steht in den Einstellungen.
        const stationWerkzeug = !(data && data.anlegen && data.anlegen.darf === true)
          ? null
          : h('button', {
            type: 'button',
            style: S.kartePlus,
            title: uebersetze('Eine Station als öffentliches Repository unter dem Eigentümer anlegen'),
            onClick: () => {
              statusWeg();
              setStationNeu({
                name: '', beschreibung: '', fehler: '', laeuft: false,
              });
            },
          }, uebersetze('Station anlegen'));

        // Das kleine Formular steht unter dem Knopf. Fehler bleiben darin
        // stehen, statt oben im Board zu erscheinen.
        const stationsFormular = stationNeu === null ? null : h('div', {
          style: {
            ...S.form, margin: '0 0 10px', width: '320px', boxSizing: 'border-box',
          },
        },
        h('div', { style: S.feldBlock },
          h('span', { style: S.feldTitel }, uebersetze('Name')),
          h('input', {
            autoFocus: true,
            value: stationNeu.name,
            placeholder: uebersetze('Name der Station'),
            style: { ...S.input, width: '100%', boxSizing: 'border-box' },
            onChange: (e) => setStationNeu({
              ...stationNeu, name: e.target.value, fehler: '',
            }),
            onKeyDown: (e) => {
              if (e.key === 'Enter') { e.preventDefault(); stationAnlegen(); }
              if (e.key === 'Escape') { e.preventDefault(); setStationNeu(null); }
            },
          })),
        h('div', { style: { ...S.feldBlock, marginTop: '6px' } },
          h('span', { style: S.feldTitel }, uebersetze('Beschreibung')),
          h('textarea', {
            value: stationNeu.beschreibung,
            placeholder: uebersetze('Was geschieht an dieser Station?'),
            style: { ...S.flaeche, minHeight: '48px' },
            onChange: (e) => setStationNeu({
              ...stationNeu, beschreibung: e.target.value, fehler: '',
            }),
          })),
        // Unter wem die Station entsteht: das steht vor dem Absenden da, damit
        // ein fremder Eigentümer nicht erst an der Antwort sichtbar wird.
        (eigentuemerName || eigentuemerWert)
          ? h('p', { style: { ...S.hinweis, marginTop: '6px' } },
            uebersetze('Entsteht unter {0}.', [eigentuemerName || eigentuemerWert]))
          : h('p', { style: { ...S.boardFehler, marginTop: '6px' } },
            uebersetze('Ohne Eigentümer entsteht keine Station. Trage ihn in den Einstellungen ein.')),
        stationNeu.fehler
          ? h('p', { style: { ...S.boardFehler, marginTop: '6px' } }, stationNeu.fehler)
          : null,
        h('div', { style: { ...S.knoepfe, marginTop: '6px' } },
          h('button', {
            type: 'button',
            style: S.klein,
            disabled: stationNeu.laeuft,
            onClick: stationAnlegen,
          }, stationNeu.laeuft ? uebersetze('Anlegen …') : uebersetze('Anlegen')),
          h('button', {
            type: 'button',
            style: S.klein,
            onClick: () => setStationNeu(null),
          }, uebersetze('Abbrechen'))));

        // Die Bestätigung nach dem Anlegen: Repository und der Weg in den
        // Katalog. Sie bleibt stehen, bis er sie schließt.
        const stationsBestaetigung = stationAngelegt === null ? null : h('div', {
          style: { ...S.bibEinzelheit, marginBottom: '10px' },
        },
        h('div', { style: S.bibEinzelheitKopf },
          h('span', { style: S.bibEinzelheitTitel },
            uebersetze('Angelegt: {0}', [stationAngelegt.name])),
          h(Knopf, {
            symbol: 'Schließen',
            stil: S.schliessen,
            onClick: () => setStationAngelegt(null),
          }, '✕')),
        stationAngelegt.owner && stationAngelegt.repo
          ? feld(uebersetze('Repository'), h('span', { style: S.bibPfad },
            uebersetze('{0}/{1}', [stationAngelegt.owner, stationAngelegt.repo])))
          : null,
        feld(uebersetze('Zu finden'), uebersetze('Hier im Board unter Stationen. Auf einem anderen Board suchst du sie im Katalog — dort steht sie mit Herkunft, Host und Fassung.')),
        h('div', { style: { ...S.knoepfe, marginTop: '6px' } },
          h('button', {
            type: 'button',
            style: S.klein,
            title: uebersetze('Den Katalog mit dieser Station öffnen'),
            onClick: () => katalogZeigen(stationAngelegt.repo || stationAngelegt.name),
          }, uebersetze('Im Katalog zeigen'))));

        // Ein Workflow kommt aus einem lokalen Ordner ins Board: der Host
        // schreibt den Verweis in `board.json`, die Antwort ersetzt das Board.
        const workflowWerkzeug = !schreibbar
          ? null
          : workflowNeu === null
            ? h('button', {
              type: 'button',
              style: S.kartePlus,
              title: uebersetze('Einen Workflow aus einem lokalen Ordner ins Board übernehmen'),
              onClick: () => { statusWeg(); setWorkflowNeu(''); },
            }, uebersetze('+ Workflow übernehmen'))
            : h('span', { style: { display: 'inline-flex', gap: '6px', alignItems: 'center' } },
            h('input', {
              autoFocus: true,
              value: workflowNeu,
              placeholder: uebersetze('/pfad/zum/workflow'),
              title: uebersetze('Ordner oder Adresse des Workflow-Repositories'),
              style: { ...S.input, width: '260px' },
              onChange: (e) => setWorkflowNeu(e.target.value),
              onKeyDown: (e) => {
                if (e.key === 'Enter') { e.preventDefault(); workflowUebernehmen(); }
                if (e.key === 'Escape') { e.preventDefault(); setWorkflowNeu(null); }
              },
            }),
            h('button', {
              type: 'button',
              style: S.klein,
              disabled: workflowLaeuft,
              onClick: workflowUebernehmen,
            }, uebersetze('Übernehmen')),
            h('button', {
              type: 'button',
              style: S.klein,
              onClick: () => setWorkflowNeu(null),
            }, uebersetze('Abbrechen')));

        // Vorhaben: Name, Station, Verantwortliche und die feste Fassung des
        // Workflows, an dem das Vorhaben hängt.
        const vorhabenKarten = vorhabenListe.map((v) => {
          const fassung = fassungText(v.workflow && v.workflow.fassung);
          return karte(
            String(v.id),
            v.name || v.id,
            [
              'Station: ' + (stationNameVon(v) || uebersetze('ohne Station')),
              'Verantwortet: ' + (String(v.verantwortet == null ? '' : v.verantwortet)
                .trim() || uebersetze('ohne Verantwortliche')),
              'Workflow-Fassung: ' + fassung,
            ],
            istOffen('vorhaben', v.id),
            () => waehle('vorhaben', v.id),
          );
        });

        const offenesVorhaben = vorhabenListe.find((v) => istOffen('vorhaben', v.id))
          || null;
        const vorhabenEinzelheit = offenesVorhaben ? (() => {
          const v = offenesVorhaben;
          const dateien = Array.isArray(v.dateien) ? v.dateien : [];
          return h('div', { style: S.bibEinzelheit },
            h('div', { style: S.bibEinzelheitKopf },
              h('span', { style: S.bibEinzelheitTitel }, v.name || v.id),
              h(Knopf, {
                symbol: 'Schließen',
                stil: S.schliessen,
                onClick: () => setBibOffen(null),
              }, '✕')),
            feld(uebersetze('Station'), stationNameVon(v) || uebersetze('ohne Station')),
            feld(uebersetze('Verantwortliche'), String(v.verantwortet == null ? '' : v.verantwortet)
              .trim() || uebersetze('ohne Verantwortliche')),
            // Je Station, wer sie verantwortet — auch für Stationen, an denen
            // das Vorhaben gerade nicht steht. Die Namen kommen aus der
            // Vorhaben-Datei; der Stationsname aus dem Workflow, sonst ihre
            // Kennung.
            (() => {
              const je = v.verantwortlicheJeStation
                && typeof v.verantwortlicheJeStation === 'object'
                && !Array.isArray(v.verantwortlicheJeStation)
                ? Object.entries(v.verantwortlicheJeStation) : [];
              return feld(uebersetze('Verantwortlich je Station'), je.length
                ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '2px' } },
                  je.map(([stelle, logins]) => h('div', { key: stelle },
                    uebersetze('Station „{0}“ — Verantwortlich: {1}', [positionsName(stelle) || stelle, Array.isArray(logins) && logins.length
                      ? logins.join(', ')
                      : 'niemand']))))
                : 'ohne Eintrag');
            })(),
            feld(uebersetze('Workflow-Fassung'), fassungText(v.workflow && v.workflow.fassung)),
            feld(uebersetze('Repository'), h('span', { style: S.bibPfad },
              v.repo || v.ordner || uebersetze('ohne Pfad'))),
            feld(uebersetze('Dateien'), dateien.length
              ? h('ul', { style: S.bibDateien },
                dateien.map((name) => h('li', { key: name }, name)))
              : 'keine Dateien'),
            // Die Beiträge zu diesem Vorhaben: Pull Requests an seinem
            // Repository. Ein zusammengeführter bleibt in der Liste stehen.
            h(BeitraegeFlaeche, { repo: v.repo || v.ordner || '' }),
            // Die Fragen und der Fork zu diesem Vorhaben.
            h(FragenFlaeche, { repo: v.repo || v.ordner || '' }),
            h('div', { style: { marginTop: '8px' } },
              h('button', {
                type: 'button',
                style: S.klein,
                title: uebersetze('Das Vorhaben auf dem Board auswählen'),
                onClick: () => {
                  statusWeg();
                  setZurueck(null);
                  setWeiter(null);
                  setLeser(null);
                  setAuswahl({ art: 'vorhaben', id: v.id });
                  setLeiste(null);
                },
              }, uebersetze('Auf dem Board zeigen'))));
        })() : null;

        return h('div', null,
          h('div', { style: S.bibKopf },
            h('div', { style: { ...S.hinweis, marginTop: 0 } },
              uebersetze('Was dieses Board benutzt — gelesen aus den Repositories. Ein Klick öffnet den Eintrag.')),
            h('span', { style: { flex: 1 } })),
          // Ein öffentliches Ding, das auf ein privates verweist, steht auch
          // hier: die Bibliothek ist der Ort, an dem die Verweise sichtbar sind.
          sichtbarkeitsLuecken(data).map((eintrag, i) => h('p', {
            key: 'sichtbarkeit-' + i,
            style: S.sichtbarkeitWarnung,
          }, sichtbarkeitsZeile(eintrag))),
          abschnitt(uebersetze('Stationen'), stationen.length, stationKarten, null,
            stationWerkzeug, h('div', null, stationsBestaetigung, stationsFormular)),
          abschnitt(uebersetze('Workflows'), arbeitsFlows.length, workflowKarten,
            workflowEinzelheit, workflowWerkzeug),
          abschnitt(uebersetze('Vorhaben'), vorhabenListe.length, vorhabenKarten, vorhabenEinzelheit),
          h(TeamsFlaeche));
      })() : null;

      // Die Bibliothek der Fassung 1: alle Schritte, auch die, die gerade
      // nicht im Workflow stehen. Ein Schritt ist ein Ding — steht er zweimal
      // im Workflow, ist es derselbe, und eine Änderung gilt an beiden Stellen.
      const bibliothekFassung1 = h('div', null,
        h('div', { style: S.bibKopf },
          h('div', { style: { ...S.hinweis, marginTop: 0 } },
            schrittZug
              ? uebersetze('Auf die freie Fläche fallen lassen — oder auf eine Station: dann kommt sie gleich danach.')
              : uebersetze('Station greifen und auf die Fläche ziehen; Klick öffnet sie.')),
          h('span', { style: { flex: 1 } }),
          neuerSchritt !== null
            ? h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } },
              h('div', { style: { width: '200px' } },
                eingabe(neuerSchritt, setNeuerSchritt, schrittAnlegen)),
              h('button', {
                type: 'button', style: S.klein, onClick: () => setNeuerSchritt(null),
              }, uebersetze('Abbrechen')))
            : h('button', {
              type: 'button',
              style: S.kartePlus,
              onClick: () => { statusWeg(); setNeuerSchritt(''); },
            }, uebersetze('+ Neue Station'))),
        h('div', { style: S.bibReihe },
          schritte.length
            ? schritte.map((schritt, i) => {
              const stellen = positionen.filter((p) => p.schritt === schritt.id).length;
              const aktiv = art === 'schritt' && auswahlId === schritt.id;
              const bFarbe = farbeFuerSchritt(schritt.id);
              return h('div', {
                key: schritt.id,
                draggable: true,
                title: uebersetze('Ziehen setzt die Station in den Workflow; Klick öffnet sie'),
                onDragStart: (ev) => {
                  setSchrittZug(schritt.id);
                  try {
                    ev.dataTransfer.setData('text/plain', schritt.id);
                    ev.dataTransfer.effectAllowed = 'copy';
                  } catch { /* egal */ }
                },
                onDragEnd: () => { setSchrittZug(null); setSchrittZiel(null); },
                style: aktiv
                  ? { ...S.bibKarte, borderColor: 'var(--board-akzent, var(--dsw-alias-brand-primary))' }
                  : S.bibKarte,
              },
              h('button', {
                type: 'button',
                style: {
                  ...S.bibReiter,
                  borderTop: '3px solid ' + bFarbe,
                  background: bFarbe + '14',
                  color: aktiv ? 'var(--board-akzent, var(--dsw-alias-brand-primary))' : undefined,
                },
                title: schritt.name,
                onClick: () => schrittWaehlen(schritt.id),
              }, schritt.name || (schritt.fehlt ? uebersetze('Verweis fehlt') : schritt.id)),
              h('div', { style: S.bibFlaeche },
                schritt.fremd
                  ? uebersetze('bei {0} — nur lesen', [personName(schritt.host)])
                  : stellen === 0
                    ? null
                    : stellen === 1
                      ? uebersetze('1× im Workflow')
                      : uebersetze('{0}× im Workflow', [stellen])));
            })
            : h('span', { style: S.meta },
              uebersetze('Noch keine Stationen — „+ Neue Station“ legt eine an.'))));

      // --- Bibliothek --------------------------------------------------------

      // Welche Bibliothek die Fläche zeigt, entscheidet die Fassung des
      // Boards: Fassung 1 bleibt, wie sie war; Fassung 2 zeigt die drei Arten.
      const bibliothek = data && data.format === 2
        ? bibliothekFassung2
        : bibliothekFassung1;

      // Der Katalog neben der Bibliothek: derselbe Ort, die andere Sicht. Er
      // zeigt die öffentlichen Dinge des Hauptboards — Art, Name, Host,
      // Sterne, Fassung und den Verweis. Fehlt eine Zahl, steht dort „—“.
      const katalogArt = {
        station: 'Station',
        workflow: 'Workflow',
        vorhaben: 'Vorhaben',
      };
      const katalogEintraege = katalog && Array.isArray(katalog.eintraege)
        ? katalog.eintraege
        : [];
      const katalogStand = (() => {
        const roh = katalog && katalog.stand ? String(katalog.stand) : '';
        if (!roh) return '';
        const datum = new Date(roh);
        return Number.isNaN(datum.getTime())
          ? roh
          : datum.toLocaleString(sprachTag(), { dateStyle: 'short', timeStyle: 'short' });
      })();
      // --- Katalog -----------------------------------------------------------

      const katalogFlaeche = h('div', null,
        h('div', { style: S.bibKopf },
          h('input', {
            type: 'search',
            style: { ...S.input, width: '260px' },
            value: katalogSuche,
            placeholder: uebersetze('Katalog durchsuchen'),
            title: uebersetze('Name, Host, Tag oder Beschreibung'),
            onChange: (ev) => {
              setKatalogSuche(ev.target.value);
              // Wer tippt, will den Zwischenspeicher; der frische Blick gilt
              // dem Knopf „Im Katalog zeigen“.
              setKatalogFrisch(0);
            },
          }),
          h('span', { style: { flex: 1 } }),
          katalogStand ? h('span', { style: S.meta }, uebersetze('Stand: {0}', [katalogStand])) : null),
        // Der Hinweis steht über der Liste: der letzte Stand ist noch da, aber
        // er ist nicht mehr frisch.
        katalog && katalog.hinweis
          ? h('p', { style: S.formatWarnung }, katalog.hinweis)
          : null,
        katalogFehler
          ? h('p', { style: S.sichtbarkeitWarnung }, uebersetze('Katalog nicht geladen: {0}', [katalogFehler]))
          : null,
        katalogLaedt ? h('div', { style: S.hinweis }, uebersetze('Katalog wird geladen …')) : null,
        !katalogLaedt && !katalogFehler && !katalogEintraege.length
          ? h('div', { style: S.hinweis }, (katalog && katalog.hinweis)
            // Der Host hat einen Grund: „Kein Hauptboard“ braucht keinen
            // Hinweis auf die Indizierung bei GitHub.
            ? String(katalog.hinweis)
            : katalogSuche
              ? uebersetze('Nichts gefunden zu „{0}“. Ein frisch angelegtes Repository braucht bei GitHub manchmal einen Moment — später noch einmal suchen.', [katalogSuche])
              : uebersetze('Keine Einträge.'))
          : null,
        h('div', { style: S.bibReihe },
          katalogEintraege.map((rohEintrag) => {
            const eintrag = rohEintrag && typeof rohEintrag === 'object' ? rohEintrag : {};
            const art = String(eintrag.art ? eintrag.art : '');
            const host = personAnzeige(eintrag.host);
            const fassung = String(eintrag.fassung == null ? '' : eintrag.fassung).trim();
            const sterne = Number.isFinite(eintrag.sterne) ? eintrag.sterne : '—';
            const beispielZahl = Array.isArray(eintrag.beispiele)
              ? eintrag.beispiele.length : '—';
            const offeneFragen = Number.isFinite(eintrag.fragen)
              ? eintrag.fragen : '—';
            // Das Probeprojekt des Hauptboards ist das eine öffentliche
            // Vorhaben, das sich in ein eigenes Board übernehmen lässt.
            const istProbe = art === 'vorhaben'
              && (String(eintrag.name || '') === 'Probeprojekt'
                || /(^|[\\/])vorhaben-probeprojekt($|[\\/])/
                  .test(String(eintrag.repo || '')));
            const probeOffen = Boolean(uebernahme)
              && uebernahme.repo === String(eintrag.repo || '');
            return h('div', {
              key: art + ':' + String(eintrag.repo || eintrag.name || ''),
              style: { ...S.bibKarteKlick, cursor: 'default' },
            },
            h('span', { style: { ...S.bibReiter, cursor: 'default' } },
              eintrag.name || uebersetze('ohne Namen')),
            h('div', { style: { ...S.bibFlaeche, cursor: 'default' } },
              h('span', { style: { display: 'block' } },
                uebersetze('Art: {0}', [katalogArt[art] || art || uebersetze('unbekannt')])),
              h('span', { style: { display: 'block' } },
                uebersetze('Herkunft: {0}', [eintrag.herkunft === 'gefunden'
                  ? 'über GitHub gefunden'
                  : 'im Hauptboard kuratiert'])),
              eintrag.herkunft === 'gefunden' && eintrag.repo
                ? h('span', { style: { display: 'block' } },
                  uebersetze('Repository: {0}', [eintrag.repo]))
                : null,
              h('span', { style: { display: 'block' } },
                uebersetze('Host: {0}', [host || uebersetze('ohne Host')])),
              h('span', { style: { display: 'block' } }, uebersetze('★ {0}', [sterne])),
              h('span', { style: { display: 'block' } },
                uebersetze('Beispiele: {0}', [beispielZahl])),
              h('span', { style: { display: 'block' } },
                uebersetze('Offene Fragen: {0}', [offeneFragen])),
              h('span', { style: { display: 'block' } },
                uebersetze('Fassung: {0}', [fassung || uebersetze('ohne Fassung')])),
              eintrag.adresse
                ? h('a', {
                  href: String(eintrag.adresse),
                  target: '_blank',
                  rel: 'noreferrer',
                  style: {
                    display: 'inline-block', marginTop: '5px', fontSize: '12px',
                    color: 'var(--board-akzent, var(--dsw-alias-brand-primary))',
                  },
                }, uebersetze('Auf GitHub'))
                : null,
              istProbe
                ? h('div', { style: { marginTop: '8px' } },
                  probeOffen
                    ? h('div', { style: S.projektForm },
                      uebernahme.form
                        ? h('div', {
                          style: { display: 'flex', flexDirection: 'column', gap: '5px' },
                        },
                        h('input', {
                          style: { ...S.input, width: '100%', boxSizing: 'border-box' },
                          value: uebernahme.name || '',
                          placeholder: uebersetze('Dein Name'),
                          onChange: (ev) => setUebernahme({
                            ...uebernahme, name: ev.target.value, fehler: '',
                          }),
                        }),
                        h('input', {
                          style: { ...S.input, width: '100%', boxSizing: 'border-box' },
                          value: uebernahme.github || '',
                          placeholder: uebersetze('GitHub-Name (freiwillig)'),
                          title: uebersetze('Damit dich öffentliche Boards wiederfinden'),
                          onChange: (ev) => setUebernahme({
                            ...uebernahme, github: ev.target.value, fehler: '',
                          }),
                        }),
                        h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
                          h('span', {
                            style: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary)' },
                          }, uebersetze('Farbe')),
                          h('div', { style: S.farbGitter },
                            FARBEN_ALLE.map((f) => h('button', {
                              key: f,
                              type: 'button',
                              title: farbName(f),
                              style: {
                                ...S.farbPunkt,
                                background: f,
                                borderColor: uebernahme.farbe === f
                                  ? 'var(--dsw-alias-label-primary)'
                                  : 'transparent',
                              },
                              onClick: () => setUebernahme({
                                ...uebernahme, farbe: f,
                              }),
                            })))))
                        : null,
                      h('button', {
                        type: 'button',
                        style: S.button,
                        disabled: uebernahme.laeuft,
                        onClick: () => uebernehmenAusfuehren(),
                      }, uebernahme.laeuft
                        ? uebersetze('Wird übernommen …')
                        : uebersetze('In mein Board übernehmen')),
                      uebernahme.fehler
                        ? h('p', { style: S.boardFehler }, uebernahme.fehler)
                        : null)
                    : h('button', {
                      type: 'button',
                      style: S.button,
                      onClick: () => uebernehmenOeffnen(eintrag),
                    }, uebersetze('In mein Board übernehmen')))
                : null));
          })));
      const katalogUmschalter = h('div', { style: S.bibKopf },
        h('div', { style: { display: 'inline-flex', gap: '6px' } },
          ['bibliothek', 'katalog'].map((ansicht) => h('button', {
            key: ansicht,
            type: 'button',
            style: bibAnsicht === ansicht ? { ...S.wahl, ...S.wahlAktiv } : S.wahl,
            title: ansicht === 'katalog'
              ? uebersetze('Die öffentlichen Dinge des Hauptboards')
              : uebersetze('Was dieses Board benutzt'),
            onClick: () => setBibAnsicht(ansicht),
          }, ansicht === 'katalog' ? uebersetze('Katalog') : uebersetze('Bibliothek')))),
        h('span', { style: { flex: 1 } }));

      // Die Bibliothek liegt im Dock neben der Schiene, der Katalog öffnet
      // sich darin. Beide haben denselben Kopf aus `Panel` und behalten ihre
      // Stile; der Katalog liegt als eigenes Panel in der Bibliothek, damit
      // Escape nur ihn schließt und der Fokus zum Umschalter zurückkehrt, der
      // ihn geöffnet hat.
      const katalogPanel = h(Panel, {
        id: 'board-katalog',
        titel: uebersetze('Katalog'),
        kopfStil: S.bibKopf,
        titelStil: S.bibAbschnittTitel,
        schliessenStil: S.schliessen,
        fokus: true,
        onSchliessen: () => setBibAnsicht('bibliothek'),
        kinder: katalogFlaeche,
      });
      const bibliothekPanel = h(Panel, {
        key: 'board-bibliothek',
        id: 'board-bibliothek',
        titel: uebersetze('Bibliothek'),
        seiteStil: S.dock,
        kopfStil: S.bibKopf,
        titelStil: S.bibAbschnittTitel,
        schliessenStil: S.schliessen,
        fokus: true,
        onSchliessen: () => setLeiste(null),
        kinder: h('div', { style: S.bibInhalt },
          katalogUmschalter,
          bibAnsicht === 'katalog' ? katalogPanel : bibliothek),
      });

      // Die Schiene links: zwei Orte, je mit Symbol und Wort. Ein Klick öffnet
      // den Ort im Dock, ein zweiter schließt ihn. `aria-pressed` sagt
      // Vorlesern, welcher offen ist; den Fokus holt und gibt `Panel`.
      const schienenBild = (wert) => h('svg', {
        width: 20, height: 20, viewBox: '0 0 20 20', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round',
        strokeLinejoin: 'round', 'aria-hidden': 'true', focusable: 'false',
      }, wert === 'bibliothek'
        ? [
          h('path', { key: 'regal', d: 'M3 17h14' }),
          h('rect', { key: 'band1', x: 4, y: 4, width: 3, height: 11, rx: 0.5 }),
          h('rect', { key: 'band2', x: 8.5, y: 6, width: 3, height: 9, rx: 0.5 }),
          h('rect', { key: 'band3', x: 13, y: 3, width: 3, height: 12, rx: 0.5 }),
        ]
        : [
          h('circle', { key: 'blatt', cx: 10, cy: 10, r: 7 }),
          h('path', { key: 'zeiger', d: 'M10 6v4l3 2' }),
        ]);
      const schienenKnopf = (wert, text) => h('button', {
        key: wert,
        type: 'button',
        // Der Pfeil im Titel sagt beim Überfahren, ob der Ort offen ist; die
        // sichtbare Beschriftung bleibt das eine Wort.
        title: text + ' ' + (leiste === wert ? uebersetze('▾') : uebersetze('▸')),
        'aria-pressed': leiste === wert,
        className: 'board-schiene-knopf',
        style: leiste === wert
          ? { ...S.schienenKnopf, ...S.schienenKnopfAktiv }
          : S.schienenKnopf,
        onClick: () => {
          const oeffnen = leiste !== wert;
          // Ein Seitenpanel zur Zeit: die Leiste schließt das rechte Dock —
          // Station und Gespräch. Ein Vorhaben bleibt gewählt.
          setLeiste(oeffnen ? wert : null);
          if (oeffnen) leisteOeffnen();
        },
      }, schienenBild(wert), h('span', null, text));

      // Der kleine Begleiter unten in der Schiene: reine Anzeige, ohne Text
      // und ohne Klickziel. Sein Mund folgt `status.art` — ein Lächeln bei
      // „fertig“, ein kleines Ausrufezeichen bei einem Fehler, sonst ein
      // ruhiger Strich. Die Augen blinzeln über die Klasse (CSS).
      const begleiterArt = status
        && (status.art === 'fertig' || status.art === 'fehler')
        ? status.art
        : 'ruhe';
      const begleiterMund = begleiterArt === 'fertig'
        ? h('path', { key: 'mund', d: 'M5.6 11.1 Q9 13.9 12.4 11.1' })
        : begleiterArt === 'fehler'
          ? [
            h('path', { key: 'strich', d: 'M9 10.6v1.6' }),
            h('circle', {
              key: 'punkt', cx: 9, cy: 13.6, r: 0.75,
              fill: 'currentColor', stroke: 'none',
            }),
          ]
          : h('path', { key: 'mund', d: 'M6.2 12h5.6' });
      const begleiter = h('div', {
        className: 'board-begleiter',
        'data-art': begleiterArt,
        'aria-hidden': 'true',
        style: {
          marginTop: 'auto', display: 'flex', justifyContent: 'center',
          pointerEvents: 'none',
        },
      }, h('svg', {
        width: 18, height: 18, viewBox: '0 0 18 18',
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.3,
        strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': 'true', focusable: 'false',
      },
      h('circle', { key: 'kopf', cx: 9, cy: 9, r: 7.4 }),
      h('circle', {
        key: 'auge-links', className: 'board-begleiter-auge',
        cx: 6.5, cy: 7.8, r: 0.85, fill: 'currentColor', stroke: 'none',
      }),
      h('circle', {
        key: 'auge-rechts', className: 'board-begleiter-auge',
        cx: 11.5, cy: 7.8, r: 0.85, fill: 'currentColor', stroke: 'none',
      }),
      begleiterMund));
      const schiene = h('nav', { style: S.schiene },
        schienenKnopf('bibliothek', uebersetze('Bibliothek')),
        schienenKnopf('verlauf', uebersetze('Verlauf')),
        begleiter);

      // Was zur Suche passt: der getippte Text, ohne doppelte Namen, höchstens
      // sechs Treffer. Gezeigt wird der Name, den auch die Karte trägt.
      const suchwort = stationsSuche.trim().toLowerCase();
      const gesehen = new Set();
      const stationsTreffer = karten.filter((p) => {
        const name = stationsName(p);
        const schluessel = name.toLowerCase();
        if (!suchwort || !schluessel.includes(suchwort) || gesehen.has(schluessel)) {
          return false;
        }
        gesehen.add(schluessel);
        return true;
      }).slice(0, 6);

      // Die Trefferliste unter dem Feld. Pfeiltasten wandern von Treffer zu
      // Treffer, Enter nimmt den ersten (oder den, der den Fokus hat),
      // Escape leert das Feld. Ohne Treffer bleibt der Satz stehen.
      const stationsTrefferListe = stationsOffen && suchwort
        ? h('div', {
          ref: stationsListeRef,
          style: S.stationsListe,
          role: 'list',
          'aria-live': 'polite',
          onKeyDown: (ev) => {
            if (ev.key === 'Escape') {
              ev.preventDefault();
              stationsSucheLeeren();
              return;
            }
            if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;
            const knoepfe = Array.from(ev.currentTarget.querySelectorAll('[data-treffer]'));
            if (!knoepfe.length) return;
            ev.preventDefault();
            const jetzt = knoepfe.indexOf(ev.target);
            const naechster = ev.key === 'ArrowDown'
              ? (jetzt + 1 + knoepfe.length) % knoepfe.length
              : (jetzt <= 0 ? knoepfe.length - 1 : jetzt - 1);
            knoepfe[naechster].focus();
          },
        },
        stationsTreffer.length
          ? stationsTreffer.map((p, i) => h('button', {
            key: p.id,
            type: 'button',
            'data-treffer': i,
            style: S.stationsTreffer,
            // Der Klick auf einen Treffer nimmt dem Feld nicht den Fokus,
            // bevor der Klick ankommt.
            onMouseDown: (ev) => ev.preventDefault(),
            onClick: () => springeZuStation(p),
          }, stationsName(p)))
          : h('div', { style: S.stationsLeer }, uebersetze('Keine Station gefunden')))
        : null;

      // Das Feld erscheint nur, wenn es etwas zu finden gibt. Es ist schmal;
      // das Label bleibt für Vorleser, ohne die Leiste höher zu machen.
      const stationsFeld = karten.length
        ? h('div', {
          style: S.stationsSuche,
          onBlur: (ev) => {
            if (ev.currentTarget.contains(ev.relatedTarget)) return;
            setStationsOffen(false);
          },
        },
        h(Feld, {
          id: 'board-stationssuche',
          label: 'Station finden',
          labelStil: S.nurVorleser,
          placeholder: uebersetze('Station finden'),
          wert: stationsSuche,
          autoComplete: 'off',
          spellCheck: false,
          stil: { width: '140px', maxWidth: '100%', flex: '0 1 auto' },
          onEingabe: (ev) => {
            const text = ev.target.value;
            setStationsSuche(text);
            setStationsOffen(Boolean(text.trim()));
          },
          onFocus: () => {
            if (stationsSuche.trim()) setStationsOffen(true);
          },
          onKeyDown: (ev) => {
            if (ev.key === 'Escape') {
              ev.preventDefault();
              stationsSucheLeeren();
              return;
            }
            if (ev.key === 'Enter') {
              if (!stationsTreffer.length) return;
              ev.preventDefault();
              springeZuStation(stationsTreffer[0]);
              return;
            }
            if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;
            if (!stationsTreffer.length) return;
            ev.preventDefault();
            const nachUnten = ev.key === 'ArrowDown';
            setStationsOffen(true);
            const setzen = () => {
              const liste = stationsListeRef.current;
              if (!liste) return;
              const knoepfe = Array.from(liste.querySelectorAll('[data-treffer]'));
              if (!knoepfe.length) return;
              const ziel = nachUnten ? knoepfe[0] : knoepfe[knoepfe.length - 1];
              ziel.focus();
            };
            if (typeof window !== 'undefined'
              && typeof window.requestAnimationFrame === 'function') {
              window.requestAnimationFrame(setzen);
            } else {
              setzen();
            }
          },
        }),
        stationsTrefferListe)
        : null;

      // „Alles zeigen“: ohne Karten gibt es nichts zu zeigen, dann fehlt der
      // Knopf. Er rechnet nur die Lage aus, er merkt sich keinen neuen Stand.
      const allesZeigenKnopf = karten.length
        ? h('button', {
          type: 'button',
          style: S.reiter,
          onClick: allesZeigen,
        }, uebersetze('Alles zeigen'))
        : null;

      // Über der Fläche bleibt nur, was zu ihr gehört: die Suche und „Alles
      // zeigen“. Bibliothek und Verlauf sind in die Schiene links gewandert.
      // Beide stehen seit der neuen Kopfzeile in deren rechter Gruppe.


      // --- Verlauf des Boards ------------------------------------------------

      // Der Verlauf des Boards: was jede Speicherung geändert hat. Die Fassungen
      // liegen im lokalen Repository; hier stehen sie der Reihe nach, die
      // neueste oben — eine Umbenennung steht so als eigene Zeile da.
      const verlaufFlaeche = h('div', null,
        h('div', { style: S.settingHinweis },
          uebersetze('Jede Speicherung im Board legt eine Fassung an — mit dem, was sich geändert hat.')),
        !fassungen || fassungen.zustand === 'laedt'
          ? h('div', { style: { ...S.settingHinweis, marginTop: '8px' } }, uebersetze('Lade …'))
          : fassungen.zustand === 'fehler'
            ? h('div', { style: { ...S.settingHinweis, marginTop: '8px' } },
              uebersetze('Der Verlauf ließ sich nicht laden.'))
            : !fassungen.liste.length
              ? h('div', { style: { ...S.settingHinweis, marginTop: '8px' } },
                uebersetze('Noch keine Fassung.'))
              : h('div', { style: S.fassungen },
                fassungen.liste.map((f) => h('div', { key: f.hash, style: S.fassungZeile },
                  h('div', { style: S.fassungKopf }, uebersetze('{0} · {1}', [wann(f.datum), wer(f.autor)])),
                  h('div', { style: S.fassungWas }, f.nachricht)))));

      // Der Verlauf liegt im selben Dock wie die Bibliothek: der Kopf mit ✕
      // kommt aus `Panel`, der Inhalt rollt darin.
      const verlaufPanel = h(Panel, {
        key: 'board-verlauf',
        id: 'board-verlauf',
        titel: uebersetze('Verlauf'),
        seiteStil: S.dock,
        kopfStil: S.bibKopf,
        titelStil: S.bibAbschnittTitel,
        schliessenStil: S.schliessen,
        fokus: true,
        onSchliessen: () => setLeiste(null),
        kinder: h('div', { style: S.bibInhalt }, verlaufFlaeche),
      });

      // Das Dock ist der offene Ort neben der Schiene; geschlossen gibt es
      // keins, und die Fläche bekommt die Breite allein.
      const dock = leiste === 'bibliothek'
        ? bibliothekPanel
        : leiste === 'verlauf' ? verlaufPanel : null;

      // Die Teile des Stationsreiters im rechten Dock. Sein Inhalt kommt aus
      // `stationsInhalt` — derselbe Bau wie in der Karte auf der Fläche. Eine
      // Station, die noch nicht auf der Fläche steht, hat keine Karte; der
      // Hinweis auf den Weg dorthin steht dann über dem Formular.
      const offeneStelle = (art === 'schritt' && gewaehlt)
        ? positionen.find((p) => p.schritt === gewaehlt.id) || null
        : null;
      function stationDockTeile() {
        const schritt = schritte.find((x) => x.id === gewaehlt.id) || null;
        const fassung = String(gewaehlt.fassung
          || (schritt && schritt.fassung) || '').trim();
        const bearbeiten = (offeneStelle && !stationEdit && !gewaehlt.fremd && schreibbar)
          ? h(Knopf, {
            klein: true,
            stil: { flex: 'none' },
            symbol: uebersetze('Bearbeiten'),
            title: uebersetze('Werte dieser Station ändern'),
            onClick: () => {
              statusWeg();
              setBestaetigen(null);
              setEntwurf(entwurf || schrittEntwurf(data, auswahlId));
              setStationEdit(true);
            },
          }, uebersetze('Bearbeiten'))
          : null;
        return {
          titel: [
            h('span', {
              key: 'name', style: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' },
            }, gewaehlt.name || (gewaehlt.fehlt ? uebersetze('Verweis fehlt') : gewaehlt.id)),
            fassung
              ? h('span', {
                key: 'fassung',
                style: S.fassung,
                title: schritt && schritt.fassungFehlt
                  ? uebersetze('Fassung {0} fehlt; gelesen wurde der aktuelle Stand', [fassung])
                  : uebersetze('Fassung {0}', [fassung]),
              }, fassung)
              : null,
          ],
          untertitel: stationFremdHinweis(),
          kopfRechts: bearbeiten,
          kinder: h('div', { style: S.bibInhalt },
            offeneStelle
              ? stationsInhalt(offeneStelle, true)
              : h(React.Fragment, null,
                h('div', { style: { ...S.hinweis, marginBottom: '10px' } },
                  uebersetze('Noch nicht auf der Fläche — zieh sie dorthin, dann öffnet sie sich dort.')),
                gewaehlt.fremd ? stationAnzeige() : stationFormular(true))),
        };
      }

      // Die Flächen aller Personen. Die eigene steht oben; die fremden folgen
      // als Leseblätter — ihre Schritte sind sichtbar und anklickbar, aber es
      // gibt dort keine Felder zum Ändern, Löschen, Anlegen oder Ziehen.
      const eigene = eigeneFlaeche(data);
      const eigeneFarbe = eigene && eigene.farbe ? eigene.farbe : OHNE_FARBE;
      const eigenerKopf = h('div', { style: S.flaechenKopf },
        h('span', { style: { ...S.personPunkt, background: eigeneFarbe } }),
        h('span', { style: S.flaechenName }, eigene ? (eigene.name || uebersetze('Du')) : uebersetze('Du')),
        h('span', { style: S.fremdHinweis }, uebersetze('deine Fläche')));

      const fremde = (data.workflows || []).filter((p) => p && !p.ich);
      const fremdeFlaechen = fremde.length
        ? h('div', { style: { width: flaechenBreite + 'px' } },
          fremde.map((person) => {
            const pFarbe = /^#[0-9a-f]{6}$/i.test(person.farbe || '')
              ? person.farbe
              : OHNE_FARBE;
            const workflows = (person.workflows || []).map((workflow) => {
              const karten = (workflow.schritte || []).map((schritt) => {
                const schluessel = person.id + '/' + workflow.id + '/' + schritt.id;
                const offen = fremdOffen === schluessel;
                const sFarbe = personFarbe(schritt.host || person.id);
                // Steht der Schritt schon als Verweis in meinem Workflow?
                // Dann wird er nicht ein zweites Mal angestellt.
                const stehtSchon = schritte.some((x) => x && x.ref === schluessel);
                return h('div', {
                  key: schritt.id,
                  style: { ...S.fremdKarte, borderTop: '3px solid ' + sFarbe },
                },
                h('button', {
                  type: 'button',
                  style: S.fremdKarteKopf,
                  title: offen ? uebersetze('Ein- und Ausgang zuklappen') : uebersetze('Ein- und Ausgang zeigen'),
                  onClick: () => setFremdOffen(offen ? null : schluessel),
                }, schritt.name || (schritt.fehlt ? uebersetze('Verweis fehlt') : schritt.id)),
                h('div', { style: S.fremdKarteKoerper },
                  h('div', { style: S.fremdKarteFuss },
                    schritt.ref
                      ? uebersetze('Verweis aus {0}', [schritt.ref])
                      : uebersetze('bei {0}', [personName(schritt.host || person.id)])),
                  offen
                    ? h('div', null,
                      anzeigeZeile('Eingang', (schritt.eingang || []).join(', ')),
                      anzeigeZeile('Ausgang', (schritt.ausgabe || []).join(', ')))
                    : null,
                  // Anstellen: nur der Verweis kommt in meinen Workflow, die
                  // Datei der anderen Person bleibt unverändert.
                  !schritt.fehlt && !schritt.ref
                    ? h('button', {
                      key: 'anstellen',
                      type: 'button',
                      style: S.klein,
                      disabled: stehtSchon,
                      title: stehtSchon
                        ? uebersetze('Steht schon als Verweis in deinem Workflow')
                        : uebersetze('Als Verweis in deinen Workflow stellen — die Datei von {0} bleibt, wie sie ist', [person.name || person.id]),
                      onClick: stehtSchon ? null : () => fremdAnstellen(schluessel),
                    }, stehtSchon ? uebersetze('steht in deinem Workflow') : uebersetze('In meinen Workflow stellen'))
                    : null,
                  schritt.fehlt
                    ? h('div', { style: S.fremdKarteFuss },
                      uebersetze('Das Ziel dieses Verweises fehlt in der Ablage.'))
                    : null));
              });
              // Ein Vorhaben dieser Person steht an seiner Station in ihrem
              // Workflow — mit Namen, ohne Handlung; es gehört nicht mir.
              const stationName = (v) => {
                const stelle = (workflow.positionen || []).find((x) => x.id === v.position);
                const schritt = stelle
                  ? (workflow.schritte || []).find((x) => x.id === stelle.schritt)
                  : null;
                return (schritt && schritt.name) || (stelle && stelle.id) || v.position;
              };
              const ihreVorhaben = vorhaben.filter((v) => (workflow.positionen || [])
                .some((x) => x.id === v.position)
                // Steht die Station auch auf meiner Fläche, ist das Vorhaben
                // dort schon zu sehen; hier stünde es sonst zweimal.
                && !positionen.some((x) => x.id === v.position)
                && verantwortlicheVon(v).includes(String(person.id)));
              // Beiträge an Stationen dieser fremden Fläche, die auf meinem
              // Board keinen Ort haben. Wo die Station dort steht, zeigt sie
              // die Karte; hier stehen die, die sonst nirgends zu sehen wären.
              const ihreBeitraege = beitraege.filter((b) => b
                && !positionen.some((x) => x.id === b.schritt)
                && (workflow.positionen || []).some((x) => x.id === b.schritt));
              return h('div', { key: workflow.id },
                h('div', { style: S.fremdWorkflowTitel }, workflow.titel || workflow.id),
                h('div', { style: S.fremdReihe }, karten),
                ihreVorhaben.length
                  ? h('div', { style: S.fremdVorhaben },
                    ihreVorhaben.map((v) => {
                      // Die Farbe des Vorhabens ist die seiner verantwortlichen
                      // Person; sie steht auch am Vorhaben, nicht nur an der Fläche.
                      const vFarbe = /^#[0-9a-f]{6}$/i.test(String(v.farbe || ''))
                        ? v.farbe
                        : pFarbe;
                      return h('div', { key: v.id, style: { marginTop: '4px' } },
                        h('button', {
                          type: 'button',
                          style: { ...S.fremdVorhabenKnopf, marginTop: 0 },
                          title: uebersetze('Vorhaben öffnen und seine Dateien lesen'),
                          onClick: () => fremdesVorhabenOeffnen(v),
                        },
                        h('span', {
                          key: 'punkt',
                          style: { ...S.personPunkt, background: vFarbe, marginRight: '6px' },
                        }),
                        uebersetze('Vorhaben „{0}“ an „{1}“{2} · Dateien ansehen', [v.name, stationName(v), v.verantwortet ? ' — verantwortet von ' + v.verantwortet : ''])));
                    }))
                  : null,
                ihreBeitraege.length
                  ? h('div', { style: S.fremdVorhaben },
                    h('div', { style: S.fremdKarteFuss }, uebersetze('Beiträge')),
                    ihreBeitraege.map((b) => h('button', {
                      key: 'beitrag-' + b.id,
                      type: 'button',
                      style: S.fremdVorhabenKnopf,
                      title: uebersetze('Beitrag öffnen — Notiz und vorgeschlagene Fassungen lesen'),
                      onClick: () => beitragOeffnen(b),
                    },
                    uebersetze('Beitrag von {0} an „{1}“{2}{3}{4}', [b.von || '—', b.station || b.schritt, b.vorhabenName ? ' · ' + b.vorhabenName : '', b.entschieden
                        ? ' · ' + (b.entschieden.art === 'angenommen'
                          ? 'angenommen' : 'abgelehnt')
                        : '', b.notiz ? ' — ' + b.notiz : '']))))
                  : null);
            });
            return h('div', {
              key: person.id,
              style: { ...S.fremdFlaeche, borderTop: '3px solid ' + pFarbe },
            },
            h('div', { style: S.fremdKopf },
              h('span', { style: { ...S.personPunkt, background: pFarbe } }),
              h('span', { style: S.fremdName }, person.name || person.id),
              h('span', { style: S.fremdHinweis },
                uebersetze('Fläche von {0} — hier nur zu lesen. Geändert wird sie dort, wo sie herkommt.', [person.name || person.id]))),
            workflows);
          }))
        : null;

      /** Das Transkript einer Sitzung als Markdown, mit der Wahl des Laufs. */
      function transkriptInhalt() {
        if (!transkript || transkript.zustand === 'laedt') {
          return h('p', { style: S.meta }, uebersetze('Lade …'));
        }
        if (transkript.zustand === 'fehler') {
          return h('p', { style: S.meta }, uebersetze('Das Transkript konnte nicht geladen werden.'));
        }

        const laeufe = transkript.laeufe || [];
        if (!laeufe.length) {
          return h('p', { style: S.meta }, uebersetze('Dieses Transkript ist nicht mehr da.'));
        }

        const wahl = Math.min(laufWahl, laeufe.length - 1);
        const lauf = laeufe[wahl];
        return h('div', null,
          laeufe.length > 1
            ? h('select', {
              style: { ...S.feld, marginBottom: '12px' },
              value: String(wahl),
              onChange: (ev) => setLaufWahl(Number(ev.target.value)),
            }, laeufe.map((l, i) => h('option', { key: l.datei, value: String(i) },
              uebersetze('{0} · {1}{2}', [l.datum || '', l.skill || '', i === 0 ? ' (neuestes)' : '']))))
            : null,
          lauf.fehlt
            ? h('p', { style: S.meta }, uebersetze('Die Transkript-Datei fehlt im Ordner: {0}', [lauf.datei]))
            : markdown(lauf.text, oeffneLink));
      }

      // Ein alter Beitrag: Notiz, Station und die Namen der vorgeschlagenen
      // Fassungen. Entschieden wird über ihn nicht mehr im Board — neue
      // Beiträge sind Pull Requests; die alten Daten bleiben lesbar.
      /** Ein alter Beitrag: Notiz und die vorgeschlagenen Fassungen. */
      function beitragInhalt() {
        if (!beitrag) return h('p', { style: S.meta }, uebersetze('Der Beitrag ist nicht mehr da.'));
        const dateien = Array.isArray(beitrag.dateien) ? beitrag.dateien : [];
        const entschieden = beitrag.entschieden && typeof beitrag.entschieden === 'object'
          ? beitrag.entschieden : null;

        return h('div', null,
          h('div', { style: S.meta },
            uebersetze('Beitrag von {0}{1} · Station „{2}“', [beitrag.von || '—', beitrag.seit ? ' · ' + wann(beitrag.seit) : '', beitrag.station
              || positionsName(beitrag.schritt)])),
          h('div', { style: { ...S.marke, marginTop: '14px' } }, uebersetze('Notiz')),
          beitrag.notiz
            ? h('div', { style: S.beitragInhalt }, beitrag.notiz)
            : h('p', { style: S.meta }, uebersetze('Keine Notiz — nur eine vorgeschlagene Fassung.')),
          h('div', { style: { ...S.marke, marginTop: '18px' } }, uebersetze('Vorgeschlagene Fassungen')),
          dateien.length
            ? dateien.map((d, i) => h('div', {
              key: d.name || d.datei || String(i),
              style: { marginTop: '12px' },
            },
            h('div', { style: { fontSize: '12px', fontWeight: 600 } },
              d.name || d.datei || uebersetze('—')),
            d.text
              ? h('div', {
                style: {
                  marginTop: '4px', padding: '10px 12px', borderRadius: '8px',
                  border: '1px solid var(--dsw-alias-border-l1)',
                  background: 'var(--dsw-alias-bg-layer-1)',
                },
              }, markdown(d.text, null))
              : h('p', { style: S.meta },
                uebersetze('Die vorgeschlagene Fassung liegt in der alten Ablage.'))))
            : h('p', { style: S.meta }, uebersetze('Nur eine Notiz — keine Datei vorgeschlagen.')),
          h('div', { style: { ...S.marke, marginTop: '18px' } }, uebersetze('Entscheid')),
          entschieden
            ? h('div', { style: S.meta },
              uebersetze('{0} von {1}{2}{3}', [entschieden.art === 'angenommen' ? 'Angenommen' : 'Abgelehnt', personName(entschieden.von), entschieden.am ? ' am ' + wann(entschieden.am) : '', entschieden.art === 'angenommen'
                ? ' · Übernommen: ' + (Array.isArray(entschieden.teile)
                  && entschieden.teile.length
                  ? entschieden.teile.join(', ')
                  : 'keine Datei')
                : ' · Keine Datei übernommen.']))
            : h('p', { style: S.meta },
              uebersetze('Über diesen Beitrag wurde im Board nicht entschieden — neue Beiträge sind Pull Requests.')));
      }

      // Ein Beitrag ist ein Pull Request: dieselbe Fläche wie am Vorhaben.
      // Sie liest den Stand und legt mit Token einen Pull Request an; ohne
      // Token bleibt es beim Verweis auf GitHub. Eine lokale Beitragsdatei
      // entsteht nicht.
      function beitragenInhalt() {
        if (!leser) return null;
        const repo = repoDesLesers();
        const hinweis = 'Ein Beitrag ist ein Pull Request gegen das Repository '
          + 'des Vorhabens. Der Quellzweig mit deinem Text muss dort schon '
          + 'liegen; entschieden wird bei GitHub.';
        if (!repo) {
          return h('div', null,
            h('p', { style: S.meta }, hinweis),
            h('p', { style: { ...S.hinweis, margin: '8px 0 0' } },
              uebersetze('Für dieses Vorhaben ist kein Repository verknüpft — es gibt keinen Ort für einen Pull Request.')));
        }
        return h('div', null,
          h('p', { style: { ...S.meta, margin: '0 0 10px' } }, hinweis),
          h(BeitraegeFlaeche, {
            repo,
            start: beitragStart,
            textLabel: uebersetze('Notiz zum Beitrag'),
          }));
      }

      // Der Verlauf: eine Fassung wählen, den Unterschied sehen, zurückgehen.
      /** Der Verlauf einer Datei: Fassung wählen, Unterschied sehen, zurück. */
      function historieInhalt() {
        if (!historie || historie.zustand === 'laedt') {
          return h('p', { style: S.meta }, uebersetze('Lade …'));
        }
        if (historie.zustand === 'fehler') {
          return h('p', { style: S.meta }, uebersetze('Der Verlauf ließ sich nicht laden.'));
        }
        const liste = historie.liste || [];
        const wahl = Math.min(historie.wahl || 0, Math.max(0, liste.length - 1));
        const eintrag = liste[wahl];
        const v = historie.version;

        if (!liste.length) {
          return h('p', { style: S.meta },
            uebersetze('Für diese Datei gibt es noch keine Fassung — sie wurde seit dem Anfang des Verlaufs nicht gespeichert.'));
        }

        return h('div', null,
          h('select', {
            style: { ...S.feld, marginBottom: '8px' },
            value: String(wahl),
            onChange: (ev) => waehleVersion(Number(ev.target.value)),
          }, liste.map((e, i) => h('option', { key: e.hash, value: String(i) },
            uebersetze('{0} · {1} · {2}', [wann(e.datum), wer(e.autor), e.nachricht])))),
          h('div', { style: { ...S.meta, marginBottom: '10px' } },
            uebersetze('von {0} am {1}', [eintrag.autor === 'Mensch' ? 'dir' : eintrag.autor, wann(eintrag.datum)]),
            eintrag.nachricht ? uebersetze(' — {0}', [eintrag.nachricht]) : ''),
          v && v.zustand === 'laedt' ? h('p', { style: S.meta }, uebersetze('Lade …')) : null,
          v && v.zustand === 'fehler'
            ? h('p', { style: S.meta }, uebersetze('Diese Fassung ließ sich nicht laden.'))
            : null,
          v && v.zustand === 'ok'
            ? h('div', null,
              h('div', { style: S.diff },
                diffAnzeige(diffZeilen(v.alt, v.neu)).map((z, i) => h('div', {
                  key: 'd' + i,
                  style: {
                    ...S.diffZeile,
                    ...(z.art === 'weg' ? S.diffWeg
                      : z.art === 'dazu' ? S.diffDazu
                        : z.art === 'luecke' ? S.diffLuecke : null),
                  },
                }, (z.art === 'weg' ? '− ' : z.art === 'dazu' ? '+ ' : '  ') + z.text))),
              h('div', {
                style: { marginTop: '12px', display: 'flex', gap: '8px', alignItems: 'center' },
              },
              historie.frage
                ? h('span', { style: S.meta },
                  uebersetze('Zurück auf diesen Stand? Die jetzige Fassung bleibt im Verlauf. '))
                : null,
              historie.frage
                ? h('button', { type: 'button', style: S.klein, onClick: zurueckAufStand }, uebersetze('Ja, zurück'))
                : h('button', {
                  type: 'button',
                  style: S.klein,
                  onClick: () => setHistorie((alt) => (alt ? { ...alt, frage: true } : alt)),
                }, uebersetze('Auf diesen Stand zurück')),
              historie.frage
                ? h('button', {
                  type: 'button',
                  style: S.klein,
                  onClick: () => setHistorie((alt) => (alt ? { ...alt, frage: false } : alt)),
                }, uebersetze('Abbrechen'))
                : null))
            : null);
      }

      // Der Zweig, der hier beginnt: wohin er geht, wie er heißt, was er
      // mitnimmt. „Zweig anlegen" ist die Freigabe — vorher entsteht nichts.
      /** Das Formular für einen neuen Zweig an dieser Station. */
      function zweigInhalt() {
        if (!zweig) return null;
        const ziele = zweigZiele(leser.position);
        const mit = zweigMit(leser.position);
        const ort = positionsName(leser.position);
        const name = String(zweig.name || '').trim();
        const laeuft = !!(zweig.laeuft);
        return h('div', { style: S.zweig },
          h('div', { style: S.marke }, uebersetze('Neuer Zweig ab „{0}“', [ort])),
          h('div', { style: { ...S.sub, margin: '2px 0 12px' } },
            uebersetze('Das Vorhaben bleibt, wo es ist. Der Zweig beginnt an der Station, zu der von hier eine Schnur führt, und nimmt mit, was bis hierher entstanden ist{0}.', [mit.length ? ': ' + mit.join(', ') : ''])),
          h('div', { style: S.feldTitel }, uebersetze('Wohin')),
          h('div', { style: { ...S.knoepfe, margin: '4px 0 12px' } },
            ziele.map((id) => h('button', {
              key: id,
              type: 'button',
              style: {
                ...S.klein,
                ...(zweig.ziel === id
                  ? { borderColor: 'var(--board-akzent, var(--dsw-alias-brand-primary))', fontWeight: 600 }
                  : null),
              },
              onClick: () => zweigZielWaehlen(id),
            }, positionsName(id)))),
          h('div', { style: S.feldTitel }, uebersetze('Name des Zweigs')),
          h('input', {
            type: 'text',
            style: { ...S.feld, margin: '4px 0 12px', width: '100%', boxSizing: 'border-box' },
            value: zweig.name,
            spellCheck: false,
            disabled: laeuft,
            onChange: (ev) => setZweig({ ...zweig, name: ev.target.value }),
            onKeyDown: (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); zweigAnlegen(); } },
          }),
          zweig.fehler ? h('div', { style: { ...S.hinweis, marginBottom: '8px' } }, zweig.fehler) : null,
          h('div', { style: S.knoepfe },
            h('button', {
              type: 'button',
              style: {
                ...S.klein,
                ...(laeuft || !name ? { opacity: 0.45, cursor: 'default' } : null),
              },
              disabled: laeuft || !name,
              onClick: zweigAnlegen,
            }, laeuft ? uebersetze('Lege an …') : uebersetze('Zweig anlegen')),
            h('button', {
              type: 'button',
              style: S.klein,
              onClick: () => { setZweig(null); setLeser({ ...leser, modus: 'lesen' }); },
            }, uebersetze('Abbrechen'))));
      }

      // Was über dem Editor steht: der Zustand des letzten Modelleingriffs.
      // Ein Vorschlag ist kein gespeicherter Text — das steht dort, solange
      // er ihn nicht übernommen hat.
      function eingriffText() {
        if (!eingriff) return '';
        if (eingriff.fehler) {
          return (eingriff.art === 'korrektur' ? uebersetze('Korrektur nicht möglich:') : uebersetze('Überarbeiten nicht möglich:'))
            + ' ' + eingriff.fehler;
        }
        if (eingriff.laeuft) {
          return eingriff.art === 'korrektur'
            ? uebersetze('Rechtschreibung wird korrigiert — das dauert ein paar Sekunden.')
            : uebersetze('Das Modell überarbeitet den Text — bei einem langen Text dauert das bis zu einer halben Minute.');
        }
        return eingriff.art === 'korrektur'
          ? uebersetze('Korrigiert. „Zurücknehmen“ stellt deinen Text wieder her.')
          : uebersetze('Vorschlag des Modells — noch nicht gespeichert. Speichern übernimmt ihn, „Zurücknehmen“ verwirft ihn.');
      }

      // Die beiden Ablageflächen, solange gezogen wird. Sie liegen über der
      // Arbeitsfläche und nehmen selbst keine Zeigerereignisse an.
      function zielFeld(art, masse) {
        const aktiv = leserZiehen && leserZiehen.ziel === art;
        return {
          position: 'absolute',
          ...masse,
          border: '2px dashed ' + (aktiv
            ? 'var(--board-akzent, var(--dsw-alias-brand-primary))'
            : 'var(--dsw-alias-border-l2)'),
          borderRadius: '8px',
          background: aktiv ? 'color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent)' : 'color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: aktiv ? 'var(--board-akzent, var(--dsw-alias-brand-primary))' : 'var(--dsw-alias-label-secondary)',
          fontSize: '12px', fontWeight: aktiv ? 600 : 400,
        };
      }

      // --- Leser -------------------------------------------------------------

      // Die Dateien: der Ordner des Vorhabens als Baum. Aufgeklappt wird nur,
      // was er anklickt — ein Produkt kann tausende Dateien haben.
      const dateienPanel = dateien ? h('div', { style: S.dateien },
        h('div', { style: S.dateienKopf },
          h('div', { style: S.dateienTitel, title: uebersetze('Dateien · {0}', [dateien.titel]) },
            uebersetze('Dateien · {0}', [dateien.titel])),
          h(Knopf, {
            symbol: 'Schließen',
            stil: S.klein,
            onClick: () => setDateien(null),
          }, '✕')),
        h('div', { style: S.dateienListe },
          dateien.fehler ? h('div', { style: S.meta }, dateien.fehler) : null,
          baumZeilen('', 0))) : null;

      // Ein fremdes Vorhaben lässt sich lesen und bearbeiten; geschrieben wird
      // es nicht — „Beitragen“ öffnet einen Pull Request mit der Notiz. Der
      // Verlauf bleibt lesbar — er ändert nichts.
      const leserVorhaben = leser && (leser.art === 'datei' || leser.art === 'beitrag')
        ? (vorhaben.find((v) => v.id === leser.vorhaben) || null)
        : null;
      const leserDarfAendern = !leserVorhaben
        || !!(leserVorhaben.darf && leserVorhaben.darf.aendern === true);
      const leserModus = leser ? leser.modus : null;

      const leserPanel = leser ? h(Panel, {
        id: 'board-leser',
        seiteStil: lage === 'rechts'
          ? { ...S.leser, ...S.leserRechts }
          : { ...S.leser, ...S.leserUnten },
        kopfStil: { ...S.leserKopf, cursor: 'grab', touchAction: 'none' },
        titelStil: S.leserTitel,
        schliessenStil: S.klein,
        fokus: true,
        onSchliessen: () => setLeser(null),
        kopfEigenschaften: {
          title: uebersetze('Ziehen: unten oder rechts ablegen'),
          onPointerDown: (ev) => {
            if (ev.button !== 0) return;
            if (ev.target && ev.target.closest
              && ev.target.closest('button, input, select, textarea, a')) return;
            const raum = raumRef.current;
            if (!raum) return;
            const r = raum.getBoundingClientRect();
            const start = { x: ev.clientX, y: ev.clientY };
            let aktiv = false;
            let ziel = null;
            const zone = (x, y) => {
              if (y > r.top + r.height * 0.7) return 'unten';
              if (x > r.left + r.width * 0.7) return 'rechts';
              return null;
            };
            ev.preventDefault();
            const bewegen = (e) => {
              if (!aktiv) {
                if (Math.abs(e.clientX - start.x) + Math.abs(e.clientY - start.y) < 6) return;
                aktiv = true;
                zeigerFest('grabbing');
              }
              // Nur wenn die Fläche unter dem Zeiger wechselt, wird neu
              // gezeichnet — sonst bei jeder Bewegung des Zeigers.
              const neu = zone(e.clientX, e.clientY);
              if (neu !== ziel) {
                ziel = neu;
                setLeserZiehen({ ziel });
              }
            };
            const loslassen = () => {
              window.removeEventListener('pointermove', bewegen);
              window.removeEventListener('pointerup', loslassen);
              window.removeEventListener('pointercancel', loslassen);
              zeigerFest(null);
              setLeserZiehen(null);
              if (aktiv && ziel) setLage(ziel);
            };
            window.addEventListener('pointermove', bewegen);
            window.addEventListener('pointerup', loslassen);
            window.addEventListener('pointercancel', loslassen);
          },
        },
        titel: leser.art === 'transkript'
          ? uebersetze('Transkript · {0}', [leser.titel])
          : leser.art === 'beitrag'
            ? uebersetze('Beitrag von {0}', [(beitrag && beitrag.von) || leser.titel || '—'])
            : [
              // Wo die Datei liegt: das Vorhaben und die Station. Ohne beides
              // stünde hier nur ein Name, und niemand wüsste, wozu er gehört.
              h('div', { key: 'ort', style: S.leserOrt },
                (vorhaben.find((v) => v.id === leser.vorhaben) || {}).name || leser.vorhaben,
                leser.position ? uebersetze(' · Station „{0}“', [positionsName(leser.position)]) : '',
                leser.ordner ? uebersetze(' · {0}/', [leser.ordner]) : ''),
              h('div', { key: 'name', style: { overflow: 'hidden', textOverflow: 'ellipsis' } },
                leser.datei + (leser.vorhanden === false ? ' · neu' : '')),
            ],
        kopfRechts: h('div', { style: { ...S.knoepfe, flexWrap: 'wrap', justifyContent: 'flex-end' } },
          leserModus === 'beitragen'
            ? h('button', {
              type: 'button',
              style: S.klein,
              title: uebersetze('Zurück zum Text — das Formular bleibt stehen'),
              onClick: () => setLeser({ ...leser, modus: 'bearbeiten' }),
            }, uebersetze('Zurück zum Text'))
            : null,
          leser.art === 'datei' && leser.modus !== 'abzweig' && leser.position
            && leserDarfAendern && leser.vorhanden !== false
            && zweigZiele(leser.position).length
            ? h('button', {
              type: 'button',
              style: S.klein,
              title: uebersetze('Dieses Vorhaben von hier aus auf einen anderen Weg schicken'),
              onClick: zweigBeginnen,
            }, uebersetze('Abzweigen'))
            : null,
          leser.art === 'datei' && leserModus === 'bearbeiten' && !leser.konflikt
            ? (leserDarfAendern
              ? h('button', {
                type: 'button', style: S.klein, onClick: dateiSpeichern,
              }, uebersetze('Speichern'))
              : h('button', {
                type: 'button',
                style: S.klein,
                title: uebersetze('Als Beitrag speichern'),
                onClick: beitragSpeichern,
              }, uebersetze('Beitragen')))
            : null,
          leser.art === 'datei' && leserModus === 'bearbeiten'
            ? h('button', {
              type: 'button',
              style: S.klein,
              title: uebersetze('Nur Rechtschreibung und Zeichensetzung korrigieren'),
              disabled: !!(eingriff && eingriff.laeuft),
              onClick: korrigiere,
            }, eingriff && eingriff.laeuft && eingriff.art === 'korrektur'
              ? uebersetze('Korrigiere …') : uebersetze('Rechtschreibung'))
            : null,
          eingriff && eingriff.original !== undefined && eingriff.original !== leser.text
            ? h('button', {
              type: 'button',
              style: S.klein,
              title: uebersetze('Den Text vor dem Eingriff wiederherstellen'),
              onClick: () => { setLeser({ ...leser, text: eingriff.original }); setEingriff(null); },
            }, uebersetze('Zurücknehmen'))
            : null,
          leser.art === 'datei' && leser.modus !== 'verlauf' && leser.vorhanden !== false
            && !leser.pfad
            ? h('button', {
              type: 'button',
              style: S.klein,
              title: uebersetze('Die Fassungen dieser Datei — wer wann was geändert hat'),
              onClick: oeffneVerlauf,
            }, uebersetze('Verlauf'))
            : null,
          leser.art === 'datei' && leser.vorhanden !== false && !leser.pfad
            && !leser.binaer && schreibbar
            ? h('button', {
              type: 'button',
              style: S.klein,
              onClick: () => {
                const wirdBearbeiten = !(leserModus === 'bearbeiten' || leserModus === 'verlauf');
                setLeser({
                  ...leser,
                  modus: wirdBearbeiten ? 'bearbeiten' : 'lesen',
                  // Ein fremdes Vorhaben wird zum Beitrag: das Original bleibt
                  // daneben liegen, damit „Lesen“ und die Anzeige es zeigen.
                  ...(wirdBearbeiten && !leserDarfAendern
                    ? {
                      original: leser.original != null ? leser.original : leser.text,
                      notiz: leser.notiz || '',
                    }
                    : {}),
                });
              },
            }, leserModus === 'bearbeiten' || leserModus === 'verlauf'
              ? uebersetze('Lesen') : uebersetze('Bearbeiten'))
            : null,
          h('button', {
            type: 'button',
            style: S.klein,
            onClick: () => setLage(lage === 'rechts' ? 'unten' : 'rechts'),
          }, lage === 'rechts' ? uebersetze('nach unten') : uebersetze('nach rechts'))),
        kinder: h('div', { style: S.leserInhalt },
        leser.art === 'transkript'
          ? transkriptInhalt()
          : leser.art === 'beitrag'
            ? beitragInhalt()
            : leserModus === 'verlauf'
              ? historieInhalt()
              : leserModus === 'abzweig'
                ? zweigInhalt()
                : leserModus === 'beitragen'
                  ? beitragenInhalt()
                  : leserModus === 'bearbeiten'
            ? h('div', { style: { display: 'flex', flexDirection: 'column', height: '100%' } },
              h('div', { style: { flex: 'none', marginBottom: '8px' } },
                h('div', { style: S.marke }, uebersetze('Was soll anders werden?')),
                h('div', {
                  style: { display: 'flex', gap: '6px', alignItems: 'center', marginTop: '3px' },
                },
                h('input', {
                  type: 'text',
                  style: { ...S.feld, flex: 1, width: 'auto', minWidth: 0 },
                  value: aenderung,
                  spellCheck: false,
                  disabled: !!(eingriff && eingriff.laeuft),
                  onChange: (ev) => setAenderung(ev.target.value),
                  onKeyDown: (ev) => {
                    if (ev.key === 'Enter') { ev.preventDefault(); ueberarbeiten(); }
                  },
                }),
                h('button', {
                  type: 'button',
                  style: {
                    ...S.klein,
                    flex: 'none',
                    ...(String(aenderung || '').trim() && !(eingriff && eingriff.laeuft)
                      ? {}
                      : { opacity: 0.45, cursor: 'default' }),
                  },
                  title: uebersetze('Das Modell schreibt eine neue Fassung in den Editor — gespeichert wird erst mit „Speichern“'),
                  disabled: !String(aenderung || '').trim() || !!(eingriff && eingriff.laeuft),
                  onClick: ueberarbeiten,
                }, eingriff && eingriff.laeuft && eingriff.art === 'ueberarbeitet'
                  ? uebersetze('Überarbeite …')
                  : uebersetze('Überarbeiten')))),
              // Ein fremdes Vorhaben wird nicht in seine Datei geschrieben:
              // „Beitragen“ führt zum Pull Request; die Notiz steht im
              // Formular, das Original bleibt unberührt.
              !leserDarfAendern
                ? h('div', {
                  style: {
                    flex: 'none', marginBottom: '8px', padding: '8px 10px',
                    borderRadius: '8px', border: '1px solid var(--dsw-alias-border-l1)',
                    background: 'color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent)',
                  },
                },
                h('div', { style: { ...S.sub, margin: '0 0 6px' } },
                  uebersetze('Du bearbeitest ein fremdes Vorhaben — „{0}“ von {1}. „Beitragen“ öffnet einen Pull Request; die Originaldatei bleibt unberührt.', [(leserVorhaben && leserVorhaben.name) || leser.vorhaben, (leserVorhaben && leserVorhaben.verantwortet) || 'jemand anderem'])),
                h('div', { style: S.feldTitel }, uebersetze('Notiz zum Beitrag')),
                h('textarea', {
                  style: { ...S.flaeche, minHeight: '46px', marginTop: '3px' },
                  value: leser.notiz || '',
                  spellCheck: false,
                  placeholder: uebersetze('Was soll der Verantwortliche wissen?'),
                  onChange: (ev) => setLeser({ ...leser, notiz: ev.target.value }),
                }))
                : null,
              // Der Stand war beim Speichern nicht mehr der neueste: nichts
              // wurde geschrieben. Der eigene Text bleibt stehen und lässt
              // sich als Pull Request anbieten; der neue Stand ist daneben
              // lesbar.
              leser.konflikt
                ? h('div', {
                  style: {
                    flex: 'none', marginBottom: '8px', padding: '8px 10px',
                    borderRadius: '8px', border: '1px solid var(--dsw-alias-border-l1)',
                    background: 'color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent)',
                  },
                },
                h('div', { style: { ...S.sub, margin: '0 0 6px' } },
                  uebersetze('Der Stand ist neuer — gespeichert wurde nichts. Dein Text steht weiter im Editor; die Datei im Vorhaben bleibt unverändert.')),
                h('details', { style: { marginBottom: '6px' } },
                  h('summary', { style: S.meta }, uebersetze('Den neuen Stand ansehen')),
                  h('pre', {
                    style: {
                      ...S.meta, whiteSpace: 'pre-wrap', maxHeight: '120px',
                      overflow: 'auto', margin: '4px 0 0',
                    },
                  }, leser.konflikt.text)),
                h('div', { style: S.feldTitel }, uebersetze('Notiz zum Beitrag')),
                h('textarea', {
                  style: { ...S.flaeche, minHeight: '46px', marginTop: '3px' },
                  value: leser.notiz || '',
                  spellCheck: false,
                  placeholder: uebersetze('Was soll beim Vorhaben ankommen?'),
                  onChange: (ev) => setLeser({ ...leser, notiz: ev.target.value }),
                }),
                h('div', { style: { ...S.knoepfe, marginTop: '6px' } },
                  h('button', {
                    type: 'button',
                    style: S.klein,
                    title: uebersetze('Den eigenen Text als Beitrag anlegen — die Datei im Vorhaben bleibt, wie sie ist'),
                    onClick: konfliktAlsBeitrag,
                  }, uebersetze('Eigenen Text als Beitrag anlegen')),
                  h('button', {
                    type: 'button', style: S.klein, onClick: konfliktNeuenStand,
                  }, uebersetze('Neuen Stand übernehmen'))))
                : null,
              eingriffText()
                ? h('div', {
                  style: {
                    ...S.hinweis,
                    marginBottom: '8px',
                    color: eingriff && eingriff.fehler
                      ? 'var(--dsw-alias-label-primary)'
                      : 'var(--dsw-alias-label-secondary)',
                  },
                }, eingriffText())
                : null,
              h('textarea', {
                style: { ...S.editor, flex: 1 },
                value: leser.text,
                spellCheck: false,
                readOnly: !!(eingriff && eingriff.laeuft),
                onChange: (e) => setLeser({ ...leser, text: e.target.value }),
              }))
            : h('div', null,
              leser.binaer
                ? h('p', { style: S.meta },
                  uebersetze('Keine Textdatei — hier wird nichts angezeigt.{0}', [leser.groesse
                    ? ' Sie ist ' + Math.max(1, Math.round(leser.groesse / 1024)) + ' KB groß.' : '']))
                : null,
              eingriff && !eingriff.laeuft && !eingriff.fehler
                && eingriff.original !== undefined && eingriff.original !== leser.text
                ? h('p', { style: { ...S.hinweis, margin: '0 0 12px' } },
                  uebersetze('Noch nicht gespeichert — dieser Stand kommt aus dem Bearbeiten und liegt nur im Leser. „Zurücknehmen“ verwirft ihn.'))
                : null,
              leser.binaer ? null : markdown(leser.text, oeffneLink)))})
        : null;

      // --- Chat --------------------------------------------------------------

      // Das Gespräch im rechten Dock. Es zeigt Fragen und Antworten —
      // dasselbe, was später im Transkript steht, nur während es entsteht.
      // Werkzeuge, Recherche und Zwischenschritte bleiben im Chat.
      function gespraechDockTeile() {
        const sekunden = gespraech.laeuft && gespraech.seit
          ? Math.max(0, Math.round((Date.now() - gespraech.seit) / 1000))
          : 0;
        const laufText = gespraech.laeuft
          ? (sekunden >= 2 ? 'arbeitet … ' + sekunden + ' s' : 'arbeitet …')
          : (gespraech.sendet ? 'sendet …' : '');
        const sendbar = !!String(gespraech.text || '').trim() && !gespraech.sendet && !gespraech.laeuft;
        // In der Werkstatt kann ein Skill entstanden sein: er steht im Ordner,
        // an der Station fehlt er noch. Solange nichts läuft, wird er angeboten.
        const neueSkills = gespraech.art === 'werkstatt' && !gespraech.laeuft && !gespraech.sendet
          ? skills.map((sk) => sk.name)
            .filter((name) => !(gespraech.vorher || []).includes(name))
          : [];

        return {
          titel: gespraech.art === 'werkstatt'
            ? uebersetze('Skill für „{0}“', [gespraech.titel || ''])
            : (gespraech.skill ? uebersetze('◆ {0}', [gespraech.skill]) : uebersetze('Gespräch')),
          untertitel: gespraech.art === 'werkstatt'
            ? uebersetze('Werkstatt dieser Station')
            : positionsName(gespraech.position),
          schliessenTitel: uebersetze('Spalte schließen — das Gespräch läuft im Chat weiter'),
          kopfRechts: gespraech.session
            ? h('button', {
              type: 'button',
              style: S.klein,
              title: uebersetze('Diese Sitzung im Chat öffnen'),
              onClick: () => chatOeffnen(gespraech.session),
            }, uebersetze('im Chat'))
            : null,

          kinder: h('div', {
            id: 'board-chat',
            ref: inhaltRef,
            onScroll: (ev) => {
              const el = ev.currentTarget;
              amEnde.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 12;
            },
            style: { ...S.gespraech, ...S.gespraechInhalt },
          },
            gespraech.eintraege.length
              ? gespraech.eintraege.map((eintrag, i) => h('div', {
                key: 'g' + i, style: S.gespraechBlock,
              },
              eintrag.rolle === 'user'
                ? h('div', { style: S.gespraechFrage }, eintrag.text)
                : h('div', { style: S.gespraechAntwort }, markdown(eintrag.text, oeffneLink))))
              : h('p', { style: S.meta },
                gespraech.sendet ? uebersetze('Wird gesendet …') : uebersetze('Noch nichts gesagt.')),
            neueSkills.length
              ? h('div', { style: S.gespraechNeu },
                h('div', { style: S.meta },
                  neueSkills.length === 1 ? uebersetze('Ein neuer Skill ist da:') : uebersetze('Neue Skills sind da:')),
                neueSkills.map((name) => h('button', {
                  key: name,
                  type: 'button',
                  style: S.klein,
                  title: uebersetze('Diesen Skill an der Station eintragen'),
                  onClick: () => skillEintragen(name),
                }, uebersetze('„{0}“ an der Station eintragen', [name]))))
              : null,
            laufText ? h('p', { style: S.meta }, laufText) : null,
            gespraech.fehler
              ? h('p', { style: { ...S.hinweis, color: farbe ? alsText(farbe) : 'var(--dsw-alias-label-secondary)' } },
                gespraech.fehler)
              : null),

          fuss: h('div', { style: S.gespraechFuss },
            h('div', {
              style: S.gespraechGriff,
              title: uebersetze('Ziehen: Eingabefeld größer oder kleiner'),
              onPointerDown: (ev) => {
                ev.preventDefault();
                const startY = ev.clientY;
                const startH = feldHoehe;
                const bewegen = (e) => {
                  // Genug Platz für das Gespräch darüber lassen, auch im kleinen Fenster.
                  const grenze = Math.max(80, Math.min(420, window.innerHeight - 240));
                  setFeldHoehe(Math.max(56, Math.min(grenze, startH - (e.clientY - startY))));
                };
                const loslassen = () => {
                  window.removeEventListener('pointermove', bewegen);
                  window.removeEventListener('pointerup', loslassen);
                };
                window.addEventListener('pointermove', bewegen);
                window.addEventListener('pointerup', loslassen);
              },
            }, h('span', { style: S.gespraechGriffStrich })),
            h('textarea', {
              style: { ...S.gespraechFeld, height: feldHoehe + 'px' },
              value: gespraech.text || '',
              placeholder: uebersetze('Antwort schreiben …'),
              spellCheck: false,
              onChange: (ev) => setGespraech({ ...gespraech, text: ev.target.value }),
              onKeyDown: (ev) => {
                if (ev.key === 'Enter' && !ev.shiftKey) {
                  ev.preventDefault();
                  gespraechSenden();
                }
              },
            }),
            h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } },
              h('button', {
                type: 'button',
                style: {
                  ...S.klein,
                  borderColor: farbe || 'var(--board-akzent, var(--dsw-alias-brand-primary))',
                  color: farbe ? alsText(farbe) : 'var(--board-akzent, var(--dsw-alias-brand-primary))',
                  fontWeight: 600,
                  ...(sendbar ? {} : { opacity: 0.45, cursor: 'default' }),
                },
                disabled: !sendbar,
                onClick: gespraechSenden,
              }, uebersetze('Senden')),
              gespraech.laeuft
                ? h('button', { type: 'button', style: S.klein, onClick: gespraechStoppen }, uebersetze('Stopp'))
                : null,
              h('span', { style: S.meta }, uebersetze('Enter sendet · Umschalt+Enter: neue Zeile'))),
            gespraech.session
              ? h('div', { style: { marginTop: '6px' } },
                gespraech.verwerfen
                  ? h('span', { style: S.meta }, uebersetze('Sitzung ins Archiv legen? '),
                    h('button', {
                      type: 'button', style: S.mini, onClick: gespraechVerwerfen,
                      'aria-label': uebersetze('Ja, die Sitzung ins Archiv legen'),
                    }, uebersetze('✓')),
                    ' ',
                    h('button', {
                      type: 'button',
                      style: S.mini,
                      onClick: () => setGespraech({ ...gespraech, verwerfen: false }),
                      'aria-label': uebersetze('Nein, die Sitzung behalten'),
                    }, uebersetze('✕')))
                  : h('button', {
                    type: 'button',
                    style: { ...S.mini, width: 'auto', padding: '0 5px', fontSize: '12px' },
                    title: uebersetze('Sitzung ins Archiv legen und die Spalte schließen'),
                    onClick: () => setGespraech({ ...gespraech, verwerfen: true }),
                  }, uebersetze('verwerfen')))
              : null),
        };
      }

      // Das eine rechte Dock: Station, Gespräch oder beide. Bei zwei offenen
      // Reitern entscheidet `rechtsAktiv`, sonst fällt die Reiterleiste weg
      // und der Kopf zeigt direkt den einen Inhalt. Gebaut wird nur der
      // aktive Inhalt — der andere Reiter lebt in seinem Zustand weiter.
      const rechtsDock = rechtsAktiv ? (() => {
        const beide = stationImDock && gespraechImDock;
        const teile = rechtsAktiv === 'station' ? stationDockTeile() : gespraechDockTeile();
        const reiterLeiste = beide ? h('div', {
          role: 'tablist',
          style: S.dockReiter,
          // Pfeiltasten wechseln den Reiter, Home/End springen an den Rand —
          // wie bei Reitern üblich. Der Fokus bleibt auf dem gewählten Knopf.
          onKeyDown: (ev) => {
            const reihenfolge = ['station', 'gespraech'];
            const jetzt = reihenfolge.indexOf(rechtsAktiv);
            let ziel = null;
            if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') {
              ziel = reihenfolge[(jetzt + 1) % reihenfolge.length];
            } else if (ev.key === 'Home') {
              ziel = reihenfolge[0];
            } else if (ev.key === 'End') {
              ziel = reihenfolge[reihenfolge.length - 1];
            }
            if (!ziel || ziel === rechtsAktiv) return;
            ev.preventDefault();
            setRechtsReiter(ziel);
            if (typeof window !== 'undefined'
              && typeof window.requestAnimationFrame === 'function') {
              window.requestAnimationFrame(() => {
                const knopf = document.getElementById('board-reiter-' + ziel);
                if (knopf && typeof knopf.focus === 'function') knopf.focus();
              });
            }
          },
        },
          h('button', {
            type: 'button',
            role: 'tab',
            id: 'board-reiter-station',
            'aria-selected': rechtsAktiv === 'station',
            tabIndex: rechtsAktiv === 'station' ? 0 : -1,
            style: {
              ...S.dockReiterKnopf,
              ...(rechtsAktiv === 'station' ? S.dockReiterAktiv : null),
            },
            onClick: () => setRechtsReiter('station'),
          }, uebersetze('Station')),
          h('button', {
            type: 'button',
            role: 'tab',
            id: 'board-reiter-gespraech',
            'aria-selected': rechtsAktiv === 'gespraech',
            tabIndex: rechtsAktiv === 'gespraech' ? 0 : -1,
            style: {
              ...S.dockReiterKnopf,
              ...(rechtsAktiv === 'gespraech' ? S.dockReiterAktiv : null),
            },
            onClick: () => setRechtsReiter('gespraech'),
          }, uebersetze('Gespräch'))) : null;
        return h(Panel, {
          key: 'board-rechts',
          // Die Station behält ihre Kennung `board-station` (der Sprung aus
          // der Suche findet sie); der Gesprächsreiter heißt im Panel
          // `board-gespraech`, der Inhalt darunter `board-chat`.
          ...(rechtsAktiv === 'station'
            ? { id: 'board-station' }
            : { id: 'board-gespraech' }),
          titel: teile.titel,
          untertitel: teile.untertitel,
          // Die Breite gehört dem ganzen Dock; der Griff links zieht es. Das
          // Fenster ist die Grenze, damit das Dock samt Griff nicht seitlich
          // überläuft: 133 px Reserve = 72 Schiene + 9 Griff + 2 × 26 Rand.
          seiteStil: S.dockRechts,
          seiteEigenschaften: {
            width: spaltenBreite + 'px',
            maxWidth: 'calc(100vw - 133px)',
          },
          kopfStil: S.gespraechKopf,
          titelStil: rechtsAktiv === 'station' ? S.dockTitel : S.gespraechTitel,
          schliessenStil: S.schliessen,
          schliessenTitel: teile.schliessenTitel,
          fokus: true,
          onSchliessen: rechtsSchliessen,
          kopfRechts: teile.kopfRechts,
          oben: reiterLeiste,
          kinder: teile.kinder,
          fuss: teile.fuss || null,
        });
      })() : null;

      const formatWarnung = formatHinweis(data.format, data.formatAblage);
      const boards = Array.isArray(data.boards) ? data.boards : [];
      // Das öffentliche Hauptboard wird beim Start geholt. Ging das nicht,
      // steht sein Eintrag mit dem Grund in der Liste; die Board-Leiste zeigt
      // dann die Zeile mit „Wiederholen“.
      const hauptboardFehlt = boards.find((b) => (b.art === 'hauptboard'
        || b.id === 'hauptboard')
        && String(b.fehler || '') === 'nicht geholt') || null;
      // Die Anzeige liest die Kennzahlen aus `GET /board/boards`; bis die
      // Antwort da ist, bleibt die schlanke Liste aus den Seitendaten stehen.
      const boardsAnzeige = boardAnzeige && Array.isArray(boardAnzeige.boards)
        ? boardAnzeige.boards
        : boards;
      const offenesBoard = boards.find((b) => b.aktiv) || null;
      const archiv = !!(offenesBoard && offenesBoard.archiv);
      // Ohne Schreibrecht sagt die Board-Leiste „Nur lesen“ und darunter den
      // Grund und den Weg. Beides kommt fertig aus `/board/data`; ein Archiv
      // trägt seinen eigenen Hinweis und bleibt hier außen vor.
      const nurLesen = !archiv && !!data && data.darf === false;
      const darfGrund = nurLesen ? String(data.darfGrund || '').trim() : '';
      const darfHinweis = nurLesen ? String(data.darfHinweis || '').trim() : '';
      // Die erste Sitzung ohne Schreibrecht: sichtbar, sobald ein Board offen
      // ist (`!data.leer`) und `darf` falsch ist. Der Hinweis hängt allein am
      // Schreibrecht — kein Merker, kein Schließen; ein Archiv bleibt außen
      // vor, wie die Nur-lesen-Zeile darüber.
      const ersteSitzung = !archiv && !data.leer && data.darf === false;
      const boardName = offenesBoard ? offenesBoard.name : 'Board';
      // Woher ein Board kommt: GitHub-Repo oder ein Ordner auf diesem Rechner.
      const boardHerkunft = (b) => {
        const adresse = String((b && b.remote) || '');
        if (!adresse) return 'lokal';
        const treffer = adresse.match(/github\.com[:/]([^/]+)\/(.+)$/);
        if (treffer) return treffer[1] + '/' + treffer[2].replace(/\.git$/, '');
        return adresse;
      };
      // Art und Form eines Boards für die Anzeige. Die alte Ablage kennt nur
      // „github“ und „ordner“; sie erscheint hier als lokales Board.
      const boardArt = (b) => (b.hauptboard
        ? 'Hauptboard'
        : (String(b.art) === 'team' ? 'Team' : 'lokal'));
      // Der Stand der Zeile in einem Wort, das er versteht. Fehlt eine Angabe
      // oder ließ sich das Board nicht lesen, steht hier nichts — der Grund
      // steht im Titel der Zeile.
      const boardStandWort = (b) => {
        if (String(b.fehler || '').trim()) return '';
        const stand = b.stand || {};
        const offen = Number(stand.nur_lokal) || 0;
        if (offen === 1) return uebersetze('1 Fassung nur hier');
        if (offen > 1) return uebersetze('{0} Fassungen nur hier', [offen]);
        if (stand.lage === 'kein remote') return uebersetze('kein Remote');
        if (stand.lage === 'nicht abgeglichen') return uebersetze('nicht abgeglichen');
        if (stand.lage === 'abgeglichen') return uebersetze('abgeglichen');
        return '';
      };
      // Besitzer und Stand in einer Zeile; was fehlt, lässt seinen Punkt weg.
      const boardZeileText = (b) => [b.besitzer || uebersetze('ohne Besitzer'), boardStandWort(b)]
        .filter(Boolean).join(' · ');
      const boardGrund = (b) => [
        b && b.repo ? 'Ordner: ' + b.repo : '',
        b && b.stand && b.stand.remote ? 'Remote: ' + b.stand.remote : '',
        b && b.fehler ? String(b.fehler) : '',
      ].filter(Boolean).join('\n');

      // Der Hinweis der ersten Sitzung: eine Zeile unter der Leiste und über
      // den Karten. Er ist kein schwebendes Feld über den Stationen und
      // scrollt nicht mit der Fläche weg — er steht in der Seite selbst.
      const ersteSitzungHinweis = !ersteSitzung ? null : h('div', {
        style: {
          flex: 'none', display: 'flex', flexDirection: 'column', gap: '8px',
          margin: '0 0 10px', padding: '8px 10px', borderRadius: '8px',
          border: '1px solid var(--dsw-alias-border-l1)',
          background: 'var(--dsw-alias-bg-layer-1)',
        },
      },
      h('div', {
        style: {
          display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
        },
      },
      h('span', { style: { fontSize: '13px', fontWeight: 600 } },
        uebersetze('Du liest mit')),
      h('span', {
        style: {
          flex: '1 1 300px', minWidth: 0, fontSize: '12px', lineHeight: 1.45,
          color: 'var(--dsw-alias-label-secondary)',
        },
      }, uebersetze('Dieses Board liegt auf GitHub. Ohne Token bleibt es beim Lesen; dein Token bleibt auf diesem Rechner.')),
      h('div', {
        // Die beiden Wege bleiben zusammen: bricht der Hinweis um, wandert
        // die Gruppe als Ganzes in die nächste Zeile.
        style: { display: 'flex', gap: '8px', flex: 'none' },
      },
      tokenWeg && tokenWeg.offen
        ? null
        : h(Knopf, {
          stil: S.klein,
          onClick: () => setTokenWeg({
            offen: true, token: '', laeuft: false, fehler: '',
          }),
        }, uebersetze('Token eintragen')),
      h(Knopf, {
        stil: S.klein,
        onClick: () => {
          // Der vorhandene Weg zum Anlegen: die Board-Liste mit dem Formular,
          // das `POST /board/boards` schickt.
          setBoardMeldung('');
          setBoardWeg(null);
          setBoardNeu({ name: '', adresse: '', laeuft: false, fehler: '' });
          setBoardOffen(true);
        },
      }, uebersetze('Eigenes Board')))),
      tokenWeg && tokenWeg.offen ? h('div', {
        style: {
          display: 'flex', flexDirection: 'column', gap: '6px', maxWidth: '520px',
        },
      },
      h(Feld, {
        id: 'board-token-erste-sitzung',
        label: 'Token (nur zum Schreiben nötig)',
        type: 'password',
        autoComplete: 'off',
        spellCheck: false,
        wert: tokenWeg.token,
        onEingabe: (ev) => setTokenWeg({
          ...tokenWeg, token: ev.target.value, fehler: '',
        }),
        stil: { width: '100%', boxSizing: 'border-box' },
      }),
      tokenWeg.fehler
        ? h(Meldung, { zustand: 'fehler', text: tokenWeg.fehler })
        : null,
      h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
        h(Knopf, {
          stil: S.klein,
          disabled: tokenWeg.laeuft,
          onClick: tokenSpeichern,
        }, uebersetze('Speichern')),
        h(Knopf, {
          stil: S.klein,
          disabled: tokenWeg.laeuft,
          onClick: () => setTokenWeg(null),
        }, uebersetze('Abbrechen')))) : null);

      // Die Statuszeile unter der Kopfzeile sammelt, was der Seite zu sagen
      // ist: die Meldung, das Schreibrecht mit Grund und Weg, den Abgleich,
      // Warnungen. Fehlt alles, bleibt sie weg und nimmt keinen Platz.
      const statusLuecken = sichtbarkeitsLuecken(data);
      // Ein Board ohne Remote braucht keine Zeile je Repository: das Etikett
      // „lokal“ steht schon am Namen. Gezeigt wird nur, was zu tun ist — ein
      // Fehler, eine Fassung nur hier, ein Abgleich, der nicht stattfand.
      const standSichtbar = Boolean(data.stand) && !(data.stand.lage === 'kein remote'
        && !(Number(data.stand.nur_lokal) > 0));
      const staendeSichtbar = (Array.isArray(data.staende) ? data.staende : [])
        .filter((eintrag) => eintrag && (eintrag.fehler || Number(eintrag.nur_lokal) > 0
          || (eintrag.lage && eintrag.lage !== 'abgeglichen'
            && eintrag.lage !== 'kein remote')));
      const statusZeile = status || nurLesen || standSichtbar
        || staendeSichtbar.length
        || formatWarnung || statusLuecken.length
        ? h('div', { style: S.statusZeile },
          status
            ? h(Meldung, {
              zustand: status.art,
              text: status.text,
              style: S.sub,
            })
            : null,
          nurLesen
            ? h('div', { style: { ...S.boardHinweis, margin: 0 } },
              uebersetze('Nur lesen: {0}', [darfGrund
                ? uebersetze(darfGrund) : uebersetze('Für dieses Board fehlt das Schreibrecht.')]),
              darfHinweis
                ? h('span', { style: { display: 'block' } }, uebersetze(darfHinweis))
                : null)
            : null,
          standSichtbar
            ? h('p', { style: { ...S.sub, margin: 0 } }, standZeile(data.stand))
            : null,
          // Fassung 2 besteht aus vielen Repositories: nur die, bei denen es
          // etwas zu sagen gibt. Fassung 1 kennt `staende` nicht und bleibt
          // bei der einen Zusammenfassung.
          staendeSichtbar.length
            ? staendeSichtbar.map((eintrag, i) => h('p', {
              key: eintrag.pfad || ('stand-' + i),
              style: { ...S.sub, margin: 0 },
              title: [eintrag.pfad, eintrag.fehler].filter(Boolean).join('\n'),
            }, repoStandZeile(eintrag)))
            : null,
          formatWarnung
            ? h('p', { style: S.formatWarnung }, formatWarnung)
            : null,
          // Ein öffentliches Ding verweist auf ein privates: die Zeile steht
          // am Board, damit sie nicht in der Bibliothek allein hängt.
          statusLuecken.map((eintrag, i) => h('p', {
            key: 'sichtbarkeit-' + i,
            style: S.sichtbarkeitWarnung,
          }, sichtbarkeitsZeile(eintrag))))
        : null;

      return h('div', {
        style: S.page,
        className: 'board-seite',
        'data-board-akzent': akzent,
        ...(rtl ? { dir: 'rtl' } : null),
      },
        h('div', { style: S.kopfFest },
          h('div', { style: S.kopfZeile },
            h('div', { style: S.kopfLinks },
              h('div', { style: S.boardLeiste },
                h('button', {
                  type: 'button',
                  style: S.boardWahl,
                  title: uebersetze('Boards wechseln oder eines hinzufügen'),
                  onClick: () => { setBoardOffen(!boardOffen); setBoardWeg(null); },
                },
                h('span', {
                  style: {
                    ...S.personPunkt,
                    background: 'var(--board-akzent, var(--dsw-alias-brand-primary))',
                  },
                }),
                boardName,
                archiv
                  ? h('span', {
                    style: {
                      ...S.boardMeta,
                      padding: '1px 6px',
                      borderRadius: '999px',
                      border: '1px solid var(--dsw-alias-border-l2)',
                    },
                    title: uebersetze('Die alte Ablage ist Archiv: lesen ja, schreiben nein'),
                  }, uebersetze('Nur lesen'))
                  : null,
                nurLesen
                  ? h('span', {
                    style: {
                      ...S.boardMeta,
                      padding: '1px 6px',
                      borderRadius: '999px',
                      border: '1px solid var(--dsw-alias-border-l2)',
                    },
                    title: darfGrund ? uebersetze(darfGrund) : uebersetze('Für dieses Board fehlt das Schreibrecht'),
                  }, uebersetze('Nur lesen'))
                  : null,
                h('span', { style: { opacity: 0.6, fontSize: '12px' } }, uebersetze('▾'))),
                offenesBoard
                  ? h('span', { style: S.boardMeta }, boardHerkunft(offenesBoard))
                  : null,
                hauptboardFehlt
                  ? h('div', { style: S.hauptboardFehlt },
                    h('span', null, uebersetze('Hauptboard nicht geholt')),
                    h('button', {
                      type: 'button',
                      style: S.klein,
                      disabled: hauptboardLaeuft,
                      title: uebersetze('Das Hauptboard erneut von seinem Repository holen'),
                      onClick: hauptboardWiederholen,
                    }, hauptboardLaeuft ? uebersetze('Einen Moment …') : uebersetze('Wiederholen')),
                    hauptboardMeldung
                      ? h('span', { style: S.boardFehler }, hauptboardMeldung)
                      : null)
                  : null,
                boardOffen
                  ? h(Panel, {
                    id: 'board-liste',
                    titel: uebersetze('Deine Boards'),
                    seiteStil: S.boardPanel,
                    kopfStil: S.boardKopf,
                    titelStil: S.boardAnzeigeTitel,
                    schliessenStil: S.schliessen,
                    fokus: true,
                    onSchliessen: () => setBoardOffen(false),
                    kinder: [
                    boardLaedt && !boardAnzeige
                      ? h('p', { style: S.boardHinweis }, uebersetze('Boards werden geladen …'))
                      : null,
                    boardsAnzeige.map((b) => h('div', {
                      key: b.id,
                      style: {
                        ...S.boardZeile,
                        ...(b.aktiv ? S.boardZeileAktiv : null),
                      },
                    },
                    h('div', { style: S.boardKopf },
                      h('span', {
                        style: {
                          ...S.personPunkt,
                          background: b.aktiv
                            ? 'var(--board-akzent, var(--dsw-alias-brand-primary))'
                            : 'var(--dsw-alias-border-l2)',
                        },
                      }),
                      h('span', { style: S.boardName, title: b.name }, b.name),
                      h('span', { style: S.boardArt },
                        uebersetze('{0} · {1}', [boardArt(b), sichtbarkeitsWort(b.sichtbarkeit)])),
                      h('div', { style: S.boardKnoepfe },
                        b.aktiv
                          ? h('span', { style: S.boardMeta }, uebersetze('offen'))
                          : h('button', {
                            type: 'button',
                            style: S.klein,
                            disabled: Boolean(boardWechselt),
                            title: uebersetze('Dieses Board öffnen'),
                            onClick: () => boardWechseln(b.id),
                          }, boardWechselt === b.id ? uebersetze('Öffnet …') : uebersetze('Öffnen')),
                        h('button', {
                          type: 'button',
                          style: S.klein,
                          title: uebersetze('Adresse kopieren: Remote oder Ordner'),
                          onClick: () => boardAdresseKopieren(b),
                        }, uebersetze('Adresse')),
                        // Veröffentlichen legt die Repositories an, setzt die
                        // Remotes und schickt sie. Ohne Token zeigt der Knopf
                        // die Befehle zum Kopieren.
                        b.format === 2
                          ? h('button', {
                            type: 'button',
                            style: S.klein,
                            title: uebersetze('Die Repositories dieses Boards unter der Organisation anlegen und schicken'),
                            onClick: () => boardVeroeffentlichen(b),
                          }, uebersetze('Veröffentlichen'))
                          : null,
                        // Nehmen lässt sich nur ein Board, das weder das
                        // Hauptboard noch gerade offen ist.
                        b.hauptboard === false && !b.aktiv
                          ? (boardWeg === b.id
                            ? h('button', {
                              type: 'button',
                              style: S.klein,
                              title: uebersetze('Nur aus der Liste nehmen; die Dateien bleiben liegen'),
                              onClick: () => boardEntfernen(b.id),
                            }, uebersetze('wirklich?'))
                            : h('button', {
                              type: 'button',
                              style: S.klein,
                              title: uebersetze('Nur aus der Liste nehmen; die Dateien bleiben liegen'), 'aria-label': uebersetze('Nur aus der Liste nehmen; die Dateien bleiben liegen'),
                              onClick: () => setBoardWeg(b.id),
                            }, uebersetze('×')))
                          : null)),
                    h('div', { style: S.boardZeileMeta, title: boardGrund(b) },
                      boardZeileText(b)),
                    // Ohne Token: die Befehle, die die Remotes von Hand
                    // anlegen. Sie stehen an ihrem Board und lassen sich
                    // kopieren.
                    veroeffentlichen && veroeffentlichen.id === b.id
                      ? h('div', { style: S.boardForm },
                        h('p', { style: S.boardHinweis },
                          uebersetze('Kein Token: die Befehle legen die Remotes von Hand an{0}.', [veroeffentlichen.organisation
                            ? ' (Organisation ' + veroeffentlichen.organisation + ')'
                            : ''])),
                        h('pre', { style: S.befehle },
                          veroeffentlichen.befehle.join('\n')),
                        veroeffentlichen.ausgelassen
                          && veroeffentlichen.ausgelassen.length
                          ? h('p', { style: S.boardHinweis },
                            uebersetze('Ausgelassen: {0} — {1}.', [veroeffentlichen.ausgelassen
                              .map((eintrag) => eintrag.repo).join(', '), veroeffentlichen.ausgelassen[0].grund
                              || 'gehört nicht zu diesem Board']))
                          : null,
                        h('div', { style: S.startReihe },
                          h('button', {
                            type: 'button',
                            style: S.klein,
                            onClick: () => {
                              kopiereText(veroeffentlichen.befehle.join('\n'))
                                .then(() => setBoardMeldung(uebersetze('Befehle kopiert.')))
                                .catch(() => setBoardMeldung(uebersetze('Kopieren nicht möglich.')));
                            },
                          }, uebersetze('Befehle kopieren')),
                          h(Knopf, {
                            symbol: 'Schließen',
                            stil: S.klein,
                            onClick: () => setVeroeffentlichen(null),
                          })))
                      : null)),
                    boardMeldung
                      ? h('p', { style: { ...S.boardFehler, padding: '4px 6px' } }, boardMeldung)
                      : null,
                    h('div', { style: S.boardTrenner }),
                    !archiv && boardNeu
                      ? h('div', { style: S.boardForm },
                        h('span', { style: S.startMarke }, uebersetze('Board hinzufügen')),
                        h('input', {
                          style: { ...S.input, width: '100%' },
                          value: boardNeu.name,
                          placeholder: uebersetze('Name des Boards'),
                          autoFocus: true,
                          onChange: (ev) => setBoardNeu({
                            ...boardNeu, name: ev.target.value, fehler: '',
                          }),
                        }),
                        h('input', {
                          style: { ...S.input, width: '100%' },
                          value: boardNeu.adresse,
                          placeholder: uebersetze('GitHub-Adresse oder Ordner'),
                          onChange: (ev) => setBoardNeu({
                            ...boardNeu, adresse: ev.target.value, fehler: '',
                          }),
                        }),
                        h('p', { style: S.boardHinweis },
                          uebersetze('Adresse leer lassen: es entsteht ein neues Board auf diesem Rechner.')),
                        boardNeu.fehler
                          ? h('p', { style: S.boardFehler }, boardNeu.fehler)
                          : null,
                        h('div', { style: S.startReihe },
                          h('button', {
                            type: 'button',
                            style: S.startZweit,
                            disabled: boardNeu.laeuft,
                            onClick: boardVerbinden,
                          }, boardNeu.laeuft ? uebersetze('Einen Moment …') : uebersetze('Verbinden')),
                          h('button', {
                            type: 'button',
                            style: S.startZweit,
                            onClick: () => setBoardNeu(null),
                          }, uebersetze('Abbrechen'))))
                      : archiv
                        ? null
                        : h('button', {
                          type: 'button',
                          style: {
                            ...S.boardEintrag,
                            color: 'var(--dsw-alias-label-secondary)',
                          },
                          onClick: () => {
                            setBoardNeu({ name: '', adresse: '', laeuft: false, fehler: '' });
                            setBoardMeldung('');
                          },
                        }, uebersetze('+ Board hinzufügen')),
                    h('div', { style: S.boardTrenner }),
                    h('p', { style: S.boardHinweis },
                      uebersetze('Identität und GitHub stehen in den Einstellungen.')),
                    ],
                  })
                  : null)),
            h('div', { style: S.trenner }),
            // In der Mitte der Titel; die Dateien des Vorhabens stehen am
            // Ende dieser Gruppe, damit sie nicht mit ihm um die Breite ringen.
            h('div', { style: S.kopfMitte },
              h('div', { style: S.kopfTitel },
                (eigenerWorkflow(data) || {}).titel || PRODUKT_NAME),
              gewaehltesVorhaben
                ? h('button', {
                  type: 'button',
                  style: { ...S.klein, flex: 'none', marginInlineStart: 'auto' },
                  title: uebersetze('Alle Dateien dieses Vorhabens'),
                  onClick: () => dateienOeffnen(''),
                }, uebersetze('Dateien'))
                : null),
            h('div', { style: S.trenner }),
            // Rechts die Menschen am Board als Chip-Reihe, danach die
            // Werkzeuge der Fläche. Den Gruppennamen der Menschen trägt das
            // `aria-label`; eine Überschrift nimmt keine Höhe mehr.
            h('div', { style: S.kopfRechts },
              personen.length
                ? h('div', {
                  style: S.mitglieder,
                  role: 'group',
                  'aria-label': uebersetze('Am Board'),
                },
                personen.map((p) => h('button', {
                  key: p.id,
                  type: 'button',
                  style: {
                    ...S.person,
                    borderColor: p.farbe + '66',
                    ...(p.ich ? { background: p.farbe + '13' } : null),
                  },
                  title: p.ich
                    ? uebersetze('Dein Name und deine Farbe')
                    : uebersetze('Name und Farbe von {0}', [p.name || 'dieser Person']),
                  onClick: () => {
                    statusWeg();
                    setPersonEdit(personEdit && personEdit.id === p.id
                      ? null
                      : { id: p.id, name: p.name, farbe: p.farbe, github: p.github || '' });
                  },
                },
                h('span', { style: { ...S.personPunkt, background: p.farbe } }),
                p.name || (p.ich ? uebersetze('Du') : uebersetze('ohne Namen')))))
                : null,
              stationsFeld,
              allesZeigenKnopf)),
          statusZeile,
          // Die lange Bedienanleitung steht nur, solange die Fläche leer ist.
          // Sobald eine Karte da ist, wäre sie eine Dauerzeile ohne Nutzen.
          karten.length === 0
            ? h('p', { style: { ...S.sub, marginTop: '6px' } },
              uebersetze('Klick auf ein Vorhaben zeigt seine Dateien und die Skills, die es durchlaufen hat. Ziehen verschiebt es. Datei anklicken: Dokument unten. Skill anklicken: Transkript. Station anklicken: öffnen. Bibliothek oben aufklappen: Stationen auf die Fläche ziehen.'))
            : null),
        personEdit
          ? h('div', { style: { ...S.personPanel, marginBottom: '12px' } },
            h('span', { style: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary)' } }, uebersetze('Name')),
            h('input', {
              style: { ...S.input, width: '180px' },
              value: personEdit.name,
              placeholder: uebersetze('Dein Name'),
              autoFocus: true,
              onChange: (ev) => setPersonEdit({ ...personEdit, name: ev.target.value }),
              onKeyDown: (ev) => {
                if (ev.key === 'Enter') { ev.preventDefault(); personAendern(); }
                if (ev.key === 'Escape') { ev.preventDefault(); setPersonEdit(null); }
              },
            }),
            ich && personEdit.id === ich.id
              ? h('span', { style: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary)' } }, uebersetze('GitHub'))
              : null,
            ich && personEdit.id === ich.id
              ? h('input', {
                style: { ...S.input, width: '140px' },
                value: personEdit.github || '',
                placeholder: uebersetze('dein-name'),
                title: uebersetze('Dein Name auf GitHub — damit dich öffentliche Boards wiederfinden'),
                onChange: (ev) => setPersonEdit({ ...personEdit, github: ev.target.value }),
                onKeyDown: (ev) => {
                  if (ev.key === 'Enter') { ev.preventDefault(); personAendern(); }
                  if (ev.key === 'Escape') { ev.preventDefault(); setPersonEdit(null); }
                },
              })
              : null,
            h('span', { style: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary)' } }, uebersetze('Farbe')),
            h('div', { style: S.farbGitter },
              FARBEN_ALLE.map((f) => h('button', {
                key: f,
                type: 'button',
                title: farbName(f),
                style: {
                  ...S.farbPunkt,
                  background: f,
                  borderColor: personEdit.farbe === f
                    ? 'var(--dsw-alias-label-primary)'
                    : 'transparent',
                },
                onClick: () => setPersonEdit({ ...personEdit, farbe: f }),
              }))),
            h('span', { style: { flex: 1 } }),
            h('button', { type: 'button', style: S.klein, onClick: personAendern }, uebersetze('Speichern')),
            h('button', {
              type: 'button', style: S.klein, onClick: () => setPersonEdit(null),
            }, uebersetze('Abbrechen')))
          : null,
        ersteSitzungHinweis,
        // Der Körper: erst die Schiene, dann das offene Dock, der Rest gehört
        // der Fläche. Das Dock nimmt Breite, nicht Höhe — die Fläche bleibt
        // gleich hoch, ob es offen ist oder nicht.
        h('div', { style: S.koerper },
          schiene,
          dock,
          h('div', {
            ref: raumRef,
            style: {
              flex: 1, minWidth: 0, minHeight: 0, gap: '16px', position: 'relative',
              display: 'flex', flexDirection: 'row',
            },
          },
          // Board und Leser teilen sich den Platz links vom rechten Dock:
          // untereinander („unten") oder nebeneinander („rechts"). Das Dock
          // steht außerhalb dieses Raums und bleibt daneben — auch dann, wenn
          // der Leser unten liegt. Die Dateien stehen ganz links; sie gehören
          // zum Vorhaben, nicht zu einer Station.
          dateienPanel,
          h('div', {
            style: {
              flex: 1, minWidth: 0, minHeight: 0, display: 'flex', gap: '16px',
              flexDirection: lage === 'unten' ? 'column' : 'row',
            },
          },
          h('div', { style: { flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' } },
            // Was gerade gefragt ist, steht über der Fläche, nicht in ihr: die
            // Fläche wird geschoben, und was in ihr steht, kann dabei aus dem
            // Blick geraten — die Rückfrage soll immer zu sehen sein.
            verschiebenPanel,
            kantePanel,
            h('div', {
              ref: flaecheRef,
              onScroll: (ev) => {
                const el = ev.currentTarget;
                gemerkt.scroll.links = el.scrollLeft;
                gemerkt.scroll.oben = el.scrollTop;
              },
              style: { flex: 1, minWidth: 0, minHeight: 0, overflow: 'auto' },
            },
            // Die eigene Fläche liegt wie die fremden in einer Karte mit Kopf,
            // Rand und Radius; darin steht das Brett mit eigenem Ton.
            h('div', { style: S.eigeneFlaeche },
              eigenerKopf,
              flaeche),
            neuesVorhaben,
            fremdeFlaechen)),
          leserPanel),
          leserZiehen ? h('div', {
            style: { position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5 },
          },
          h('div', { style: zielFeld('unten', { left: 0, right: 0, bottom: 0, height: '30%' }) }, uebersetze('Unten')),
          h('div', {
            style: zielFeld('rechts', { top: 0, right: 0, bottom: '30%', width: '30%' }),
          }, uebersetze('Rechts'))) : null),
          // Der eine Breitengriff am linken Rand des rechten Docks. Er zieht
          // Dock und Inhalt gemeinsam; einen eigenen Griff der Chatspalte gibt
          // es nicht mehr. Das Dock steht nach dem `raum` im Körper, wie die
          // Schiene und das linke Dock davor.
          rechtsDock ? h('div', {
            style: S.dockBreiteGriff,
            title: uebersetze('Ziehen: Gesprächsspalte breiter oder schmaler'),
            onPointerDown: (ev) => {
              ev.preventDefault();
              const startX = ev.clientX;
              const startB = spaltenBreite;
              zeigerFest('col-resize');
              // Einmal je Bild reicht: sonst baut sich die Seite bei jeder
              // Zeigerbewegung neu auf.
              const setzen = jeFrame((breite) => setSpaltenBreite(breite));
              const bewegen = (e) => {
                // Dem Board bleibt immer Platz; das Dock wird höchstens so
                // breit, wie das Fenster es zulässt (133 px = 72 px Schiene
                // + 9 px Griff + 2 × 26 px Seitenrand).
                const grenze = Math.max(300, Math.min(
                  window.innerWidth - 520, window.innerWidth - 133,
                ));
                setzen(Math.max(300, Math.min(grenze, startB - (e.clientX - startX))));
              };
              const loslassen = () => {
                window.removeEventListener('pointermove', bewegen);
                window.removeEventListener('pointerup', loslassen);
                zeigerFest(null);
              };
              window.addEventListener('pointermove', bewegen);
              window.addEventListener('pointerup', loslassen);
            },
          }, h('span', { style: S.dockBreiteStrich })) : null,
          rechtsDock));
    }

    // Fängt einen Absturz der Ansicht ab. Der Harness lässt bei einem Fehler
    // nur eine leere Fläche stehen; hier steht dann, was passiert ist, mit
    // einem Knopf zum erneuten Versuch.
    class Falle extends React.Component {
      constructor(eigenschaften) {
        super(eigenschaften);
        this.state = { fehler: null };
      }

      static getDerivedStateFromError(fehler) {
        return { fehler };
      }

      componentDidCatch(fehler) {
        console.error('[board] Ansicht abgestürzt:', fehler);
      }

      render() {
        if (this.state.fehler) {
          return h('div', { style: S.page },
            h('div', { style: S.title }, PRODUKT_NAME),
            h('p', { style: S.sub }, uebersetze('Die Ansicht ist abgestürzt: {0}', [String((this.state.fehler && this.state.fehler.message) || this.state.fehler)])),
            h('button', {
              type: 'button',
              style: S.button,
              onClick: () => this.setState({ fehler: null }),
            }, uebersetze('Nochmal')));
        }
        return this.props.children;
      }
    }

    // --- Slots und apply ---------------------------------------------------

    return {
      inject: ['slots', 'locale'],
      /** Hängt die Seite in die Slots des Dashboards und meldet die Sprachen an. */
      apply(ctx) {
        function BoardIcon({ size }) {
          const kante = size || 16;
          return h('svg', {
            width: kante, height: kante, viewBox: '0 0 16 16', fill: 'none',
            stroke: 'currentColor', strokeWidth: 1.2, strokeLinejoin: 'round',
            'aria-hidden': 'true', focusable: 'false',
          },
          h('rect', { x: 1.9, y: 2.6, width: 3.5, height: 10.2, rx: 1 }),
          h('rect', { x: 6.25, y: 2.6, width: 3.5, height: 6.8, rx: 1 }),
          h('rect', { x: 10.6, y: 2.6, width: 3.5, height: 8.6, rx: 1 }));
        }

        // Die Sprache des Dashboards: die Texte des Boards folgen ihr. Ohne
        // Sprachdienst bleibt es beim deutschen Ausgangstext.
        const spracheSetzen = (id) => { sprache.lade(id).catch(() => {}); };
        const ersteSprache = ctx.locale && ctx.locale.getSnapshot
          ? (ctx.locale.getSnapshot().active || 'de')
          : 'de';
        spracheSetzen(ersteSprache);
        if (ctx.locale && ctx.on) {
          ctx.effect(() => ctx.on('locale/change', (snap) => {
            spracheSetzen((snap && snap.active) || 'de');
          }));
        }
        // Deutsch ist die Ausgangssprache des Boards: die Texte selbst sind
        // deutsch, es braucht kein Wörterbuch. Die Sprache erscheint damit im
        // Umschalter des Dashboards; die übrigen kommen mit ihren Texten.
        if (ctx.locale && ctx.locale.addLanguage) {
          const angebot = [
            { id: 'de', label: 'Deutsch' },
            { id: 'es', label: 'Español' },
            { id: 'fr', label: 'Français' },
            { id: 'ru', label: 'Русский' },
            { id: 'ja', label: '日本語' },
            { id: 'ar', label: 'العربية' },
          ];
          ctx.effect(() => {
            const abmelden = [];
            for (const eintrag of angebot) {
              try {
                const ab = ctx.locale.addLanguage({ ...eintrag, fallback: 'en' });
                if (typeof ab === 'function') abmelden.push(ab);
              } catch {
                // Eine andere Ergänzung hat die Sprache schon angemeldet: das
                // ist kein Grund, das Board nicht zu zeigen.
              }
            }
            return () => { for (const ab of abmelden) ab(); };
          });
        }

        // Die Akzentfarbe braucht zwei Werte — einen für den hellen, einen
        // für den dunklen Modus. Das Merkmal am Element wählt das Paar, ohne
        // dass die Seite das Farbschema lesen muss.
        ctx.effect(() => {
          if (typeof document === 'undefined') return undefined;
          const stil = document.createElement('style');
          stil.dataset.board = 'akzent';
          stil.textContent = AKZENT_STIL;
          document.head.appendChild(stil);
          return () => stil.remove();
        });

        const Seite = () => BoardPage(ctx);
        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main', key: 'board',
        }, () => h(Falle, null, h(Seite))));

        // Die Einstellungen des Boards stehen im Einstellungsfenster des
        // Dashboards — dort, wo Menschen sie heute suchen.
        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section', id: 'board', order: 40,
          label: () => PRODUKT_NAME,
        }, () => h(Falle, null, h(BoardEinstellungen))));

        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist', id: 'board', order: 5, label: PRODUKT_NAME,
        }, BoardIcon));
      },
    };
  },
});
