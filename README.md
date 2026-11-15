# EReport

用于报告与演示文稿转换的 Codex 技能集合。

| 技能 | 用途 |
| --- | --- |
| [image-to-editable-ppt](image-to-editable-ppt/SKILL.md) | 将截图和图片式幻灯片重建为原生可编辑 PPTX |
| [pptx-to-editable-html](pptx-to-editable-html/SKILL.md) | 将 16:9 PPTX 转换为离线可编辑 HTML |
| [webreport-to-editable-ppt](webreport-to-editable-ppt/SKILL.md) | 将 HTML WebReport 转换为原生可编辑 PPTX |

## 安装与使用

下载仓库，将需要的技能文件夹完整复制到 `~/.codex/skills/`，在 Codex 中通过技能名称调用。具体依赖、命令、支持范围与校验要求见各自的 `SKILL.md`。

图片转 PPT 与 WebReport 转 PPT 依赖 Codex presentations 技能及其运行时。PPTX 转 HTML 需要 Python、LibreOffice、Node.js、Playwright 和浏览器，详见技能说明。

本仓库包含技能说明、脚本与编辑器资源。转换效果需结合源稿逐页核验。
