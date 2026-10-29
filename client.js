/**
 * Client-Hälfte des Board-Plugins.
 *
 * Spalten sind Positionen. In einer Spalte stehen die Vorhaben, die gerade
 * an dieser Position sind — die Position selbst zeigt den Stand.
 *
 * Wird ein Vorhaben angeklickt, erscheinen seine Dateien direkt auf dem Board,
 * in der Spalte, in der sie entstanden sind, in seiner Farbe. Gezeigt wird nur,
 * was im Ordner des Vorhabens liegt; ein Skill erscheint nur, wenn zu ihm ein
 * Transkript da ist, und öffnet dann das Gespräch der Sitzung.
 *
 *   + in der Kopfzeile  → Position an dieser Stelle einfügen (Workflow ändern)
 *   + in der Fußzeile   → neues Vorhaben, beginnt an der ersten Position
 *   Klick auf den Spaltennamen → der Schritt selbst (Inhalt, Dateien, Wie)
 *   Klick auf ein Vorhaben     → hervorheben, Dateien einblenden
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-board',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

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
          : d.toLocaleString('de-DE', {
            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
          });
        teile.push('zuletzt abgeglichen ' + zeit);
      } else if (stand.lage === 'kein remote') {
        teile.push('nicht abgeglichen — kein Remote');
      } else {
        teile.push('nicht abgeglichen');
      }
      const offen = Number(stand.nur_lokal) || 0;
      if (offen > 0) {
        teile.push(offen + (offen === 1 ? ' Fassung nur hier' : ' Fassungen nur hier'));
      }
      return teile.join(' · ');
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
        return 'Die Ablage ist neuer: Format ' + formatAblage
          + ', dieses Board kennt Format ' + format
          + '. Dieses Board schreibt nicht, bis es aktualisiert ist.';
      }
      if (Number(formatAblage) < Number(format)) {
        return 'Die Ablage ist älter: Format ' + formatAblage
          + ', dieses Board schreibt Format ' + format
          + '. Die Ablage braucht den Umzug.';
      }
      return '';
    }

    // Während eines Zuges bleibt der Zeiger, was er ist. Ohne das springt er
    // über Knöpfen und Chips um, sobald die Kiste unter ihm wegrutscht. Der
    // Stil hängt an einer festen Kennung, nicht an einer Variablen — ein
    // Neuzeichnen darf ihn nicht verlieren.
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

    const S = {
      page: {
        padding: '22px 26px', height: '100%', boxSizing: 'border-box',
        color: 'var(--dsw-alias-label-primary)',
        display: 'flex', flexDirection: 'column',
      },
      kopfFest: { flex: 'none', marginBottom: '14px' },
      // Kopfzeile: links Titel und Hinweis, rechts die Menschen am Board.
      kopf: { display: 'flex', gap: '18px', alignItems: 'flex-start' },
      kopfText: { flex: 1, minWidth: 0 },
      mitglieder: { flex: 'none', display: 'flex', flexDirection: 'column', gap: '5px', alignItems: 'flex-end' },
      mitgliederTitel: {
        fontSize: '10px', letterSpacing: '0.05em', textTransform: 'uppercase',
        color: 'var(--dsw-alias-label-secondary)', opacity: 0.85,
      },
      mitgliederReihe: { display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' },
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
      flaechenKopf: {
        display: 'flex', alignItems: 'center', gap: '7px', margin: '0 0 8px',
        fontSize: '13px',
      },
      flaechenName: { fontWeight: 600 },
      fremdFlaeche: {
        marginTop: '26px', boxSizing: 'border-box', borderRadius: '12px',
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'rgba(127, 127, 127, 0.04)', padding: '14px 16px 18px',
      },
      fremdKopf: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' },
      fremdName: { fontSize: '16px', fontWeight: 600 },
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
        width: '240px', boxSizing: 'border-box', borderRadius: '10px',
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-1)', overflow: 'hidden',
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.06)',
      },
      fremdKarteKopf: {
        display: 'block', width: '100%', boxSizing: 'border-box', textAlign: 'left',
        fontFamily: 'inherit', fontSize: '13px', fontWeight: 600, lineHeight: '1.35',
        padding: '8px 10px', border: 'none', background: 'rgba(127, 127, 127, 0.08)',
        color: 'var(--dsw-alias-label-primary)', cursor: 'pointer',
        borderBottom: '1px solid var(--dsw-alias-border-l1)',
      },
      fremdKarteKoerper: {
        display: 'flex', flexDirection: 'column', gap: '6px', padding: '8px 10px',
      },
      fremdKarteFuss: { fontSize: '11px', color: 'var(--dsw-alias-label-secondary)' },
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
        marginTop: '6px', padding: '6px 9px', borderRadius: '7px',
        border: '1px dashed var(--dsw-alias-border-l2)',
        background: 'rgba(127, 127, 127, 0.04)', fontFamily: 'inherit',
        color: 'var(--dsw-alias-label-primary)', cursor: 'pointer',
      },
      beitragKopf: { fontSize: '11px', fontWeight: 600 },
      beitragNotiz: {
        marginTop: '2px', fontSize: '11px', lineHeight: 1.35,
        color: 'var(--dsw-alias-label-secondary)', overflow: 'hidden',
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
      },
      beitragDateien: {
        marginTop: '2px', fontSize: '10px', lineHeight: 1.35,
        color: 'var(--dsw-alias-label-secondary)',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      },
      beitragInhalt: { fontSize: '13px', lineHeight: 1.6, whiteSpace: 'pre-wrap' },
      personPanel: {
        marginTop: '10px', padding: '10px 12px', borderRadius: '10px',
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-1)',
        display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap',
      },
      farbReihe: { display: 'flex', gap: '5px', alignItems: 'center' },
      farbGitter: {
        display: 'grid', gridTemplateColumns: 'repeat(10, 16px)', gap: '4px',
        alignItems: 'center',
      },
      projektForm: {
        margin: '0 0 6px', padding: '8px', borderRadius: '8px',
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'rgba(127, 127, 127, 0.07)',
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
        gap: '8px', marginBottom: '2px',
      },
      boardWahl: {
        display: 'inline-flex', alignItems: 'center', gap: '6px',
        fontSize: '12px', fontFamily: 'inherit', padding: '3px 9px',
        borderRadius: '999px', border: '1px solid var(--dsw-alias-border-l1)',
        background: 'transparent', color: 'var(--dsw-alias-label-primary)', cursor: 'pointer',
      },
      boardPanel: {
        position: 'absolute', top: '100%', left: 0, marginTop: '6px', zIndex: 30,
        width: '320px', maxWidth: 'calc(100vw - 60px)', padding: '7px',
        borderRadius: '10px', border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-1)',
        boxShadow: '0 10px 28px rgba(0, 0, 0, 0.28)',
      },
      boardEintrag: {
        display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
        padding: '6px 8px', borderRadius: '6px', border: '1px solid transparent',
        background: 'transparent', color: 'var(--dsw-alias-label-primary)',
        fontFamily: 'inherit', fontSize: '12px', textAlign: 'left', cursor: 'pointer',
      },
      boardMeta: {
        marginLeft: 'auto', fontSize: '10px',
        color: 'var(--dsw-alias-label-secondary)', whiteSpace: 'nowrap',
      },
      boardTrenner: {
        margin: '6px 0', borderTop: '1px solid var(--dsw-alias-border-l1)',
      },
      boardForm: {
        display: 'flex', flexDirection: 'column', gap: '6px', padding: '6px 4px 2px',
      },
      boardHinweis: {
        margin: 0, fontSize: '11px', lineHeight: 1.45,
        color: 'var(--dsw-alias-label-secondary)',
      },
      boardFehler: { margin: 0, fontSize: '11px', lineHeight: 1.4, color: '#f85149' },
      // Die Seite ohne Board: Identität eintragen, dann das erste Board.
      startSeite: {
        height: '100%', overflow: 'auto', boxSizing: 'border-box',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '28px',
        color: 'var(--dsw-alias-label-primary)',
      },
      startKarte: {
        width: '100%', maxWidth: '540px', padding: '24px 26px',
        borderRadius: '14px', border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-1)',
      },
      startTitel: { fontSize: '22px', fontWeight: 600, margin: '0 0 6px' },
      startText: {
        margin: '0 0 18px', fontSize: '13px', lineHeight: 1.6,
        color: 'var(--dsw-alias-label-secondary)',
      },
      startFeld: { display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '12px' },
      startMarke: {
        fontSize: '11px', letterSpacing: '0.04em', textTransform: 'uppercase',
        color: 'var(--dsw-alias-label-secondary)', opacity: 0.85,
      },
      startReihe: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' },
      startKnopf: {
        fontSize: '13px', fontFamily: 'inherit', padding: '7px 14px',
        borderRadius: '7px', border: '1px solid var(--dsw-alias-brand-primary)',
        background: 'var(--dsw-alias-brand-primary)', color: '#ffffff', cursor: 'pointer',
      },
      startZweit: {
        fontSize: '12px', fontFamily: 'inherit', padding: '6px 12px',
        borderRadius: '7px', border: '1px solid var(--dsw-alias-border-l1)',
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
        margin: '8px 0 0', padding: '7px 10px', borderRadius: '7px',
        border: '1px solid #d2992266', background: '#d2992214', color: '#d29922',
        fontSize: '12px', lineHeight: 1.45,
      },
      table: { borderCollapse: 'collapse', fontSize: '13px' },
      th: {
        textAlign: 'left', padding: '8px 10px', whiteSpace: 'nowrap', fontWeight: 500,
        color: 'var(--dsw-alias-label-secondary)', verticalAlign: 'middle',
        borderBottom: '1px solid var(--dsw-alias-border-l1)',
      },
      thStift: {
        width: '20px', height: '20px', lineHeight: '16px', padding: 0, textAlign: 'center',
        fontSize: '12px', fontFamily: 'inherit', borderRadius: '5px', cursor: 'pointer',
        border: '1px solid transparent', background: 'transparent',
        color: 'var(--dsw-alias-label-secondary)', marginLeft: '6px', verticalAlign: 'middle',
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
        border: '2px solid var(--dsw-alias-brand-primary)',
        background: 'var(--dsw-alias-bg-layer-1)', cursor: 'crosshair', touchAction: 'none',
      },
      pfeilZiel: {
        color: 'var(--dsw-alias-brand-primary)', fontWeight: 700,
        background: 'rgba(127,127,127,0.12)', borderRadius: '6px',
      },
      // Die Reiter über dem Board: Bibliothek und Einstellungen klappen auf
      // und zu. Ein Reiter ist die Kopfzeile seiner Fläche, kein eigener Ort.
      leiste: { flex: 'none', display: 'flex', alignItems: 'center', gap: '6px', margin: '0 0 6px' },
      reiter: {
        fontSize: '12px', fontFamily: 'inherit', padding: '4px 10px 4px 8px',
        borderRadius: '7px', border: '1px solid transparent', background: 'transparent',
        color: 'var(--dsw-alias-label-secondary)', cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', gap: '6px',
      },
      reiterOffen: {
        borderColor: 'var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-1)',
        color: 'var(--dsw-alias-label-primary)', fontWeight: 600,
      },
      reiterPfeil: { fontSize: '9px', opacity: 0.75, lineHeight: 1 },
      leistenFlaeche: {
        flex: 'none', margin: '0 0 10px', padding: '10px 12px',
        border: '1px solid var(--dsw-alias-border-l1)', borderRadius: '10px',
        background: 'var(--dsw-alias-bg-layer-1)',
      },
      bibKopf: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' },
      bibReihe: { display: 'flex', gap: '8px', alignItems: 'stretch', flexWrap: 'wrap' },
      // Die Bibliothek zeigt dieselbe Kiste in klein: oben der Name, darunter
      // die Fläche. Was darin liegt, sagt die zweite Zeile.
      bibKarte: {
        display: 'flex', flexDirection: 'column', width: '132px', boxSizing: 'border-box',
        borderRadius: '8px', border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-1)', cursor: 'grab',
        overflow: 'hidden', boxShadow: '0 1px 2px rgba(0, 0, 0, 0.06)',
      },
      bibReiter: {
        display: 'block', width: '100%', boxSizing: 'border-box', textAlign: 'left',
        padding: '4px 7px', border: 'none',
        borderBottom: '1px solid var(--dsw-alias-border-l1)',
        background: 'rgba(127, 127, 127, 0.08)', fontFamily: 'inherit',
        fontSize: '11px', fontWeight: 600, lineHeight: '1.3',
        color: 'var(--dsw-alias-label-primary)', cursor: 'pointer',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      },
      bibFlaeche: {
        flex: 1, minHeight: '26px', boxSizing: 'border-box', padding: '4px 7px',
        fontSize: '10px', lineHeight: '1.3', cursor: 'grab',
        color: 'var(--dsw-alias-label-secondary)',
      },
      pfeil: {
        flex: '0 0 34px', alignSelf: 'center', textAlign: 'center',
        color: 'var(--dsw-alias-label-secondary)', fontSize: '16px', lineHeight: 1,
        userSelect: 'none',
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
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)',
      },
      karteKopf: {
        display: 'flex', alignItems: 'flex-start', gap: '6px',
        minHeight: '34px', boxSizing: 'border-box',
        padding: '7px 10px', borderBottom: '1px solid var(--dsw-alias-border-l1)',
        background: 'rgba(127, 127, 127, 0.08)', userSelect: 'none',
        borderTopLeftRadius: '11px', borderTopRightRadius: '11px',
      },
      karteName: {
        flex: '0 1 auto', minWidth: 0, padding: 0, margin: 0, border: 'none',
        background: 'transparent', fontFamily: 'inherit', fontSize: '13px',
        fontWeight: 600, lineHeight: '1.35', textAlign: 'left', cursor: 'pointer',
        color: 'var(--dsw-alias-label-primary)',
      },
      karteNameAktiv: { color: 'var(--dsw-alias-brand-primary)' },
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
        borderBottomLeftRadius: '11px', borderBottomRightRadius: '11px',
        cursor: 'pointer',
      },
      // Die Einstellungen in der aufgeblähten Station: Beschriftung über Feld.
      formular: { display: 'flex', flexDirection: 'column', gap: '8px' },
      feldBlock: { display: 'flex', flexDirection: 'column', gap: '3px' },
      feldTitel: { fontSize: '11px', color: 'var(--dsw-alias-label-secondary)' },
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
        borderColor: 'var(--dsw-alias-brand-primary)',
        color: 'var(--dsw-alias-brand-primary)',
        background: 'rgba(127, 127, 127, 0.12)', fontWeight: 600,
      },
      // Eine Zeile in den Einstellungen: was gilt, und die Wahl daneben.
      settingBlock: { marginTop: '14px' },
      settingZeile: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' },
      settingTitel: {
        fontSize: '11px', letterSpacing: '0.04em', textTransform: 'uppercase',
        color: 'var(--dsw-alias-label-secondary)', opacity: 0.85, marginRight: '2px',
      },
      settingHinweis: {
        fontSize: '11px', color: 'var(--dsw-alias-label-secondary)', marginTop: '6px',
      },
      // Der Verlauf des Boards: eine Fassung je Zeile, die neueste oben.
      fassungen: {
        marginTop: '8px', maxHeight: '220px', overflowY: 'auto',
        display: 'flex', flexDirection: 'column',
      },
      fassungZeile: {
        padding: '5px 0', borderBottom: '1px solid var(--dsw-alias-border-l1)',
      },
      fassungKopf: { fontSize: '10.5px', color: 'var(--dsw-alias-label-secondary)' },
      fassungWas: {
        fontSize: '12px', lineHeight: '1.35', color: 'var(--dsw-alias-label-primary)',
      },
      karteNeu: { borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
      // Das Ziel beim Ziehen eines Schritts: ein Plus mitten auf der Station,
      // darunter das eine Wort, das die Richtung sagt. Es fängt keine Maus ab —
      // das Ablegen gilt der Station, auf der es liegt.
      kartePlusZiel: {
        position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
        width: '58px', height: '58px', boxSizing: 'border-box', borderRadius: '50%',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: '1px', zIndex: 5, pointerEvents: 'none',
        background: 'var(--dsw-alias-brand-primary)', color: '#fff',
        boxShadow: '0 6px 18px rgba(0, 0, 0, 0.28)',
        fontSize: '22px', lineHeight: 1, fontWeight: 700,
      },
      kartePlusZielText: { fontSize: '9px', fontWeight: 600, opacity: 0.9, lineHeight: 1 },
      kartePlus: {
        fontSize: '12px', fontFamily: 'inherit', padding: '4px 10px', borderRadius: '6px',
        border: '1px dashed var(--dsw-alias-border-l2)', background: 'transparent',
        color: 'var(--dsw-alias-label-secondary)', cursor: 'pointer',
      },
      td: {
        padding: '10px', verticalAlign: 'top',
        borderBottom: '1px solid var(--dsw-alias-border-l1)',
      },
      tdSpalte: {
        padding: '10px', verticalAlign: 'top', minWidth: '170px', maxWidth: '260px',
        borderBottom: '1px solid var(--dsw-alias-border-l1)',
      },
      leer: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary)', opacity: 0.5 },
      chip: {
        display: 'block', width: '100%', boxSizing: 'border-box', textAlign: 'left',
        marginBottom: '4px', padding: '5px 9px', borderRadius: '6px',
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)',
        cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit', lineHeight: 1.35,
      },
      mini: {
        width: '22px', height: '20px', padding: 0, marginRight: '4px', lineHeight: 1,
        fontSize: '11px', fontFamily: 'inherit', borderRadius: '5px', cursor: 'pointer',
        border: '1px solid var(--dsw-alias-border-l1)', background: 'transparent',
        color: 'var(--dsw-alias-label-secondary)',
      },
      miniAus: { opacity: 0.35, cursor: 'default' },
      // Grün, wenn der Schritt sein Ergebnis hat: gefüllt, damit der Unterschied
      // in hellem und dunklem Theme gleich deutlich ist.
      miniGruen: {
        background: '#1f883d', borderColor: '#1f883d', color: '#ffffff', fontWeight: 600,
      },
      klein: {
        fontSize: '11px', fontFamily: 'inherit', padding: '3px 8px', borderRadius: '5px',
        cursor: 'pointer', border: '1px solid var(--dsw-alias-border-l1)',
        background: 'transparent', color: 'var(--dsw-alias-label-secondary)',
      },
      form: {
        margin: '0 0 10px', padding: '8px', borderRadius: '6px',
        border: '1px dashed var(--dsw-alias-border-l2)',
      },
      knoepfeKlein: { display: 'flex', alignItems: 'center', margin: '0 0 8px' },
      datei: {
        marginTop: '8px', padding: '8px 9px', borderRadius: '6px',
        border: '1px solid', background: 'transparent',
      },
      dateiName: {
        fontSize: '11px', fontWeight: 600, marginBottom: '4px', wordBreak: 'break-all',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      },
      dateiText: {
        fontSize: '11px', lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        maxHeight: '160px', overflow: 'auto',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      },
      dateiFehlt: { fontSize: '11px', fontStyle: 'italic', opacity: 0.65 },
      // Die Herkunft am Vorhaben: „Zweig von …“ und „Fork von …“. Der Name des
      // Ursprungs ist ein Knopf, wenn der Ursprung sichtbar ist.
      herkunftZeile: {
        margin: '0 0 6px', fontSize: '11px', lineHeight: 1.45,
        color: 'var(--dsw-alias-label-secondary)',
      },
      herkunftLink: {
        padding: 0, margin: 0, border: 'none', background: 'transparent',
        font: 'inherit', color: 'var(--dsw-alias-brand-primary)',
        textDecoration: 'underline', cursor: 'pointer',
      },
      detail: {
        marginTop: '28px', padding: '16px 18px', maxWidth: '760px',
        border: '1px solid var(--dsw-alias-border-l1)', borderRadius: '10px',
        background: 'var(--dsw-alias-bg-layer-1)',
      },
      detailKopf: {
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: '12px', marginBottom: '12px',
      },
      detailTitle: { fontSize: '14px', fontWeight: 600, margin: 0 },
      schliessen: {
        flex: 'none', width: '24px', height: '24px', padding: 0, lineHeight: 1,
        fontSize: '14px', fontFamily: 'inherit', borderRadius: '6px', cursor: 'pointer',
        border: '1px solid var(--dsw-alias-border-l1)', background: 'transparent',
        color: 'var(--dsw-alias-label-secondary)',
      },
      meta: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary)', margin: '0 0 8px' },
      button: {
        fontSize: '12px', fontFamily: 'inherit', padding: '4px 10px', borderRadius: '6px',
        border: '1px solid var(--dsw-alias-border-l1)', background: 'var(--dsw-alias-bg-layer-1)',
        color: 'var(--dsw-alias-label-primary)', cursor: 'pointer',
      },
      plus: {
        width: '22px', height: '22px', lineHeight: '18px', padding: 0, textAlign: 'center',
        fontSize: '14px', fontFamily: 'inherit', borderRadius: '5px', cursor: 'pointer',
        border: '1px dashed var(--dsw-alias-border-l2)', background: 'transparent',
        color: 'var(--dsw-alias-label-secondary)', verticalAlign: 'middle',
      },
      plusLeise: {
        width: '20px', height: '20px', lineHeight: '16px', padding: 0, textAlign: 'center',
        fontSize: '13px', fontFamily: 'inherit', borderRadius: '5px', cursor: 'pointer',
        border: '1px dashed var(--dsw-alias-border-l1)', background: 'transparent',
        color: 'var(--dsw-alias-label-secondary)', marginRight: '6px', verticalAlign: 'middle',
      },
      input: {
        fontSize: '12px', fontFamily: 'inherit', padding: '4px 8px', width: '150px',
        borderRadius: '6px', border: '1px solid var(--dsw-alias-brand-primary)',
        background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)',
        outline: 'none',
      },
      zeilePlus: {
        fontSize: '12px', fontFamily: 'inherit', padding: '4px 10px', borderRadius: '6px',
        border: '1px dashed var(--dsw-alias-border-l2)', background: 'transparent',
        color: 'var(--dsw-alias-label-secondary)', cursor: 'pointer',
      },
      gitter: {
        display: 'grid', gridTemplateColumns: '96px 1fr', gap: '8px 12px',
        alignItems: 'start', marginBottom: '12px',
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
        outline: 'none',
      },
      flaeche: {
        fontSize: '12px', fontFamily: 'inherit', padding: '6px 8px', width: '100%',
        boxSizing: 'border-box', minHeight: '58px', resize: 'vertical', lineHeight: 1.5,
        borderRadius: '6px', border: '1px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)',
        outline: 'none',
      },
      hinweis: {
        fontSize: '11px', color: 'var(--dsw-alias-label-secondary)', marginTop: '4px',
        lineHeight: 1.4,
      },
      knoepfe: { display: 'flex', gap: '8px', alignItems: 'center' },
      bestaetigung: {
        margin: '0 0 12px', padding: '10px 12px', borderRadius: '8px',
        border: '1px solid var(--dsw-alias-brand-primary)',
        background: 'var(--dsw-alias-bg-layer-1)',
      },
      dateiKnopf: {
        display: 'block', width: '100%', boxSizing: 'border-box', textAlign: 'left',
        marginTop: '6px', padding: '5px 9px', borderRadius: '6px', cursor: 'pointer',
        border: '1px solid', background: 'transparent', fontWeight: 600,
        fontSize: '11px', wordBreak: 'break-all',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      },
      // Ein Dateiname im Satz: Schreibmaschinenschrift, damit er sich vom
      // deutschen Text unterscheidet — so sind zwei fast gleiche Namen zu sehen.
      codeName: {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: '10px', wordBreak: 'break-all',
      },
      // Die Namen, die in einem Dateifeld stehen: einzeln zu sehen, einzeln
      // zu entfernen. Darunter, was sich anbietet.
      feldChips: {
        display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px', alignItems: 'center',
      },
      feldChip: {
        display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 6px',
        borderRadius: '5px', border: '1px solid var(--dsw-alias-border-l1)',
        background: 'transparent', color: 'var(--dsw-alias-label-secondary)',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: '10px',
      },
      feldFolgt: { fontSize: '10px', color: 'var(--dsw-alias-label-secondary)', opacity: 0.75 },
      feldAngebote: { display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' },
      feldAngebot: {
        display: 'inline-flex', alignItems: 'baseline', gap: '5px', padding: '2px 7px',
        borderRadius: '5px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '10px',
        border: '1px dashed var(--dsw-alias-border-l1)', background: 'transparent',
        color: 'var(--dsw-alias-label-secondary)',
      },
      // Die Übergabe zwischen zwei Stationen: was ankommt, was hinausgeht.
      uebergabe: { display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '4px' },
      uebergabeZeile: {
        fontSize: '11px', color: 'var(--dsw-alias-label-secondary)', lineHeight: 1.45,
      },
      uebergabeWarn: { fontSize: '11px', color: '#d29922', lineHeight: 1.45 },
      karteWarnung: {
        marginTop: '8px', padding: '5px 8px', borderRadius: '6px',
        border: '1px solid #d2992266', background: '#d2992214',
        color: '#d29922', fontSize: '10px', lineHeight: 1.4,
      },
      leser: {
        display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0,
        border: '1px solid var(--dsw-alias-border-l1)', borderRadius: '10px',
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
        fontSize: '11px', fontWeight: 400, fontFamily: 'inherit',
        color: 'var(--dsw-alias-label-secondary)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      },
      leserInhalt: { flex: 1, minHeight: 0, overflow: 'auto', padding: '14px 18px' },
      // Die Dateien eines Vorhabens: eine Spalte neben der Fläche. Sie bleibt
      // offen, während ein Dokument im Leser steht.
      dateien: {
        flex: '0 0 300px', display: 'flex', flexDirection: 'column', minHeight: 0,
        border: '1px solid var(--dsw-alias-border-l1)', borderRadius: '10px',
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
        padding: '4px 8px', border: 'none', borderRadius: '4px',
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
      diffWeg: { background: 'rgba(200, 60, 60, 0.14)' },
      diffDazu: { background: 'rgba(31, 136, 61, 0.16)' },
      diffLuecke: {
        color: 'var(--dsw-alias-label-secondary)', fontStyle: 'italic', fontSize: '11px',
        padding: '2px 8px',
      },
      // Die Gesprächsspalte steht neben dem Board, solange ein Gespräch läuft.
      // Sie zeigt Fragen und Antworten — dasselbe, was später im Transkript
      // steht, nur während es entsteht.
      gespraech: {
        display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0,
        border: '1px solid var(--dsw-alias-border-l1)', borderRadius: '10px',
        background: 'var(--dsw-alias-bg-layer-1)',
      },
      gespraechBreiteGriff: {
        flex: 'none', width: '9px', alignSelf: 'stretch', cursor: 'col-resize',
        margin: '0 -12px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        touchAction: 'none', userSelect: 'none',
      },
      gespraechBreiteStrich: {
        width: '3px', height: '44px', borderRadius: '2px',
        background: 'var(--dsw-alias-border-l2)',
      },
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
        fontSize: '12px', lineHeight: 1.5, padding: '6px 9px', borderRadius: '7px',
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
        background: 'transparent', color: 'var(--dsw-alias-label-primary)', outline: 'none',
      },
      gespraechGriff: {
        height: '12px', margin: '-8px 0 2px', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        cursor: 'ns-resize', touchAction: 'none', userSelect: 'none',
      },
      gespraechGriffStrich: {
        width: '32px', height: '3px', borderRadius: '2px',
        background: 'var(--dsw-alias-border-l2)',
      },
      editor: {
        width: '100%', height: '100%', boxSizing: 'border-box', resize: 'none',
        padding: 0, border: 'none', outline: 'none', background: 'transparent',
        color: 'var(--dsw-alias-label-primary)', fontSize: '12px', lineHeight: 1.55,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      },
      mdH1: { fontSize: '18px', margin: '0 0 10px', fontWeight: 600 },
      mdH2: { fontSize: '15px', margin: '16px 0 8px', fontWeight: 600 },
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
        fontSize: '11px', lineHeight: 1.5,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      },
      mdKopf: {
        margin: '0 0 14px', padding: '8px 10px', borderRadius: '6px',
        background: 'var(--dsw-alias-bg-layer-2)', fontSize: '11px',
        display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '2px 10px',
        color: 'var(--dsw-alias-label-secondary)',
      },
      mdTrenner: {
        border: 'none', borderTop: '1px solid var(--dsw-alias-border-l1)', margin: '16px 0',
      },
      codeInline: {
        padding: '1px 4px', borderRadius: '4px', fontSize: '12px',
        background: 'var(--dsw-alias-bg-layer-2)',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      },
      link: { color: 'var(--dsw-alias-brand-primary)' },
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

    const farbName = (hex) => {
      const i = FARBEN_ALLE.indexOf(hex);
      if (i < 0) return 'Farbe';
      return FARB_STUFEN[i % FARB_STUFEN.length] + ' '
        + FARB_NAMEN[Math.floor(i / FARB_STUFEN.length)];
    };

    // Ein Vorhaben ohne eigene Farbe bekommt der Reihe nach einen hellen Ton.
    const FARBEN = PALETTE.map((stufen) => stufen[1]);

    const farbeVon = (index) => FARBEN[((index % FARBEN.length) + FARBEN.length) % FARBEN.length];

    // Eine Farbe als Schrift: mit der Textfarbe des Themas gemischt, damit auch
    // ein zarter Ton hell wie dunkel lesbar bleibt.
    const alsText = (farbe) => 'color-mix(in oklab, ' + farbe + ' 60%, var(--dsw-alias-label-primary))';

    // Alles, was am Zeiger hängt, wird gesammelt und höchstens einmal je Bild
    // gezeichnet. Ein Zeiger meldet sich oft hundertmal in der Sekunde; ohne
    // das würde jedes Mal neu gezeichnet, und das ruckelt sichtbar.
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

    const listen = (wert) => (Array.isArray(wert) ? wert.join(', ') : '');

    /**
     * Die eigene Fläche: die Person mit `ich`, sonst die erste. `/board/data`
     * liefert eine Fläche je Person; die alten Felder `workflow` und `schritte`
     * bleiben lesbar, weil schreibende Routen sie noch in ihrer Antwort tragen.
     */
    function eigeneFlaeche(data) {
      const liste = data && Array.isArray(data.workflows) ? data.workflows : [];
      return liste.find((p) => p && p.ich) || liste[0] || null;
    }

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

    function schritteVonFlaeche(data) {
      const workflow = eigenerWorkflow(data);
      return (workflow && workflow.schritte) || [];
    }

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
      const gruppe = (wurzel) => {
        const ids = [];
        let tiefste = 0;
        belegt = new Map();
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

    /**
     * Der Dateiname aus einem Link, wenn er auf eine Datei zeigt.
     * Externe Adressen und Sprungmarken ergeben einen leeren Namen — sie
     * öffnet der Browser. `file://` und gleiche Adresse wie die Seite gelten
     * als Datei; der Rest der Adresse ist egal, es zählt der letzte Teil.
     */
    // Der Pfad eines Links, soweit er in das Vorhaben führt. Anders als
    // `linkName` behält er die Ordner: `produkt/README.md` ist eine Datei im
    // Ordner, nicht eine Datei „README.md“ daneben.
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
          raus.push({ art: 'luecke', text: '… ' + (anzahl - 6) + ' Zeilen unverändert' });
          raus.push(zeilen[j - 3], zeilen[j - 2], zeilen[j - 1]);
        } else {
          for (let k = i; k < j; k += 1) raus.push(zeilen[k]);
        }
        i = j;
      }
      return raus;
    }

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
        bloecke.push(h('p', { key: 'leer', style: S.meta }, 'Die Datei ist leer.'));
      }
      return bloecke;
    }

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
      // Die Gesprächsspalte: dieselbe Sitzung, dieselben Zeilen.
      gespraech: null,
      // Ein Eingriff des Modells, der noch nicht gespeichert ist — damit
      // „Zurücknehmen“ auch nach einem Wechsel noch möglich bleibt.
      eingriff: null,
      // Welcher Reiter über dem Board offen ist: keiner, „Bibliothek“ oder
      // „Einstellungen“. Auch das bleibt beim Wechsel zum Chat stehen.
      leiste: null,
      // Was er gerade tippt: der Auftrag an das Modell, der Name einer neuen
      // Station, eines neuen Vorhabens, einer Person.
      aenderung: '',
      neuerSchritt: null,
      editVorhaben: null,
      projektEdit: null,
      personEdit: null,
      feldHoehe: 72,
      spaltenBreite: 360,
      scroll: { links: 0, oben: 0 },
      entwurf: null,
    };

    function BoardPage(ctx) {
      const [data, setData] = React.useState(gemerkt.data);
      const [fehler, setFehler] = React.useState(null);
      const [auswahl, setAuswahl] = React.useState(gemerkt.auswahl); // { art:'schritt'|'vorhaben', id }
      const [meldung, setMeldung] = React.useState(null);
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
        && (gemerkt.leser.modus === 'verlauf' || gemerkt.leser.modus === 'abzweig')
        ? { ...gemerkt.leser, modus: 'lesen' }
        : gemerkt.leser); // Datei: { art:'datei', … } · Transkript: { art:'transkript', … }
      // Ein Zweig, der gerade angelegt wird: wohin er geht und wie er heißt.
      const [zweig, setZweig] = React.useState(null); // { ziel, name, laeuft, fehler }
      // Das Vorhaben, das gerade geforkt wird. Bis die Antwort da ist, bleibt
      // sein Knopf gesperrt — ein zweiter Fork entsteht nicht aus Versehen.
      const [forkLaeuft, setForkLaeuft] = React.useState(null);
      // Der geöffnete Beitrag: Notiz und vorgeschlagene Fassungen.
      const [beitrag, setBeitrag] = React.useState(gemerkt.beitrag);
      // Der Entscheid zu diesem Beitrag: welche Teile übernommen werden, ob er
      // gerade läuft und was schiefging. Nur der Verantwortliche sieht ihn.
      const [entscheid, setEntscheid] = React.useState({ teile: [], laeuft: false, fehler: '' });
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
      const [verlauf, setVerlauf] = React.useState(null); // { id, zustand, schritte }
      const [ziehen, setZiehen] = React.useState(null); // Vorhaben, das gerade gezogen wird
      const [ziel, setZiel] = React.useState(null); // Spalte unter dem Zeiger
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
      // Höhe des Eingabefelds in der Gesprächsspalte; ziehbar am Griff darüber.
      const [feldHoehe, setFeldHoehe] = React.useState(gemerkt.feldHoehe);
      // Breite der Gesprächsspalte; ziehbar am Griff links davon.
      const [spaltenBreite, setSpaltenBreite] = React.useState(gemerkt.spaltenBreite);
      // Bibliothek: der Name, der gerade getippt wird; der Schritt, der gerade
      // gezogen wird; die Fläche darunter; die Rückfrage vor dem Löschen.
      // Bibliothek, Einstellungen und Verlauf klappen über dem Board auf;
      // zugeklappt gehört die Fläche ganz dem Board.
      const [leiste, setLeiste] = React.useState(gemerkt.leiste);
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
      const [boardNeu, setBoardNeu] = React.useState(null);
      const [boardWeg, setBoardWeg] = React.useState(null);
      const [boardMeldung, setBoardMeldung] = React.useState('');
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
      const dateiRef = React.useRef(leser && leser.art === 'datei'
        ? leser.vorhaben + '/' + leser.datei
        : null);

      React.useEffect(() => {
        let lebendig = true;
        fetch('/board/data', { headers: { accept: 'application/json' } })
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
          .then((d) => { if (lebendig) { gemerkt.data = d; setData(d); } })
          .catch((e) => { if (lebendig) setFehler(String((e && e.message) || e)); });
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

      const art = auswahl ? auswahl.art : null;
      const auswahlId = auswahl ? auswahl.id : null;
      // Wohin das Mausrad schiebt. Ohne Eintrag seitwärts: das Board ist
      // breiter als hoch, und senkrecht gibt es meist nichts zu holen.
      const mausrad = data && data.einstellungen && data.einstellungen.mausrad === 'auf-ab'
        ? 'auf-ab'
        : 'seitwaerts';

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
      }, [gespraech, feldHoehe, spaltenBreite]);
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
        if (gespraechZu === g.session) return;
        setGespraech((alt) => (alt && alt.session === g.session
          ? alt
          : {
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
      React.useEffect(() => {
        if (!sitzungAktiv) return undefined;
        let lebendig = true;
        const adresse = gespraechArt === 'werkstatt'
          ? '/board/werkstatt/stand?schritt=' + encodeURIComponent(gespraechOrt || '')
          : '/board/gespraech/stand?vorhaben=' + encodeURIComponent(auswahlId)
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
      }, [sitzungAktiv, gespraechArt, gespraechOrt, auswahlId]);

      // Ein Zug ist zu Ende: in der Zwischenzeit können Dateien entstanden und
      // Skills angelegt worden sein — das Board holt sie sich einmal.
      const gespraechLaeuft = !!(gespraech && gespraech.laeuft);
      React.useEffect(() => {
        if (gespraechLaeuft || !sitzungAktiv) return;
        ladeBoard().catch(() => {});
        setTick((n) => n + 1);
      }, [gespraechLaeuft, sitzungAktiv]);

      // Das Board neu holen: nach einem neuen Gespräch oder nach dem Verwerfen
      // stimmt sonst die gemerkte Liste der Gespräche nicht mehr.
      async function ladeBoard() {
        const antwort = await fetch('/board/data', { headers: { accept: 'application/json' } });
        if (!antwort.ok) throw new Error('HTTP ' + antwort.status);
        const d = await antwort.json();
        gemerkt.data = d;
        setData(d);
      }

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
        const wert = await poste(pfad, koerper);
        setData(wert);
        return wert;
      }

      async function dateiSpeichern() {
        if (!leser) return;
        const ziel = vorhaben.find((v) => v.id === leser.vorhaben);
        if (ziel && !(ziel.darf && ziel.darf.aendern)) {
          setMeldung('Dieses Vorhaben verantwortet jemand anderes — gespeichert wird als Beitrag.');
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
          setMeldung('„' + leser.datei + '" gespeichert.');
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
            setMeldung('Der Stand ist neuer — nichts wurde geschrieben. Dein Text bleibt; '
              + 'lege ihn als Beitrag an oder übernimm den neuen Stand.');
            return;
          }
          setMeldung('Konnte nicht speichern: ' + String((e && e.message) || e));
        }
      }

      // Bei einem überholten Stand bleibt der eigene Text der Ausgangspunkt:
      // er wird als Beitrag angeboten, die Datei im Vorhaben bleibt unverändert.
      async function konfliktAlsBeitrag() {
        if (!leser || !leser.konflikt) return;
        const konflikt = leser.konflikt;
        const notiz = String(leser.notiz || '').trim();
        try {
          await poste('/board/beitrag', {
            vorhaben: leser.vorhaben,
            schritt: leser.position
              || (gewaehltesVorhaben ? gewaehltesVorhaben.position : ''),
            notiz,
            dateien: [{ name: leser.datei, text: konflikt.eigener }],
            ...(konflikt.basis ? { basis: konflikt.basis } : {}),
          });
          setMeldung('Dein Text liegt als Beitrag — die Datei im Vorhaben bleibt unverändert.');
          setLeser({
            ...leser,
            text: konflikt.text,
            basis: konflikt.basis,
            konflikt: undefined,
            notiz: '',
            vorhanden: true,
            modus: 'lesen',
          });
          setEingriff(null);
          setTick((n) => n + 1);
          ladeBoard().catch(() => {});
        } catch (e) {
          setMeldung('Der Beitrag ließ sich nicht speichern: ' + String((e && e.message) || e));
        }
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
        setMeldung('Der neue Stand steht im Leser.');
      }

      // In ein fremdes Vorhaben wird nicht geschrieben: der Text geht als
      // Beitrag mit einer Notiz in die Ablage, das Original bleibt unberührt.
      async function beitragSpeichern() {
        if (!leser || leser.art !== 'datei') return;
        const notiz = String(leser.notiz || '').trim();
        const original = leser.original != null ? leser.original : leser.text;
        const geaendert = leser.text !== original;
        const dateien = geaendert ? [{ name: leser.datei, text: leser.text }] : [];
        if (!notiz && !dateien.length) {
          setMeldung('Ein Beitrag braucht eine Notiz oder eine geänderte Datei.');
          return;
        }
        try {
          await poste('/board/beitrag', {
            vorhaben: leser.vorhaben,
            schritt: leser.position || (gewaehltesVorhaben ? gewaehltesVorhaben.position : ''),
            notiz,
            dateien: dateien,
            // Der Beitrag sitzt auf dem Stand auf, den der Leser beim Öffnen
            // hatte — derselbe `basis`-Wert wie beim Speichern.
            ...(leser.basis ? { basis: leser.basis } : {}),
          });
          setMeldung('Beitrag gespeichert — die Originaldatei bleibt unberührt.');
          setLeser({
            ...leser,
            text: original,
            notiz: '',
            original: undefined,
            vorhanden: true,
            modus: 'lesen',
          });
          setEingriff(null);
          setTick((n) => n + 1);
          ladeBoard().catch(() => {});
        } catch (e) {
          setMeldung('Der Beitrag ließ sich nicht speichern: ' + String((e && e.message) || e));
        }
      }

      // Über einen Beitrag entscheidet der Verantwortliche des Vorhabens —
      // ganz, in Teilen oder ablehnend. Erst danach ändert sich der Stand des
      // Vorhabens; der Beitrag bleibt mit seinem Vermerk sichtbar.
      function beitragEntscheiden(art) {
        if (!beitrag || !beitrag.id || beitrag.entschieden) return;
        const ziel = vorhaben.find((v) => v.id === beitrag.vorhaben) || null;
        if (!ziel || !(ziel.darf && ziel.darf.entscheiden)) return;
        const teile = art === 'annehmen' && entscheid && Array.isArray(entscheid.teile)
          ? entscheid.teile.slice() : [];
        setEntscheid((alt) => ({ ...(alt || {}), laeuft: true, fehler: '' }));
        poste('/board/beitrag/entscheiden', {
          beitrag: beitrag.id,
          art,
          ...(art === 'annehmen' ? { teile } : {}),
        }).then((wert) => {
          setBeitrag((alt) => {
            if (!alt || alt.id !== beitrag.id) return alt;
            // Die gelesenen Fassungen bleiben im Leser stehen; die Antwort
            // trägt nur den Entscheid und die Namen der Dateien.
            return { ...alt, ...((wert && wert.beitrag) || {}), dateien: alt.dateien };
          });
          setEntscheid({ teile: [], laeuft: false, fehler: '' });
          setMeldung(art === 'annehmen'
            ? 'Beitrag angenommen — die übernommenen Dateien liegen als neue Fassung.'
            : 'Beitrag abgelehnt — der Stand des Vorhabens bleibt unverändert.');
          setTick((n) => n + 1);
          ladeBoard().catch(() => {});
        }).catch((e) => {
          setEntscheid((alt) => ({
            ...(alt || {}),
            laeuft: false,
            fehler: 'Der Entscheid ließ sich nicht speichern: '
              + String((e && e.message) || e),
          }));
        });
      }

      // Ein Teil des Beitrags wird übernommen oder nicht; ohne eigenen Eingriff
      // sind alle angehakt.
      function entscheidTeilUmschalten(name) {
        setEntscheid((alt) => {
          const teile = alt && Array.isArray(alt.teile) ? alt.teile.slice() : [];
          const stelle = teile.indexOf(name);
          if (stelle >= 0) teile.splice(stelle, 1); else teile.push(name);
          return { ...(alt || {}), teile, fehler: '' };
        });
      }

      // --- Der Verlauf einer Datei -------------------------------------------
      // Jede Speicherung liegt als Fassung im lokalen Repository. Gezeigt wird,
      // wer gespeichert hat, wann, und was sich geändert hat.

      function wann(iso) {
        const d = new Date(String(iso || ''));
        if (Number.isNaN(d.getTime())) return String(iso || '');
        return d.toLocaleString('de-AT', { dateStyle: 'medium', timeStyle: 'short' });
      }

      function wer(autor) {
        return autor === 'Mensch' ? 'Du' : (autor || 'unbekannt');
      }

      function oeffneVerlauf() {
        if (!leser || leser.art !== 'datei') return;
        setMeldung(null);
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
          setMeldung('„' + leser.datei + '“ steht wieder auf dem Stand vom ' + wann(v.datum) + '.');
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
            setMeldung('Der Stand ist neuer — nichts wurde zurückgesetzt. '
              + 'Der neue Stand steht im Leser.');
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
          setMeldung('Konnte nicht zurücksetzen: ' + String((e && e.message) || e));
        }
      }

      // Korrigiert nur die Rechtschreibung — der Text bleibt seiner, bis er
      // speichert. Das Original liegt bis zum Speichern daneben.
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
              ? 'Die Korrektur hat zu lange gedauert. Nichts wurde geändert.'
              : roh,
          });
        }
      }

      // Überarbeiten ist ein Vorschlag, kein Speichern: das Modell schreibt
      // eine neue Fassung nach seiner Anweisung, er liest sie im Editor und
      // entscheidet dann. Bis dahin liegt das Original daneben.
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
              ? 'Das Überarbeiten hat zu lange gedauert. Nichts wurde geändert.'
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
        setMeldung(null);
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

      // Einen Beitrag öffnen: die Notiz steht sofort da, die vorgeschlagenen
      // Fassungen kommen aus ihrem Ordner. Gelesen wird nur — entschieden wird
      // er erst beim Verantwortlichen, dort mit Annehmen, Teilen oder Ablehnen.
      function beitragOeffnen(eintrag) {
        if (!eintrag || !eintrag.id) return;
        setMeldung(null);
        setEingriff(null);
        // Alle vorgeschlagenen Dateien sind zuerst angehakt: ohne eigene Wahl
        // wird der ganze Beitrag übernommen.
        setEntscheid({
          teile: Array.isArray(eintrag.dateien) ? eintrag.dateien.slice() : [],
          laeuft: false,
          fehler: '',
        });
        setBeitrag({ ...eintrag, laedt: true, fehler: '', dateien: [] });
        setLeser({
          art: 'beitrag',
          beitrag: eintrag.id,
          vorhaben: eintrag.vorhaben,
          position: eintrag.schritt,
          titel: eintrag.von,
        });
        fetch('/board/beitrag?vorhaben=' + encodeURIComponent(eintrag.vorhaben)
          + '&beitrag=' + encodeURIComponent(eintrag.id))
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
          .then((d) => {
            setBeitrag((alt) => (alt && alt.id === eintrag.id
              ? { ...alt, ...((d && d.beitrag) || {}), dateien: (d && d.dateien) || [], laedt: false }
              : alt));
          })
          .catch((e) => {
            setBeitrag((alt) => (alt && alt.id === eintrag.id
              ? { ...alt, laedt: false, fehler: String((e && e.message) || e) }
              : alt));
          });
      }

      // Eine Datei im Wurzelordner öffnen und ihre `basis` mitnehmen: nur so
      // merkt der Editor beim Speichern, dass jemand anders sie inzwischen
      // geändert hat. Gelesen wird dieselbe Route wie im Leser.
      function oeffneDateiMitBasis(vorhabenId, name, positionId) {
        fetch('/board/doc?vorhaben=' + encodeURIComponent(vorhabenId)
          + '&datei=' + encodeURIComponent(name))
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => {
            if (!d) { setMeldung('Die Datei „' + name + '“ ließ sich nicht lesen.'); return; }
            if (!d.exists) {
              setMeldung('Die Datei „' + name + '“ gibt es in diesem Vorhaben nicht.');
              return;
            }
            setMeldung(null);
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
          .catch(() => setMeldung('Die Datei „' + name + '“ ließ sich nicht lesen.'));
      }

      // Ein Link auf eine Datei öffnet den Leser — genauso, wie ein Klick auf
      // dem Board die Datei öffnet. Gibt es sie nicht, steht das da; ein
      // leerer Leser wäre ein Versprechen, das nicht stimmt.
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
                setMeldung('Die Datei „' + pfad + '“ gibt es in diesem Vorhaben nicht.');
                return;
              }
              setMeldung(null);
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
            .catch(() => setMeldung('Die Datei „' + pfad + '“ ließ sich nicht lesen.'));
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
        setMeldung(null);
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
        setMeldung(null);
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

      async function zweigAnlegen() {
        if (!leser || leser.art !== 'datei' || !zweig || zweig.laeuft) return;
        const name = String(zweig.name || '').trim();
        if (!name) { setZweig({ ...zweig, fehler: 'Der Zweig braucht einen Namen.' }); return; }
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
          setMeldung('Zweig „' + name + '“ liegt jetzt bei „' + zielName + '“'
            + (mit.length ? ' — mit ' + mit.join(', ') : '') + '.');
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

      async function gespraechBeginnen(skill, positionId) {
        setMeldung(null);
        setGespraechZu(null);
        amEnde.current = true;
        const vorhanden = gewaehltesVorhaben
          && (Array.isArray(gewaehltesVorhaben.gespraeche) ? gewaehltesVorhaben.gespraeche : [])
            .find((g) => g && g.session && g.position === positionId);
        if (vorhanden) {
          setGespraech({
            art: 'vorhaben',
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
          return;
        }
        const auftrag = auftragFuer(skill, positionId);
        if (!auftrag) return;
        // Der Klick ist die Freigabe: der Auftrag geht sofort hinaus, das
        // Modell beginnt zu fragen. Kein Text zum Abschicken mehr im Feld.
        const entwurf = {
          art: 'vorhaben',
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
        await sendenFuer(entwurf, auftrag);
      }

      // Wohin ein Gespräch gehört: an ein Vorhaben an dieser Station oder an
      // die Werkstatt der Station. Beides hat seine eigene Route.
      function gespraechZiel(stand) {
        if (stand && stand.art === 'werkstatt') {
          return { pfad: '/board/werkstatt', koerper: { schritt: stand.schritt } };
        }
        if (!gewaehltesVorhaben) return null;
        return {
          pfad: '/board/gespraech',
          koerper: { vorhaben: gewaehltesVorhaben.id, position: stand.position },
        };
      }

      async function sendenFuer(stand, text) {
        const ziel = gespraechZiel(stand);
        if (!ziel) return;
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
            ? { ...alt, sendet: false, fehler: 'Nicht gesendet: ' + String((e && e.message) || e) }
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
            ? { ...alt, fehler: 'Stopp nicht möglich: ' + String((e && e.message) || e) }
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
          setMeldung('Gespräch verworfen. Die Sitzung liegt im Archiv.');
          setTick((n) => n + 1);
        } catch (e) {
          setMeldung('Konnte nicht verwerfen: ' + String((e && e.message) || e));
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
          setMeldung('Skill „' + name + '“ an der Station „' + (gespraech.titel || '') + '“ eingetragen.');
        } catch (e) {
          setMeldung('Nicht eingetragen: ' + String((e && e.message) || e));
        }
      }

      function chatOeffnen(session) {
        const ui = ctx && typeof ctx.get === 'function' ? ctx.get('uiWorkspace') : undefined;
        if (!ui || typeof ui.openSession !== 'function') {
          setMeldung('Von hier lässt sich kein Chat öffnen.');
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
          setMeldung('Station „' + name + '“ angelegt. Zieh sie aus der Bibliothek auf die Fläche.');
        } catch (e) {
          setMeldung('Konnte nicht anlegen: ' + String((e && e.message) || e));
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
            setMeldung('Station in den Workflow gesetzt.');
            return;
          }
          const kanten = (eigenerWorkflow(neu) || {}).kanten || [];
          const stelle = positionenVon(neu).find((p) => !vorher.has(p.id));
          if (stelle && !kanten.some((k) => k.von === nach && k.nach === stelle.id)) {
            await sende('/board/kante', { von: nach, nach: stelle.id });
          }
          setMeldung('Station eingesetzt und gleich danach angeschlossen.');
        } catch (e) {
          setMeldung('Konnte nicht einsetzen: ' + String((e && e.message) || e));
        }
      }

      async function schrittLoeschen() {
        if (!bestaetigenSchritt) return;
        try {
          await sende('/board/schritt/loeschen', { id: bestaetigenSchritt });
          setBestaetigenSchritt(null);
          setAuswahl(null);
          setMeldung('Station gelöscht.');
        } catch (e) {
          setBestaetigenSchritt(null);
          setMeldung('Konnte nicht löschen: ' + String((e && e.message) || e));
        }
      }

      // Einen fremden Schritt aus seiner Fläche in den eigenen Workflow
      // stellen. Er wird nicht kopiert: der Host schreibt einen Verweis in die
      // eigene Datei, die Datei des Hosts bleibt, wie sie ist.
      async function fremdAnstellen(ref) {
        if (!ref) return;
        try {
          await sende('/board/fremd/anstellen', { ref });
          setMeldung('Der Schritt steht jetzt in deinem Workflow — als Verweis auf „'
            + ref + '“.');
        } catch (e) {
          setMeldung('Nicht angestellt: ' + String((e && e.message) || e));
        }
      }

      // Den Verweis wieder herausnehmen. Der fremde Schritt selbst bleibt.
      async function verweisEntfernen(ref) {
        if (!ref) return;
        try {
          await sende('/board/fremd/entfernen', { ref });
          setBestaetigenVerweis(null);
          setAuswahl(null);
          setMeldung('Verweis herausgenommen. Der Schritt bleibt bei seinem Host.');
        } catch (e) {
          setBestaetigenVerweis(null);
          setMeldung('Konnte den Verweis nicht herausnehmen: '
            + String((e && e.message) || e));
        }
      }

      async function vorhabenAnlegen() {
        const wert = String(editVorhaben || '').trim();
        if (!wert) { setEditVorhaben(null); return; }
        try {
          const neu = await sende('/board/vorhaben', { name: wert });
          const angelegt = (neu.vorgaenge || []).find((v) => v.name === wert);
          setMeldung('Vorhaben „' + wert + '" angelegt.');
          setEditVorhaben(null);
          if (angelegt) setAuswahl({ art: 'vorhaben', id: angelegt.id });
        } catch (e) {
          setMeldung('Konnte nicht speichern: ' + String((e && e.message) || e));
        }
      }

      async function verschiebenNach(id, positionId) {
        const v = (data.vorgaenge || []).find((x) => x.id === id);
        const p = positionenVon(data).find((x) => x.id === positionId);
        try {
          await sende('/board/vorhaben/verschieben', { id, position: positionId });
          setMeldung('„' + (v ? v.name : id) + '" ist jetzt bei '
            + (p ? p.name : positionId) + '.');
        } catch (e) {
          setMeldung('Konnte nicht verschieben: ' + String((e && e.message) || e));
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
        setMeldung(null);
        await verschiebenNach(id, nach);
      }

      async function projektSpeichern() {
        if (!projektEdit) return;
        const name = String(projektEdit.name || '').trim();
        if (!name) { setMeldung('Das Vorhaben braucht einen Namen.'); return; }
        try {
          await sende('/board/vorhaben/aendern', {
            id: projektEdit.id,
            name,
            farbe: projektEdit.farbe,
          });
          setProjektEdit(null);
          setMeldung(null);
        } catch (e) {
          setMeldung('Konnte nicht speichern: ' + String((e && e.message) || e));
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
          setMeldung(null);
        } catch (e) {
          setMeldung('Name oder Farbe nicht gespeichert: ' + String((e && e.message) || e));
        }
      }

      // Ein anderes Board öffnen. Die Seite wird danach neu aufgebaut: was
      // offen war, gehört zum alten Board.
      async function boardWechseln(id) {
        if (!data || id === data.aktiv) { setBoardOffen(false); return; }
        setBoardMeldung('');
        try {
          await poste('/board/boards/wechsel', { id });
          window.location.reload();
        } catch (e) {
          setBoardMeldung('Board nicht gewechselt: ' + String((e && e.message) || e));
        }
      }

      async function boardVerbinden() {
        if (!boardNeu || boardNeu.laeuft) return;
        const name = String(boardNeu.name || '').trim();
        const adresse = String(boardNeu.adresse || '').trim();
        if (!adresse && !name) {
          setBoardNeu({ ...boardNeu, fehler: 'Bitte einen Namen angeben.' });
          return;
        }
        setBoardNeu({ ...boardNeu, laeuft: true, fehler: '' });
        try {
          await poste('/board/boards', { name, adresse });
          window.location.reload();
        } catch (e) {
          setBoardNeu({
            ...boardNeu, laeuft: false, fehler: String((e && e.message) || e),
          });
        }
      }

      async function boardEntfernen(id) {
        try {
          await poste('/board/boards/entfernen', { id });
          window.location.reload();
        } catch (e) {
          setBoardMeldung('Nicht aus der Liste genommen: ' + String((e && e.message) || e));
        }
      }

      // Ohne Board: zuerst die Identität, dann das erste Board. `art` ist
      // `hauptboard` (das öffentliche), `verbinden` (Adresse) oder `eigenes`.
      async function startBoard(art) {
        if (start.laeuft) return;
        const name = start.name.trim();
        if (!name) {
          setStart({ ...start, fehler: 'Bitte deinen Namen eintragen.' });
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
            setStart({ ...start, fehler: 'Bitte die Adresse oder den Ordner eintragen.' });
            return;
          }
          boardName = boardName || 'Board';
        } else {
          boardName = boardName || 'Mein Board';
        }
        setStart({ ...start, laeuft: true, fehler: '' });
        try {
          await poste('/board/identitaet', {
            name, github: start.github.trim(), farbe: start.farbe,
          });
          await poste('/board/boards', { name: boardName, adresse });
          window.location.reload();
        } catch (e) {
          setStart({ ...start, laeuft: false, fehler: String((e && e.message) || e) });
        }
      }

      async function zurueckschicken() {
        if (!zurueck) return;
        const grund = String(zurueck.grund || '').trim();
        if (!grund) { setMeldung('Bitte den offenen Punkt benennen.'); return; }
        try {
          await sende('/board/vorhaben/zurueckschicken', {
            id: zurueck.id, nach: zurueck.nach, grund,
          });
          const ziel = positionenVon(data).find((p) => p.id === zurueck.nach);
          setMeldung('Zurückgeschickt nach „' + (ziel ? ziel.name : zurueck.nach) + '".');
          setZurueck(null);
        } catch (e) {
          setMeldung('Konnte nicht zurückschicken: ' + String((e && e.message) || e));
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
          setMeldung('„' + (v ? v.name : weiter.id) + '“ an „'
            + (ziel ? ziel.name : weiter.nach) + '“ weitergegeben — verantwortet von '
            + personName(weiter.person) + '.');
          setWeiter(null);
        } catch (e) {
          setMeldung('Konnte nicht weitergeben: ' + String((e && e.message) || e));
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
          setMeldung('Station gespeichert.');
        } catch (e) {
          setMeldung('Konnte nicht speichern: ' + String((e && e.message) || e));
        }
      }

      // Der Auftrag für die Werkstatt. Er beschreibt das Board so, wie es
      // gerade eingerichtet ist — die Station, ihre Dateien, ihre Nachbarn,
      // die Ablageorte —, damit die Anweisung zu diesem Workflow passt und
      // nicht zu einem erdachten. Geschrieben wird sie in die Ablage, nicht in
      // den Harness: dort liegt sie nur für die Dauer eines Laufs.
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
          '- Host: ' + (personName(gewaehlt.host) || 'niemand'),
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
      async function werkstattStarten() {
        if (art !== 'schritt' || !gewaehlt) return;
        setMeldung(null);
        setGespraechZu(null);
        amEnde.current = true;
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
        await sendenFuer(entwurf, werkstattAuftrag());
      }

      async function positionLoeschen() {
        if (!bestaetigen) return;
        try {
          await sende('/board/position/loeschen', { id: bestaetigen });
          setBestaetigen(null);
          setAuswahl(null);
          setMeldung('Station aus dem Workflow genommen. Sie bleibt in der Bibliothek.');
        } catch (e) {
          setBestaetigen(null);
          setMeldung('Konnte nicht löschen: ' + String((e && e.message) || e));
        }
      }

      if (fehler) {
        return h('div', { style: S.page }, h('div', { style: S.title }, 'Board'),
          h('p', { style: S.sub }, 'Die Daten konnten nicht geladen werden: ' + fehler));
      }
      if (!data) {
        return h('div', { style: S.page }, h('div', { style: S.title }, 'Board'),
          h('p', { style: S.sub }, 'Lade …'));
      }

      // Ohne Board steht hier der Anfang: die eigene Identität und das erste
      // Board. Das Hauptboard ist öffentlich — was dort entsteht, sieht jeder.
      if (data.leer) {
        return h('div', { style: S.startSeite },
          h('div', { style: S.startKarte },
            h('div', { style: S.startTitel }, 'Willkommen im Board'),
            h('p', { style: S.startText },
              'Das Board ist eine öffentliche Werkstatt. Menschen legen ihre Projekte an, '
              + 'arbeiten an ihnen und sehen, was die anderen tun — von der ersten Idee an. '
              + 'Verbinde das Hauptboard, um dabei zu sein, oder lege ein eigenes an.'),
            h('div', { style: S.startFeld },
              h('span', { style: S.startMarke }, 'Dein Name'),
              h('input', {
                style: { ...S.input, width: '100%' },
                value: start.name,
                placeholder: 'Wie du im Board heißt',
                autoFocus: true,
                onChange: (ev) => setStart({ ...start, name: ev.target.value, fehler: '' }),
              })),
            h('div', { style: S.startFeld },
              h('span', { style: S.startMarke }, 'GitHub-Name (freiwillig)'),
              h('input', {
                style: { ...S.input, width: '100%' },
                value: start.github,
                placeholder: 'dein-name auf GitHub',
                onChange: (ev) => setStart({ ...start, github: ev.target.value, fehler: '' }),
              }),
              h('p', { style: S.boardHinweis },
                'Damit findet dein Board dich auf öffentlichen Boards wieder, '
                + 'auch wenn dein Name sich ändert.')),
            h('div', { style: S.startFeld },
              h('span', { style: S.startMarke }, 'Deine Farbe'),
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
              }, start.laeuft ? 'Einen Moment …' : 'Hauptboard verbinden')),
            h('p', { style: { ...S.boardHinweis, marginTop: '8px' } },
              'Das Hauptboard ist öffentlich: Projekte, Dateien und der Weg dorthin '
              + 'sind für alle sichtbar.'),
            h('div', { style: S.startTrenner }, 'Oder ein eigenes Board'),
            h('div', { style: S.startFeld },
              h('span', { style: S.startMarke }, 'Name des Boards'),
              h('input', {
                style: { ...S.input, width: '100%' },
                value: start.boardName,
                placeholder: 'z. B. Mein Projekt',
                onChange: (ev) => setStart({ ...start, boardName: ev.target.value, fehler: '' }),
              })),
            h('div', { style: S.startReihe },
              h('button', {
                type: 'button',
                style: S.startZweit,
                onClick: () => startBoard('eigenes'),
              }, 'Eigenes Board anlegen'),
              h('input', {
                style: { ...S.input, flex: 1, minWidth: '180px' },
                value: start.adresse,
                placeholder: 'GitHub-Adresse oder Ordner',
                onChange: (ev) => setStart({ ...start, adresse: ev.target.value, fehler: '' }),
              }),
              h('button', {
                type: 'button',
                style: S.startZweit,
                onClick: () => startBoard('verbinden'),
              }, 'Verbinden')),
            start.fehler ? h('p', { style: { ...S.boardFehler, marginTop: '10px' } },
              start.fehler) : null));
      }

      const positionen = positionenVon(data);
      const vorhaben = data.vorgaenge || [];
      // Beiträge fremder und eigener Vorhaben: sie stehen an ihrer Station und
      // werden dort mit dem Namen dessen gezeigt, der sie geschrieben hat.
      const beitraege = Array.isArray(data.beitraege) ? data.beitraege : [];
      const spalten = positionen.length + 1;
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
        return p.name || (p.ich ? 'Du' : 'ohne Namen');
      };
      // Wer ein Vorhaben verantwortet, steht je Station in der Ablage. Die
      // Handlungen bietet die Seite nur an, wenn `darf` sie erlaubt; fehlt die
      // Antwort (alte Daten), bleibt es beim bisherigen Angebot.
      const verantwortlicheVon = (v) => {
        const feld = v && v.verantwortliche;
        const liste = feld && typeof feld === 'object' && !Array.isArray(feld)
          ? feld[v.position]
          : null;
        return Array.isArray(liste) ? liste.map(String) : [];
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
      const gewaehlterSchritt = (art === 'schritt' && auswahlId)
        ? (() => {
          const schritt = schritte.find((x) => x.id === auswahlId);
          if (!schritt) return null;
          const stellen = positionen.filter((p) => p.schritt === schritt.id);
          const erste = stellen[0] || null;
          const wie = erste && erste.abgeleitet
            ? erste.abgeleitet.wie
            : { art: (schritt.wie && schritt.wie.art) || 'textfeld', wert: (schritt.wie && schritt.wie.wert) || '' };
          return {
            id: schritt.id,
            name: schritt.name,
            host: schritt.host || '',
            // Ein fremder Schritt wird nur gelesen. Geändert wird er in der
            // Workflow-Datei seines Hosts, nicht hier.
            fremd: schritt.fremd === true || !!(ich && schritt.host && schritt.host !== ich.id),
            ref: typeof schritt.ref === 'string' ? schritt.ref : null,
            fehlt: schritt.fehlt === true,
            stellen: stellen.length,
            abgeleitet: erste && erste.abgeleitet
              ? erste.abgeleitet
              : { eingang: [], ausgabe: [], eingangEigener: false, ausgabeEigene: false, wie },
          };
        })()
        : null;

      const gewaehlt = auswahl
        ? (auswahl.art === 'schritt'
          ? gewaehlterSchritt
          : vorhaben.find((v) => v.id === auswahl.id))
        : null;

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
      const verschiebenPanel = verschiebenVorhaben ? h('div', { style: S.bestaetigung },
        h('div', { style: { fontSize: '12px' } },
          '„' + verschiebenVorhaben.name + '“ von „'
          + positionsName(verschiebenVorhaben.position) + '“ nach „'
          + positionsName(verschieben.nach) + '“ verschieben?'),
        h('div', { style: { display: 'flex', gap: '6px', marginTop: '8px' } },
          h('button', {
            type: 'button',
            style: S.klein,
            onClick: async () => {
              const auftrag = verschieben;
              setVerschieben(null);
              await verschiebenNach(auftrag.id, auftrag.nach);
            },
          }, 'Verschieben'),
          h('button', {
            type: 'button',
            style: S.klein,
            onClick: () => setVerschieben(null),
          }, 'Abbrechen'))) : null;

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
      function schrittWaehlen(id) {
        setMeldung(null);
        setAuswahl((alt) => (alt && alt.art === 'schritt' && alt.id === id
          ? null
          : { art: 'schritt', id }));
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
            ? 'kommt von „' + q.name + '“'
            : 'wird von „' + q.name + '“ erwartet'));
        });
        const weitere = bekannteDateien.filter((n) => !namen.includes(n)
          && !angebote.some((x) => x.name === n));

        const setzen = (liste) => setEntwurf({ ...e, [feld]: liste.join(', ') });

        return h('div', { style: S.feldBlock },
          h('span', { style: S.feldTitel }, istEingang ? 'Eingang' : 'Ausgang'),
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
                    title: 'Diesen Namen aus dem Feld nehmen',
                    style: {
                      border: 0, background: 'transparent', cursor: 'pointer',
                      padding: 0, color: 'inherit', fontSize: '10px', lineHeight: 1,
                    },
                    onClick: () => setzen(namen.filter((x) => x !== n)),
                  }, '✕')
                  : null)),
              getippt ? null : h('span', { style: S.feldFolgt }, 'folgt automatisch'))
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
                    title: 'Diesen Namen ins Feld nehmen',
                    onClick: () => setzen(namen.concat([a.name])),
                  }, '+ ' + a.name, h('span', { key: 'w', style: { opacity: 0.7 } }, a.warum))))
                : null,
              // Was sonst im Board vorkommt, ist schwächer: kein Vorschlag für
              // diese Verbindung, nur ein Name, den es gibt.
              weitere.length
                ? h('div', { style: S.feldAngebote },
                  angebote.length
                    ? h('span', { key: 'trend', style: S.feldFolgt }, 'auch im Board:')
                    : null,
                  weitere.map((n) => h('button', {
                    key: 'w-' + n,
                    type: 'button',
                    style: { ...S.feldAngebot, opacity: 0.7 },
                    title: 'Diesen Namen ins Feld nehmen',
                    onClick: () => setzen(namen.concat([n])),
                  }, '+ ' + n)))
                : null)
            : null);
      }

      function chipFuer(v) {
        const aktiv = art === 'vorhaben' && auswahlId === v.id;
        // Was die eigene Person an diesem Vorhaben darf. Ohne Antwort gibt es
        // keine Handlung — lieber nichts anbieten als falsch.
        const darf = v.darf || {};
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
            style: { ...S.feld, width: 'auto', padding: '0 2px', fontSize: '11px', height: '20px' },
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
            title: 'Dateien dieses Vorhabens zeigen',
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
              setMeldung(null);
              setZurueck(null);
              setWeiter(null);
              setLeser(null);
              setAuswahl((alt) => (alt && alt.art === 'vorhaben' && alt.id === v.id
                ? null : { art: 'vorhaben', id: v.id }));
            },
          }, v.name + (offen.length ? ' ↩' : '')),

          // Wer das Vorhaben gerade verantwortet — an jedem Vorhaben, nicht
          // erst im geöffneten Zustand.
          v.verantwortet
            ? h('div', {
              style: {
                margin: '0 0 6px', fontSize: '11px', lineHeight: 1.4,
                color: 'var(--dsw-alias-label-secondary)',
              },
            }, 'verantwortet von ' + v.verantwortet)
            : null,

          // Woher das Vorhaben kommt: „Zweig von … ab …“ und „Fork von …“.
          // Ist der Ursprung sichtbar, führt sein Name dorthin.
          zweigHerkunft || forkHerkunft
            ? h('div', { style: S.herkunftZeile },
              zweigHerkunft
                ? h('div', { key: 'zweig' },
                  'Zweig von ',
                  zweigHerkunft.sichtbar
                    ? h('button', {
                      type: 'button',
                      style: S.herkunftLink,
                      title: 'Zum Ursprung „' + (zweigHerkunft.name || zweigHerkunft.von) + '“',
                      onClick: () => herkunftOeffnen(zweigHerkunft.von),
                    }, zweigHerkunft.name || zweigHerkunft.von)
                    : (zweigHerkunft.name || zweigHerkunft.von),
                  ' ab ' + (zweigHerkunft.stationName || zweigHerkunft.station))
                : null,
              forkHerkunft
                ? h('div', { key: 'fork' },
                  'Fork von ',
                  forkHerkunft.sichtbar
                    ? h('button', {
                      type: 'button',
                      style: S.herkunftLink,
                      title: 'Zum Ursprung „' + (forkHerkunft.name || forkHerkunft.von) + '“',
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
                margin: '0 0 6px', fontSize: '11px', lineHeight: 1.45, color: alsText(vFarbe),
              },
            }, offen.map((r, i) => h('div', { key: i },
              '↩ zurück nach „' + (r.nachName || nameVon(r.nach)) + '“: „'
                + (r.grund || 'ohne Angabe') + '“',
              h('span', { style: { opacity: 0.75 } },
                ' — von ' + (r.vonName || nameVon(r.von)) + ', ' + r.seit))))
            : null,

          aktiv && (darf.verschieben || darf.aendern || darf.weitergeben
            || darf.zurueckschicken)
            ? h('div', { style: S.knoepfeKlein },
              darf.verschieben
                ? (vorgaenger.length
                  ? wahl(vorgaenger, '◀', vorgaenger.length === 1 ? 'Zurück' : 'Zurück — wohin?', false)
                  : h('button', {
                    type: 'button',
                    style: { ...S.mini, ...S.miniAus },
                    title: 'Keine Station davor',
                    disabled: true,
                  }, '◀'))
                : null,
              darf.verschieben
                ? (nachfolger.length
                  ? wahl(nachfolger, '▶', nachfolger.length === 1
                    ? (fertig ? 'Weiter — das Ergebnis dieser Station liegt vor' : 'Weiter')
                    : 'Weiter — wohin?', fertig)
                  : h('button', {
                    type: 'button',
                    style: { ...S.mini, ...S.miniAus },
                    title: 'Keine Station danach',
                    disabled: true,
                  }, '▶'))
                : null,
              darf.weitergeben
                ? h('button', {
                  type: 'button',
                  style: nachfolger.length ? S.mini : { ...S.mini, ...S.miniAus },
                  title: nachfolger.length
                    ? 'Weitergeben: Zielstation und nächste verantwortliche Person nennen'
                    : 'Keine Station danach',
                  disabled: !nachfolger.length,
                  onClick: () => {
                    setMeldung(null);
                    setZurueck(null);
                    setProjektEdit(null);
                    const ziel = nachfolger.length ? nachfolger[0] : '';
                    setWeiter({
                      id: v.id,
                      nach: ziel,
                      person: ziel ? hostVonPosition(ziel) : (ich ? ich.id : ''),
                    });
                  },
                }, 'Weitergeben')
                : null,
              darf.aendern
                ? h('button', {
                  type: 'button',
                  style: projektEdit && projektEdit.id === v.id
                    ? { ...S.mini, borderColor: 'var(--dsw-alias-brand-primary)' }
                    : S.mini,
                  title: 'Bearbeiten: Name und Farbe',
                  onClick: () => {
                    setMeldung(null);
                    setWeiter(null);
                    setProjektEdit(projektEdit && projektEdit.id === v.id
                      ? null
                      : { id: v.id, name: v.name, farbe: vFarbe });
                  },
                }, '✎')
                : null,
              darf.zurueckschicken
                ? h('button', {
                  type: 'button',
                  style: vorgaenger.length ? S.mini : { ...S.mini, ...S.miniAus },
                  title: 'Zurückschicken: etwas ist offen',
                  disabled: !vorgaenger.length,
                  onClick: () => {
                    setMeldung(null);
                    setProjektEdit(null);
                    setWeiter(null);
                    setZurueck({
                      id: v.id,
                      nach: vorgaenger.length ? vorgaenger[0] : v.position,
                      grund: '',
                    });
                  },
                }, '↩')
                : null)
            : null,

          // Ein fremdes Vorhaben lässt sich lesen: seine Dateien sind einen
          // Klick entfernt. Geändert wird dort nichts.
          aktiv && !darf.aendern
            ? h('div', { style: S.knoepfeKlein },
              h('button', {
                type: 'button',
                style: S.mini,
                title: 'Die Dateien dieses Vorhabens ansehen',
                onClick: () => dateienOeffnen('', v),
              }, 'Dateien'))
            : null,

          // Forken darf jedes sichtbare Vorhaben — auch ein fremdes. Die Kopie
          // ist ein eigenes Vorhaben; der Ursprung bleibt unberührt.
          aktiv
            ? h('div', { style: S.knoepfeKlein },
              h('button', {
                type: 'button',
                style: S.mini,
                title: 'Eine eigene Kopie dieses Vorhabens anlegen — der Ursprung bleibt, wie er war',
                disabled: forkLaeuft === v.id,
                onClick: () => forken(v),
              }, forkLaeuft === v.id ? '…' : 'Forken'))
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
                h('button', { type: 'button', style: S.klein, onClick: projektSpeichern }, 'Speichern'),
                h('button', {
                  type: 'button', style: S.klein, onClick: () => setProjektEdit(null),
                }, 'Abbrechen')))
            : null,

          aktiv && zurueck && zurueck.id === v.id
            ? h('div', { style: S.form },
              h('select', {
                style: { ...S.feld, fontSize: '11px', marginBottom: '6px' },
                value: zurueck.nach,
                onChange: (e) => setZurueck({ ...zurueck, nach: e.target.value }),
              }, positionen.map((p) => h('option', { key: p.id, value: p.id }, p.name))),
              h('input', {
                autoFocus: true,
                style: { ...S.feld, fontSize: '11px', marginBottom: '6px' },
                placeholder: 'Was ist offen?',
                value: zurueck.grund,
                onChange: (e) => setZurueck({ ...zurueck, grund: e.target.value }),
                onKeyDown: (e) => {
                  if (e.key === 'Enter') { e.preventDefault(); zurueckschicken(); }
                  if (e.key === 'Escape') { e.preventDefault(); setZurueck(null); }
                },
              }),
              h('div', { style: { display: 'flex', gap: '6px' } },
                h('button', { type: 'button', style: S.klein, onClick: zurueckschicken },
                  'Zurückschicken'),
                h('button', {
                  type: 'button', style: S.klein, onClick: () => setZurueck(null),
                }, 'Abbrechen')))
            : null,

          // Weitergeben: Zielstation und nächste verantwortliche Person. Der
          // Eintrag an der Zielstation entsteht mit der Handlung, das Vorhaben
          // wandert dorthin. Ohne genannte Person bleibt es beim Abgebenden.
          aktiv && weiter && weiter.id === v.id
            ? h('div', { style: S.form },
              h('div', { style: { fontSize: '11px', marginBottom: '4px' } },
                'Weitergeben an'),
              h('select', {
                style: { ...S.feld, fontSize: '11px', marginBottom: '6px' },
                value: weiter.nach,
                onChange: (e) => {
                  const ziel = e.target.value;
                  setWeiter({ ...weiter, nach: ziel, person: hostVonPosition(ziel) });
                },
              }, nachfolger.map((id) => h('option', { key: id, value: id }, nameVon(id)))),
              h('div', { style: { fontSize: '11px', marginBottom: '4px' } },
                'Nächste verantwortliche Person'),
              h('select', {
                style: { ...S.feld, fontSize: '11px', marginBottom: '6px' },
                value: weiter.person,
                onChange: (e) => setWeiter({ ...weiter, person: e.target.value }),
              }, personen.map((p) => h('option', { key: p.id, value: p.id },
                p.name || (p.ich ? 'Du' : p.id)))),
              h('div', { style: { display: 'flex', gap: '6px' } },
                h('button', { type: 'button', style: S.klein, onClick: weitergebenAktion },
                  'Weitergeben'),
                h('button', {
                  type: 'button', style: S.klein, onClick: () => setWeiter(null),
                }, 'Abbrechen')))
            : null);
      }

      // Eine Spalte ist entweder ein Prozess („A → B", mit Skill) oder ein
      // Dokument. Der Prozess zeigt seinen Skill im Feld, das Dokument erscheint
      // in der Spalte danach. Nur der letzte Prozess zeigt seine Dateien selbst,
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
      // Dokument erscheint in der Spalte danach. Folgt ihm wieder ein Prozess,
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
      // beim Prozess seine Ausgabedatei, an der Ergebnis-Spalte das, was dort
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
          title: 'Transkript der Sitzung öffnen',
          style: {
            ...S.dateiKnopf, borderStyle: 'dashed', borderColor: farbe, color: alsText(farbe),
          },
          onClick: () => oeffneTranskript(p.id, p.name),
        }, '◆ ' + wie.wert);
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
          title: 'Dieses Gespräch in einer Spalte rechts öffnen',
          style: { ...S.dateiKnopf, borderColor: farbe, color: alsText(farbe) },
          onClick: () => gespraechBeginnen(wie.wert, p.id),
        }, '▶ ' + wie.wert + ' starten');
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
        setMeldung(null);
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
        setMeldung(null);
        setWeiter(null);
        setZurueck(null);
        setProjektEdit(null);
        setLeser(null);
        setAuswahl({ art: 'vorhaben', id: ziel.id });
      }

      // Eine eigene Kopie anlegen — auch von einem fremden Vorhaben. Der
      // Ursprung wird nur gelesen; geschrieben wird allein der neue Ordner.
      async function forken(v) {
        if (!v || forkLaeuft) return;
        setForkLaeuft(v.id);
        setMeldung(null);
        try {
          const wert = await sende('/board/vorhaben/forken', { id: v.id });
          const neu = (wert.vorgaenge || []).find((x) => x.id === wert.neu) || null;
          setAuswahl({ art: 'vorhaben', id: wert.neu });
          setMeldung('Fork „' + ((neu && neu.name) || wert.neu)
            + '“ angelegt — der Ursprung bleibt, wie er war.'
            + (wert.dateien ? ' ' + wert.dateien + ' Dateien übernommen.' : ''));
        } catch (e) {
          setMeldung('Forken nicht möglich: ' + String((e && e.message) || e));
        } finally {
          setForkLaeuft(null);
        }
      }

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
                fehler: 'Der Ordner ließ sich nicht lesen: ' + String((e && e.message) || e),
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
      function dateiOeffnen(pfad) {
        if (!dateien) return;
        const teile = String(pfad).split('/');
        const name = teile[teile.length - 1];
        const ordner = teile.slice(0, -1).join('/');
        const vorhabenId = dateien.vorhaben;
        setMeldung(null);
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
          .catch(() => setMeldung('Die Datei „' + name + '“ ließ sich nicht lesen.'));
      }

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
              ? (e.anzahl || 0) + ' Einträge'
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
                : h('div', { key: unterpfad + '-lade', style: { ...S.meta, ...rand } }, 'Lade …'))
              : null,
          ];
        });
        if (dateien.mehr[pfad]) {
          zeilen.push(h('div', { key: pfad + '-mehr', style: { ...S.meta, ...rand } },
            '… und ' + dateien.mehr[pfad] + ' weitere'));
        }
        return zeilen;
      }

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
          title: 'In den Ordner des Vorhabens schreiben',
          style: { ...S.dateiKnopf, borderStyle: 'dotted', borderColor: farbe, color: alsText(farbe) },
          onClick: () => oeffneSchreiben(datei, p.name, p.id),
        }, '✎ ' + p.name + ' schreiben');
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
      // Strich — nichts Erfundenes.
      const anzeigeZeile = (titel, wert) => {
        const text = String(wert || '').trim();
        return h('div', { style: S.feldBlock },
          h('span', { style: S.feldTitel }, titel),
          text
            ? h('div', { style: S.anzeigeWert }, text)
            : h('div', { style: { ...S.anzeigeWert, ...S.leer } }, '—'));
      };

      // Wie an dieser Station gearbeitet wird — das Wort aus der Auswahl und,
      // wenn eines genannt ist, das gewählte Ding dazu.
      const aktionText = () => {
        const w = WIE.find((x) => x.wert === e.wieArt) || WIE[2];
        // Nur Skill und Skript tragen einen Namen; die anderen Arten sind
        // ohne Zusatz vollständig.
        if (!e.wieWert.trim() || w.wert === 'textfeld' || w.wert === 'chat'
          || w.wert === 'datei') return w.text;
        return w.text + ': ' + e.wieWert.trim();
      };

      // Die geöffnete Station, gelesen. Das Öffnen zeigt die Werte; erst
      // „Bearbeiten“ macht daraus Felder. Ein fremder Schritt bleibt beim
      // Lesen: geändert wird er in der Workflow-Datei seines Hosts.
      const stationAnzeige = () => (art === 'schritt' && gewaehlt) ? h('div', { style: S.anzeige },
        h('div', { style: { ...S.hostZeile, marginBottom: 0 } },
          gewaehlt.ref
            ? 'bei ' + personName(gewaehlt.host)
            : 'Host: ' + personName(gewaehlt.host)
              + (ich && gewaehlt.host === ich.id ? ' (du)' : '')),

        gewaehlt.fremd
          ? h('div', { style: S.fremdHinweis },
            gewaehlt.ref
              ? 'Verweis auf „' + gewaehlt.ref + '“ — hier nur zu lesen.'
              : 'Dieser Schritt gehört ' + personName(gewaehlt.host)
                + ' — hier nur zu lesen.')
          : null,

        anzeigeZeile('Beschreibung', e.inhalt),
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
              h('span', { style: S.feldTitel }, 'Übergabe'),
              h('div', { style: S.uebergabe }, zeilen))
            : null;
        })(),
        anzeigeZeile('Weiterreichung zur nächsten Station', e.weiter === 'automatisch'
          ? 'Automatisch, wenn die Ausgabedatei erzeugt ist'
          : 'Freigabe'))
        : null;

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
          'Host: ' + personName(gewaehlt.host)
            + (ich && gewaehlt.host === ich.id ? ' (du)' : '')),

        // Der Name ist die Beschriftung der Station: er steht auf der Karte und
        // in den Nachbarlisten. Die Datei hängt nicht an ihm — beim Umbenennen
        // trägt das Board den bisherigen Dateinamen als Ausgang ein.
        h('div', { style: S.feldBlock },
          h('span', { style: S.feldTitel }, 'Name'),
          h('input', {
            style: { ...S.feld, width: '100%', boxSizing: 'border-box' },
            value: e.name || '',
            onChange: (ev) => setEntwurf({ ...e, name: ev.target.value }),
          })),

        h('div', { style: S.feldBlock },
          h('span', { style: S.feldTitel }, 'Beschreibung'),
          h('textarea', {
            style: { ...S.flaeche, minHeight: '54px', width: '100%' },
            value: e.inhalt,
            onChange: (ev) => setEntwurf({ ...e, inhalt: ev.target.value }),
          })),

        // Der Eingang: das Feld und darunter, was sich anbietet. Kein eigener
        // Knopf — die Liste steht immer da, wo ein Dateiname stehen kann.
        dateiFeld('eingang'),

        h('div', { style: S.feldBlock },
          h('span', { style: S.feldTitel }, 'Aktion'),
          h('div', { style: { ...S.knoepfe, flexWrap: 'wrap' } },
            WIE.map((w) => h('button', {
              key: w.wert,
              type: 'button',
              style: e.wieArt === w.wert ? { ...S.wahl, ...S.wahlAktiv } : S.wahl,
              onClick: () => {
                setEntwurf({ ...e, wieArt: w.wert });
                if (w.wert === 'skill' && e.wieWert) ausgangFuerSkill(e.wieWert);
              },
            }, w.text)))),

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
            h('option', { value: '' }, '— Skill wählen —'),
            skills.map((sk) => h('option', { key: sk.name, value: sk.name },
              (sk.titel ? sk.titel + ' — ' + sk.name : sk.name)
                + (sk.entwurf ? ' (Entwurf)' : '')))),
            h('button', { type: 'button', style: S.klein, onClick: werkstattStarten },
              'Skill kreieren'))
          : null,

        e.wieArt === 'skript'
          ? h('input', {
            style: { ...S.feld, width: '100%', boxSizing: 'border-box' },
            value: e.wieWert,
            placeholder: 'Pfad des Skripts',
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
              h('span', { style: S.feldTitel }, 'Übergabe'),
              h('div', { style: S.uebergabe }, zeilen))
            : null;
        })(),

        h('div', { style: S.feldBlock },
          h('span', { style: S.feldTitel }, 'Weiterreichung zur nächsten Station'),
          h('div', { style: { ...S.knoepfe, flexWrap: 'wrap' } },
            WEITER.map((w) => h('button', {
              key: w.wert,
              type: 'button',
              style: e.weiter === w.wert ? { ...S.wahl, ...S.wahlAktiv } : S.wahl,
              onClick: () => setEntwurf({ ...e, weiter: w.wert }),
            }, w.text)))),

        h('div', { style: { ...S.knoepfe, marginTop: '2px' } },
          h('button', { type: 'button', style: S.button, onClick: schrittSpeichern }, 'Speichern'),
          imFeld
            ? h('button', {
              type: 'button', style: S.klein, onClick: () => setAuswahl(null),
            }, 'Schließen')
            // In der Karte führt „Abbrechen“ zurück zur Anzeige — geschlossen
            // wird dort mit dem X.
            : h('button', {
              type: 'button', style: S.klein, title: 'Ohne Änderung zurück zur Anzeige',
              onClick: stationVerwerfen,
            }, 'Abbrechen'),
          h('span', { style: { flex: 1 } }),
          // Löschen geht nur, solange die Station nirgends im Workflow steht.
          gewaehlt.stellen > 0
            ? null
            : bestaetigenSchritt === gewaehlt.id
              ? h('span', { style: S.knoepfe },
                h('button', { type: 'button', style: S.klein, onClick: schrittLoeschen },
                  'Ja, löschen'),
                h('button', {
                  type: 'button', style: S.klein, onClick: () => setBestaetigenSchritt(null),
                }, 'Abbrechen'))
              : h('button', {
                type: 'button',
                style: S.klein,
                title: 'Diese Station aus der Bibliothek löschen',
                onClick: () => { setMeldung(null); setBestaetigenSchritt(gewaehlt.id); },
              }, 'Löschen')))
        : null;

      // --- Die Fläche -------------------------------------------------------
      const KARTEN_BREITE = 240;
      // Doppelt so hoch wie vorher: darunter ist Platz für die Dateien, die
      // eine Station zeigt, wenn ein Vorhaben gewählt ist.
      const KARTEN_HOEHE = 240;
      // Beim Bearbeiten bläht sich die Station auf und zeigt ihre Einstellungen.
      const KARTE_GROSS = 440;
      // Mitte der Titelzeile: drei Pixel Farbstreifen, sieben Pixel Rand,
      // dann die erste Zeile.
      const PORT_HOEHE = 20;
      // Die offene Station steht groß da; ihre Schnüre setzen am breiten Rand an.
      const offeneStation = art === 'schritt' ? auswahlId : null;
      const breiteFuer = (p) => (p && p.schritt === offeneStation ? KARTE_GROSS : KARTEN_BREITE);

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
      // Die offene Station ist hoch: die Fläche bekommt genug Platz, damit sie
      // ganz zu sehen ist.
      const flaechenHoehe = Math.max(360,
        ...karten.map((p) => (p.y || 0)
          + (p.schritt === offeneStation ? 760 : KARTEN_HOEHE + 60))) + 240;

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
          setMeldung('Lage nicht gespeichert: ' + String((e && e.message) || e));
          return false;
        }
      }

      // Frei oder automatisch. Gewechselt wird nur der Modus: seine Lagen
      // bleiben, wie sie sind, und stehen beim Zurückschalten wieder da.
      async function anordnungSetzen(modus) {
        if (anordnung === modus) return;
        try {
          await sende('/board/layout', { modus });
          setMeldung(null);
          const el = flaecheRef.current;
          if (el) { el.scrollLeft = 0; el.scrollTop = 0; }
        } catch (e) {
          setMeldung('Anordnung nicht gewechselt: ' + String((e && e.message) || e));
        }
      }

      async function mausradSetzen(wert) {
        if (wert === mausrad) return;
        setMeldung(null);
        try {
          await sende('/board/einstellung', { name: 'mausrad', wert });
        } catch (e) {
          setMeldung('Einstellung nicht gespeichert: ' + String((e && e.message) || e));
        }
      }

      async function kanteLegen(von, nach) {
        try {
          await sende('/board/kante', { von, nach });
          setMeldung('Verbunden.');
        } catch (e) {
          setMeldung('Nicht verbunden: ' + String((e && e.message) || e));
        }
      }

      async function kanteLoeschen() {
        if (!kanteWahl) return;
        try {
          await sende('/board/kante/loeschen', { von: kanteWahl.von, nach: kanteWahl.nach });
          setKanteWahl(null);
          setMeldung('Verbindung gelöst.');
        } catch (e) {
          setKanteWahl(null);
          setMeldung('Nicht gelöst: ' + String((e && e.message) || e));
        }
      }

      // Eine Kiste greifen: sie folgt dem Zeiger, rastet auf zehn Pixel und
      // wird beim Loslassen gespeichert.
      //
      // Während des Zuges zeichnet niemand das Board neu: die Kiste wandert per
      // transform, die Schnüre an ihr bekommen einen neuen Pfad, und das alles
      // höchstens einmal je Bild. Neu gezeichnet wird erst beim Loslassen — so
      // bleibt das Ziehen auch dann flüssig, wenn ein Dokument offen ist.
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
      function kanteZiehen(p, ev) {
        ev.preventDefault();
        ev.stopPropagation();
        const raum = flaecheRef.current;
        if (!raum) return;
        const bild = raum.querySelector('svg[data-kanten]');
        zeigerFest('crosshair');
        const r = raum.getBoundingClientRect();
        const x0 = r.left + raum.scrollLeft;
        const y0 = r.top + raum.scrollTop;

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
            onClick: () => { setMeldung(null); setKanteWahl({ von: k.von, nach: k.nach }); },
          }));
      }));

      const flaeche = h('div', {
        style: {
          position: 'relative', width: flaechenBreite + 'px', height: flaechenHoehe + 'px',
          marginTop: '14px',
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
          const raum = flaecheRef.current;
          const r = raum ? raum.getBoundingClientRect() : { left: 0, top: 0 };
          const x = Math.max(0, Math.round((ev.clientX - r.left + (raum ? raum.scrollLeft : 0) - 20) / 10) * 10);
          const y = Math.max(0, Math.round((ev.clientY - r.top + (raum ? raum.scrollTop : 0) - 20) / 10) * 10);
          const id = schrittZug;
          setSchrittZug(null);
          setSchrittZiel(null);
          schrittEinfuegen(id, x, y);
        },
      },
      kantenBild,
      karten.map((p) => {
        // In der Spalte stehen alle Vorhaben an dieser Station — auch ein
        // weitergegebenes. Wer es verantwortet, sagt die Zeile darunter; die
        // Handlungen bietet erst `darf` an.
        const hier = vorhaben.filter((v) => v.position === p.id);
        const hierBeitraege = beitraege.filter((b) => b && b.schritt === p.id);
        const dateien = dateienFuer(p).filter((d) => d.exists);
        const start = startFuer(p);
        const schreiben = schreibFuer(p);
        const skill = skillFuer(p);
        const aktiv = art === 'schritt' && auswahlId === p.schritt;
        const lage = lageVon(p);
        const sFarbe = farbeFuerSchritt(p.schritt);
        const schrittHeiss = schrittZiel === 'karte-' + p.id;
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
              'bei ' + personName(refSchritt.host) + ' · Verweis',
              h('div', { key: 'ein' },
                'Eingang: ' + ((refSchritt.eingang || []).join(', ') || '—')),
              h('div', { key: 'aus' },
                'Ausgang: ' + ((refSchritt.ausgabe || []).join(', ') || '—')))
            : null,
          hier.map(chipFuer),
          // Beiträge stehen an der Station, an der sie gemacht wurden — mit dem
          // Namen dessen, der sie geschrieben hat. Ein Klick öffnet Notiz und
          // vorgeschlagene Fassungen; entschieden wird erst beim Verantwortlichen.
          hierBeitraege.map((b) => h('button', {
            key: 'beitrag-' + b.id,
            type: 'button',
            style: S.beitragKnopf,
            title: 'Beitrag öffnen — Notiz und vorgeschlagene Fassungen lesen',
            onClick: () => beitragOeffnen(b),
          },
          h('div', { style: S.beitragKopf },
            'Beitrag von ' + (b.von || '—')
            + (b.vorhabenName ? ' · ' + b.vorhabenName : '')),
          b.notiz ? h('div', { style: S.beitragNotiz }, b.notiz) : null,
          Array.isArray(b.dateien) && b.dateien.length
            ? h('div', { style: S.beitragDateien }, b.dateien.join(', '))
            : null,
          b.entschieden
            ? h('div', { style: S.beitragDateien },
              (b.entschieden.art === 'angenommen' ? 'angenommen' : 'abgelehnt')
              + ' von ' + personName(b.entschieden.von))
            : null)),
          start,
          schreiben,
          skill,
          dateien.map((d) => h('button', {
            key: d.name,
            type: 'button',
            title: d.art === 'ordner'
              ? 'Ordner öffnen — ' + (d.anzahl || 0) + ' Einträge'
              : 'Dokument öffnen',
            style: {
              ...S.dateiKnopf,
              borderColor: farbe,
              color: alsText(farbe),
              ...(d.art === 'ordner' ? { borderStyle: 'dashed' } : null),
            },
            onClick: () => {
              setMeldung(null);
              setEingriff(null);
              if (d.art === 'ordner') {
                dateienOeffnen(d.name);
                return;
              }
              // Über die Leserroute, damit die Basis der Datei mitkommt.
              oeffneDateiMitBasis(gewaehltesVorhaben.id, d.name, p.id);
            },
          }, d.art === 'ordner'
            ? d.name + ' · ' + (d.anzahl || 0)
            : d.name)),
          // Passt die Übergabe zu einem Nachbarn nicht, steht es an der Karte —
          // zu sehen, ohne die Station zu öffnen. Geöffnet steht es ausführlich
          // in der Anzeige, deshalb nur an der geschlossenen Karte.
          (() => {
            if (aktiv) return null;
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
              zeilen.slice(0, 2).map((t, i) => h('div', { key: i }, '⚠ ' + t)),
              zeilen.length > 2
                ? h('div', { key: 'mehr' }, '… und ' + (zeilen.length - 2) + ' weitere')
                : null);
          })(),
        ];

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
                h('span', { key: 'frage', style: S.feldTitel }, 'Verweis herausnehmen?'),
                h('button', {
                  key: 'ja', type: 'button', style: S.klein,
                  onClick: () => verweisEntfernen(gewaehlt.ref),
                }, 'Ja, herausnehmen'),
                h('button', {
                  key: 'nein', type: 'button', style: S.klein,
                  onClick: () => setBestaetigenVerweis(null),
                }, 'Nein'),
              ]
              : h('button', {
                key: 'nehmen',
                type: 'button',
                style: S.klein,
                title: 'Nur der Verweis verschwindet; der Schritt bleibt bei seinem Host',
                onClick: () => { setMeldung(null); setBestaetigenVerweis(gewaehlt.ref); },
              }, 'Verweis herausnehmen'))
            : bestaetigen === p.id
              ? [
                h('span', { key: 'frage', style: S.feldTitel }, 'Aus dem Workflow nehmen?'),
                h('button', {
                  key: 'ja', type: 'button', style: S.klein, onClick: positionLoeschen,
                }, 'Ja, herausnehmen'),
                h('button', {
                  key: 'nein', type: 'button', style: S.klein,
                  onClick: () => setBestaetigen(null),
                }, 'Nein'),
              ]
              : h('button', {
                key: 'nehmen',
                type: 'button',
                style: S.klein,
                title: 'Die Station bleibt in der Bibliothek',
                onClick: () => { setMeldung(null); setBestaetigen(p.id); },
              }, 'Aus dem Workflow nehmen'));

        return h('div', {
          key: p.id,
          'data-schritt': p.id,
          style: {
            ...S.karte,
            width: breiteFuer(p) + 'px',
            minHeight: KARTEN_HOEHE + 'px',
            position: 'absolute', left: lage.x + 'px', top: lage.y + 'px',
            ...(aktiv
              ? { boxShadow: '0 12px 32px rgba(0, 0, 0, 0.22)', zIndex: 4 }
              : null),
            ...(zug && zug.id === p.id
              ? { boxShadow: '0 10px 24px rgba(0, 0, 0, 0.18)', zIndex: 3 }
              : null),
            ...(schrittHeiss
              ? { outline: '2px dashed var(--dsw-alias-brand-primary)', outlineOffset: '-2px' }
              : ziel === p.id && ziehen
                ? {
                  outline: '2px dashed ' + (farbe || 'var(--dsw-alias-brand-primary)'),
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
              setMeldung(null);
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
            setMeldung(null);
            setVerschieben({ id, nach: p.id });
          },
        },
        h('div', {
          style: { ...S.portEin, borderColor: sFarbe + '99' },
          title: 'Eingang',
        }),
        h('div', {
          style: { ...S.portAus, borderColor: sFarbe },
          title: 'Ausgang — ziehen, um mit einer anderen Station zu verbinden',
          onPointerDown: (ev) => kanteZiehen(p, ev),
        }),
        // Hier fällt der Schritt hin: ein Plus, das gleich die Richtung sagt.
        schrittHeiss
          ? h('div', { key: 'plus', style: S.kartePlusZiel },
            h('span', null, '＋'),
            h('span', { style: S.kartePlusZielText }, 'danach'))
          : null,
        h('div', {
          style: { ...S.karteKopf, borderTop: '3px solid ' + sFarbe, background: sFarbe + '14' },
        },
        h('button', {
          type: 'button',
          style: aktiv ? { ...S.karteName, ...S.karteNameAktiv } : S.karteName,
          title: aktiv ? 'Klein machen' : 'Station öffnen',
          onClick: () => schrittWaehlen(p.schritt),
        }, p.name || (p.fehlt ? 'Verweis fehlt' : p.schritt)),
        // Die freie Fläche neben dem Namen ist der Griff zum Bewegen: der
        // Zeiger wird zur Hand, ein Klick tut nichts. Automatisch angeordnet
        // gibt es nichts zu greifen — dann bleibt nur die Fläche übrig, die
        // den Namen nach links und die Knöpfe nach rechts hält.
        h('div', {
          style: anordnung === 'auto' ? { ...S.griff, cursor: 'default' } : S.griff,
          title: anordnung === 'auto' ? null : 'Ziehen verschiebt die Station',
          onPointerDown: anordnung === 'auto' ? null : (ev) => kisteZiehen(p, ev),
        }),
        anordnung === 'auto'
          ? null
          : h('svg', {
            width: 10, height: 14, viewBox: '0 0 10 14',
            style: S.griffPunkte, 'aria-hidden': 'true',
          },
          [2, 7, 12].map((y) => h('circle', { key: 'l' + y, cx: 3, cy: y, r: 1.3, fill: 'currentColor' })),
          [2, 7, 12].map((y) => h('circle', { key: 'r' + y, cx: 7, cy: y, r: 1.3, fill: 'currentColor' }))),
        // Nur die geöffnete Station trägt ein X: es macht sie wieder klein.
        // Die geschlossene Karte bleibt frei davon — sie wird über ihren
        // Namen geöffnet und über ihren Griff bewegt.
        aktiv
          ? h('div', { style: { display: 'flex', flex: 'none', alignItems: 'center', gap: '2px' } },
            stationEdit || fremderSchritt
              ? null
              : h('button', {
                type: 'button',
                style: { ...S.klein, flex: 'none' },
                title: 'Werte dieser Station ändern',
                onClick: () => {
                  setMeldung(null);
                  setBestaetigen(null);
                  setEntwurf(entwurf || schrittEntwurf(data, auswahlId));
                  setStationEdit(true);
                },
              }, 'Bearbeiten'),
            h('button', {
              type: 'button',
              style: S.thStift,
              title: 'Klein machen',
              onClick: () => setAuswahl(null),
            }, '✕'))
          : null),
        // Die Fläche unter der Trennlinie: hier liegt, was gerade im Schritt
        // ist — und wenn nichts darin liegt, bleibt sie leer und sichtbar.
        h('div', {
          style: aktiv ? { ...S.karteKoerper, cursor: 'default' } : S.karteKoerper,
          title: aktiv ? null : 'Klick auf eine leere Stelle: Station öffnen',
          onClick: aktiv ? null : (ev) => {
            if (ev.target !== ev.currentTarget) return;
            setMeldung(null);
            schrittWaehlen(p.schritt);
          },
        },
          aktiv
            ? (stationEdit
              ? stationFormular(false)
              // Geöffnet steht oben, was eingestellt ist, darunter das, was
              // gerade darin liegt — und ganz unten der Weg heraus.
              : [stationAnzeige(), inhalt, fuss])
            : inhalt));
      }));

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
          'Verbindung „' + positionsName(kanteWahl.von) + '“ → „'
          + positionsName(kanteWahl.nach) + '“ löschen?'),
        h('button', { type: 'button', style: S.klein, onClick: kanteLoeschen }, 'Ja, löschen'),
        h('button', {
          type: 'button', style: S.klein, onClick: () => setKanteWahl(null),
        }, 'Abbrechen'))
        : null;


      const neuesVorhaben = h('div', { style: { marginTop: '14px' } },
        editVorhaben === null
          ? h('button', {
            type: 'button',
            style: S.zeilePlus,
            title: 'Neues Vorhaben, beginnt an der ersten Position',
            onClick: () => { setMeldung(null); setEditVorhaben(''); },
          }, '+ Neues Vorhaben')
          : eingabe(editVorhaben, setEditVorhaben, vorhabenAnlegen));

      // Die Bibliothek: alle Schritte, auch die, die gerade nicht im Workflow
      // stehen. Ein Schritt ist ein Ding — steht er zweimal im Workflow, ist
      // es derselbe, und eine Änderung gilt an beiden Stellen.
      const bibliothek = h('div', null,
        h('div', { style: S.bibKopf },
          h('div', { style: { ...S.hinweis, marginTop: 0 } },
            schrittZug
              ? 'Auf die freie Fläche fallen lassen — oder auf eine Station: dann kommt sie gleich danach.'
              : 'Station greifen und auf die Fläche ziehen; Klick öffnet sie.'),
          h('span', { style: { flex: 1 } }),
          neuerSchritt !== null
            ? h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } },
              h('div', { style: { width: '200px' } },
                eingabe(neuerSchritt, setNeuerSchritt, schrittAnlegen)),
              h('button', {
                type: 'button', style: S.klein, onClick: () => setNeuerSchritt(null),
              }, 'Abbrechen'))
            : h('button', {
              type: 'button',
              style: S.kartePlus,
              onClick: () => { setMeldung(null); setNeuerSchritt(''); },
            }, '+ Neue Station')),
        h('div', { style: S.bibReihe },
          schritte.length
            ? schritte.map((schritt, i) => {
              const stellen = positionen.filter((p) => p.schritt === schritt.id).length;
              const aktiv = art === 'schritt' && auswahlId === schritt.id;
              const bFarbe = farbeFuerSchritt(schritt.id);
              return h('div', {
                key: schritt.id,
                draggable: true,
                title: 'Ziehen setzt die Station in den Workflow; Klick öffnet sie',
                onDragStart: (ev) => {
                  setSchrittZug(schritt.id);
                  try {
                    ev.dataTransfer.setData('text/plain', schritt.id);
                    ev.dataTransfer.effectAllowed = 'copy';
                  } catch { /* egal */ }
                },
                onDragEnd: () => { setSchrittZug(null); setSchrittZiel(null); },
                style: aktiv
                  ? { ...S.bibKarte, borderColor: 'var(--dsw-alias-brand-primary)' }
                  : S.bibKarte,
              },
              h('button', {
                type: 'button',
                style: {
                  ...S.bibReiter,
                  borderTop: '3px solid ' + bFarbe,
                  background: bFarbe + '14',
                  color: aktiv ? 'var(--dsw-alias-brand-primary)' : undefined,
                },
                title: schritt.name,
                onClick: () => schrittWaehlen(schritt.id),
              }, schritt.name || (schritt.fehlt ? 'Verweis fehlt' : schritt.id)),
              h('div', { style: S.bibFlaeche },
                schritt.fremd
                  ? 'bei ' + personName(schritt.host) + ' — nur lesen'
                  : stellen === 0
                    ? null
                    : stellen === 1
                      ? '1× im Workflow'
                      : stellen + '× im Workflow'));
            })
            : h('span', { style: S.meta },
              'Noch keine Stationen — „+ Neue Station“ legt eine an.')));

      // Die Reiter über dem Board. Zugeklappt gehört die Höhe dem Board; was
      // offen ist, bleibt beim Wechsel zum Chat offen.
      const reiter = (wert, text) => h('button', {
        key: wert,
        type: 'button',
        style: leiste === wert ? { ...S.reiter, ...S.reiterOffen } : S.reiter,
        title: leiste === wert ? 'Zuklappen' : 'Aufklappen',
        onClick: () => setLeiste((alt) => (alt === wert ? null : wert)),
      }, h('span', { style: S.reiterPfeil }, leiste === wert ? '▾' : '▸'), text);

      const leistenReiter = h('div', { style: S.leiste },
        reiter('bibliothek', 'Bibliothek'),
        reiter('einstellungen', 'Einstellungen'),
        reiter('verlauf', 'Verlauf'));

      // Die Einstellungen: was am Board gilt und nicht zum Workflow gehört.
      // Oben die Anordnung, darunter das Mausrad; weitere kommen hierher.
      const einstellungen = h('div', null,
        h('div', null,
          h('div', { style: S.settingZeile },
            h('span', { style: S.settingTitel }, 'Anordnung'),
            ['frei', 'auto'].map((modus) => h('button', {
              key: modus,
              type: 'button',
              style: anordnung === modus ? { ...S.wahl, ...S.wahlAktiv } : S.wahl,
              title: modus === 'auto'
                ? 'Das Board ordnet die Stationen in Linien an'
                : 'Die Stationen stehen, wo du sie hinziehst',
              onClick: () => anordnungSetzen(modus),
            }, modus === 'auto' ? 'Automatisch' : 'Frei'))),
          h('div', { style: S.settingHinweis }, anordnung === 'auto'
            ? 'Das Board ordnet an — verschieben geht im Modus „Frei“.'
            : 'Die Stationen stehen, wo du sie hinziehst.')),
        h('div', { style: S.settingBlock },
          h('div', { style: S.settingZeile },
            h('span', { style: S.settingTitel }, 'Mausrad'),
            ['seitwaerts', 'auf-ab'].map((wert) => h('button', {
              key: wert,
              type: 'button',
              style: mausrad === wert ? { ...S.wahl, ...S.wahlAktiv } : S.wahl,
              title: wert === 'seitwaerts'
                ? 'Das Rad schiebt das Board nach links und rechts'
                : 'Das Rad schiebt das Board nach oben und unten',
              onClick: () => mausradSetzen(wert),
            }, wert === 'seitwaerts' ? 'Seitwärts' : 'Auf und ab'))),
          h('div', { style: S.settingHinweis },
            mausrad === 'seitwaerts'
              ? 'Das Rad schiebt nach links und rechts; mit Shift nach oben und unten.'
              : 'Das Rad schiebt nach oben und unten; mit Shift nach links und rechts.')));

      // Der Verlauf des Boards: was jede Speicherung geändert hat. Die Fassungen
      // liegen im lokalen Repository; hier stehen sie der Reihe nach, die
      // neueste oben — eine Umbenennung steht so als eigene Zeile da.
      const verlaufFlaeche = h('div', null,
        h('div', { style: S.settingHinweis },
          'Jede Speicherung im Board legt eine Fassung an — mit dem, was sich geändert hat.'),
        !fassungen || fassungen.zustand === 'laedt'
          ? h('div', { style: { ...S.settingHinweis, marginTop: '8px' } }, 'Lade …')
          : fassungen.zustand === 'fehler'
            ? h('div', { style: { ...S.settingHinweis, marginTop: '8px' } },
              'Der Verlauf ließ sich nicht laden.')
            : !fassungen.liste.length
              ? h('div', { style: { ...S.settingHinweis, marginTop: '8px' } },
                'Noch keine Fassung.')
              : h('div', { style: S.fassungen },
                fassungen.liste.map((f) => h('div', { key: f.hash, style: S.fassungZeile },
                  h('div', { style: S.fassungKopf }, wann(f.datum) + ' · ' + wer(f.autor)),
                  h('div', { style: S.fassungWas }, f.nachricht)))));

      // Eine Station, die noch nicht auf der Fläche steht, hat keine Karte, die
      // sich aufblähen könnte — ihre Einstellungen stehen deshalb hier. Ein
      // fremder Schritt wird auch hier nur gelesen.
      const schrittPanel = (art === 'schritt' && gewaehlt && gewaehlt.stellen === 0)
        ? h('div', { style: S.detail },
          h('div', { style: S.detailKopf },
            h('div', { style: S.detailTitle }, gewaehlt.name
              || (gewaehlt.fehlt ? 'Verweis fehlt' : gewaehlt.id)),
            h('button', {
              type: 'button', style: S.schliessen, title: 'Schließen',
              onClick: () => setAuswahl(null),
            }, '✕')),
          gewaehlt.fremd
            ? stationAnzeige()
            : [
              h('div', { key: 'hinweis', style: { ...S.hinweis, marginBottom: '10px' } },
                'Noch nicht auf der Fläche — zieh sie dorthin, dann öffnet sie sich dort.'),
              stationFormular(true),
            ])
        : null;

      // Die Flächen aller Personen. Die eigene steht oben; die fremden folgen
      // als Leseblätter — ihre Schritte sind sichtbar und anklickbar, aber es
      // gibt dort keine Felder zum Ändern, Löschen, Anlegen oder Ziehen.
      const eigene = eigeneFlaeche(data);
      const eigeneFarbe = eigene && eigene.farbe ? eigene.farbe : OHNE_FARBE;
      const eigenerKopf = h('div', { style: S.flaechenKopf },
        h('span', { style: { ...S.personPunkt, background: eigeneFarbe } }),
        h('span', { style: S.flaechenName }, eigene ? (eigene.name || 'Du') : 'Du'),
        h('span', { style: S.fremdHinweis }, 'deine Fläche'));

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
                  title: offen ? 'Ein- und Ausgang zuklappen' : 'Ein- und Ausgang zeigen',
                  onClick: () => setFremdOffen(offen ? null : schluessel),
                }, schritt.name || (schritt.fehlt ? 'Verweis fehlt' : schritt.id)),
                h('div', { style: S.fremdKarteKoerper },
                  h('div', { style: S.fremdKarteFuss },
                    schritt.ref
                      ? 'Verweis aus ' + schritt.ref
                      : 'bei ' + personName(schritt.host || person.id)),
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
                        ? 'Steht schon als Verweis in deinem Workflow'
                        : 'Als Verweis in deinen Workflow stellen — die Datei von '
                          + (person.name || person.id) + ' bleibt, wie sie ist',
                      onClick: stehtSchon ? null : () => fremdAnstellen(schluessel),
                    }, stehtSchon ? 'steht in deinem Workflow' : 'In meinen Workflow stellen')
                    : null,
                  schritt.fehlt
                    ? h('div', { style: S.fremdKarteFuss },
                      'Das Ziel dieses Verweises fehlt in der Ablage.')
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
                          title: 'Vorhaben öffnen und seine Dateien lesen',
                          onClick: () => fremdesVorhabenOeffnen(v),
                        },
                        h('span', {
                          key: 'punkt',
                          style: { ...S.personPunkt, background: vFarbe, marginRight: '6px' },
                        }),
                        'Vorhaben „' + v.name + '“ an „' + stationName(v) + '“'
                          + (v.verantwortet ? ' — verantwortet von ' + v.verantwortet : '')
                          + ' · Dateien ansehen'),
                        // Auch hier gilt: forken darf jedes sichtbare Vorhaben.
                        h('button', {
                          type: 'button',
                          style: { ...S.klein, marginTop: '3px' },
                          title: 'Eine eigene Kopie dieses Vorhabens anlegen — der Ursprung bleibt, wie er war',
                          disabled: forkLaeuft === v.id,
                          onClick: () => forken(v),
                        }, forkLaeuft === v.id ? 'Forke …' : 'Forken'));
                    }))
                  : null,
                ihreBeitraege.length
                  ? h('div', { style: S.fremdVorhaben },
                    h('div', { style: S.fremdKarteFuss }, 'Beiträge'),
                    ihreBeitraege.map((b) => h('button', {
                      key: 'beitrag-' + b.id,
                      type: 'button',
                      style: S.fremdVorhabenKnopf,
                      title: 'Beitrag öffnen — Notiz und vorgeschlagene Fassungen lesen',
                      onClick: () => beitragOeffnen(b),
                    },
                    'Beitrag von ' + (b.von || '—')
                      + ' an „' + (b.station || b.schritt) + '“'
                      + (b.vorhabenName ? ' · ' + b.vorhabenName : '')
                      + (b.entschieden
                        ? ' · ' + (b.entschieden.art === 'angenommen'
                          ? 'angenommen' : 'abgelehnt')
                        : '')
                      + (b.notiz ? ' — ' + b.notiz : ''))))
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
                'Fläche von ' + (person.name || person.id)
                + ' — hier nur zu lesen. Geändert wird sie dort, wo sie herkommt.')),
            workflows);
          }))
        : null;

      function transkriptInhalt() {
        if (!transkript || transkript.zustand === 'laedt') {
          return h('p', { style: S.meta }, 'Lade …');
        }
        if (transkript.zustand === 'fehler') {
          return h('p', { style: S.meta }, 'Das Transkript konnte nicht geladen werden.');
        }

        const laeufe = transkript.laeufe || [];
        if (!laeufe.length) {
          return h('p', { style: S.meta }, 'Dieses Transkript ist nicht mehr da.');
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
              (l.datum || '') + ' · ' + (l.skill || '') + (i === 0 ? ' (neuestes)' : ''))))
            : null,
          lauf.fehlt
            ? h('p', { style: S.meta }, 'Die Transkript-Datei fehlt im Ordner: ' + lauf.datei)
            : markdown(lauf.text, oeffneLink));
      }

      // Ein Beitrag: die Notiz, die vorgeschlagenen Fassungen und der
      // Entscheid. Annehmen, Teile oder Ablehnen bietet nur der
      // Verantwortliche an; alle anderen lesen den Vermerk.
      function beitragInhalt() {
        if (!beitrag || beitrag.laedt) {
          return h('p', { style: S.meta }, 'Lade …');
        }
        if (beitrag.fehler) {
          return h('p', { style: S.meta },
            'Der Beitrag ließ sich nicht laden: ' + beitrag.fehler);
        }
        const dateien = Array.isArray(beitrag.dateien) ? beitrag.dateien : [];
        const entschieden = beitrag.entschieden && typeof beitrag.entschieden === 'object'
          ? beitrag.entschieden : null;
        const ziel = vorhaben.find((v) => v.id === beitrag.vorhaben) || null;
        const darfEntscheiden = !entschieden
          && !!(ziel && ziel.darf && ziel.darf.entscheiden === true);
        const wahl = entscheid && Array.isArray(entscheid.teile) ? entscheid.teile : [];
        const laeuft = !!(entscheid && entscheid.laeuft);

        return h('div', null,
          h('div', { style: S.meta },
            'Beitrag von ' + (beitrag.von || '—')
            + (beitrag.seit ? ' · ' + wann(beitrag.seit) : '')
            + ' · Station „' + (beitrag.station
              || positionsName(beitrag.schritt)) + '“'),
          h('div', { style: { ...S.marke, marginTop: '14px' } }, 'Notiz'),
          beitrag.notiz
            ? h('div', { style: S.beitragInhalt }, beitrag.notiz)
            : h('p', { style: S.meta }, 'Keine Notiz — nur eine vorgeschlagene Fassung.'),
          h('div', { style: { ...S.marke, marginTop: '18px' } }, 'Vorgeschlagene Fassungen'),
          dateien.length
            ? dateien.map((d) => h('div', { key: d.name, style: { marginTop: '12px' } },
              h('div', { style: { fontSize: '12px', fontWeight: 600 } },
                d.name + (d.exists === false ? ' · fehlt' : '')),
              d.exists === false
                ? h('p', { style: S.meta }, 'Die vorgeschlagene Datei fehlt: ' + d.datei)
                : h('div', {
                  style: {
                    marginTop: '4px', padding: '10px 12px', borderRadius: '8px',
                    border: '1px solid var(--dsw-alias-border-l1)',
                    background: 'var(--dsw-alias-bg-layer-1)',
                  },
                }, markdown(d.text || '', null))))
            : h('p', { style: S.meta }, 'Nur eine Notiz — keine Datei vorgeschlagen.'),
          h('div', { style: { ...S.marke, marginTop: '18px' } }, 'Entscheid'),
          entschieden
            ? h('div', { style: S.meta },
              (entschieden.art === 'angenommen' ? 'Angenommen' : 'Abgelehnt')
              + ' von ' + personName(entschieden.von)
              + (entschieden.am ? ' am ' + wann(entschieden.am) : '')
              + (entschieden.art === 'angenommen'
                ? ' · Übernommen: ' + (Array.isArray(entschieden.teile)
                  && entschieden.teile.length
                  ? entschieden.teile.join(', ')
                  : 'keine Datei')
                : ' · Keine Datei übernommen.'))
            : darfEntscheiden
              ? h('div', null,
                dateien.length
                  ? h('div', { style: { marginBottom: '8px' } },
                    dateien.map((d) => h('label', {
                      key: 'teil-' + d.name,
                      style: { display: 'block', fontSize: '12px', lineHeight: 1.5 },
                    },
                    h('input', {
                      type: 'checkbox',
                      checked: wahl.includes(d.name),
                      disabled: laeuft,
                      onChange: () => entscheidTeilUmschalten(d.name),
                    }),
                    ' ' + d.name)))
                  : null,
                h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
                  h('button', {
                    type: 'button',
                    style: { ...S.klein, ...(laeuft ? { opacity: 0.5 } : {}) },
                    disabled: laeuft,
                    title: 'Den Beitrag ganz oder in den angehakten Teilen übernehmen',
                    onClick: () => beitragEntscheiden('annehmen'),
                  }, 'Annehmen'),
                  h('button', {
                    type: 'button',
                    style: { ...S.klein, ...(laeuft ? { opacity: 0.5 } : {}) },
                    disabled: laeuft,
                    title: 'Den Beitrag ablehnen — der Stand des Vorhabens bleibt unverändert',
                    onClick: () => beitragEntscheiden('ablehnen'),
                  }, 'Ablehnen')),
                entscheid && entscheid.fehler
                  ? h('div', { style: S.meta }, entscheid.fehler)
                  : null)
              : h('p', { style: S.meta },
                'Noch nicht entschieden — das entscheidet die verantwortliche Person.'));
      }

      // Der Verlauf: eine Fassung wählen, den Unterschied sehen, zurückgehen.
      function historieInhalt() {
        if (!historie || historie.zustand === 'laedt') {
          return h('p', { style: S.meta }, 'Lade …');
        }
        if (historie.zustand === 'fehler') {
          return h('p', { style: S.meta }, 'Der Verlauf ließ sich nicht laden.');
        }
        const liste = historie.liste || [];
        const wahl = Math.min(historie.wahl || 0, Math.max(0, liste.length - 1));
        const eintrag = liste[wahl];
        const v = historie.version;

        if (!liste.length) {
          return h('p', { style: S.meta },
            'Für diese Datei gibt es noch keine Fassung — sie wurde seit dem Anfang des Verlaufs nicht gespeichert.');
        }

        return h('div', null,
          h('select', {
            style: { ...S.feld, marginBottom: '8px' },
            value: String(wahl),
            onChange: (ev) => waehleVersion(Number(ev.target.value)),
          }, liste.map((e, i) => h('option', { key: e.hash, value: String(i) },
            wann(e.datum) + ' · ' + wer(e.autor) + ' · ' + e.nachricht))),
          h('div', { style: { ...S.meta, marginBottom: '10px' } },
            'von ' + (eintrag.autor === 'Mensch' ? 'dir' : eintrag.autor) + ' am ' + wann(eintrag.datum),
            eintrag.nachricht ? ' — ' + eintrag.nachricht : ''),
          v && v.zustand === 'laedt' ? h('p', { style: S.meta }, 'Lade …') : null,
          v && v.zustand === 'fehler'
            ? h('p', { style: S.meta }, 'Diese Fassung ließ sich nicht laden.')
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
                  'Zurück auf diesen Stand? Die jetzige Fassung bleibt im Verlauf. ')
                : null,
              historie.frage
                ? h('button', { type: 'button', style: S.klein, onClick: zurueckAufStand }, 'Ja, zurück')
                : h('button', {
                  type: 'button',
                  style: S.klein,
                  onClick: () => setHistorie((alt) => (alt ? { ...alt, frage: true } : alt)),
                }, 'Auf diesen Stand zurück'),
              historie.frage
                ? h('button', {
                  type: 'button',
                  style: S.klein,
                  onClick: () => setHistorie((alt) => (alt ? { ...alt, frage: false } : alt)),
                }, 'Abbrechen')
                : null))
            : null);
      }

      // Der Zweig, der hier beginnt: wohin er geht, wie er heißt, was er
      // mitnimmt. „Zweig anlegen" ist die Freigabe — vorher entsteht nichts.
      function zweigInhalt() {
        if (!zweig) return null;
        const ziele = zweigZiele(leser.position);
        const mit = zweigMit(leser.position);
        const ort = positionsName(leser.position);
        const name = String(zweig.name || '').trim();
        const laeuft = !!(zweig.laeuft);
        return h('div', { style: S.zweig },
          h('div', { style: S.marke }, 'Neuer Zweig ab „' + ort + '“'),
          h('div', { style: { ...S.sub, margin: '2px 0 12px' } },
            'Das Vorhaben bleibt, wo es ist. Der Zweig beginnt an der Station, zu der von hier '
            + 'eine Schnur führt, und nimmt mit, was bis hierher entstanden ist'
            + (mit.length ? ': ' + mit.join(', ') : '') + '.'),
          h('div', { style: S.feldTitel }, 'Wohin'),
          h('div', { style: { ...S.knoepfe, margin: '4px 0 12px' } },
            ziele.map((id) => h('button', {
              key: id,
              type: 'button',
              style: {
                ...S.klein,
                ...(zweig.ziel === id
                  ? { borderColor: 'var(--dsw-alias-brand-primary)', fontWeight: 600 }
                  : null),
              },
              onClick: () => zweigZielWaehlen(id),
            }, positionsName(id)))),
          h('div', { style: S.feldTitel }, 'Name des Zweigs'),
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
            }, laeuft ? 'Lege an …' : 'Zweig anlegen'),
            h('button', {
              type: 'button',
              style: S.klein,
              onClick: () => { setZweig(null); setLeser({ ...leser, modus: 'lesen' }); },
            }, 'Abbrechen')));
      }

      // Was über dem Editor steht: der Zustand des letzten Modelleingriffs.
      // Ein Vorschlag ist kein gespeicherter Text — das steht dort, solange
      // er ihn nicht übernommen hat.
      function eingriffText() {
        if (!eingriff) return '';
        if (eingriff.fehler) {
          return (eingriff.art === 'korrektur' ? 'Korrektur nicht möglich: ' : 'Überarbeiten nicht möglich: ')
            + eingriff.fehler;
        }
        if (eingriff.laeuft) {
          return eingriff.art === 'korrektur'
            ? 'Rechtschreibung wird korrigiert — das dauert ein paar Sekunden.'
            : 'Das Modell überarbeitet den Text — bei einem langen Text dauert das bis zu einer halben Minute.';
        }
        return eingriff.art === 'korrektur'
          ? 'Korrigiert. „Zurücknehmen“ stellt deinen Text wieder her.'
          : 'Vorschlag des Modells — noch nicht gespeichert. Speichern übernimmt ihn, „Zurücknehmen“ verwirft ihn.';
      }

      // Die beiden Ablageflächen, solange gezogen wird. Sie liegen über der
      // Arbeitsfläche und nehmen selbst keine Zeigerereignisse an.
      function zielFeld(art, masse) {
        const aktiv = leserZiehen && leserZiehen.ziel === art;
        return {
          position: 'absolute',
          ...masse,
          border: '2px dashed ' + (aktiv
            ? 'var(--dsw-alias-brand-primary)'
            : 'var(--dsw-alias-border-l2)'),
          borderRadius: '10px',
          background: aktiv ? 'rgba(127,127,127,0.12)' : 'rgba(127,127,127,0.05)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: aktiv ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-label-secondary)',
          fontSize: '12px', fontWeight: aktiv ? 600 : 400,
        };
      }

      // Die Dateien: der Ordner des Vorhabens als Baum. Aufgeklappt wird nur,
      // was er anklickt — ein Produkt kann tausende Dateien haben.
      const dateienPanel = dateien ? h('div', { style: S.dateien },
        h('div', { style: S.dateienKopf },
          h('div', { style: S.dateienTitel, title: 'Dateien · ' + dateien.titel },
            'Dateien · ' + dateien.titel),
          h('button', {
            type: 'button', style: S.klein, title: 'Schließen',
            onClick: () => setDateien(null),
          }, '✕')),
        h('div', { style: S.dateienListe },
          dateien.fehler ? h('div', { style: S.meta }, dateien.fehler) : null,
          baumZeilen('', 0))) : null;

      // Ein fremdes Vorhaben lässt sich lesen und bearbeiten; gespeichert wird
      // es nicht, sondern als Beitrag mit Notiz. Der Verlauf bleibt lesbar —
      // er ändert nichts.
      const leserVorhaben = leser && (leser.art === 'datei' || leser.art === 'beitrag')
        ? (vorhaben.find((v) => v.id === leser.vorhaben) || null)
        : null;
      const leserDarfAendern = !leserVorhaben
        || !!(leserVorhaben.darf && leserVorhaben.darf.aendern === true);
      const leserModus = leser ? leser.modus : null;

      const leserPanel = leser ? h('div', {
        style: lage === 'rechts' ? { ...S.leser, ...S.leserRechts } : { ...S.leser, ...S.leserUnten },
      },
      h('div', {
        style: { ...S.leserKopf, cursor: 'grab', touchAction: 'none' },
        title: 'Ziehen: unten oder rechts ablegen',
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
        h('div', { style: S.leserTitel },
          leser.art === 'transkript'
            ? 'Transkript · ' + leser.titel
            : leser.art === 'beitrag'
              ? 'Beitrag von ' + ((beitrag && beitrag.von) || leser.titel || '—')
              : [
                // Wo die Datei liegt: das Vorhaben und die Station. Ohne beides
                // stünde hier nur ein Name, und niemand wüsste, wozu er gehört.
                h('div', { key: 'ort', style: S.leserOrt },
                  (vorhaben.find((v) => v.id === leser.vorhaben) || {}).name || leser.vorhaben,
                  leser.position ? ' · Station „' + positionsName(leser.position) + '“' : '',
                  leser.ordner ? ' · ' + leser.ordner + '/' : ''),
                h('div', { key: 'name', style: { overflow: 'hidden', textOverflow: 'ellipsis' } },
                  leser.datei + (leser.vorhanden === false ? ' · neu' : '')),
              ]),
        h('div', { style: { ...S.knoepfe, flexWrap: 'wrap', justifyContent: 'flex-end' } },
          leser.art === 'datei' && leser.modus !== 'abzweig' && leser.position
            && leserDarfAendern && leser.vorhanden !== false
            && zweigZiele(leser.position).length
            ? h('button', {
              type: 'button',
              style: S.klein,
              title: 'Dieses Vorhaben von hier aus auf einen anderen Weg schicken',
              onClick: zweigBeginnen,
            }, 'Abzweigen')
            : null,
          leser.art === 'datei' && leserModus === 'bearbeiten' && !leser.konflikt
            ? (leserDarfAendern
              ? h('button', {
                type: 'button', style: S.klein, onClick: dateiSpeichern,
              }, 'Speichern')
              : h('button', {
                type: 'button',
                style: S.klein,
                title: 'Den geänderten Text als Beitrag in die Ablage legen — das Original bleibt unberührt',
                onClick: beitragSpeichern,
              }, 'Als Beitrag speichern'))
            : null,
          leser.art === 'datei' && leserModus === 'bearbeiten'
            ? h('button', {
              type: 'button',
              style: S.klein,
              title: 'Nur Rechtschreibung und Zeichensetzung korrigieren',
              disabled: !!(eingriff && eingriff.laeuft),
              onClick: korrigiere,
            }, eingriff && eingriff.laeuft && eingriff.art === 'korrektur'
              ? 'Korrigiere …' : 'Rechtschreibung')
            : null,
          eingriff && eingriff.original !== undefined && eingriff.original !== leser.text
            ? h('button', {
              type: 'button',
              style: S.klein,
              title: 'Den Text vor dem Eingriff wiederherstellen',
              onClick: () => { setLeser({ ...leser, text: eingriff.original }); setEingriff(null); },
            }, 'Zurücknehmen')
            : null,
          leser.art === 'datei' && leser.modus !== 'verlauf' && leser.vorhanden !== false
            && !leser.pfad
            ? h('button', {
              type: 'button',
              style: S.klein,
              title: 'Die Fassungen dieser Datei — wer wann was geändert hat',
              onClick: oeffneVerlauf,
            }, 'Verlauf')
            : null,
          leser.art === 'datei' && leser.vorhanden !== false && !leser.pfad
            && !leser.binaer
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
              ? 'Lesen' : 'Bearbeiten')
            : null,
          h('button', {
            type: 'button',
            style: S.klein,
            onClick: () => setLage(lage === 'rechts' ? 'unten' : 'rechts'),
          }, lage === 'rechts' ? 'nach unten' : 'nach rechts'),
          h('button', {
            type: 'button', style: S.klein, title: 'Schließen',
            onClick: () => setLeser(null),
          }, '✕'))),
      h('div', { style: S.leserInhalt },
        leser.art === 'transkript'
          ? transkriptInhalt()
          : leser.art === 'beitrag'
            ? beitragInhalt()
            : leserModus === 'verlauf'
              ? historieInhalt()
              : leserModus === 'abzweig'
                ? zweigInhalt()
                : leserModus === 'bearbeiten'
            ? h('div', { style: { display: 'flex', flexDirection: 'column', height: '100%' } },
              h('div', { style: { flex: 'none', marginBottom: '8px' } },
                h('div', { style: S.marke }, 'Was soll anders werden?'),
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
                  title: 'Das Modell schreibt eine neue Fassung in den Editor — gespeichert wird erst mit „Speichern“',
                  disabled: !String(aenderung || '').trim() || !!(eingriff && eingriff.laeuft),
                  onClick: ueberarbeiten,
                }, eingriff && eingriff.laeuft && eingriff.art === 'ueberarbeitet'
                  ? 'Überarbeite …'
                  : 'Überarbeiten'))),
              // Ein fremdes Vorhaben wird nicht in seine Datei geschrieben:
              // beim Speichern entsteht ein Beitrag mit dieser Notiz.
              !leserDarfAendern
                ? h('div', {
                  style: {
                    flex: 'none', marginBottom: '8px', padding: '8px 10px',
                    borderRadius: '8px', border: '1px solid var(--dsw-alias-border-l1)',
                    background: 'rgba(127, 127, 127, 0.05)',
                  },
                },
                h('div', { style: { ...S.sub, margin: '0 0 6px' } },
                  'Du bearbeitest ein fremdes Vorhaben — „'
                  + ((leserVorhaben && leserVorhaben.name) || leser.vorhaben)
                  + '“ von ' + ((leserVorhaben && leserVorhaben.verantwortet) || 'jemand anderem')
                  + '. Beim Speichern entsteht ein Beitrag; die Originaldatei bleibt unberührt.'),
                h('div', { style: S.feldTitel }, 'Notiz zum Beitrag'),
                h('textarea', {
                  style: { ...S.flaeche, minHeight: '46px', marginTop: '3px' },
                  value: leser.notiz || '',
                  spellCheck: false,
                  placeholder: 'Was soll der Verantwortliche wissen?',
                  onChange: (ev) => setLeser({ ...leser, notiz: ev.target.value }),
                }))
                : null,
              // Der Stand war beim Speichern nicht mehr der neueste: nichts
              // wurde geschrieben. Der eigene Text bleibt stehen und lässt
              // sich als Beitrag anlegen; der neue Stand ist daneben lesbar.
              leser.konflikt
                ? h('div', {
                  style: {
                    flex: 'none', marginBottom: '8px', padding: '8px 10px',
                    borderRadius: '8px', border: '1px solid var(--dsw-alias-border-l1)',
                    background: 'rgba(127, 127, 127, 0.05)',
                  },
                },
                h('div', { style: { ...S.sub, margin: '0 0 6px' } },
                  'Der Stand ist neuer — gespeichert wurde nichts. Dein Text steht weiter '
                  + 'im Editor; die Datei im Vorhaben bleibt unverändert.'),
                h('details', { style: { marginBottom: '6px' } },
                  h('summary', { style: S.meta }, 'Den neuen Stand ansehen'),
                  h('pre', {
                    style: {
                      ...S.meta, whiteSpace: 'pre-wrap', maxHeight: '120px',
                      overflow: 'auto', margin: '4px 0 0',
                    },
                  }, leser.konflikt.text)),
                h('div', { style: S.feldTitel }, 'Notiz zum Beitrag'),
                h('textarea', {
                  style: { ...S.flaeche, minHeight: '46px', marginTop: '3px' },
                  value: leser.notiz || '',
                  spellCheck: false,
                  placeholder: 'Was soll beim Vorhaben ankommen?',
                  onChange: (ev) => setLeser({ ...leser, notiz: ev.target.value }),
                }),
                h('div', { style: { ...S.knoepfe, marginTop: '6px' } },
                  h('button', {
                    type: 'button',
                    style: S.klein,
                    title: 'Den eigenen Text als Beitrag anlegen — die Datei im Vorhaben bleibt, wie sie ist',
                    onClick: konfliktAlsBeitrag,
                  }, 'Eigenen Text als Beitrag anlegen'),
                  h('button', {
                    type: 'button', style: S.klein, onClick: konfliktNeuenStand,
                  }, 'Neuen Stand übernehmen')))
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
                  'Keine Textdatei — hier wird nichts angezeigt.' + (leser.groesse
                    ? ' Sie ist ' + Math.max(1, Math.round(leser.groesse / 1024)) + ' KB groß.' : ''))
                : null,
              eingriff && !eingriff.laeuft && !eingriff.fehler
                && eingriff.original !== undefined && eingriff.original !== leser.text
                ? h('p', { style: { ...S.hinweis, margin: '0 0 12px' } },
                  'Noch nicht gespeichert — dieser Stand kommt aus dem Bearbeiten und liegt nur im Leser. '
                  + '„Zurücknehmen“ verwirft ihn.')
                : null,
              leser.binaer ? null : markdown(leser.text, oeffneLink))))
        : null;

      // Die Gesprächsspalte. Sie zeigt Fragen und Antworten — dasselbe, was
      // später im Transkript steht, nur während es entsteht. Werkzeuge,
      // Recherche und Zwischenschritte bleiben im Chat.
      const gespraechPanel = gespraech ? (() => {
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

        return h('div', {
          style: {
            ...S.gespraech,
            flex: '0 0 ' + spaltenBreite + 'px',
            maxWidth: spaltenBreite + 'px',
          },
        },
          h('div', { style: S.gespraechKopf },
            h('div', { style: { minWidth: 0 } },
              h('div', { style: S.gespraechTitel },
                gespraech.art === 'werkstatt'
                  ? 'Skill für „' + (gespraech.titel || '') + '“'
                  : (gespraech.skill ? '◆ ' + gespraech.skill : 'Gespräch')),
              h('div', { style: S.meta }, gespraech.art === 'werkstatt'
                ? 'Werkstatt dieser Station'
                : positionsName(gespraech.position))),
            h('div', { style: { display: 'flex', gap: '6px', flex: 'none' } },
              gespraech.session
                ? h('button', {
                  type: 'button',
                  style: S.klein,
                  title: 'Diese Sitzung im Chat öffnen',
                  onClick: () => chatOeffnen(gespraech.session),
                }, 'im Chat')
                : null,
              h('button', {
                type: 'button',
                style: S.klein,
                title: 'Spalte schließen — das Gespräch läuft im Chat weiter',
                onClick: () => {
                  setGespraechZu(gespraech.session || true);
                  setGespraech(null);
                },
              }, '✕'))),

          h('div', {
            ref: inhaltRef,
            onScroll: (ev) => {
              const el = ev.currentTarget;
              amEnde.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 12;
            },
            style: S.gespraechInhalt,
          },
            gespraech.eintraege.length
              ? gespraech.eintraege.map((eintrag, i) => h('div', {
                key: 'g' + i, style: S.gespraechBlock,
              },
              eintrag.rolle === 'user'
                ? h('div', { style: S.gespraechFrage }, eintrag.text)
                : h('div', { style: S.gespraechAntwort }, markdown(eintrag.text, oeffneLink))))
              : h('p', { style: S.meta },
                gespraech.sendet ? 'Wird gesendet …' : 'Noch nichts gesagt.'),
            neueSkills.length
              ? h('div', { style: S.gespraechNeu },
                h('div', { style: S.meta },
                  neueSkills.length === 1 ? 'Ein neuer Skill ist da:' : 'Neue Skills sind da:'),
                neueSkills.map((name) => h('button', {
                  key: name,
                  type: 'button',
                  style: S.klein,
                  title: 'Diesen Skill an der Station eintragen',
                  onClick: () => skillEintragen(name),
                }, '„' + name + '“ an der Station eintragen')))
              : null,
            laufText ? h('p', { style: S.meta }, laufText) : null,
            gespraech.fehler
              ? h('p', { style: { ...S.hinweis, color: farbe ? alsText(farbe) : 'var(--dsw-alias-label-secondary)' } },
                gespraech.fehler)
              : null),

          h('div', { style: S.gespraechFuss },
            h('div', {
              style: S.gespraechGriff,
              title: 'Ziehen: Eingabefeld größer oder kleiner',
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
              placeholder: 'Antwort schreiben …',
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
                  borderColor: farbe || 'var(--dsw-alias-brand-primary)',
                  color: farbe ? alsText(farbe) : 'var(--dsw-alias-brand-primary)',
                  fontWeight: 600,
                  ...(sendbar ? {} : { opacity: 0.45, cursor: 'default' }),
                },
                disabled: !sendbar,
                onClick: gespraechSenden,
              }, 'Senden'),
              gespraech.laeuft
                ? h('button', { type: 'button', style: S.klein, onClick: gespraechStoppen }, 'Stopp')
                : null,
              h('span', { style: S.meta }, 'Enter sendet · Umschalt+Enter: neue Zeile')),
            gespraech.session
              ? h('div', { style: { marginTop: '6px' } },
                gespraech.verwerfen
                  ? h('span', { style: S.meta }, 'Sitzung ins Archiv legen? ',
                    h('button', {
                      type: 'button', style: S.mini, onClick: gespraechVerwerfen,
                    }, '✓'),
                    ' ',
                    h('button', {
                      type: 'button',
                      style: S.mini,
                      onClick: () => setGespraech({ ...gespraech, verwerfen: false }),
                    }, '✕'))
                  : h('button', {
                    type: 'button',
                    style: { ...S.mini, width: 'auto', padding: '0 5px', fontSize: '10px' },
                    title: 'Sitzung ins Archiv legen und die Spalte schließen',
                    onClick: () => setGespraech({ ...gespraech, verwerfen: true }),
                  }, 'verwerfen'))
              : null));
      })() : null;

      const formatWarnung = formatHinweis(data.format, data.formatAblage);
      const boards = Array.isArray(data.boards) ? data.boards : [];
      const offenesBoard = boards.find((b) => b.aktiv) || null;
      const boardName = offenesBoard ? offenesBoard.name : 'Board';
      // Woher ein Board kommt: GitHub-Repo oder ein Ordner auf diesem Rechner.
      const boardHerkunft = (b) => {
        const adresse = String((b && b.remote) || '');
        if (!adresse) return 'lokal';
        const treffer = adresse.match(/github\.com[:/]([^/]+)\/(.+)$/);
        if (treffer) return treffer[1] + '/' + treffer[2].replace(/\.git$/, '');
        return adresse;
      };

      return h('div', { style: S.page },
        h('div', { style: S.kopfFest },
          h('div', { style: S.kopf },
            h('div', { style: S.kopfText },
              h('div', { style: S.boardLeiste },
                h('button', {
                  type: 'button',
                  style: S.boardWahl,
                  title: 'Boards wechseln oder eines hinzufügen',
                  onClick: () => { setBoardOffen(!boardOffen); setBoardWeg(null); },
                },
                h('span', {
                  style: {
                    ...S.personPunkt,
                    background: 'var(--dsw-alias-brand-primary)',
                  },
                }),
                boardName,
                h('span', { style: { opacity: 0.6, fontSize: '10px' } }, '▾')),
                offenesBoard
                  ? h('span', { style: S.boardMeta }, boardHerkunft(offenesBoard))
                  : null,
                boardOffen
                  ? h('div', { style: S.boardPanel },
                    boards.map((b) => h('div', {
                      key: b.id,
                      style: { display: 'flex', alignItems: 'center', gap: '4px' },
                    },
                    h('button', {
                      type: 'button',
                      style: {
                        ...S.boardEintrag,
                        ...(b.aktiv
                          ? {
                            background: 'rgba(127, 127, 127, 0.08)',
                            borderColor: 'var(--dsw-alias-border-l1)',
                          }
                          : null),
                      },
                      onClick: () => boardWechseln(b.id),
                    },
                    h('span', {
                      style: {
                        ...S.personPunkt,
                        background: b.aktiv
                          ? 'var(--dsw-alias-brand-primary)'
                          : 'var(--dsw-alias-border-l2)',
                      },
                    }),
                    h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis' } },
                      b.name),
                    h('span', {
                      style: {
                        ...S.boardMeta, maxWidth: '130px', overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      },
                    }, boardHerkunft(b))),
                    !b.aktiv
                      ? (boardWeg === b.id
                        ? h('button', {
                          type: 'button',
                          style: S.klein,
                          title: 'Nur aus der Liste nehmen; die Dateien bleiben liegen',
                          onClick: () => boardEntfernen(b.id),
                        }, 'wirklich?')
                        : h('button', {
                          type: 'button',
                          style: S.klein,
                          title: 'Nur aus der Liste nehmen; die Dateien bleiben liegen',
                          onClick: () => setBoardWeg(b.id),
                        }, '×'))
                      : null)),
                    h('div', { style: S.boardTrenner }),
                    boardNeu
                      ? h('div', { style: S.boardForm },
                        h('input', {
                          style: { ...S.input, width: '100%' },
                          value: boardNeu.name,
                          placeholder: 'Name des Boards',
                          autoFocus: true,
                          onChange: (ev) => setBoardNeu({
                            ...boardNeu, name: ev.target.value, fehler: '',
                          }),
                        }),
                        h('input', {
                          style: { ...S.input, width: '100%' },
                          value: boardNeu.adresse,
                          placeholder: 'GitHub-Adresse oder Ordner',
                          onChange: (ev) => setBoardNeu({
                            ...boardNeu, adresse: ev.target.value, fehler: '',
                          }),
                        }),
                        h('p', { style: S.boardHinweis },
                          'Adresse leer lassen: es entsteht ein neues Board auf diesem Rechner.'),
                        boardNeu.fehler
                          ? h('p', { style: S.boardFehler }, boardNeu.fehler)
                          : null,
                        h('div', { style: S.startReihe },
                          h('button', {
                            type: 'button',
                            style: S.startZweit,
                            disabled: boardNeu.laeuft,
                            onClick: boardVerbinden,
                          }, boardNeu.laeuft ? 'Einen Moment …' : 'Verbinden'),
                          h('button', {
                            type: 'button',
                            style: S.startZweit,
                            onClick: () => setBoardNeu(null),
                          }, 'Abbrechen')))
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
                      }, '+ Board hinzufügen'),
                    boardMeldung
                      ? h('p', { style: { ...S.boardFehler, padding: '4px 6px' } }, boardMeldung)
                      : null)
                  : null),
              h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
                h('div', { style: S.title }, (eigenerWorkflow(data) || {}).titel || 'Board'),
                // Die Dateien eines Vorhabens: erreichbar, auch wenn keine
                // Station gerade einen Ordner als Ergebnis hat.
                gewaehltesVorhaben
                  ? h('button', {
                    type: 'button',
                    style: S.klein,
                    title: 'Alle Dateien dieses Vorhabens',
                    onClick: () => dateienOeffnen(''),
                  }, 'Dateien')
                  : null),
              h('p', { style: S.sub }, meldung
                || 'Klick auf ein Vorhaben zeigt seine Dateien und die Skills, die es durchlaufen hat. '
                + 'Ziehen verschiebt es. Datei anklicken: Dokument unten. Skill anklicken: Transkript. '
                + 'Station anklicken: öffnen. Bibliothek oben aufklappen: Stationen auf die Fläche ziehen.'),
              data.stand
                ? h('p', { style: { ...S.sub, marginTop: '4px', fontSize: '12px' } },
                  standZeile(data.stand))
                : null,
              formatWarnung
                ? h('p', { style: S.formatWarnung }, formatWarnung)
                : null),
            // Wer ist am Board? Jeder mit seiner Farbe; die Farbe tragen
            // seine Stationen.
            personen.length
              ? h('div', { style: S.mitglieder },
                h('div', { style: S.mitgliederTitel }, 'Am Board'),
                h('div', { style: S.mitgliederReihe },
                  personen.map((p) => h('button', {
                    key: p.id,
                    type: 'button',
                    style: {
                      ...S.person,
                      borderColor: p.farbe + '66',
                      ...(p.ich ? { background: p.farbe + '13' } : null),
                    },
                    title: p.ich
                      ? 'Dein Name und deine Farbe'
                      : 'Name und Farbe von ' + (p.name || 'dieser Person'),
                    onClick: () => {
                      setMeldung(null);
                      setPersonEdit(personEdit && personEdit.id === p.id
                        ? null
                        : { id: p.id, name: p.name, farbe: p.farbe, github: p.github || '' });
                    },
                  },
                  h('span', { style: { ...S.personPunkt, background: p.farbe } }),
                  p.name || (p.ich ? 'Du' : 'ohne Namen')))))
              : null)),
        personEdit
          ? h('div', { style: { ...S.personPanel, marginBottom: '12px' } },
            h('span', { style: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary)' } }, 'Name'),
            h('input', {
              style: { ...S.input, width: '180px' },
              value: personEdit.name,
              placeholder: 'Dein Name',
              autoFocus: true,
              onChange: (ev) => setPersonEdit({ ...personEdit, name: ev.target.value }),
              onKeyDown: (ev) => {
                if (ev.key === 'Enter') { ev.preventDefault(); personAendern(); }
                if (ev.key === 'Escape') { ev.preventDefault(); setPersonEdit(null); }
              },
            }),
            ich && personEdit.id === ich.id
              ? h('span', { style: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary)' } }, 'GitHub')
              : null,
            ich && personEdit.id === ich.id
              ? h('input', {
                style: { ...S.input, width: '140px' },
                value: personEdit.github || '',
                placeholder: 'dein-name',
                title: 'Dein Name auf GitHub — damit dich öffentliche Boards wiederfinden',
                onChange: (ev) => setPersonEdit({ ...personEdit, github: ev.target.value }),
                onKeyDown: (ev) => {
                  if (ev.key === 'Enter') { ev.preventDefault(); personAendern(); }
                  if (ev.key === 'Escape') { ev.preventDefault(); setPersonEdit(null); }
                },
              })
              : null,
            h('span', { style: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary)' } }, 'Farbe'),
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
            h('button', { type: 'button', style: S.klein, onClick: personAendern }, 'Speichern'),
            h('button', {
              type: 'button', style: S.klein, onClick: () => setPersonEdit(null),
            }, 'Abbrechen'))
          : null,
        leistenReiter,
        leiste === 'bibliothek' ? h('div', { style: S.leistenFlaeche }, bibliothek) : null,
        leiste === 'einstellungen' ? h('div', { style: S.leistenFlaeche }, einstellungen) : null,
        leiste === 'verlauf' ? h('div', { style: S.leistenFlaeche }, verlaufFlaeche) : null,
        h('div', {
          ref: raumRef,
          style: {
            display: 'flex', flex: 1, minHeight: 0, gap: '16px', position: 'relative',
            flexDirection: 'row',
          },
        },
        // Board und Leser teilen sich den Platz links vom Gespräch: untereinander
        // („unten") oder nebeneinander („rechts"). Die Gesprächsspalte bleibt
        // rechts daneben stehen — auch dann, wenn der Leser unten liegt.
        // Die Dateien stehen ganz links; sie gehören zum Vorhaben, nicht zu
        // einer Station.
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
          schrittPanel,
          h('div', {
            ref: flaecheRef,
            onScroll: (ev) => {
              const el = ev.currentTarget;
              gemerkt.scroll.links = el.scrollLeft;
              gemerkt.scroll.oben = el.scrollTop;
            },
            style: { flex: 1, minWidth: 0, minHeight: 0, overflow: 'auto' },
          },
          eigenerKopf,
          flaeche,
          neuesVorhaben,
          fremdeFlaechen)),
        leserPanel),
        gespraech ? h('div', {
          style: S.gespraechBreiteGriff,
          title: 'Ziehen: Gesprächsspalte breiter oder schmaler',
          onPointerDown: (ev) => {
            ev.preventDefault();
            const startX = ev.clientX;
            const startB = spaltenBreite;
            zeigerFest('col-resize');
            // Einmal je Bild reicht: sonst baut sich die Seite bei jeder
            // Zeigerbewegung neu auf.
            const setzen = jeFrame((breite) => setSpaltenBreite(breite));
            const bewegen = (e) => {
              // Dem Board bleibt immer Platz; die Spalte wird nicht beliebig breit.
              const grenze = Math.max(300, window.innerWidth - 520);
              setzen(Math.max(280, Math.min(grenze, startB - (e.clientX - startX))));
            };
            const loslassen = () => {
              window.removeEventListener('pointermove', bewegen);
              window.removeEventListener('pointerup', loslassen);
              zeigerFest(null);
            };
            window.addEventListener('pointermove', bewegen);
            window.addEventListener('pointerup', loslassen);
          },
        }, h('span', { style: S.gespraechBreiteStrich })) : null,
        gespraechPanel,
        leserZiehen ? h('div', {
          style: { position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5 },
        },
        h('div', { style: zielFeld('unten', { left: 0, right: 0, bottom: 0, height: '30%' }) }, 'Unten'),
        h('div', {
          style: zielFeld('rechts', { top: 0, right: 0, bottom: '30%', width: '30%' }),
        }, 'Rechts')) : null));
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
            h('div', { style: S.title }, 'Board'),
            h('p', { style: S.sub }, 'Die Ansicht ist abgestürzt: '
              + String((this.state.fehler && this.state.fehler.message) || this.state.fehler)),
            h('button', {
              type: 'button',
              style: S.button,
              onClick: () => this.setState({ fehler: null }),
            }, 'Nochmal'));
        }
        return this.props.children;
      }
    }

    return {
      inject: ['slots', 'locale'],
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

        const Seite = () => BoardPage(ctx);
        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main', key: 'board',
        }, () => h(Falle, null, h(Seite))));

        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist', id: 'board', order: 5, label: 'Board',
        }, BoardIcon));
      },
    };
  },
});
