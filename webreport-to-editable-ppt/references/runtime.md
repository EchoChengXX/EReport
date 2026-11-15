# 运行与范围

## 环境

本技能使用当前 Codex 桌面 presentations 技能的 `@oai/artifact-tool`，以及同一依赖包内的 Playwright、Sharp。Python 脚本仅使用标准库。先调用 `load_workspace_dependencies` 并读取当前 presentations 技能；设置：

- `RUNTIME_NODE_MODULES`：返回的 Node.js packages 目录。
- `RUNTIME_PYTHON`：返回的 Python 可执行文件。
- `PRESENTATIONS_SKILL`：当前 presentations/SKILL.md 所在目录。
- `CHROME_PATH`（可选）：现有 Chromium/Chrome 可执行文件。当前默认 macOS `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`；其他系统必须显式设置。不要因默认浏览器不匹配就安装或覆盖用户浏览器。

用返回的 Node 可执行文件运行脚本，`convert.mjs` 的子进程复用它。隔离浏览器在沙箱中不能启动时，按当前工具权限机制申请必要的执行权限；不改变系统浏览器配置。

在首次创建前按 presentations 技能执行 `mark_artifact_operation_started.mjs`。入口不能替代这项宿主工作流。

```sh
<RUNTIME_NODE> <SKILL_DIR>/scripts/convert.mjs <INPUT.html> --output <OUTPUT.pptx> --work <PRIVATE_WORK_DIR> --pages 1,4,7
```

路径及参数通过进程参数传递，不拼接到 shell 中。运行目录是当前任务工作目录；最终文件必须位于本任务允许写入的位置。所有文件用新输出名，不覆盖源稿。

## 分步调试

```text
node scripts/extract_webreport.mjs INPUT.html WORK_DIR --pages 1,4,7 --selector section.slide
node scripts/build_pptx.mjs WORK_DIR/manifest.json WORK_DIR/draft.pptx
python scripts/polish_pptx.py WORK_DIR/draft.pptx WORK_DIR/manifest.json WORK_DIR/native.pptx
node scripts/finalize.mjs WORK_DIR/native.pptx FINAL.pptx WORK_DIR/manifest.json
python scripts/audit_conversion.py WORK_DIR/manifest.json FINAL.pptx --report WORK_DIR/audit.json
node scripts/render_pptx.mjs FINAL.pptx WORK_DIR/final-render
```

SVG解析支持 M/L/H/V/C/S/Q/T/A/Z（含相对命令）、circle、ellipse、rect、line、polyline、polygon；使用屏幕变换矩阵映射到PPT。图标由原生路径组成，不是SVG图片。超出支持范围需检查日志，不能暗中栅格化。

## 当前边界

- 优先面向静态、多页 HTML WebReport。DOM文字、常规 CSS 卡片、边框、圆角、单层线性渐变、基本 SVG 图示是主要目标。
- 背景阴影、多层径向渐变会简化；特殊 CSS clipping/mask/filter、SVG use/text/渐变引用、Canvas/WebGL、复杂混合模式需专项适配。
- 照片、产品截图、原始品牌标志保留源图。对 mix-blend-mode:multiply 的白底图做透明化近似，不将它称为完全等价的合成。
- 对源图内嵌文字不自动OCR。HTML页面可编辑化和截图内部再重建是不同范围，用户要求后者时明确识别并单独重建。
- 当前列表自动处理UL/OL的直接LI；嵌套列表、分栏列表、异构样式段落要人工核对并适配。
- 不把固定“32页”或某个业务主题作为通用契约；测试记录只代表本次样本。

## 已验证样本

在《企业AI下一站_从局部提效到整体进化》WebReport中，选取源页1、4、7、18、23作为5页可行性样例，分别覆盖封面渐变与插图、带字卡片、同框原生项目符号、原生SVG图标和复杂架构/竖排文字。字体统一微软雅黑。实际运行记录留在当前任务测试工作目录，不将这份业务文档打入技能包。
