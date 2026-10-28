#!/usr/bin/env bash
# A8s 實機效能量測：每種情況開一個網址，等 7 秒，用 top 取樣 15 秒，算 Chrome 全部程序的 CPU（單核 = 100%），並截圖。
# 用法：bash phone_bench.sh <adb 埠> <輸出資料夾> "名稱|網址路徑" ...
# 每次載入前確認 Chrome（或鎖屏後無焦點）狀態；手機鎖上或被切到別的 App 就停止。
AD=${AD:-/c/Users/user/AppData/Local/Android/Sdk/platform-tools/adb.exe}
PORT=$1; OUT=$2; shift 2
S="-P $PORT -s 37a46ed0c80b7ece"
mkdir -p "$OUT"
locked() { $AD $S shell dumpsys window policy | grep -q "showing=true"; }
meas() {
  $AD $S shell "top -b -d 1 -n 16 -o %CPU,ARGS" | awk -v L="$1" '/%CPU/{if(n)a[n]=s; n++; s=0; next} /chrome/{s+=$1} END{a[n]=s; for(i=2;i<=n;i++){t+=a[i]; if(a[i]>m)m=a[i]}; printf "%s\t平均 %.1f%%\t最高 %.1f%%\n", L, t/(n-1), m}'
}
locked && { echo "手機鎖著，停止"; exit 1; }
$AD $S shell svc power stayon usb
for item in "$@"; do
  name=${item%%|*}; path=${item#*|}
  # 網址要加單引號：手機上的 sh 會把 & 當成背景執行，後面的參數會被切掉
  $AD $S shell "am start -a android.intent.action.VIEW -d 'http://localhost:5180/$path' -p com.android.chrome" >/dev/null
  sleep 7
  if locked || ! $AD $S shell dumpsys window | grep -q "mCurrentFocus=.*com.android.chrome"; then echo "Chrome 不在前景或手機鎖上，停止"; break; fi
  meas "$name"
  $AD $S exec-out screencap -p > "$OUT/$name.png"
done
$AD $S shell svc power stayon false
