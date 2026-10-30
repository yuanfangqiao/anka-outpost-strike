export const MAPS = [
  {id:'desert',name:'沙漠基地',english:'DUSTFALL OUTPOST',tag:'01 / 原点行动',description:'穿过峡谷据点，击退机器军团，摧毁重型机甲。',color:'#edb76e'},
  {id:'jungle',name:'丛林遗迹',english:'VERDANT RUINS',tag:'02 / 绿荫追踪',description:'在遗迹与大树之间游走，用掩体阻断敌人的火力。',color:'#82b584'},
  {id:'snow',name:'雪地要塞',english:'FROSTLINE KEEP',tag:'03 / 极地防线',description:'白雪覆盖的边境堡垒，冷色视野中的红色威胁。',color:'#a1ccdf'},
  {id:'city',name:'未来都市',english:'NEON DISTRICT',tag:'04 / 霓虹反击',description:'进入灯光闪烁的街区，迎击精锐与空中无人机。',color:'#a89be8'},
];
export const MODES = [
 {id:'story',name:'主线闯关',icon:'◈',description:'三波战斗 · 最终机甲 Boss'},
 {id:'survival',name:'生存模式',icon:'∞',description:'无限波次 · 难度逐渐提升'},
 {id:'coop',name:'合作副本',icon:'⌘',description:'AI 搭档 · 可邀请好友联机'},
 {id:'versus',name:'双方对战',icon:'⚔',description:'1 对 1 人机 · 先得 10 分获胜'},
];
export const WEAPONS = [
 {id:'rifle',name:'突击步枪',short:'AR-28',damage:24,rate:8.5,mag:28,reserve:196,reload:1.65,range:70,spread:.014,pellets:1,color:0xed7654},
 {id:'sniper',name:'狙击枪',short:'SR-05',damage:120,rate:.85,mag:5,reserve:35,reload:2.4,range:110,spread:.002,pellets:1,color:0xf1c45e},
 {id:'shotgun',name:'霰弹枪',short:'SG-08',damage:15,rate:1.25,mag:8,reserve:64,reload:2.1,range:24,spread:.11,pellets:7,color:0x6ea6e3},
 {id:'smg',name:'冲锋枪',short:'SM-36',damage:14,rate:13,mag:36,reserve:252,reload:1.4,range:40,spread:.032,pellets:1,color:0xf078bb},
 {id:'rocket',name:'火箭筒',short:'RL-01',damage:145,rate:.7,mag:1,reserve:8,reload:2.6,range:65,spread:.008,pellets:1,projectile:'rocket',radius:4,color:0xf17943},
 {id:'grenadeLauncher',name:'榴弹枪',short:'GL-06',damage:95,rate:1.5,mag:6,reserve:30,reload:2.3,range:38,spread:.016,pellets:1,projectile:'grenade',radius:3.1,color:0xb6a2d3},
 {id:'energy',name:'能量枪',short:'EN-20',damage:35,rate:5.5,mag:20,reserve:140,reload:1.9,range:80,spread:.006,pellets:1,color:0x67deef},
];
export const ENEMIES = {
 walker:{name:'步兵机器人',hp:72,speed:2.3,damage:8,range:14,interval:1.7,score:60,radius:.52,height:1.15},
 sniper:{name:'狙击机器人',hp:52,speed:1.2,damage:18,range:29,interval:3.0,score:85,radius:.48,height:1.3},
 drone:{name:'飞行无人机',hp:45,speed:3.2,damage:6,range:17,interval:1.35,score:70,radius:.55,height:2.8},
 bomber:{name:'自爆机器人',hp:50,speed:3.4,damage:27,range:1.5,interval:.7,score:75,radius:.5,height:.85},
 shield:{name:'盾牌机器人',hp:190,speed:1.6,damage:9,range:11,interval:1.6,score:115,radius:.65,height:1.4},
 elite:{name:'精锐机甲',hp:165,speed:2.7,damage:10,range:20,interval:1.2,score:150,radius:.65,height:1.5},
 boss:{name:'巨型战争机甲',hp:1800,speed:1.2,damage:17,range:28,interval:1.8,score:1600,radius:1.5,height:2.3},
};
export const SETTINGS_KEY='anka-desert-strike-settings-v1';
export const SAVE_KEY='anka-desert-strike-progress-v1';
