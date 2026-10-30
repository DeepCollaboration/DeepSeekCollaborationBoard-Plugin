# CollaborationBoard

[Deutsch](README.de.md) · [English](README.md) · **Español** · [Français](README.fr.md) · [Русский](README.ru.md) · [日本語](README.ja.md) · [العربية](README.ar.md) · [中文](README.zh.md)

## Qué es

CollaborationBoard reúne estaciones, flujos de trabajo, proyectos y tableros en una sola superficie dentro del DeepSeek Harness. Cada cosa vive en su propio repositorio Git; el tablero solo guarda las referencias. No hay un servicio propio, ni una base de datos, ni un inicio de sesión aparte.

- **Estación** — un paso de trabajo: qué entra, qué sale, cómo se ejecuta, con ejemplos y límites. Su archivo ancla es `station.json`.
- **Flujo de trabajo** — una composición de estaciones con orden, ramificaciones y reglas. Su archivo ancla es `workflow.json`; apunta a las estaciones con una versión en lugar de copiarlas.
- **Proyecto** — el trabajo concreto sobre un flujo de trabajo: nombre, posición, responsables de cada paso, archivos y transcripciones. Su archivo ancla es `vorhaben.json`.
- **Tablero** — un repositorio lleno de referencias: qué flujos, proyectos y estaciones usa una persona o un equipo. El **tablero principal** público es la página de inicio; junto a él hay tableros de equipo y tableros locales sin remoto.

## Requisitos

- DeepSeek Harness (DSH)
- Node 24
- Git

## Instalación

```bash
dsh plugin --profile web add github:DeepCollaboration/DeepSeekCollaborationBoard-Plugin
```

El plugin se instala en el perfil `web` y se activa allí. Reinicia DSH después; la página aparece en la barra lateral.

## Primer inicio

En el primer arranque, el tablero descarga el tablero principal público, lo registra y trae las estaciones, los flujos de trabajo y los proyectos a los que apunta. Puedes leer y explorar sin nombre y sin token. Para crear una estación necesitas un token de GitHub y un propietario; ambos se indican en **Ajustes → Board → GitHub**. Después, crea tu primera estación en la biblioteca, en **Estaciones**.

## Más

- [Versión completa en inglés](README.md)
- [Documentación](docs/) (en alemán)
