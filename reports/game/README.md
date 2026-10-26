# ANKA 游戏验证记录

本轮新增：真正的离线1对1规则人机对战，默认菜单入口“双方对战”。详见 duel-notes.md 和 duel-checks.json。真人实机已分别验证玩家击倒人机、红方击倒玩家、1:1比分和复活。原离线机器人波次演练已被替换。

当前可玩第一版使用 Vue 3 + Three.js；四种地图、主线三波、无限生存、AI合作、真人 WebRTC 房间和 PvP 均已实现。环境与机器人由代码构建，角色来源为既有 Tripo 资产、用户提供的两份 Mixamo FBX，以及本地 Blender 程序动作；没有新增付费生成调用。

## 已完成检查

- `npm run build`：生产构建成功，产物在根目录 dist/。Three.js 共享包约648KB，Vite 有大包提示；按需加载联机 SDK，模型文件只加载所选的两份新版资产。
- `npm run test:game`：真实控制器的四地图三波通关（每地图25敌人含Boss）、三阶段Boss、生存Boss波、全部7武器射击换弹、护盾伤害治疗、跳跃翻滚、失败结算、PvP计分、合作救援、客机分数同步和回合重开均通过。通关由测试脚本驱动，不是人工完整通关。
- `npm run validate:aim`：两个最终 GLB 各16段动画、65骨骼、0 glTF errors；逐段进行真实Three.js蒙皮采样。保留原模型已有的一个 NODE_SKINNED_MESH_NON_ROOT warning。
- 浏览器：真实沙漠战斗、武器切换、投掷、护盾、失败结算，四地图菜单切换和390×844/1280×800布局；新蹲伏、倒地在角色实验室实播。当前浏览器无脚本错误。
- 真人联机：同机两个浏览器客户端经公共PeerJS信令及实际WebRTC数据通道连接，同步进入同一关卡，双方显示2/4，能看到对方角色与同一批敌人。后续朝向、出生点、重开同步另有控制器检查。

## 使用限制

当前为可玩首版，程序环境与概念图的美术精度仍有差距。PvP没有账号匹配、专用权威服务器或服务端反作弊；房间跨网络连通性取决于公共信令和NAT，未部署TURN。手机尺寸菜单已检查；真实触屏双指手感仍需手机实机进一步调校。主线是三波关卡，尚无长篇剧情、账号成长和联网存档。

## 本地文件

- 主入口：index.html，源码 game/。
- 角色实验室：characters.html，选择“更多动作”。
- Blender源文件：source/male_scout_game.blend、source/female_striker_game.blend。
- 自动检查详情：controller-checks.json；角色详情：../mixamo/validation.json。
- 浏览器截图：menu-desktop.jpg、menu-mobile.jpg、desert-first.jpg、network-two-clients.jpg、jungle.jpg、snow.jpg、city.jpg、characters-crouch.jpg、characters-death.jpg。

## 私有发布

已注册 owner-private Site，但源码上传步骤被自动审批拒绝，尚未上传或部署。拒绝理由是未取得把本地源码和模型上传到具体外部目的地的明确授权。准备内容见 upload-plan.json；待用户确认后使用同一 Site ID 继续，不重复创建。
