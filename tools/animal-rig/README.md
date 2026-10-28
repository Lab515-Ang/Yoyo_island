# animal-rig：動物動態（網格骨架）製作腳本

規則與驗收步驟見 `docs/規格-動物動態網格.md`。這裡是石虎（`leopard_cat`）實際用的腳本，**座標都是石虎手調的**（肚子線 `BELLY`、腿的範圍 `LEGS`、耳朵交界線、各轉軸、腳掌切線），做別隻要改。

## 工作資料夾

腳本從工作資料夾執行（`cwd` = 工作資料夾，腳本用路徑呼叫）。工作資料夾放在 `.forge/`（不進 git），結構：

```
.forge/rive-test/
├─ side/
│  ├─ generated.png        主圖（局部重畫後的版本）
│  └─ generated_orig.png   原主圖（剝層圖是對它做的）
└─ rig/                    ← cwd
   ├─ e1/ e3/ e4/ e5/ …    GPT 剝層圖（generated.png）
   ├─ e1_aligned.png …     register.py 的輸出
   ├─ masks.npz            masks.py
   ├─ layers/ rig.json     rig.py（硬切片 23 層）
   └─ mesh_layers/ rig_mesh.json  make_mesh.py（網格 12 層）
```

## 順序

```bash
A=../../../tools/animal-rig        # 從 .forge/rive-test/rig 看過去
# 1. GPT 剝層（提示在 prompts/，參考圖是原主圖），每張：
#    python route_media.py image --route codex-cli --prompt-file prompts/e1.txt --reference side/generated_orig.png --out-dir .forge/rive-test/rig/e1
python -I $A/register.py ../side/generated_orig.png e1/generated.png e1    # e1 e3 e4 e5 各一次
python -I $A/masks.py
python $A/rig.py                   # 硬切片圖層＋rig.json
python $A/make_psd.py leopard_cat_rig.psd
python $A/make_mesh.py             # 網格圖層＋leopard_cat_mesh.psd＋rig_mesh.json
python $A/make_mesh_player.py D:/RiveSandbox/player/m   # 網格＋權重＋播放頁
python $A/make_b.py D:/RiveSandbox/player/b             # CSS 硬切片版播放頁（對照用）
```

局部重畫主圖：GPT 用 `prompts/e6.txt` 這類提示 → `register.py` 對齊 → `python -I $A/patch_master.py e6_aligned.png x0 y0 x1 y1`。

## 檢查

```bash
HALF=1 MESH_DIR=D:/RiveSandbox/player/m python $A/walkcheck.py out.png   # 跟手機一樣的半尺寸貼圖
python $A/check_poses.py           # 硬切片各姿勢
python -I $A/crop.py <圖> x0 y0 x1 y1 倍率 out.png      # 放大加格線，量座標
```

- `pose.py`：硬切片離線擺姿勢；`mesh_pose.py`：網格版離線渲染（`HALF=1` 用半尺寸 webp，`MESH_DIR` 指定 `make_mesh_player.py` 的輸出）。
- `walkpose.py`：走路姿勢，和 `m_template.html` 的動作相同。

- `phone_bench.sh`：A8s 實機量 CPU（每種情況等 7 秒、取樣 15 秒、截圖），例：`bash phone_bench.sh 5037 out "網格_walk|m/?walk=1&auto=0"`。先確認手機解鎖、沒在專注。

需要：Python 3.12、numpy、scipy、opencv-python-headless、Pillow、psd-tools 1.26+。
