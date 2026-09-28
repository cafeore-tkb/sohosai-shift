#!/bin/bash
# macOS 用ランチャー：このファイルと同じフォルダの index.html を既定のブラウザで開きます
cd "$(dirname "$0")" || exit 1
open "index.html"
