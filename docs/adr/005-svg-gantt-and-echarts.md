# ADR-005 甘特图自研 SVG，统计图表用 ECharts(SVG)

- 状态：已采纳
- 日期：2026-11-06

## 背景

首页需要 2 张统计图；项目页需要 WBS 甘特图（计划条 + 实际条、层级、缩放、导出 PNG）。

## 决策

- 统计图（成本趋势、进度/产值）用 ECharts 5，显式指定 **SVG renderer**。
- 甘特图 `src/components/GanttChart.vue` 自研：正手写 SVG 矩形 + 文本，按天算 x 坐标，父节点按子项工期加权。

## 理由

- 甘特图需求只有「计划/实际双条 + 层级 + 缩放 + 图例」，引一个甘特库（dhtmlx/frappe-gantt）体积大、样式难对齐 Element Plus，且实际条口径是本项目自定义的（完成率×工期），改造成本更高。
- SVG 而非 Canvas：打印/截图清晰，DOM 可被 E2E 断言（`document.querySelectorAll('svg')`），导出 PNG 只需序列化 SVG。

## 代价

- WBS 条数超过约 200 时需要自己实现纵向虚拟滚动（当前按项目 WBS 规模 8~50 条设计，未做虚拟化）。
- 缩放与拖拽交互要自己写事件，比现成库费工。
