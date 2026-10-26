export const THEMES = {
  desert: {
    title: '砂岩前哨', sky: 0x9fd7f3, fog: 0xd8b899, ground: 0xd8ac6b, key: 0xffe4ba,
    wall: 0xc18b50, wallLight: 0xdfb47a, wallDark: 0x93643c, roof: 0xa97642,
    stone: 0xad7648, stoneLight: 0xc7935c, stoneDark: 0x86563b,
    wood: 0x91603b, woodLight: 0xb77d42, metal: 0x475563, dark: 0x293844,
    accent: 0xc86f40, fabric: 0xb66e3d, glass: 0x41727d, glow: 0x71d6cf,
    plant: 0x789751, plantLight: 0x9baf5b, plantDark: 0x456546, dust: 0xecd0a0,
  },
  jungle: {
    title: '雨林遗迹', sky: 0xb1d9c5, fog: 0x8baf97, ground: 0x7a8d59, key: 0xe7f0c6,
    wall: 0x80916f, wallLight: 0xb5b493, wallDark: 0x586b59, roof: 0x627d58,
    stone: 0x697b64, stoneLight: 0x9ba080, stoneDark: 0x485e51,
    wood: 0x70563b, woodLight: 0x99804c, metal: 0x4b6767, dark: 0x243f3d,
    accent: 0xd6a74f, fabric: 0x79864b, glass: 0x486f71, glow: 0x89e5c3,
    plant: 0x386e47, plantLight: 0x6d9a4f, plantDark: 0x24513d, dust: 0xb0b57b,
  },
  snow: {
    title: '霜原要塞', sky: 0xc4e1f2, fog: 0xc7dce9, ground: 0xe3edf0, key: 0xe7f2ff,
    wall: 0x899fb1, wallLight: 0xc0d2dc, wallDark: 0x5c748d, roof: 0xdbe7eb,
    stone: 0x879dad, stoneLight: 0xb9cfda, stoneDark: 0x617b90,
    wood: 0x747f85, woodLight: 0xa3b2b8, metal: 0x53677d, dark: 0x2c3e56,
    accent: 0xc48551, fabric: 0x7b9da8, glass: 0x395f79, glow: 0x85dfee,
    plant: 0x486b6b, plantLight: 0xaec9c7, plantDark: 0x345559, dust: 0xf4f7f5,
  },
  city: {
    title: '霓虹禁区', sky: 0x17253b, fog: 0x26354d, ground: 0x3b4658, key: 0xa8c8f2,
    wall: 0x47566e, wallLight: 0x71829a, wallDark: 0x303d52, roof: 0x35435b,
    stone: 0x3a4960, stoneLight: 0x586981, stoneDark: 0x26344b,
    wood: 0x58606b, woodLight: 0x7e8795, metal: 0x647b91, dark: 0x1b2a40,
    accent: 0xe18cb3, fabric: 0x4c7f9b, glass: 0x30677d, glow: 0x6ae3e9,
    plant: 0x4c8a89, plantLight: 0x7dc3b0, plantDark: 0x2d6768, dust: 0x71829b,
  },
};

export const WORLD_THEMES = Object.freeze(Object.keys(THEMES));

export function randomGenerator(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

