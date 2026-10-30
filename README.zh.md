# CollaborationBoard

[Deutsch](README.de.md) · [English](README.md) · [Español](README.es.md) · [Français](README.fr.md) · [Русский](README.ru.md) · [日本語](README.ja.md) · [العربية](README.ar.md) · **中文**

## 这是什么

CollaborationBoard 把站点、工作流、项目和看板汇集到 DeepSeek Harness 中的一个界面里。每样东西都位于自己的 Git 仓库中，看板只保存引用。没有独立的服务，没有数据库，也没有单独的登录。

- **站点** — 一个工作步骤：输入什么、输出什么、怎样运行，附有示例和边界。它的锚点文件是 `station.json`。
- **工作流** — 由站点组成的流程，带有顺序、分支和规则。它的锚点文件是 `workflow.json`；它按版本引用站点，而不是复制站点。
- **项目** — 在工作流上进行的实际工作：名称、位置、每一步的负责人、文件和文字记录。它的锚点文件是 `vorhaben.json`。
- **看板** — 一个装满引用的仓库：某个人或团队使用哪些工作流、项目和站点。公开的**主看板**是起始页；旁边还有团队看板和没有远端的本地看板。

## 前提

- DeepSeek Harness（DSH）
- Node 24
- Git

## 安装

```bash
dsh plugin --profile web add github:DeepCollaboration/DeepSeekCollaborationBoard-Plugin
```

插件会安装到 `web` 配置中并在那里启用。之后重启 DSH，页面就会出现在侧边栏。

## 首次启动

首次启动时，看板会自动获取公开的主看板并登记它，同时加载它引用的站点、工作流和项目。无需名字和令牌即可阅读和浏览。创建站点需要 GitHub 令牌和所有者，两者都在**设置 → Board → GitHub** 中填写。之后，在库中的**站点**下创建你的第一个站点。

## 更多

- [英文完整版](README.md)
- [文档](docs/)（德文）
