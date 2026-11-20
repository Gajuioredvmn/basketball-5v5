# 第三方資料

## 真人動作資料

遊戲裡的跳投、運球、上籃、搶籃板、接球動作來自以下動作捕捉資料，已用 `source/tools/` 裡的程式轉換到本遊戲的骨架（只取關節方向，重新取樣成 30fps，並對齊遊戲的起跳／出手／落地時間）。

- **CMU Graphics Lab Motion Capture Database** — http://mocap.cs.cmu.edu/ 
  The data used in this project was obtained from mocap.cs.cmu.edu. The database was created with funding from NSF EIA-0196217.
  使用片段：06_02（運球）、124_05（跳投）
- **SkillMimic / BallPlay-M** — https://github.com/wyhuai/SkillMimic ，Apache License 2.0 
  Copyright the SkillMimic authors. 使用片段：run_3（跑動運球，含球路）、rebound_1（搶籃板）、catch_013（接球）、layup_001（上籃）。 
  修改：從 .pt 讀出關節座標，轉成本遊戲骨架的骨頭旋轉並壓縮，見 `source/tools/sm2json.py`、`retarget.mjs`、`build_mocap.mjs`。

- **Quaternius Universal Animation Library 1 & 2** — https://quaternius.com ，CC0 1.0（公眾領域）
  使用片段：Walk_Loop（走路的上半身）、Sitting_Idle_Loop、Sitting_Talking_Loop、Idle_Loop、Idle_Talking_Loop、Idle_FoldArms_Loop、Dance_Loop（已轉成資料，部分保留給板凳、裁判、啦啦隊使用）。
