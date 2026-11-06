# 架构说明（工程管理本地版）

> 面向维护者。产品需求见 PRD 文档，业务规则落地见 `docs/rules.md`，操作说明见 `docs/manual.md`，验收记录见 `docs/acceptance/`。

## 1. 设计前提

| 约束 | 结论 |
|---|---|
| 单机、无后端、可离线 | 数据全部落在浏览器 IndexedDB；不引入任何服务端 |
| 一台电脑一个人用 | 不做多用户/权限/协同，冲突只在「导入备份」时出现 |
| 附件可达数百 MB（PDF/IFC） | 附件字节不进 IndexedDB 主库，走文件系统目录，按需降级 |
| 32 类单据，字段各异 | 用「配置驱动」而非 32 套手写页面 |
| 5 万条单据量级 | 列表走索引 + 分页；搜索用内存倒排/子串扫描，单次 ≤ 300ms |

## 2. 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 构建 | Vite 6 + TypeScript | 开发态 HMR，产物静态托管即可 |
| 框架 | Vue 3.5（`<script setup>`）+ Pinia + vue-router（hash 模式） | hash 路由便于 `file://`/静态服务器直接打开 |
| UI | Element Plus 2.9（`zh-cn`） | 表格/表单/弹窗/分页开箱可用 |
| 持久化 | Dexie 4（IndexedDB 封装） | 事务、批量读写、索引查询 |
| 表格导出 | ExcelJS | 千分位、冻结表头、自动筛选、多 sheet |
| 图表 | ECharts 5（SVG renderer） | 首页两张图；SVG 便于打印与导出 |
| 甘特图 | 自研 SVG 组件 | 需求简单，避免引入重型甘特库 |
| 压缩 | fflate | 备份包流式 zip，不占满内存 |
| 测试 | Vitest + fake-indexeddb / puppeteer-core + 本机 Edge | 单元 + 浏览器 E2E |

## 3. 分层

```
src/
├─ shared/          纯函数：money（分）、date（日历日）、id（uid/hash）
├─ core/
│  ├─ db/           Dexie schema（41 表）、仓储 repo（列表/增删改/软删/设置）
│  ├─ engine/       单据引擎：类型定义、校验、计算字段、默认值、数值规范化
│  ├─ docs/         33 份单据配置（1 骨架 + 32 业务单据），defineDoc()
│  └─ services/     业务服务：编号、附件、WBS、甘特、结算、成本、库存、挣值、
│                   预警、搜索、回收站、今日计划、备份、质量联动、保存钩子、
│                   Excel、下载、WBS 导入
├─ stores/          Pinia：当前项目、项目列表、WBS 缓存
├─ components/      DocPage（通用单据页）、DocTabs（tab 壳）、GanttChart
├─ views/           12 个一级页面 + 打印页
└─ layout/          侧边菜单、项目切换、全局搜索、预警徽标、授权横幅
```

依赖方向单向：`views → components → core → shared`。`core` 不 import 任何 Vue 文件，因此全部业务逻辑可在 Node（Vitest + fake-indexeddb）里跑。

## 4. 数据模型

41 张表，定义在 `src/core/db/index.ts` 的 `DOC_TABLE_INDEX`，一份声明同时用于 Dexie schema 与「哪些表进回收站」。

| 分组 | 表 |
|---|---|
| 骨架 | `projects`、`wbs`、`progressRecords` |
| 合同线 | `contracts`、`changes`、`visas`、`submissions`、`settlements` |
| 成本 | `budgets`、`expenses` |
| 质量 | `qualityPlans`、`inspections`、`concealments`、`tests`、`defects` |
| 安全 | `safetyPlans`、`briefings`、`hazards`、`riskSources`、`emergencyPlans`、`trainings`、`certificates` |
| 物资设备 | `materialPlans`、`materialReceipts`、`stockFlows`、`equipment`、`machineShifts` |
| 文档 | `drawings`、`archives` |
| 劳务 | `teams`、`workers`、`attendances`、`teamMeasurements`、`payrolls` |
| 支撑 | `attachments`、`settings`、`dictionaries`、`warningReads`、`todayTodos`、`numberSequences`、`fileBlobs` |

约定：

- 主键统一 `id: string`（`uid()`），业务编号放 `code`，唯一性由 `assertCodeAvailable` 在保存前校验，不做数据库唯一索引（软删除后编号可释放）。
- 所有业务表带 `projectId`、`createdAt`、`updatedAt`、`deletedAt`。`deletedAt !== null` 即「在回收站」。
- 复合索引只建真实用到的：`[projectId+code]`、`[projectId+parentId]`、`[projectId+wbsId+category]`、`[docType+docId]`。

## 5. 单据引擎

一份 `defineDoc({ key, table, title, prefix, group, fields, lock, print, dateField, statusField, searchFields })` 驱动：

| 消费者 | 用到配置里的 |
|---|---|
| 列表页（`DocPage.vue`） | `fields` 里 `list:true` 的列、`filter` 的筛选器、`dateField` 区间、`statusField` 状态筛选、`lock` 决定编辑/删除是否可用 |
| 新增/编辑弹窗 | `formFields`（含 `span` 栅格）、`type` 决定控件、`required` 出红星、`help` 出提示 |
| 校验 | `validateRow`：一次返回**全部**错误（不短路），前端按字段标红 |
| 计算字段 | `type:'computed'` + `computed(row)`，保存前 `applyComputed` 重算，前端只读 |
| 打印 | `/print/:docType/:id` 按 `print.template` 选版式 |
| Excel 导出 | 表头取 `label`，`format:'money'` 出千分位 |
| 全局搜索 | `searchFields` + `title` 拼索引文本 |
| 取号 | `prefix` + 设置页前缀覆盖 |

引擎带来的关键收益：**新增一类单据只需在 `src/core/docs/*.ts` 加一份配置**，列表/表单/详情/打印/导出/搜索全部自动可用。32 类单据的配置合计约 1000 行，若手写页面约需 2.5 万行。

## 6. 附件存储

三级降级（`src/core/services/attachment.ts`）：

1. **File System Access 目录**（用户授权，推荐）：字节写真实目录，便于用资源管理器直接看；
2. **OPFS**（Origin Private File System）：无授权时默认；
3. **IndexedDB `fileBlobs`**：前两者都不可用时兜底（Safari 等）。

配套机制：

- **去重**：`hash = sha256(文件)`，同 hash 只存一份，`refCount` 记引用数；删附件只减引用，减到 0 才真正删字节。
- **临时态**：新建单据时上传的附件 `state='temp'`，保存时 `bindTempAttachments` 绑定，取消时 `discardTempAttachments` 丢弃（对应 AC-05/AC-11）。
- **回收站关系**：删单据只把附件置 `pending-trash`，不删字节；恢复单据时回 `active`；永久删除或 90 天到期清理时才释放字节（对应 AC-30）。
- **配额**：`checkQuota` 估算已用空间，超阈值在设置页与上传处提示。

## 7. 备份格式

`fflate` 流式写 zip，结构：

```
manifest.json     版本、导出时间、各表行数、附件数、总字节
data/<table>.json 每张表一个文件
files/<hash>.<ext> 附件字节（按 hash 存放，天然去重）
```

导入策略三选一（逐条冲突可选）：`skip`（跳过）/ `overwrite`（覆盖）/ `rename`（另存为 `-R1` 并迁移 `projectId` 引用）。见 `importBackup(bytes, policy)`。

## 8. 启动顺序

`src/main.ts`：

```
openDb() → initStorage() → ensureSeed() → cleanupExpired() → cleanupOldReads() → mount
```

- `ensureSeed` 幂等：只有库为空才写演示项目/WBS/合同/预算等，避免污染真实数据。
- `cleanupExpired`：清掉回收站里超 90 天的记录与字节。
- `cleanupOldReads`：清掉过期的预警已读标记。

## 9. 关键计算口径

| 主题 | 口径 | 位置 |
|---|---|---|
| 金额 | 存储为「元」的两位小数，**运算时先转「分」整数**，避免浮点误差 | `shared/money.ts` |
| 日期 | 一律先 `dateOnly` 取当天 0 点再算**日历日差**，不用毫秒除法 | `shared/date.ts` |
| 甘特图实际条 | 起点=计划开始，长度=完成率×计划工期；父节点按子项**工期加权**聚合 | `core/services/gantt.ts` |
| 四算对比 | 合同价按各 WBS 预算占比**分摊**；预算为 0 时不算比率（`rate:null`） | `core/services/cost.ts` |
| 结算金额 | 只统计状态为「待收款/部分收款」的结算单为应收 | `core/services/settlement.ts` |
| 挣值 | BCWS/BCWP/ACWP 按月累计，SPI=BCWP/BCWS，CPI=BCWP/ACWP | `core/services/evm.ts` |

## 10. 测试策略

| 层 | 位置 | 覆盖 |
|---|---|---|
| 单元/集成 | `tests/*.test.ts`（Vitest + fake-indexeddb） | 编号取号、校验、附件三后端、WBS 树、甘特聚合、导入解析、结算/成本/库存/质量联动、搜索、预警、回收站、备份、日期边界、Excel |
| 浏览器冒烟 | `scripts/e2e/smoke.mjs` | 启动、8 卡片、2 图表、13 条路由、新增隐患、搜索、打印、控制台无报错 |
| 浏览器流程 | `scripts/e2e/flows.mjs` | 新建签证→合价→锁单校验→删除→回收站→恢复→导出 Excel→备份 zip→预警抽屉 |
| 性能/稳定性 | `scripts/e2e/perf.mjs` | 5 万条数据下搜索、翻页、筛选；`--soak` 跑 50 轮增删改 |

单元测试在 Node 里跑，所以 `core` 层不允许直接碰 `window`/`document`（附件后端通过 `globalThis` 探测能力，缺失即降级）。

## 11. 已知取舍

- **搜索是内存全量扫描**，不做持久化倒排索引：5 万条 50ms 左右，够用；再往上需要一个 `searchIndex` 表并增量维护。
- **无并发控制**：单机单用户，不做乐观锁；备份导入是唯一可能的数据冲突点。
- **打印用浏览器 `window.print()`**：保证 A4 排版一致，但不生成真实 PDF 文件（浏览器「另存为 PDF」即可）。
- **32 类单据共用一套列表交互**：牺牲了个别单据的定制化空间，换来一致性。
