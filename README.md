<div align="center">
  <h1>zeroxB</h1>
  <p><strong>面向 Windows 的本地优先 AI 画布与笔记工作台</strong></p>
  <p>
    <img alt="Windows" src="https://img.shields.io/badge/Windows_10%2F11-x64-0078D4?style=flat-square&logo=windows&logoColor=white">
    <img alt="Tauri 2" src="https://img.shields.io/badge/Tauri-2-ffc131?style=flat-square&logo=tauri&logoColor=111111">
    <img alt="Next.js 15" src="https://img.shields.io/badge/Next.js-15-000000?style=flat-square&logo=nextdotjs&logoColor=white">
    <img alt="React 19" src="https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react&logoColor=111111">
    <a href="LICENSE"><img alt="GPL-3.0" src="https://img.shields.io/badge/license-GPL--3.0-0f766e?style=flat-square"></a>
  </p>
</div>

## 项目定位

zeroxB 将无限画布、Markdown 笔记、资料收集和 AI 对话整合到一个桌面工作区。内容默认保存在本机，适合把零散文本、图片、记录和引用逐步组织成可检索、可关联、可继续写作的知识结构。

> 当前产品只面向 **Windows 10/11 x64**。本仓库不维护 Android、iOS、macOS 或 Linux 安装包。

## 主要能力

- **画布优先工作区**：创建文本、图片和笔记引用节点，支持缩放、自动整理、网格吸附与线性浏览。
- **自然的文本块尺寸**：拖动创建时沿用用户手势，文本超过初始空间后自动增长；边缘可横向或纵向调整。
- **关系连线**：从节点锚点或节点任意位置右键拖动建立关系，拖动过程中实时显示实线曲线、端点与目标高亮。
- **AI 对话与定位**：AI 可结合画布内容回答问题，并将结果定位回对应节点或证据位置。
- **图片识别**：支持 Windows 本地图片识别缓存，并可通过配置的视觉模型理解图片内容。
- **可折叠界面**：左侧资源栏和底部 AI 输入区均可折叠；偏好会持久化，AI 草稿与附件不会因折叠丢失。
- **本地数据与恢复**：工作区数据保存在本机 SQLite 数据库，并提供备份、启动恢复和写入串行化保护。
- **安全的 AI 凭据**：密钥通过 Windows Credential Manager 管理，应用数据仅保存不透明引用。

## 安装

推荐从本仓库的 [Releases](https://github.com/zhuxice-ctrl/huabu/releases) 获取 Windows NSIS 安装包。

覆盖安装不会主动删除用户数据库。默认数据目录为：

```text
%APPDATA%\com.zeroxb.desktop\
```

重要数据仍建议在升级前自行备份。自定义安装目录可以在安装器中选择。

## 本地开发

### 环境要求

- Windows 10/11 x64
- Node.js 与 pnpm
- Rust stable（`x86_64-pc-windows-msvc`）
- Visual Studio 2022 Build Tools，包含 MSVC 与 Windows SDK
- Microsoft Edge WebView2 Runtime

### 启动开发环境

```powershell
corepack enable
pnpm install --frozen-lockfile
pnpm tauri dev
```

### 自动化验证

```powershell
pnpm test:canvas
pnpm verify:foundation
.\node_modules\.bin\tsc.CMD --noEmit
cargo test --manifest-path src-tauri\Cargo.toml --locked
cargo check --manifest-path src-tauri\Cargo.toml --locked
```

Rust 命令应在 Visual Studio Developer PowerShell/Command Prompt 中执行，确保 `link.exe` 可用。

### 构建 Windows 安装包

```powershell
.\node_modules\.bin\tauri.CMD build --bundles nsis
```

默认输出目录：

```text
src-tauri\target\release\bundle\nsis\
```

## 技术栈

- Tauri 2 + Rust
- Next.js 15 + React 19 + TypeScript
- Tailwind CSS 4
- React Flow
- SQLite

## 分支约定

`main` 是当前 Windows 产品的稳定主分支。功能开发应从 `main` 创建独立分支，验证通过后再合并。

## 上游与许可

zeroxB 基于 [NoteGen](https://github.com/codexu/note-gen) 开发，详细归属见 [NOTICE.md](NOTICE.md)。本项目及衍生发布遵循 [GNU General Public License v3.0](LICENSE)。
