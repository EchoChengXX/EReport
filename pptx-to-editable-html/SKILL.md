---
name: pptx-to-editable-html
description: 将现有16:9 PPTX按原稿内容、页序和视觉转换为离线可编辑HTML，保留独立SVG图形与文字，合并语义文本框和渐变碎片，并校验编辑、保存与重开。用于PPT转HTML、可编辑WebReport复刻；不用于新建演讲内容、HTML转PPT或把整页截图包装成可编辑稿。
---

# PPT 转高保真可编辑 HTML

目标是可继续修改、复用的单文件 HTML。原稿中的照片和产品截图保持图片；其余可提取的文字、矢量图形应是独立对象，不能以整页图片替代。

## 路径和依赖

包内 `scripts/convert.py` 完成渲染、对象提取、语义和渐变合并与编辑器构建；`scripts/verify.cjs` 验证浏览器行为。包内包含编辑器，不依赖另一个技能安装目录。

需要 Python 的 `python-pptx`、PyMuPDF、lxml，LibreOffice，以及 Node/Playwright 和本地 Chromium 或 Chrome。桌面环境先调用 `load_workspace_dependencies` 取得运行时；不要把某台机器的用户名或缓存版本号写入转换脚本。必要时设置 `PPTX_HTML_NODE_MODULES`、`PPTX_HTML_CHROME` 或传入 `--soffice`、`--node`。缺少依赖时明确报告，不自动改用截图式输出。

## 转换

1. 只读确认原稿和目标路径。检查页数、隐藏页、媒体、尺寸及源文字结构；目前支持16:9 PPTX，其他比例不自动拉伸。
2. 复杂稿先选代表页，覆盖多样式文字、渐变图、表格、截图、嵌套组合、连接线和视频。默认保留页序、文字和原视觉；用户要求时才统一标题或删纯视频页。
3. 运行脚本。过程文件默认自动清理；需要截图和报告时指定 `/tmp` 中的 `--work-dir` 与 `--qa-report`，不要把它们写进资料库。

```bash
python3 ~/.codex/skills/pptx-to-editable-html/scripts/convert.py \
  /absolute/source.pptx /absolute/final.html \
  --pages 1,4-6 \
  --work-dir /tmp/pptx-html-review \
  --qa-report /tmp/pptx-html-review/conversion.json
```

- 不传 `--pages`：处理全稿，包含隐藏页。
- `--omit-pure-video`：用户允许略过视频时，删除没有其他静态内容的纯视频页；其他视频页保留静态画面，不转换播放。
- `--normalize-titles webreport`：用户要求统一WebReport标题时使用；只处理内容页页头，不重写标题。暗页对比度、长标题与Logo避让仍须目视检查。
- `--pdf /absolute/rendered.pdf`：可复用已经核对的渲染PDF，但PDF页数必须与原PPT一致，不能拿删过隐藏页的PDF做映射。
- 已存在的输出文件会拒绝覆盖，避免破坏用户已编辑的最终稿。

## 校验和修复

```bash
node ~/.codex/skills/pptx-to-editable-html/scripts/verify.cjs \
  /absolute/final.html /tmp/pptx-html-review/browser
```

检查每页对象加载与截图、多行语义文字编辑、移动、缩放、撤销、保存重开和只读放映。再对照原稿检查截图，特别是文字覆盖、字体、图片裁剪、表格和连接线。浏览器测试通过不等于视觉已验收。

阅读转换报告：未匹配的源文字框、未合并文字和越界对象必须检查。不要将未匹配字形、图片内文字或无法识别的旋转文字声称为已可编辑。复杂页的修复与可接受限制见 [references/conversion-and-qa.md](references/conversion-and-qa.md)。

最终改动后重新验证。只有实际检查过才能报告通过，不用静态结构检查代替逐页视觉核验。

## 交付与复用

默认只交付最终HTML的绝对路径链接；Markdown内容解析仅在用户要求时另做。若用户要求归档Obsidian，只保存最终稿及必要导航，避免将对象JSON、截图、旧版本和抓取缓存纳入检索。

说明双击或通过对象列表编辑完整文字框、拖动和四角缩放、组合/解组、保存HTML、F11放映。保存会导出新文件，重新打开后保留修改。原始文字的初始显示尽量沿用渲染位置；改写后以该框主样式重新排版，多样式段落或大幅增字需要复核，不能承诺逐字符富文本完全保留。
