#!/usr/bin/env bash
# Publishes the validated build of a main commit as the rolling prerelease that README's offline download points at.
# The workflow's release job runs it after `Build and test`, next to the downloaded, checksum-verified built-game files.
# The tag moves to this commit and each asset is replaced under the same name, so the download URLs never change:
# https://github.com/<repo>/releases/download/<tag>/<asset>. Formal versions (v0.2.0, ...) stay separate releases.
#
#   publish-release.sh <tag>    needs GH_TOKEN (contents: write), GITHUB_REPOSITORY, GITHUB_SHA, GITHUB_RUN_ID
set -euo pipefail

tag=${1:?usage: publish-release.sh <tag>}
repo=${GITHUB_REPOSITORY:?} sha=${GITHUB_SHA:?}
run_url="${GITHUB_SERVER_URL:-https://github.com}/$repo/actions/runs/${GITHUB_RUN_ID:?}"
assets=(release/Escape-Bincov-portable.zip release/Escape-Bincov-web.zip release/release-manifest.json)
for file in "${assets[@]}"; do
  [ -s "$file" ] || { echo "::error::Missing release file $file" >&2; exit 1; }
done
# The build job stamps the manifest with the commit it built; publishing another commit's files under this tag would
# break the one binding the mirror relies on.
built=$(jq -r '.commit // ""' release/release-manifest.json)
[ "$built" = "$sha" ] || { echo "::error::The manifest describes commit '$built', not $sha" >&2; exit 1; }

title='main 最新验证版'
notes=$(mktemp)
{
  echo "\`main\` 的提交 $sha 通过 [CI]($run_url) 全部检查后，由工作流自动发布。每次 \`main\` 验证成功都会替换这里的文件，下载地址不变。"
  echo
  echo '- `Escape-Bincov-portable.zip`：离线便携版，解压到固定文件夹后双击 `start the game.html`。'
  echo '- `Escape-Bincov-web.zip`：根目录只有 `index.html`，用于其他静态托管。'
  echo '- `release-manifest.json`：两个 ZIP 与 HTML 的大小和 SHA-256，以及构建它们的提交（`commit`）和 CI 运行（`run`），内容如下。'
  echo
  echo '```json'
  cat release/release-manifest.json
  echo '```'
  echo
  echo '这是持续更新的预发布，不是正式版本；正式版本见带版本号的发布页。'
} > "$notes"

# Point the tag at this commit first: `gh release create` would otherwise attach the release to a stale existing tag.
if gh api "repos/$repo/git/ref/tags/$tag" --silent 2> /dev/null; then
  gh api --method PATCH "repos/$repo/git/refs/tags/$tag" -f sha="$sha" -F force=true --silent
else
  gh api --method POST "repos/$repo/git/refs" -f ref="refs/tags/$tag" -f sha="$sha" --silent
fi
if gh release view "$tag" --repo "$repo" > /dev/null 2>&1; then
  gh release upload "$tag" "${assets[@]}" --repo "$repo" --clobber
  gh release edit "$tag" --repo "$repo" --title "$title" --notes-file "$notes" --prerelease
else
  gh release create "$tag" "${assets[@]}" --repo "$repo" --verify-tag --prerelease --latest=false \
    --title "$title" --notes-file "$notes"
fi
echo "Published $sha as https://github.com/$repo/releases/tag/$tag"
