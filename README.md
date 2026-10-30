# CollaborationBoard

[Deutsch](README.de.md) · **English** · [Español](README.es.md) · [Français](README.fr.md) · [Русский](README.ru.md) · [日本語](README.ja.md) · [العربية](README.ar.md) · [中文](README.zh.md)

The board is a public workshop and a private workspace at once: people create
projects, work on them, and see what others are doing. There is no service in
between, no database and no separate sign-in. The harness is the process, Git is
the store, and GitHub is where rights and collaboration live.

## What the board is

Stations, workflows, projects and boards are separate Git repositories; the
public ones sit under the `DeepCollaboration` organization:

- **Station** — one step of work: what goes in, what comes out, how it runs,
  with examples and limits. Its anchor file is `station.json`.
- **Workflow** — a composition of stations with an order, branches and rules.
  Its anchor file is `workflow.json`; it points to a specific version of a
  station instead of copying it.
- **Project** — the concrete work on a workflow: name, position, who is
  responsible at each step, files and transcripts. Its anchor file is
  `vorhaben.json`.
- **Board** — a repository full of references: which workflows, projects and
  stations a person or a team uses. The public **main board** is the start page;
  next to it there are team boards and local boards without a remote.

The plugin assembles the surface from these repositories. It owns no content:
what you see is in the repositories, and what you change is recorded there as a
new version.

## Install

Requirement: DeepSeek Harness (DSH) with Node 24 and Git.

```bash
dsh plugin --profile web add github:DeepCollaboration/DeepSeekCollaborationBoard-Plugin
```

The plugin is installed into the `web` profile and enabled there. Restart DSH
afterwards; the page appears in the sidebar. The profile's configuration lives
under `$DSH_HOME/profiles/web/` — nothing there needs to be entered by hand.

### If the plugin does not start

The common cases with cause and fix are in
[docs/fehlersuche.md](docs/fehlersuche.md).

If DSH reports “Failed to load plugins” with `@local/dsh-board: failed` at
startup, the client has read a dashboard service without registering it. The
board needs `slots` (the places in the interface) and `locale` (the language);
both are listed in `client.js` under `inject`. If one is missing, DSH aborts the
plugin's startup instead of loading it without the service.

A guard in the code does not help here: the read itself throws. The fix is one
line — add the service to `inject`, restart DSH. `test/markt47.mjs` checks the
list and fails with the same message when a service is missing.

## First start

On first start the board fetches the public main board by itself:

- It clones `https://github.com/DeepCollaboration/board-hauptboard` to
  `$DSH_HOME/board/cache/DeepCollaboration/board-hauptboard`.
- It enters the main board in `$DSH_HOME/board/boards.json` and opens it.
- It fetches the stations, workflows and projects the main board points to
  into the same cache. They then live under
  `$DSH_HOME/board/cache/DeepCollaboration/<repository>`.

An existing registry with other boards stays untouched. Without a network the
entry remains and says “not fetched”; the page offers a button to retry, and the
rest of the board stays usable.

**Reading needs no name.** After the first start the main board, its stations,
the catalog and the Probeprojekt are open. You can browse, open files and read
conversations. You only need a name of your own when you join, contribute, or
want a board of your own.

### Fresh install: reading is free, creating needs a token

1. **Install.** The command is above under **Install**; restart DSH afterwards.
2. **Open.** Open the board in the sidebar. On first start the main board is
   already fetched and registered.
3. **Read.** The main board, stations, workflow, catalog and the Probeprojekt
   are open without a name and without a token. While there is no write
   permission, the board bar shows **Read only** with the reason below it; the
   library can still be browsed.
4. **Create only with a token.** The **Create station** button appears only once
   a token is stored and an owner is known. Store the token under
   **Settings → Board → GitHub**; without it the board stays readable, but no
   new stations are created. The response to an attempt to create explains this
   path.

The catalog searches public stations with the topic `dsh-board-station` even
without signing in. What you find you can read and put into a workflow; only the
reference is written.

## The interface

Everything happens on one page: a header across the top, a rail on the left,
docks beside it, and the canvas in the middle.

- **Header** — the board on the left, the title in the middle, the people and
  the page's tools on the right, including the station search. A status line
  below it says what the page has to say and disappears when there is nothing.
- **Rail** — a narrow column on the left that is always visible. It holds the
  **Library** and the **History**; a small companion sits there and reacts to
  “done” and to errors.
- **Dock** — the left dock opens the library or the history; its content scrolls
  while its header stays. The right dock shows the open station and the
  conversation, with tabs when both are open at once. Drag the left edge of the
  right dock to make it wider or narrower.
- **Canvas** — the free surface with cards and connections. Drag stations and
  projects, connect stations, hand a project on to the next step. What you move
  stays where you put it in **Free** layout.
- **Open station** — click a station on the canvas or in the library. The right
  dock shows its name and version, what goes in and what comes out, and how it
  runs.
- **Conversation** — a conversation at a station runs in the right dock and
  shows questions and answers as they are written — the same text that later
  appears in the transcript. Close the column and the conversation continues in
  the chat.

## Your own board

In the main board open the library and switch to **Catalog** at the top. There
is the **Probeprojekt** — the sample project, a public project at the “Idee”
station. The **Import into my Board** button starts the way:

1. If your name is missing, a small form asks for name, GitHub name (optional)
   and color. These details apply to all boards.
2. The board creates a local board under `$DSH_HOME/board/ablagen/<id>/`, for
   example `annas-board`.
3. The Probeprojekt is placed in your board as your own copy. The copy is a
   separate repository under `vorhaben-probeprojekt-kopie/`; it points to the
   original with `fork_von`. Workflows and stations are only referenced, not
   copied.
4. The new board is open. Use the board bar to switch between the main board and
   your own at any time. The switch stays on the surface: it fills with the new
   board without reloading the page or dropping you back into the chat.

Your own board has no remote at first and stays on this machine. It can be
published under the organization later; that needs the GitHub token.

## Creating a station

In the library, under **Stations**, the **Create station** button appears once a
token and an owner are there; below it two fields ask for name and description.
The form shows **Created under “<owner>”** — the name the repository will be
created under. The board builds a separate repository with `station.json` and a
README in the cache and creates it as a public repository `station-<id>` under
the owner — with the topic `dsh-board-station` and without a token in
`.git/config`. The reference `owner/repo` is then in `board.json`, and the new
station appears in the library immediately.

A card stays as confirmation: the station's name, its repository, and the
sentence saying where to find it. Here in the board it is under **Stations**; on
any other board it is in the **Catalog**. The **Show in catalog** button opens
the catalog with its repository id in the search and checks with GitHub instead
of reading the cache — a newly created repository sometimes takes a moment to
show up in search there. In the catalog every entry carries its origin:
**curated in the main board** or **found via GitHub**, and for found entries the
repository.

If GitHub refuses the creation, the message gives the reason: the board names
the owner and the token's login, and the way out — set the owner to your own
account, or use a token with rights on the organization.

## The open way — two people, one board

A board does not belong to one person alone. The same way has been walked from
both sides and checked in `test/markt43.mjs` against a mock GitHub server:

1. **Create.** A creates a station in the library. It becomes a public
   repository `station-<id>` under the owner, carries the topic
   `dsh-board-station`, and is listed with its reference in `board.json`.
2. **Find.** B opens the catalog. The catalog searches for the topic by itself
   and finds the station without any help; it appears next to the curated
   entries. B needs no token for this.
3. **Put into a workflow.** On the shared board the station is in the library.
   B puts it into the workflow from there. Only the reference with its version
   is written; the station stays in its repository.
4. **Fork and contribute.** B forks the station and opens a pull request against
   the original. A sees the contribution with number, state and source; the
   decision is made on GitHub.
5. **Create a project.** B creates a project at the station. It is its own
   repository; A sees the card at the step, with B as the responsible person.

Without a token, the board, workflow, station, catalog and pull requests stay
readable. Only creating, forking and contributing need a sign-in; without a
token the button leads to GitHub, where you can do the same thing.

## Appearance and language

The board brings no colors of its own: it reads the colors, surfaces and fonts
of the dashboard and follows **Settings → General → Appearance** (Light, Dark,
System) — including the fonts and font sizes set there. Themes that other
plugins register also apply.

One exception is the **board accent color**. It colors highlights in the board
and nothing else. You find it under **Settings → Board → Accent color**:
Default (the dashboard's color), Violet, Turquoise, Amber, Rose or Indigo. Every
accent has a light and a dark value; the choice applies to all boards and is
stored per person in `$DSH_HOME/board/darstellung.json`.

The same section holds **Layout** (Free or Automatic), **Mouse wheel** (sideways
or up and down), and the **Owner** of new stations and projects. Below that come
**Your identity** (name, GitHub name, color) and **GitHub** (connect or delete a
token, check a repository). The board bar at the top now only switches between
boards and creates new ones — everything that is set up lives in one place: the
settings window.

The **language** follows the dashboard: **Settings → General → Language**.
Eight languages are complete: German, English, Chinese, Spanish, French,
Russian, Japanese and Arabic. If an entry is missing in a language, the German
text appears there, never a blank. Arabic also lays out the surface right to
left (`dir="rtl"`); the cards keep their positions because the surface is a
place, not a column of text.

The dashboard itself only speaks English or Chinese — it does not ship the other
languages. If you choose German, for example, the board's text is German while
the rest of the interface stays English.

## The GitHub token (optional)

The token is **optional**. Without a token you can read, clone, write locally
and publish through your Git setup. Pull requests, questions and forks are also
possible without a token — then through the ways the board links to GitHub.

With a token the board can additionally:

- create repositories under the organization and publish a board,
- create pull requests, questions and forks directly in the board,
- read teams and private metadata,
- check your write permission on a repository.

You store it under **Settings → Board → GitHub**. The board checks it with
GitHub before saving it. It lives in `$DSH_HOME/board/github.json`, readable only
by you (0600), and never appears in a response, a message or a log. **Delete
token** removes it again.

The token does not replace Git access: writing happens through your SSH key or
your Git credentials, the token only for the GitHub API.

## Contributing, forking, asking

A **contribution** is a pull request against the repository of the thing you
want to improve. A **fork** is your own copy of that repository. A **question**
is an issue on its repository. All three stay on GitHub; the board keeps no
second store. The old local store under `beitraege/` is no longer written;
existing entries remain readable.

This is how it works in the board:

1. Open a station, a workflow or a project in the library or the catalog.
2. At the bottom, **Contributions**, **Questions** and **Fork** show their
   state.
3. With a token you create a contribution, a question or a fork right there.
   Without a token the button leads to GitHub, where you do the same.
4. The decision is made on GitHub: the responsible person merges the pull
   request, answers or closes the question, and takes over the fork. The board
   shows the new state the next time it reads.

For your own things you edit the files in the board; every save is a version in
its repository. For other people's things the way is a contribution as a pull
request; the board does not change their original file.

## Where the local files live

Everything the board stores locally lives under `$DSH_HOME/board/`:

| Path | Content |
| --- | --- |
| `boards.json` | the boards you use, which one is open, and whether an old board is an archive |
| `identitaet.json` | your name, your GitHub name, your color |
| `github.json` | your GitHub token, if stored (0600) |
| `cache/<owner>/<repository>/` | clones of public and connected repositories; deletable and rebuildable |
| `ablagen/<id>/` | your local boards including imported projects |
| `sterne.json` | the cache of stars from the catalog |
| `sichtbarkeit.json` | public or private for repositories whose name does not say it |

The repositories themselves live on GitHub or in your own folder. The cache is
a copy; the truth is in the repository.

## The old store as an archive

Next to boards of format 2, a format 1 board can sit in the registry. If it is
kept as an archive (`archiv: true` in `boards.json`), the board bar shows
“Archive” and **Read only**: projects, files and conversations stay readable;
every write attempt is rejected with **403 “The old store is an archive”**
before a file is touched. Switching to another board, removing it from the
list, and your own identity remain allowed.

Nobody sets the mark during the move. Only after the owner accepts it is the real board entered as an archive; until then it can be forced with
`BOARD_ARCHIV=1` for a check.

## The shape of the store

The store has format 2. A board repository contains `board.json` with name,
kind, people and the references to workflows, projects and stations; the main
board additionally carries `katalog.json`, the public collection. Every other
thing carries exactly one anchor file — `station.json`, `workflow.json` or
`vorhaben.json` — and next to it its files, examples and transcripts.

A board contains references, not copies of things. Only an imported project
lies in your board as its own copy, because you want to work on it; that copy is
a separate repository with its own history.

## Checks

```bash
npm test        # node --test test/*.mjs
npm run check   # node --check client.js && node --check index.js
```

`test/` holds 84 check files; the test runner counts each as one test. 34 of
them read the author's workshop — the old store and the main board, both outside
this repository. A foreign clone has neither. The CI therefore runs the 50
independent checks and filters the workshop files out with a `grep -vE`
expression ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)). A suite with
its own fixtures for all 84 is still open.

The checks read the source and work on copies under `/tmp`. They do not write to
real repositories.

## Documentation

The documentation in [`docs/`](docs/) is written in German:

- [Architecture](docs/architektur.md) — host and client, modules, storage,
  rights, composition, slots.
- [Development](docs/entwicklung.md) — requirements, wiring into the profile,
  checks, `client.js`, adding a language, troubleshooting.
- [Routes](docs/routen.md) — all `/board/*` routes with method, purpose,
  permission and response.
- [Data formats](docs/datenformate.md) — the anchor files, fields and examples.
- [Troubleshooting](docs/fehlersuche.md) — symptom, cause, fix for the cases in
  operation.

[CONTRIBUTING.md](CONTRIBUTING.md) explains how to contribute;
[CHANGELOG.md](CHANGELOG.md) lists the changes;
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) says how we work together;
[SECURITY.md](SECURITY.md) says how to report security issues.

## License

MIT — see [LICENSE](LICENSE). Copyright © 2026 Thomas Heinrich.

## Status

Version 0.1.0 — the first public version. `package.json` marks the package
private because it is installed from Git, not from npm.

Known limits: the GitHub write paths are tested against a mock server, not
live. The checks do not use a browser, so the visible result is checked by hand.
