# 镜像服务器改造说明：改从 `main-latest` 发布页取清单

给有镜像服务器权限的 agent。写于 2026-10-24，对应 [PR #105](https://github.com/xuys2025/escape-bincov/pull/105)（head `f46b080`）。**#105 合并前要先完成本改造**；维护者已确认镜像现在会从提交里读发布清单或 HTML。

## 1. 为什么要改

仓库 `xuys2025/escape-bincov` 以前把打包产物随源码提交：`dist/index.html`、`start the game.html`、两个 ZIP、`docs/release-manifest.json`。#105 合并后：

- 新的 `main` 提交里**不再有** `dist/index.html` 和 `docs/release-manifest.json`。按提交号读这两个文件（raw.githubusercontent.com、contents API、`git show` 等），会得到 404 或“文件不存在”。
- 合并前的历史提交里这些文件都还在，旧链接仍然有效。
- 每次 `main` 的 CI 验证成功后，CI 把自己构建的文件发布到滚动预发布 **`main-latest`**：
  - 标签 `main-latest` 移到本次提交；
  - 三个文件按同名替换，下载地址不变。
- Pages 不变：仍只在 `main` 验证成功后部署同一份构建，地址 `https://xuys2025.github.io/escape-bincov/`。

## 2. 新的数据来源

| 内容 | 地址 |
| --- | --- |
| 发布清单 | `https://github.com/xuys2025/escape-bincov/releases/download/main-latest/release-manifest.json` |
| 网页 ZIP（根目录只有 `index.html`） | `https://github.com/xuys2025/escape-bincov/releases/download/main-latest/Escape-Bincov-web.zip` |
| 离线便携 ZIP | `https://github.com/xuys2025/escape-bincov/releases/download/main-latest/Escape-Bincov-portable.zip` |
| 发布页（人看） | `https://github.com/xuys2025/escape-bincov/releases/tag/main-latest` |

下载地址会 302 跳到 `objects.githubusercontent.com`，`curl` 要加 `-L`。#105 合并后、第一次 `main` 运行成功之前，这些地址都是 **404**。现在也是 404，这是正常的。

清单格式如下。`commit` 和 `run` 只在 CI 构建时写入，本地打包没有这两项：

```json
{
  "version": "0.2.0",
  "commit": "40 位提交号：构建这些文件的 main 提交",
  "run": 40100333406,
  "htmlBytes": 8056122,
  "htmlSha256": "游戏 HTML 的 SHA-256",
  "artifacts": {
    "dist/index.html": { "bytes": 8056122, "sha256": "…" },
    "start the game.html": { "bytes": 8056122, "sha256": "…" },
    "release/Escape-Bincov-portable.zip": { "bytes": 5266826, "sha256": "…" },
    "release/Escape-Bincov-web.zip": { "bytes": 5262317, "sha256": "…" }
  }
}
```

`run` 是 GitHub Actions 的运行 ID，即 `https://github.com/xuys2025/escape-bincov/actions/runs/<run>`。

## 3. 改造前先读现有脚本

仓库里没有镜像脚本，只有这些记录可参考：

- 有一个 `verify_run` 函数，核对一次 CI 运行的 job 列表，要求 `Build and test`、`Deploy Pages` 成功；
- 镜像做“固定提交 / 清单 / 实际 Pages 字节一致”的校验；
- 由定时任务同步，对外公开一个 `version.json`，记录当前同步的是哪次发布。

请先找到脚本里**按提交号读 `docs/release-manifest.json` 或 `dist/index.html` 的那一步**，只改这一步，其余逻辑保持原样：`verify_run`、文件锁、激活流程、`version.json` 的格式。

## 4. 新的核对流程

每轮定时任务：

1. 下载 `main-latest` 的 `release-manifest.json`。下载失败（包括 404）：**本轮不同步**，保留当前线上版本，下次再试。
2. 检查 `commit` 是 40 位小写十六进制，`run` 是正整数。不满足就本轮不同步。
3. 用 `run` 取运行：`GET https://api.github.com/repos/xuys2025/escape-bincov/actions/runs/<run>`。要求以下各项全部成立：
   - `repository.full_name == "xuys2025/escape-bincov"`
   - `path == ".github/workflows/ci-pages.yml"`
   - `head_branch == "main"`
   - `event` 是 `push` 或 `workflow_dispatch`
   - `status == "completed"`，且 `conclusion == "success"`
   - `head_sha == commit`（清单里的）
   - 原有的 `verify_run(run)` 照旧通过（job 列表里 `Build and test`、`Deploy Pages` 成功）。

   发布文件是在运行**结束前**上传的：发布 job 和 `Deploy Pages` 并行。所以刚发布时运行可能还是 `in_progress`，这时本轮不同步，等下一轮。
4. 取要同步的 HTML，二选一，保持现有做法即可：
   - Pages：`https://xuys2025.github.io/escape-bincov/`。Pages 的 CDN 可能比发布晚几分钟。
   - 网页 ZIP：先核对 ZIP 本身的 SHA-256 等于 `artifacts["release/Escape-Bincov-web.zip"].sha256`，再解出 `index.html`。
5. HTML 的 SHA-256 必须等于清单的 `htmlSha256`，字节数等于 `htmlBytes`。
6. 全部通过才按原流程发布到镜像。`version.json` 记录清单里的 `commit` 和 `run`。如果原来就记录提交号，含义不变。
7. 任一步不一致都**本轮不同步**，不报错退出、不回滚已上线版本。也**不要退回去读旧提交里的文件**：那会把镜像停在旧版本上，还显示成“已校验”。

不一致的常见原因：

- 期间又有新的 `main` 合入，发布页和 Pages 先后被替换；
- 较新的运行取消了旧运行。

下一轮通常就一致了。

## 5. 过渡期：新旧两种都支持

为了在 #105 合并前就部署、中间不断档，建议脚本暂时两种都支持：

- 运行的提交（`head_sha`）里**有** `docs/release-manifest.json`：按原逻辑走（#105 合并前的所有提交）。
- **没有**：走第 4 节的新流程（#105 合并后的提交）。

#105 合并、新流程稳定同步过几次后，再删掉旧分支。

## 6. 参考实现（bash + curl + jq + sha256sum）

只说明判断顺序，不是现有脚本的替代品。照现有脚本的语言改写，并接回原来的 `verify_run`、锁和发布步骤：

```bash
#!/usr/bin/env bash
set -euo pipefail
repo=xuys2025/escape-bincov
api="https://api.github.com/repos/$repo"
skip() { echo "skip: $*"; exit 0; }   # 本轮不同步，线上版本保持不变

manifest=$(curl -fsSL "https://github.com/$repo/releases/download/main-latest/release-manifest.json") \
  || skip "main-latest 还没有清单"
commit=$(jq -r '.commit // ""' <<<"$manifest")
run=$(jq -r '.run // ""' <<<"$manifest")
want=$(jq -r '.htmlSha256' <<<"$manifest")
bytes=$(jq -r '.htmlBytes' <<<"$manifest")
[[ $commit =~ ^[0-9a-f]{40}$ && $run =~ ^[1-9][0-9]*$ ]] || skip "清单缺 commit/run"

meta=$(curl -fsSL -H 'Accept: application/vnd.github+json' "$api/actions/runs/$run") || skip "取不到运行 $run"
jq -e --arg c "$commit" --arg r "$repo" '
  .repository.full_name == $r and .path == ".github/workflows/ci-pages.yml" and .head_branch == "main"
  and (.event == "push" or .event == "workflow_dispatch")
  and .status == "completed" and .conclusion == "success" and .head_sha == $c' <<<"$meta" > /dev/null \
  || skip "运行 $run 还没成功结束，或与清单不符"
# verify_run "$run" || skip "job 列表不符"      # 接回原有函数

tmp=$(mktemp)
curl -fsSL -o "$tmp" "https://xuys2025.github.io/escape-bincov/" || skip "取不到 Pages"
[ "$(sha256sum "$tmp" | cut -d' ' -f1)" = "$want" ] || skip "Pages 还不是 $commit 的构建"
[ "$(stat -c %s "$tmp")" = "$bytes" ] || skip "大小不符"
# 原流程：加锁、发布 $tmp、写 version.json（commit=$commit, run=$run）、激活
```

匿名请求 GitHub API 每小时限 60 次。定时任务频繁时，用一个**只读**的 token（`Authorization: Bearer …`），不需要任何写权限。

## 7. 验收

合并前（新脚本已部署，`main-latest` 还不存在）：

- 定时任务照常运行。当前 `main` 的提交里有 `docs/release-manifest.json`，走旧逻辑，镜像版本保持或正常前进。
- 日志能看到新流程的分支被正确跳过（清单 404），不报错。

合并后（`main` 第一次运行成功，可在 `https://github.com/xuys2025/escape-bincov/actions/workflows/ci-pages.yml` 查看）：

- 发布页 `main-latest` 存在，清单的 `commit` 等于该次 `main` 运行的提交。
- 下一轮定时任务后，镜像的 `version.json` 指向这个提交。
- 镜像对外提供的 HTML，SHA-256 等于清单的 `htmlSha256`。

把实际结果（改了哪些文件、日志片段、上面三项的实际值）报告给维护者，由维护者在 #105 里确认后再合并。

## 8. 不要做的事

- 不要向仓库推送、改分支或标签，不要手动创建或修改 `main-latest`；发布只由 CI 做。
- 不要为了让镜像先同步，把生成物重新提交回仓库。
- 不要用有写权限的 GitHub token。
- 不要把镜像校验放宽成“只要能下载就同步”。

相关说明：仓库里的规则写在 #105 的 [`docs/CI.md` 的「Pages 与镜像」](https://github.com/xuys2025/escape-bincov/blob/f46b0808380efdc85dc7cab4317f8ce3d228709d/docs/CI.md#pages-与镜像)和[「构建与离线包发布」](https://github.com/xuys2025/escape-bincov/blob/f46b0808380efdc85dc7cab4317f8ce3d228709d/docs/CI.md#构建与离线包发布)两节；发布脚本见 [`scripts/ci/publish-release.sh`](https://github.com/xuys2025/escape-bincov/blob/f46b0808380efdc85dc7cab4317f8ce3d228709d/scripts/ci/publish-release.sh)。
