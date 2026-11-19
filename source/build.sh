#!/bin/bash
# 打包：把 source/src 的程式（含 three.js）打成單一 index.html，輸出到 repo 根目錄
set -e
cd "$(dirname "$0")"
[ -d node_modules ] || npm install
npx esbuild src/main.js --bundle --minify --format=iife --target=es2020 --outfile=build/game.js --log-level=warning
python3 -c "
h=open('src/index.html').read(); j=open('build/game.js').read().replace('</script','<\\\\/script')
open('../index.html','w').write(h.replace('<script>/*GAME*/</script>','<script>'+j+'</script>'))
"
echo "已輸出 ../index.html"
