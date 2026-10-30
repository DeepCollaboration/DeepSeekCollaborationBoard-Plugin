# In den Plugins-Store

Der Store ist die Liste **awesome-dsh-plugin**; das Dashboard liest ihren
Katalog als npm-Paket `dsh-plugin-catalog` (Format 1). Ein Eintrag ist **eine
YAML-Datei** im Repository `awesome-dsh-plugin/awesome-dsh-plugin` unter
`data/plugins/`; die READMEs und der Katalog werden daraus erzeugt. Ein eigener
npm-Upload ist nicht nötig — der Eintrag zeigt auf das GitHub-Repository, und
`dsh plugin add` installiert von dort.

## Was der Eintrag braucht

- `url`, `name` (`owner/repo`), `category`, `description` (en und zh).
- Das Repository deklariert `dsh.bundle` in `package.json` — hier vorhanden
  (`bundle.patch: ./cordis.patch.yml`), samt `cordis.patch.yml` im Wurzelordner.
- Das Repository ist mindestens einen Tag alt und trägt das Thema `dsh-plugin`.
- Eine Beschreibung, die nur sagt, was das Plugin tut (keine Werbung); sie wird
  gegen den Code geprüft.

## Der Eintrag

Datei `data/plugins/DeepCollaboration__DeepSeekCollaborationBoard-Plugin.yml`:

```yaml
url: https://github.com/DeepCollaboration/DeepSeekCollaborationBoard-Plugin
name: DeepCollaboration/DeepSeekCollaborationBoard-Plugin
category: workflow
description:
  en: A shared board that composes stations, workflows and projects from separate Git repositories, with GitHub as the access gate.
  zh: 由独立 Git 仓库组合站点、工作流和项目的共享看板，以 GitHub 作为访问关口。
```

`category` ist `workflow` (Stationen, Workflows, Vorhaben); `ui` wäre die
Oberfläche, aber der Gegenstand ist die Arbeit selbst.

## Der Weg

1. **Stand veröffentlichen.** Der Eintrag zeigt auf das Repository; was dort
   nicht liegt, gibt es im Store nicht.
2. **Repository beschreiben und verschlagworten** (GitHub → Settings):
   - Beschreibung: `A shared board for stations, workflows and projects in DeepSeek Harness.`
   - Thema: `dsh-plugin`.
3. **Eintrag als Pull Request.** Das Repository
   `awesome-dsh-plugin/awesome-dsh-plugin` forken, die YAML-Datei oben unter
   `data/plugins/` anlegen, PR öffnen. Die CI prüft Manifest, Alter, Thema und
   Form; ein Mensch liest das Repository.
4. **Danach:** Nach dem Merge erzeugt die Liste den Katalog neu; der Eintrag
   erscheint im Store, sobald das CDN-Paket aktualisiert ist.

## Was nicht nötig ist

- **Kein npm-Paket.** Der Eintrag installiert vom Repository; der interne
  Paketname `@local/dsh-board` bleibt, wie er ist. Ein öffentlicher Name wäre
  erst für eine npm-Veröffentlichung nötig.
- **Kein Tarball.** Das Plugin hat keinen Bauschritt; die Quellinstallation
  genügt. Ein vorgebautes Tarball am Release wäre nur eine Bequemlichkeit.
