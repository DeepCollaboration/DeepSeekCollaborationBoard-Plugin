# CollaborationBoard

[Deutsch](README.de.md) · [English](README.md) · [Español](README.es.md) · **Français** · [Русский](README.ru.md) · [日本語](README.ja.md) · [العربية](README.ar.md) · [中文](README.zh.md)

## Ce que c'est

CollaborationBoard réunit stations, workflows, projets et tableaux sur une seule surface dans le DeepSeek Harness. Chaque élément vit dans son propre dépôt Git ; le tableau ne conserve que les références. Il n'y a ni service propre, ni base de données, ni connexion séparée.

- **Station** — une étape de travail : ce qui entre, ce qui sort, comment elle se déroule, avec des exemples et des limites. Son fichier d'ancrage est `station.json`.
- **Workflow** — une composition de stations avec un ordre, des branches et des règles. Son fichier d'ancrage est `workflow.json` ; il pointe vers les stations avec une version au lieu de les copier.
- **Projet** — le travail concret sur un workflow : nom, position, responsables de chaque étape, fichiers et transcriptions. Son fichier d'ancrage est `vorhaben.json`.
- **Tableau** — un dépôt plein de références : quels workflows, projets et stations une personne ou une équipe utilise. Le **tableau principal** public est la page d'accueil ; à côté, il y a des tableaux d'équipe et des tableaux locaux sans dépôt distant.

## Prérequis

- DeepSeek Harness (DSH)
- Node 24
- Git

## Installation

```bash
dsh plugin --profile web add github:DeepCollaboration/DeepSeekCollaborationBoard-Plugin
```

Le plugin s'installe dans le profil `web` et y est activé. Redémarrez DSH ensuite ; la page apparaît dans la barre latérale.

## Premier démarrage

Au premier démarrage, le tableau récupère le tableau principal public, l'enregistre et charge les stations, workflows et projets qu'il référence. Vous pouvez lire et explorer sans nom ni jeton. Pour créer une station, il faut un jeton GitHub et un propriétaire ; les deux se règlent dans **Réglages → Board → GitHub**. Ensuite, créez votre première station dans la bibliothèque, sous **Stations**.

## Pour aller plus loin

- [Version complète en anglais](README.md)
- [Documentation](docs/) (en allemand)
