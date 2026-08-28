# rubick-snippet-plus

一个用于 [Rubick](https://rubick.app/) 的 Markdown 代码片段搜索与自动粘贴插件。

- 仓库地址：<https://github.com/shuifan-open/rubick-snippet-plus>

本项目由 [utools-snippet](https://github.com/bit-ranger/utools-snippet) 移植适配到 Rubick 而生。
通过维护一份 Markdown 文件（或目录），就能在全局输入框中快速检索并**一键粘贴**任意代码片段 / 常用文本，无需打开编辑器复制粘贴。

## 特性

- **Markdown 驱动**：将片段按 `# 标题` 组织在 `.md` 文件中（支持目录递归扫描，也可指向单个 `.md`）。
- **全局搜索**：在 Rubick 呼出后输入 `snippet` 或关键字，基于子序列（subsequence）匹配标题，支持空格分隔的多个关键词。
- **一键粘贴**：回车或点击后，自动把片段内容写入剪贴板、隐藏 Rubick、把焦点切回之前的应用，并模拟 `Ctrl+V` 完成粘贴。
- **配置持久化**：通过 `sniSetting` 设置 Markdown 路径，路径保存在本地，重进自动回填。

## 目录结构

```
rubick-snippet-plus/
├── plugin.json      # Rubick 实际读取的插件清单（必须存在，main/preload 相对路径）
├── package.json     # 供 npm link 全局链接使用的包描述（name: @pfy/rubick-snippet-plus）
├── preload.js       # 预加载脚本：搜索/粘贴/焦点恢复/剪贴板/存储等核心逻辑
├── index.html       # 界面：搜索列表 + 设置面板（UI 类型插件入口）
└── logo.png         # 插件图标
```

## 安装

### 环境要求

- [Rubick](https://rubick.app/)（已安装并可正常使用）
- [Node.js](https://nodejs.org/)（用于 `npm link`）
- Windows 或 macOS（粘贴模拟逻辑按平台自动选择实现）

### 步骤

1. 在本项目目录下将包链接到 npm 全局：

   ```bash
   npm link
   ```

2. 打开 Rubick → 设置 → 开发者 → 在安装框中填入包名并安装：

   ```
   @pfy/rubick-snippet-plus
   ```

3. 在 Rubick 中可通过以下命令调用：

   - `snippet` / `snippet_search` → 搜索并粘贴片段
   - `sniSetting` / `snippet_setting` → 配置 Markdown 路径

## 使用说明

### 1. 准备 Markdown

创建一个 `.md` 文件，用 `# `（井号空格）作为片段标题，标题后的代码块作为片段内容。**一个文件可以存放任意多个代码片段**，片段之间用 `# ` 标题分隔即可。例如：

```markdown
# pyMain

```python
if __name__ == "__main__":

    ...
```

# bash for loop

```bash
for i in $(seq 1 10); do
  echo $i
done
```

> 说明：
> - 解析时以 `#\s` 开头的行为片段标题，标题下（含语言标记的 fenced code block，如 ` ```python `）的内容会被识别为片段正文；
> - 片段正文中的 ``` 围栏行会被过滤，粘贴时只输出代码本体；
> - 也可以指定一个目录，插件会递归扫描其中所有 `.md` 文件。

### 2. 配置路径

- 呼出 Rubick，输入 `sniSetting` 进入设置。
- 在上方输入框粘贴 Markdown **目录** 或 **单个 `.md` 文件** 的绝对路径，回车保存。
- 路径会持久化保存，下次进入自动回填。

### 3. 搜索并粘贴

- 呼出 Rubick，输入 `snippet` 进入搜索。
- 继续输入关键词进行**子序列模糊匹配**（空格分隔多个关键词时需全部命中）。
- 用 `↑` / `↓` 选择，回车或点击该项即可**一键粘贴**到之前的应用（焦点会自动切回、并模拟 `Ctrl+V`）。

## 键盘操作

| 按键 | 搜索面板 | 设置面板 |
| --- | --- | --- |
| `↑` / `↓` | 切换光标 | — |
| `Enter` | 粘贴当前选中片段 | 保存输入路径并隐藏 |

## 工作机制

Rubick 的插件运行在 **BrowserView** 中，`preload.js` 会被自动注入（同时 `index.html` 也以脚本方式引入，作为兜底）。核心流程如下：

1. **录入与配置**：`sniSetting` 通过 Rubick 子输入框收集路径，用 `rubick.dbStorage`（同步 API，非 Promise）持久化键值。
2. **搜索**：`snippet` 读取 Markdown，按 `#\s` 拆分并解析出 `title` / `description`，再按子序列算法过滤。
3. **粘贴**：
   - 将片段内容写入剪贴板（`electron.clipboard`）；
   - 调用 `hideMainWindow()` 隐藏 Rubick；
   - **`focusPreviousWindow()`**：Rubick 主窗口是 `alwaysOnTop + skipTaskbar`，`hideMainWindow()` 只是隐藏、不会把焦点还给之前的应用，且 Rubick 没有恢复焦点的 API。因此插件在 Windows 上用 **PowerShell + Win32（`EnumWindows` / `SetForegroundWindow`）**，在 macOS 上用 **`osascript`**，主动把焦点切回 Z 序最顶层的可见、非 Rubick 窗口；
   - 稍作等待后调用 **`simulatePaste()`** 模拟粘贴。

### 为什么不用 `rubick.simulateKeyboardTap`

Rubick 自带的 `simulateKeyboardTap` 通过 `java -jar .../jar/key-sender.jar` 发送按键，但部分 Rubick 发行版**并未打包该 jar 文件**，导致模拟按键静默失败、永远不会粘贴。因此本插件改用更可靠的原生方案：

- **Windows**：`cscript` + `WScript.Shell.SendKeys` 发送 `Ctrl+V`。
- **macOS**：`osascript` + `System Events keystroke` 发送 `Cmd+V`（需要「辅助功能」授权）。

`simulateKeyboardTap` 仅作为最后兜底保留。

## 开发

### 加载插件

对 `preload.js` / `index.html` 等文件做出修改后，在 Rubick 插件页（或插件开发者工具）按 `Ctrl+R` 刷新即可生效，无需重新 `npm link`。

### 手动验证

```bash
# 校验 JS 语法
node -c preload.js

# 校验 HTML 内联脚本
node -e "require('fs').readFileSync('index.html','utf8').replace(/[\s\S]*?<script>([\s\S]*?)<\/script>/g,'')"  # 说明性示例，实际以下方为准
```

> 提示：项目根目录的 `.history/` 与 `.opencode/` 为编辑器 / 工具自动生成，属忽略文件，不在版本库维护范围。

## 常见问题

### 聚焦正确、光标也切回目标窗口，但不粘贴？

优先确认是否为本节所述「jar 缺失」问题。只需确认 `simulatePaste` 走的是原生 SendKeys 分支（`preload.js` 中 `sendkeys`/`SendKeys` 存在且被调用）。若仍失败，可把 `pasteSnippet` 中 `focusPreviousWindow()` 后的 `sleep(600)` 适当调大（如 1000），以留出更多焦点稳定时间。

### macOS 上粘贴无反应？

需要在 **系统设置 → 隐私与安全性 → 辅助功能** 中为运行 Rubick 的终端 / 进程授予辅助功能权限，`osascript keystroke` 才能生效。

### 改了代码不生效？

在 Rubick 插件页 `Ctrl+R` 强制刷新（BrowserView 会重新加载 `preload.js` 与 `index.html`）。
