# 第三方資料

## 真人動作資料

遊戲裡球員、板凳、裁判、啦啦隊的真人動作（投籃、罰球、運球、換手運球、胯下、背後、轉身、假動作、切入、防守、傳接球、搶籃板、撿球、坐姿、裁判手勢等）來自以下動作捕捉資料，已用 `source/tools/` 裡的程式轉換到本遊戲的骨架（只取關節方向，重新取樣成 30fps，並對齊遊戲的起跳／出手／落地時間）。

- **CMU Graphics Lab Motion Capture Database** — http://mocap.cs.cmu.edu/ 
  The data used in this project was obtained from mocap.cs.cmu.edu. The database was created with funding from NSF EIA-0196217.
  使用片段：06_02～06_15（各種運球、換手運球、投籃）、102_01～102_33（持球跑動轉彎、轉身、切入、假動作、投籃假動作、防守滑步、軸心腳；不含 102_09 校正動作）、124_03～124_06（投籃、罰球、跳投、上籃）、26～32、40、41 號（籃球裁判手勢）
- **SkillMimic / BallPlay-M** — https://github.com/wyhuai/SkillMimic ，Apache License 2.0 
  Copyright the SkillMimic authors. 使用片段：BallPlay-M 全部籃球技能（跑動運球、左右跑、搶籃板 31 段、接球 12 段、撿球 34 段、三種投籃、傳球、上籃、轉身上籃、勾手、換手運球、胯下轉身、背後運球），只略過 5 段開頭就已經拿著球的撿球。 
  修改：從 .pt 讀出關節座標，轉成本遊戲骨架的骨頭旋轉並壓縮，見 `source/tools/sm2json.py`、`retarget.mjs`、`build_mocap.mjs`。

- **Quaternius Universal Animation Library 1 & 2** — https://quaternius.com ，CC0 1.0（公眾領域）
  使用片段：Walk_Loop、Walk_Formal_Loop、Sitting_Idle_Loop、Sitting_Talking_Loop、Sitting_Enter、Sitting_Exit、Idle_Loop、Idle_Talking_Loop、Idle_FoldArms_Loop、Idle_No_Loop、Idle_Rail_Call、Yes、Hit_Chest、Hit_Head、Hit_Knockback、Dance_Loop。其他（武器、殭屍、游泳、農務等）跟籃球無關，沒有使用。
