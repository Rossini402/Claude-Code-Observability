# hooks/

Claude Code 的 hook 脚本，**给被观测项目复制使用**。
独立于 `apps/server` 和 `apps/client`，因为它要部署到本仓库**之外**的目标项目。

## 文件

| 文件 | 用途 |
|---|---|
| `send-event.js` | 通用事件发送器。Claude Code 触发任意 hook 时被调用，从 stdin 读 payload，POST 到 `http://localhost:4000/events`。**纯 Node.js**，目标项目无需 TypeScript 工具链。 |
| `settings.template.json` | `.claude/settings.json` 模板，把 12 种 hook 全挂到 `send-event.js`。 |
| `package.json` | 仅声明 `"type": "commonjs"`，让 `send-event.js` 在任何 host 仓库下都按 CJS 解析（覆盖外层若有的 `"type": "module"`）。复制 hook 到目标项目时**建议把它一起带上**。 |

## 在目标项目里启用 hooks

> 前提：本仓库的 server 已启动（`pnpm dev:server`，监听 :4000）。

1. **拷贝模板到目标项目**

   ```bash
   cp hooks/settings.template.json /path/to/your-project/.claude/settings.json
   ```

   （也可以直接编辑现有的 `.claude/settings.json`，把 `hooks` 字段合并进去。）

2. **替换两个占位符**：

   - `/ABSOLUTE/PATH/TO/agent-obs/hooks/send-event.js` → 本仓库 `hooks/send-event.js` 的**绝对路径**
   - `YOUR-APP` → 你给目标项目起的标识名（会出现在 dashboard 的 Source 过滤里）

   一条 sed 搞定：

   ```bash
   HOOKS_DIR="$(pwd)/hooks"   # 在 agent-obs 根目录跑
   sed -i '' "s|/ABSOLUTE/PATH/TO/agent-obs/hooks|$HOOKS_DIR|g; s|YOUR-APP|my-todo|g" \
     /path/to/your-project/.claude/settings.json
   ```

3. **在目标项目跑 Claude Code**

   ```bash
   cd /path/to/your-project
   claude
   # 随便发一句指令，dashboard 里就能看到事件了
   ```

4. **不想监听全部事件**？删掉 `settings.json` 里对应键即可。最低保留 `PreToolUse` + `PostToolUse` + `SubagentStart` + `SubagentStop` 就能看到主要轨迹。

## 协议铁律（实现要点）

`send-event.js` 必须满足：

- **绝不阻塞 Claude Code**：无论 server 挂没挂、网络通不通，进程都 `exit 0`
- **5 秒超时**：fetch 用 `AbortSignal.timeout(5000)`
- **错误不向上抛**：所有失败追加到 `~/.agent-obs/send-event.log`

完整协议见 [`docs/02-event-schema.md` §6](../docs/02-event-schema.md#6-hook-脚本协议)。

## 手动验证（不开 Claude Code 也能测）

在 `agent-obs` 根目录执行：

```bash
# 1) 模拟 Claude Code 调用：管道喂一段 payload JSON
echo '{"session_id":"test","tool_name":"Bash","tool_input":{"command":"ls"}}' \
  | node hooks/send-event.js --source-app=test --event-type=PreToolUse

# 2) 确认事件已落库
curl -s 'http://localhost:4000/events/recent?source_app=test' | python3 -m json.tool

# 3) 把 server 关掉再调一次，应该静默失败、exit code 仍为 0
echo '{"session_id":"test"}' \
  | node hooks/send-event.js --source-app=test --event-type=Notification
echo "exit code: $?"   # 期望 0

# 失败信息追加在 ~/.agent-obs/send-event.log
tail -3 ~/.agent-obs/send-event.log
```

## 调试小贴士

- 事件没进 dashboard？先看 `~/.agent-obs/send-event.log` 有没有报错
- 看 server 端是否收到：`curl http://localhost:4000/events/recent?limit=5`
- 临时换 server 地址：在 hook command 里加 `--server=http://other-host:4000`
