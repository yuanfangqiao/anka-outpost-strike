# 在 Anka 中安装与对战

本插件 ID 为 `anka-outpost-strike`，Anka 的 `plugins/anka-outpost-strike` 可直接软链到本目录。
插件根包含 `plugin.json`、`server/main.py` 和 `web/index.js`；游戏源码仍在 `game/`。

## 安装和运行

构建需要 Node.js 22.12+。更新 Anka 后重启后端，在插件管理中选择
「ANKA 前线对决 → 构建并安装」。宿主执行 `npm ci` 和 `npm run build`，
再编译轻量 Anka 入口、注册后端房间定义。运行时只加载产物，不依赖 Vite 开发服务。

本地单人开发仍可 `npm install && npm run dev`；好友联机须从 Anka 打开。
`npm run build` 构建到暂存目录，完成后生成 `dist/build.json` 并替换 `dist/`。
`dist/`、`node_modules/` 不提交。

## 邀请与鉴权

1. 房主登录 Anka，打开游戏，点击「邀请好友 · 双人对战」。
2. 扫描二维码或复制邀请链接。邀请 10 分钟有效，仅领取一个好友席位。
3. 好友填写昵称并点击加入，无须注册 Anka。
4. 加入后获得 **24 小时**的指定房间访客身份，10 分钟邀请到期不会踢出玩家。
5. 双方选角色，房主选四张地图之一，双方准备后开始；加载完成后统一倒计时。
6. 结算后房主返回大厅再次准备；移除好友后可生成新邀请。

访客不能访问 Anka 的聊天、设置、笔记、其他插件或其他房间。
离开、被移除、房间关闭或插件停用会提前结束房间权限。
临时断线保留席位 30 秒；刷新后保留身份并回大厅重新准备。
服务器重启后需要重新建房。

## 对战

1.1 新增第一人称、联机道具拾取和掩体复活，操作与测试见 [GAMEPLAY-1.1.md](GAMEPLAY-1.1.md)。

固定两人，允许相同角色，P1 蓝方 / P2 红方。先得 10 分或 180 秒结束，平分判平局。
3 秒复活、2 秒复活保护；开火结束保护。
Anka WSS 转发房间内消息，房主统一计算伤害、弹药、消耗品、复活和成绩，
客人不能自行上报生命值和击杀数。比赛时间基于服务端时钟，断线等待不计时。
这套裁定适用于好友对战，房主仍是受信任的战斗模拟方。

## 部署

在 Anka 设置 `ANKA_PUBLIC_URL=https://你的域名`，以单 worker 运行并支持 WSS。
`localhost` 链接只能在本机打开，好友需要能访问同一个 Anka 地址。
活跃房间期间宿主禁止重建游戏。构建号或协议不一致会提示刷新。

## 验证

```sh
npm run test:online
npm run test:game
npm run test:ai
npm run test:duel
npm run test:duel:ui
npm run build
```

`scripts/verify-room-browser.mjs` 需要 Playwright 和可用的 Chromium。
通过 `ANKA_QA_URL / ANKA_QA_USER / ANKA_QA_PASSWORD` 指定隔离测试服务和测试账号；
可用 `PLAYWRIGHT_MODULE` 指定 Playwright 模块位置、
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` 指定浏览器。
脚本会建房、邀请测试访客并移除该访客，请使用专用测试账号。
