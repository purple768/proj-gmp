# ADR-003 附件：目录 > OPFS > IndexedDB 三级降级 + sha256 去重 + 引用计数

- 状态：已采纳
- 日期：2026-11-06

## 背景

PRD 明确要求「上传 500MB 以上的文件不报错、不限大小」（AC-08），且设置页能看到占用。把字节塞进 IndexedDB 的 `Blob` 在大文件下会写放大、易失败，也没法用资源管理器查看。

## 决策

1. 存储位置三级降级：**用户授权目录**（File System Access API）→ **OPFS** → **IndexedDB `fileBlobs`**。`initStorage()` 在启动时探测能力并恢复上次授权。
2. 元数据永远在 `attachments` 表（`id/docType/docId/fileName/ext/size/hash/relPath/state/refCount`），字节只按 `hash` 存一份。
3. `state` 状态机：`temp`（新建单据时暂存）→ `active`（保存绑定）→ `pending-trash`（随单据软删除）→ `deleted`（永久删/到期清理，此时才释放字节）。

## 理由

- 授权目录让「数据在哪」这件事对用户可见，也天然支持把目录放进网盘/移动硬盘做二次备份。
- OPFS 兜底保证「用户不授权也能用」，IndexedDB 兜底覆盖 Safari。
- sha256 去重：同一份图纸被 5 张单据引用只占一份空间；`refCount` 保证删单不误删别人的附件。

## 代价

- 目录句柄有权限有效期，浏览器重启后可能需重新授权 → 启动时检测并在布局顶部弹授权横幅（不是丢数据，只是需要一次点击）。
- 换浏览器/换目录会导致旧字节找不到 → 备份包必须把字节一并打包（ADR-004），恢复时 `restoreFile` 按 hash 重新落盘。
