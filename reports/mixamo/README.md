# Mixamo 瞄准动作重定向

最终模型：

- `assets/characters/mixamo/male_scout_aim.glb`
- `assets/characters/mixamo/female_striker_aim.glb`

两个模型均保留原人物网格、贴图、65 根骨骼、约 2 米高度和外层归一化变换，原 Tripo GLB 未修改。提供九段动作：

| Clip | 来源 | 时长 |
| --- | --- | --- |
| Idle / Walk / Run / Jump | 原 Tripo 动作 | 保留原时长 |
| TripoShoot | 原 Tripo Shoot，仅重命名留档 | 保留原时长 |
| AimRaise | 用户提供的 `Rifle Down To Aim.fbx` | 0.8667 秒 |
| AimLower | 用户提供的 `Rifle Aim To Down.fbx` | 1.5 秒 |
| AimIdle | AimRaise 末帧固定姿势，本地派生 | 2 秒循环 |
| Shoot | AimRaise 末帧 + 最大 1.1° 胸部轻后坐，本地派生 | 0.3 秒循环 |

AimRaise / AimLower 是过渡动作，播放一次；AimIdle / Shoot 可循环。新 Shoot 旨在替换旧 Tripo Shoot 的不合理大幅摆臂。该 Shoot 并非新下载的 Mixamo 射击动作，来源在报告内有明确记录。

## 实现和限制

`scripts/mixamo-retarget.py` 使用身体坐标空间旋转、源 Rest 逆变换、目标虚拟 T 姿态和 quaternion FK 重建，处理源 T 姿态与目标 A 姿态、骨 roll、朝向、比例和单位差异。目标骨长和皮肤绑定保持不变。髋部水平位移归零，保留按身高缩放后的竖直移动。

实际两个角色与源骨架均为 65 / 65 骨匹配，无未映射骨。角色比例与标准人体不同，因此该步骤不保证两手精确落到枪械握点；游戏中应在 AnimationMixer 更新后应用左右手两骨 IK，并按男女角色分别设置枪械握点。脚底未做 ground IK。

输入 armature 对象必须为正的均匀缩放；不支持镜像或不均匀缩放。脚本不会覆盖输入模型，输出路径必须与输入路径不同。

## 复现

在项目根目录运行（`ROLE` 替换成 `male_scout` 或 `female_striker`）：

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python scripts/mixamo-retarget.py -- \
  --source-fbx "Rifle Down To Aim.fbx" \
  --target-glb "assets/characters/tripo/ROLE_animated.glb" \
  --output-glb "reports/mixamo/ROLE-raise.glb" \
  --clip-name AimRaise \
  --report "reports/mixamo/ROLE-raise.json"

/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python scripts/mixamo-retarget.py -- \
  --source-fbx "Rifle Aim To Down.fbx" \
  --target-glb "reports/mixamo/ROLE-raise.glb" \
  --output-glb "assets/characters/mixamo/ROLE_aim.glb" \
  --clip-name AimLower --create-aim-loops \
  --report "reports/mixamo/ROLE-final.json" \
  --output-blend "reports/mixamo/ROLE_aim.blend"
```

实际已执行的报告命名是 `male-final.json`、`female-final.json`。各阶段日志包含骨名映射、Rest swing 角度、单位比例、未映射骨、采样次数和关键关节姿势。导出后仅修复新 GLB 的非单位切线。

## 检查结果

- `validation.json`：Khronos glTF validator 两文件均 0 errors。原模型外层归一化层级保留，因此各有一条 `NODE_SKINNED_MESH_NON_ROOT` warning；Three.js 实际加载与蒙皮采样通过。
- Nine clips × five sample times × all skinned vertices，全部位置有限，未见异常拉伸或尺寸失控。
- AimIdle 的左右手首末位置差为 0；Shoot 首末差小于 0.00000011 米。
- `male-aim-first.png` / `male-aim-last.png` 为实际 AimRaise 开始和结束渲染；`female-aim-idle-first.png` / `female-aim-idle-last.png` 为女角色最终 AimIdle 渲染，已肉眼检查。
- `aim-end-poses.json` 提供关键关节的 GLTF 世界位置和明确标注的 Blender 世界 quaternion（wxyz）。
- `validation.json` 的 `aimEndRuntimeJoints` 提供 Three.js 实际读取的 GLTF 世界位置及 quaternion（xyzw），优先给运行时对接使用。

GLTFLoader 会将骨名里的冒号移除，例如 Blender 的 `mixamorig:LeftHand` 在 Three.js 中是 `mixamorigLeftHand`；运行时使用忽略标点的骨名匹配更稳妥。

最终 GLB 为交付文件；`.blend` 是可编辑中间文件，不需要放入浏览器资源。渲染脚本、骨架检查脚本及验证脚本均保留供复查。


## 本地补充动作（非 Mixamo 下载）

两名角色各增加 `CrouchIdle` 2s、`CrouchWalk` 1s、`Roll` .9s、`Victory` 2.5s、`Reload` 1.5s、`Hurt` .5s、`Death` 1.4s，总计16段。由 `scripts/procedural-character-actions.py` 在本地 Blender 制作，蹲伏使用腿部 IK，逐帧以真实蒙皮最低点校正接地。翻滚为原地动作，游戏映射至 .58s并驱动水平位移。倒地采用保持末帧。后续倒地姿势已修正为腿部伸展；旧静帧不代表最新倒地末姿。

运行时 `game/actor.js` 叠加双臂 IK，将右手对准枪握把、左手对准前护木；枪朝向使用完整世界四元数，避免转过180度时欧拉角反向。最终导出检查见 validation.json。
