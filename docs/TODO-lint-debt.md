# TODO: 待清理的 lint 债

工作流首次启用 `pnpm lint`（biome）时，发现仓库历史代码积累了 27 个 lint 错误。
其中可被 biome 安全自动修复的部分（format / organizeImports）已在
`a788ec4 chore(client): apply biome formatting to legacy files` 处理掉。

剩 **27 个错误**，分两类：

- **5 个 a11y**：真代码改动（不是格式问题），biome 不能自动修
- **22 个 FIXABLE-unsafe**：biome 标记为「可自动修但不保证 100% 语义保留」，
  需要 `biome check --write --unsafe` 才会写入。本质都是显式重构。

---

## 1. a11y（5 个）

`<div onClick=...>` 缺键盘等价交互。需要显式补 `onKeyDown` + `role="button"` +
`tabIndex={0}`，或者改成原生 `<button>`。

| 文件 | 行号 | 规则 |
|------|------|------|
| `apps/client/src/components/EventDetailModal.tsx` | 80:5 | `lint/a11y/useKeyWithClickEvents` |
| `apps/client/src/components/EventDetailModal.tsx` | 81:24 | `lint/a11y/useSemanticElements` |
| `apps/client/src/components/EventDetailModal.tsx` | 87:7 | `lint/a11y/useKeyWithClickEvents` |
| `apps/client/src/components/EventRow.tsx` | 21:5 | `lint/a11y/useKeyWithClickEvents` |
| `apps/client/src/components/PairedEventRow.tsx` | 97:5 | `lint/a11y/useKeyWithClickEvents` |

修复路径：

```tsx
// 之前
<div onClick={() => onClick?.(event)} className="...">...</div>

// 之后（任选其一）
// 方案 A：补键盘事件 + 语义角色
<div
  role="button"
  tabIndex={0}
  onClick={() => onClick?.(event)}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') onClick?.(event);
  }}
  className="..."
>...</div>

// 方案 B：换原生 button，去掉 div（可能影响 layout）
<button type="button" onClick={() => onClick?.(event)} className="...">...</button>
```

`useSemanticElements` 那条要把 `<div role="dialog">` 换成 `<dialog>` 元素，或者
直接 ignore（dashboard 的 modal 样式定制度高，原生 `<dialog>` 兼容性是另一个话题）。

---

## 2. FIXABLE-unsafe（22 个）

biome 不会默认写入。可单独跑 `pnpm exec biome check --write --unsafe .` 一次性收掉，
但建议**先 review** 再批量应用，因为 unsafe 标签不是空穴来风（边界条件下有差异）。

### 2.1 `complexity/useLiteralKeys`（11 个）

`obj['key']` → `obj.key`。语义等价，纯重构。

| 文件 | 行号 |
|------|------|
| `apps/server/src/http.ts` | 56:30, 62:30, 68:34, 74:28, 80:26, 117:26, 118:29, 119:30, 120:30, 121:30 |
| `hooks/send-event.js` | 51:23 |

### 2.2 `complexity/useOptionalChain`（4 个）

`a && a.b` → `a?.b`。语义在多数场景等价，但在 `a` 为 `0` / `''` 等 falsy 非 nullish
值时行为不同（`a && a.b` 短路为 `a`，`a?.b` 仍尝试访问）。`hooks/send-event.js`
是动态 JS 文件（无 TS 类型保障），review 时尤其留意。

| 文件 | 行号 |
|------|------|
| `hooks/send-event.js` | 57:36, 71:35, 102:46, 109:25 |

### 2.3 `complexity/noUselessSwitchCase`（4 个）

被 `default:` 兜住的空 `case` 可以删除。`apps/client/src/lib/format.ts:81-84` 的
`case 'SessionStart' | 'SessionEnd' | 'Stop' | 'PreCompact'` 全部 fallthrough 到
`default: return ''`，删掉后行为一致。

| 文件 | 行号 |
|------|------|
| `apps/client/src/lib/format.ts` | 81:5, 82:5, 83:5, 84:5 |

> 注：`summarizeEvent` 的 switch 是个文档化的"已知事件类型"列表，删 case 会丢失这部分
> 信号。考虑在删除前用注释保留枚举上下文，或者干脆 ignore 此规则。

### 2.4 `style/noUnusedTemplateLiteral`（3 个）

\`literal without interpolation\` → `'literal'`。SQL 字符串常量从模板字面量改普通
字符串，纯字面量替换。

| 文件 | 行号 |
|------|------|
| `apps/server/src/db.ts` | 231:14, 235:14, 240:7 |

---

## 3. 处理建议

- **独立 PR / commit 处理**，不要混进 feature commit。
- 推荐顺序：
  1. 先修 a11y 5 个（真代码改动，需要测交互），独立 commit。
  2. 再批量跑 `biome check --write --unsafe .`，diff review 后 commit；
     若 `useOptionalChain` 在 `hooks/send-event.js` 上看着不放心，可以单独 ignore
     该规则在 `.js` 文件上。
- 处理完后建议在 `apps/client/package.json` 或仓库根加一个 `lint-staged` /
  pre-commit hook（见 `.husky/`），从此让新 commit 自动保证 lint 0 错误，
  避免再积新债。

---

## 4. 状态追踪

最后一次检查时间：2026-04-28，commit `a788ec4` 之后。
检查命令：`pnpm lint`。
