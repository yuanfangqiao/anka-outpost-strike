# 模型与网页传输优化 · 2026-10-30

默认版本以保留原角色外观、完整骨骼与全部动作为优先；纯顶点色、激进减面与 Blender 重烘焙试验没有通过画质门槛，未进入游戏构建。

## 实测结果

| 项目 | 原版 | 默认优化版 |
|---|---:|---:|
| 男角色 GLB | 7,973,144 字节 / 19,800 三角面 | 1,718,968 字节 / 18,173 三角面 |
| 女角色 GLB | 8,201,192 字节 / 19,800 三角面 | 1,762,824 字节 / 18,082 三角面 |
| 游戏首次传输 | 约 17.24 MB，未压缩文件大小 | 2,212,521 字节，真实 Chrome 冷缓存 HTTP 传输 |
| 再次打开 | — | 1,187 字节，模型和代码命中浏览器缓存 |

MB 按 1,000,000 字节计算。下载量为游戏本体，通过 Anka `/play/anka-outpost-strike` 验证，不包含第一次加载 Anka 外壳的资源。桌面 1440×900 与手机 390×844 得到相同下载量。线上代理、请求头及浏览器版本可能造成小幅差异。

两角色仍各有 65 根骨骼、16 段原始动画。16 组固定动作/视角的角色前景加权 SSIM 平均 0.9563、最低 0.9329；最低轮廓 IoU 0.9972。背景不计入相似度。该指标是这些采样画面的客观对照，不代表所有设备、视角或主观感受均能量化为同一百分比。

## 默认处理方式

- 颜色贴图保留至 1024 像素，WebP 质量 90。
- 法线保留至 512 像素、金属度/粗糙度保留至 256 像素，两者使用无损 WebP，保留当前材质反应。
- 减面保留 UV 接缝，以相对误差 0.002 作为约束；不为达到目标比例而强制破坏脸部、衣物或轮廓。
- 合并重复数据，清理冗余关键帧，保留骨骼名、动作名与所有原始动作。
- Meshopt 压缩与顶点量化；Three.js 加载器显式注册解码器。
- 游戏和角色展示页均引用 `assets/characters/optimized/`。原版及备用大模型不再进入发布构建。
- 构建自动生成 `.br` / `.gz`；Anka 生产及开发服务按请求协商格式。没有预压缩副本时回退动态 Gzip。
- 带内容哈希的资源使用浏览器私有长期缓存；入口页面检查更新，开发源码继续禁止缓存。

## 备份与回退

原始 `assets/characters/mixamo/*_aim.glb` 未修改。另有独立备份：

`source/model-backups/2026-10-30/`

该目录包含两份原始 GLB 和 `manifest.json`，记录路径、大小、SHA-256。优化脚本只在备份不存在时创建它；如果原版与已有备份不一致会停止，不会覆盖备份。

如需回退运行资源，将 `game/actor.js` 与 `demo/characters.js` 的角色地址改回原始 `mixamo/*_aim.glb` 并重新构建即可。

## 重现与验证

```sh
npm ci
npm run optimize:models
npm run test:models
npm run build
```

视觉验证需另开一个终端运行 `npm run dev -- --port 5187`，再运行：

```sh
npm run test:models:visual
```

默认使用本地 Google Chrome，可通过 `PLAYWRIGHT_CHROMIUM_EXECUTABLE` 指定其他 Chromium。视觉验证 URL 可通过 `ANKA_QA_URL` 指定。`node scripts/optimize-characters.mjs --variants` 可另外输出纯顶点色实验副本，始终不会用于默认游戏。

生产传输验证使用 Anka 已有的隔离测试服务和临时账号：

```sh
# 在 Anka 根目录
PYTHONPATH=server .venv/bin/python -B server/tests/device_browser_server.py --port 18772
# 在游戏根目录
npm run test:delivery
```

`scripts/verify-asset-server.mjs` 默认针对 Anka Vite 的 5190 端口，验证开发态压缩、原始字节、MIME、HEAD、Range 与动态压缩。

结构化报告在 `reports/optimization/`：`assets.json`、`motion.json`、`visuals.json`、`compression.json`、`delivery.json`。截图及实验中间文件不纳入版本控制。

移动端回归另外修复了手柄入口覆盖暂停按钮的问题。桌面、844×390 横屏、390×844 竖屏和 568×320 小屏均通过真实 Chrome 触摸验证，涵盖多指移动/射击/拖动瞄准、动作、暂停及尺寸变化释放输入；这不是 iPhone/Android 真机验收。
