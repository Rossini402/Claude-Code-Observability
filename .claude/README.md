# `.claude/` — 仓库 Claude Code 配置目录

这个目录里有两份**与本仓库使用 Claude Code 有关**的文件，作用各不相同。

## 文件清单

| 文件 | 是否 git 跟踪 | 用途 |
|------|---------------|------|
| `settings.example.json` | 是 | 给**外部项目**用的 hook 配置示例。复制到任何想被观测的项目，替换占位符即可启用。 |
| `settings.local.json` | 否（`.gitignore` 排除） | 仓库主人本机的 Claude Code 个人设置，不入库。 |
| `README.md`（本文件） | 是 | 解释上面两个文件。 |

> 注意：`settings.example.json` **不会被 Claude Code 自动加载**（Claude Code 只读
> `settings.json` 和 `settings.local.json`）。它纯粹是给读者拷贝用的样板，不会
> 影响在本仓库里运行 Claude 的行为。

## 怎么用 `settings.example.json`

想让某个项目（比如 `~/work/my-app`）的事件被本系统观测，按下面三步：

```bash
# 1) 进入目标项目，建好 .claude 目录
mkdir -p ~/work/my-app/.claude

# 2) 把样板复制过去（注意目标文件名是 settings.json，不是 .example.json）
cp .claude/settings.example.json ~/work/my-app/.claude/settings.json

# 3) 替换两个占位符（在目标 settings.json 上做就行）
sed -i '' \
  -e 's|/ABSOLUTE/PATH/TO/claude-code-obs|/Users/you/path/to/this/repo|g' \
  -e 's|YOUR_PROJECT|my-app|g' \
  ~/work/my-app/.claude/settings.json
```

### 必须替换的占位符

| 占位符 | 替换成 |
|--------|--------|
| `/ABSOLUTE/PATH/TO/claude-code-obs` | 本仓库在你机器上的**绝对路径**（例如 `/Users/yichen/Desktop/claude-code/agent-obs`），让 hook command 能找到 `hooks/send-event.js`。 |
| `YOUR_PROJECT` | 你给目标项目起的**短标识名**（例如 `my-app`、`easy-iot`），dashboard 的 `Source` 过滤里会显示这个名字。 |

替换后用 `jq . path/to/settings.json` 验证 JSON 仍合法。

## 不想监听全部 12 种事件？

直接编辑目标项目的 `settings.json`，删掉不要的事件键。最少保留 `PreToolUse +
PostToolUse + SubagentStart + SubagentStop` 就能看到主要工具轨迹。

## 前置依赖

事件要进 dashboard，本仓库的 server 必须在跑：

```bash
pnpm dev:server   # 监听 :4000，hook 脚本会 POST 到这里
```

更详细的脚本说明见 [`hooks/README.md`](../hooks/README.md)。
