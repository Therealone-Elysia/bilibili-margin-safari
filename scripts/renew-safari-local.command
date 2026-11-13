#!/bin/zsh
# Double-click in Finder; all renewal logic is in the adjacent Node.js script.
set -u
script_dir="${0:A:h}"
node_bin="$(command -v node 2>/dev/null || true)"
if [[ -z "$node_bin" ]]; then
  for candidate in "$HOME/.local/bin/node" /opt/homebrew/bin/node /usr/local/bin/node; do
    if [[ -x "$candidate" ]]; then node_bin="$candidate"; break; fi
  done
fi
if [[ -z "$node_bin" ]]; then
  print '请先安装 Node.js 22 或更新版本，再运行此脚本。'
  result=1
else
  if (( $# == 0 )); then set -- --renew; fi
  "$node_bin" "$script_dir/safari-renew-local.mjs" "$@"
  result=$?
fi
if [[ -t 0 ]]; then read -r '?按回车关闭窗口……'; fi
exit "$result"
