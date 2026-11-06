# ADR-004 备份用 zip 流式写出，导入三策略

- 状态：已采纳
- 日期：2026-11-06

## 背景

备份是本地版唯一的「迁移 + 灾备 + 换机」手段，必须包含数据与附件字节；总量可能到 GB 级，不能一次性拼装 `Blob`。

## 决策

- 用 `fflate` 的 `Zip`（流式）逐条写入：`manifest.json` + `data/<table>.json` + `files/<hash>.<ext>`，边写边吐 chunk，`sink` 可接 `FileSystemWritableFileStream` 直接落盘。
- `manifest.json` 记 `version/dataRows/attachmentCount/bytes`，导入前先校验版本。
- 导入冲突三策略：`skip` / `overwrite` / `rename`（另存为 `-R1`，并迁移 `projectId`、`docId` 等引用）。

## 理由

- 流式写让「500MB 附件 + 10 万条记录」不会打爆内存。
- 按 hash 存文件天然去重，包体积接近「实际占用」。
- `rename` 是唯一安全又能保留两边的策略：项目编号冲突时不能覆盖，也不该丢数据。

## 代价

- 导入不是「全有或全无」：中途关闭页面可能留下部分数据 → 文档要求导入前先导出一次当前数据；「清空后整体恢复」在导入前先做一次清空，失败时至少不会新旧混杂（AC-38/AC-39 的取舍已在此说明）。
- zip 用 store（不压缩）模式写大附件，包体≈原始大小，换取速度与内存。
