# 战斗特效与合成音效

`CombatEffects` 仅向传入的 Three.js 场景添加一个效果 Group，不创建灯光、摄像机或渲染器，也不下载外部资源。

```js
const effects = new CombatEffects(scene, { muted: false });
// 必须在开始/音效按钮的用户手势回调中调用：
await effects.unlockAudio();
effects.fire(muzzleWorldPosition, hitWorldPosition);
effects.impact(hitWorldPosition, { metal: true });
effects.update(deltaSeconds);
```

所有约定方法均已实现：`unlockAudio`、`setMuted`、`fire`、`impact`、`explosion`、`heal`、`damage`、`reload`、`shield`、`update`、`dispose`。

视觉包括：细体积弹道、枪口热核心、热火花、金属命中碎光、爆炸热核、扩散冲击环、柔和烟尘、旋转碎片、治疗十字粒子和护盾网格脉冲。`damage()` 同时把公开的 `damagePulse` 设为 1，随 `update` 衰减，主游戏可将其用于 HUD 受击遮罩。

粒子使用固定 Float32Array 和两个 Points 图元；短暂 Mesh 使用环形复用池。上限为热粒子 288、烟尘 160、弹道 24、闪光/护盾 16、冲击环 14、碎片 36。效果过密时覆盖池中最早的槽位，不增加场景对象。输入 Vector3 的坐标被复制，调用后复用输入不会移动已发射效果。

构造函数和所有特效方法不会创建或读取 AudioContext。只有 `unlockAudio()` 才创建浏览器音频上下文、主音量和一次性噪声缓冲；无 AudioContext 的环境安全返回 false。Web Audio 合成射击、命中、爆炸、换弹、治疗、护盾与受击提示，节点按结束事件清理，最多 24 个声音同时存在。音序使用音频时钟调度，不使用 setTimeout/setInterval。静音不影响视觉。

特效生命周期完全由 `update(deltaSeconds)` 驱动；`dispose()` 移除 Group，销毁全部几何、材质和音频节点，重复调用安全。

## 已执行验证

- `node --check game/effects.js` 通过。
- 在 Node 实际模拟五分钟、3,600 次射击，混合命中、爆炸、治疗、护盾与换弹；场景效果对象始终固定为 92 个，粒子未超池容量。
- 调用后修改复用的 from/to Vector3，不会移动已发射弹道。
- 所有粒子坐标保持有限；推进八秒后所有粒子和 Mesh 效果均失活，重复 dispose 后场景为空。
- 给全局 AudioContext 安装会抛错的 getter，确认视觉调用和静音操作均不触及音频；只有 unlockAudio 才访问，错误安全处理。
- 使用假的 AudioContext 执行全部音效方法，确认 24 声部上限、静音恢复、调度节点清理和音频关闭。

实际音色听感和粒子着色器的 WebGL 显示仍需在主游戏集成的浏览器里检查。
