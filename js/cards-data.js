/* 坎友卡牌中心 - 第一弹卡牌数据
 * 依据：gtcg/卡牌清单.md（逐张从卡面识别，2026-10-13）
 */
const SETS = [
  { id: "set1", name: "第一弹", count: 24 }
];

const KEYWORD_DEFS = {
  "守护": "此角色可以阻挡对手对你或你的其他角色发起的攻击。",
  "突袭": "此角色可以攻击处于疲劳状态的对手角色。",
  "响应": "此卡可以在对手的回合中使用。",
  "泛用": "此角色可以装备任意武器。",
  "重整": "将此角色恢复为活跃状态，本回合中，此角色不能攻击。",
  "登场时": "触发时机：该角色入场时触发。",
  "攻击时": "触发时机：宣告攻击时触发。",
  "守护时": "触发时机：进行守护时触发（细节待规则确定）。",
  "共鸣时": "触发时机：与共鸣值相关的时点（细节待规则确定）。",
  "共鸣中": "持续状态：与共鸣值相关的状态（细节待规则确定）。"
};

const CARDS = [
  {
    id: "card01", set: "set1", name: "仙山拳名家佩儿", type: "角色",
    cost: 3, attr: "光", factions: ["消逝之都", "神威门"], weapons: ["手套"],
    power: 2500, img: "assets/cards/card01.png",
    text: ["[登场时]：查看你的牌库顶5张牌，将其中1张名称含有「神威门」的卡加入手牌，其余牌以任意顺序置于牌库底。"],
    keywords: ["登场时"]
  },
  {
    id: "card02", set: "set1", name: "仙山拳名家梅儿", type: "角色",
    cost: 3, attr: "光", factions: ["消逝之都", "神威门"], weapons: ["手套"],
    power: 2500, img: "assets/cards/card02.png",
    text: ["[攻击时]：此角色战力+2000，直到此次战斗结束。"],
    keywords: ["攻击时"]
  },
  {
    id: "card03", set: "set1", name: "掌门陶禹", type: "角色",
    cost: 4, attr: "光", factions: ["消逝之都", "神威门"], weapons: ["手套"],
    power: 2000, img: "assets/cards/card03.png",
    text: ["使用「神威门」卡牌时：抽1张牌。"],
    keywords: []
  },
  {
    id: "card04", set: "set1", name: "勇士挑战者", type: "角色",
    cost: 1, attr: "土", factions: ["地牢王国"], weapons: [],
    power: 1500, img: "assets/cards/card04.png",
    text: ["[守护]：此角色可以阻挡对手对你或你的其他角色发起的攻击。"],
    keywords: ["守护"]
  },
  {
    id: "card05", set: "set1", name: "巴尔哈尔？", type: "角色",
    cost: 5, attr: "土", factions: ["地牢王国"], weapons: [],
    power: 5500, img: "assets/cards/card05.png",
    text: ["[守护]：此角色可以阻挡对手对你或你的其他角色发起的攻击。"],
    keywords: ["守护"],
    note: "卡名带问号，待确认是否为正式卡名。"
  },
  {
    id: "card06", set: "set1", name: "工程师玛丽安", type: "角色",
    cost: 3, attr: "土", factions: ["泰坦王国"], weapons: ["步枪"],
    power: 1500, img: "assets/cards/card06.png",
    text: ["[登场时]：指定己方一名其他角色，使其在本回合内获得[突袭]。", "[突袭]：此角色可以攻击处于疲劳状态的对手角色。"],
    keywords: ["登场时", "突袭"]
  },
  {
    id: "card07", set: "set1", name: "旅馆老板娘", type: "角色",
    cost: 2, attr: "虚", factions: ["浮游城"], weapons: ["篮子"],
    power: 2000, img: "assets/cards/card07.png",
    text: ["[登场时]：查看你的牌库顶3张牌，选择1张加入手牌，将剩余的分别置于你的牌库顶或牌库底。"],
    keywords: ["登场时"]
  },
  {
    id: "card08", set: "set1", name: "森林妖精青叶", type: "角色",
    cost: 2, attr: "土", factions: ["坎特伯雷"], weapons: ["弓"],
    power: 2000, img: "assets/cards/card08.png",
    text: ["此角色不能攻击。", "[登场时]：从牌库顶抽1张牌。"],
    keywords: ["登场时"]
  },
  {
    id: "card09", set: "set1", name: "蠢脸骑士", type: "角色",
    cost: 3, attr: "虚", factions: ["坎特伯雷"], weapons: ["单手剑", "双手剑", "弓", "步枪"],
    power: 2500, img: "assets/cards/card09.png",
    text: ["装备武器时：力量+500。"],
    keywords: [],
    note: "原文为「力量」，与「战力」术语待统一。"
  },
  {
    id: "card10", set: "set1", name: "真正的勇士克雷格", type: "角色",
    cost: 4, attr: "土", factions: ["地牢王国", "浮游城"], weapons: ["单手剑"],
    power: 3000, img: "assets/cards/card10.png",
    text: ["[守护]：此角色可以阻挡对手对你或你的其他角色发起的攻击。", "[守护时]：此角色战力+3000，直到此次战斗结束。"],
    keywords: ["守护", "守护时"]
  },
  {
    id: "card11", set: "set1", name: "波比&琳达", type: "角色",
    cost: 4, attr: "虚", factions: ["坎特伯雷"], weapons: [],
    power: 5000, img: "assets/cards/card11.png",
    text: [],
    keywords: []
  },
  {
    id: "card12", set: "set1", name: "哥布林", type: "角色",
    cost: 1, attr: "虚", factions: [], weapons: [],
    power: 1000, img: "assets/cards/card12.png",
    text: ["[泛用]：此角色可以装备任意武器。"],
    keywords: ["泛用"],
    note: "无阵营标签。"
  },
  {
    id: "card13", set: "set1", name: "利贝拉", type: "装备",
    cost: 2, attr: "虚", factions: [], weapons: ["单手剑"],
    power: 1000, img: "assets/cards/card13.png",
    text: ["[共鸣时]：获得1点共鸣值。", "[攻击时]：选择对手的1名角色使其本回合中给予1000点伤害。"],
    keywords: ["共鸣时", "攻击时"],
    exclusiveTo: "蠢脸骑士",
    note: "攻击时效果原文存在歧义（详见规则草案 C6）。"
  },
  {
    id: "card14", set: "set1", name: "新手剑", type: "装备",
    cost: 2, attr: "虚", factions: [], weapons: ["单手剑"],
    power: 2000, img: "assets/cards/card14.png",
    text: [],
    keywords: []
  },
  {
    id: "card15", set: "set1", name: "沉默", type: "装备",
    cost: 1, attr: "土", factions: [], weapons: ["单手剑"],
    power: 500, img: "assets/cards/card15.png",
    text: ["[共鸣中]：回合结束时[重整]。", "[重整]：将此角色恢复为活跃状态，本回合中，此角色不能攻击。"],
    keywords: ["共鸣中", "重整"],
    exclusiveTo: "真正的勇士克雷格",
    note: "重整对象（装备卡自身/被装备角色）待规则确定。"
  },
  {
    id: "card16", set: "set1", name: "仙山拳最终奥义，霸王冰焰弹！", type: "事件",
    cost: 5, attr: "光", factions: ["消逝之都", "神威门"], weapons: [],
    power: null, img: "assets/cards/card16.png",
    text: ["从牌库顶抽2张牌，然后选择对方1名角色击破。"],
    keywords: ["击破"],
    note: "卡图为占位图，待替换。"
  },
  {
    id: "card17", set: "set1", name: "佩儿的特训", type: "事件",
    cost: 1, attr: "光", factions: ["消逝之都", "神威门"], weapons: [],
    power: null, img: "assets/cards/card17.png",
    text: ["使己方所有角色在本回合中战力+1000。"],
    keywords: []
  },
  {
    id: "card18", set: "set1", name: "塞西尔的演唱会", type: "事件",
    cost: 2, attr: "虚", factions: ["流浪歌手"], weapons: [],
    power: null, img: "assets/cards/card18.png",
    text: ["从牌库顶抽取2张牌，然后弃置1张手牌。"],
    keywords: []
  },
  {
    id: "card19", set: "set1", name: "她一定会喜欢的", type: "事件",
    cost: 2, attr: "虚", factions: ["浮游城"], weapons: [],
    power: null, img: "assets/cards/card19.png",
    text: ["从你的废弃区中选择1张卡，将其置于费用区。"],
    keywords: []
  },
  {
    id: "card20", set: "set1", name: "我只是路过", type: "事件",
    cost: 1, attr: "虚", factions: ["坎特伯雷"], weapons: [],
    power: null, img: "assets/cards/card20.png",
    text: ["将己方场上的1名角色返回手牌，然后从自己的牌库抽1张牌。"],
    keywords: []
  },
  {
    id: "card21", set: "set1", name: "让人想要哭泣的场景", type: "事件",
    cost: 2, attr: "虚", factions: ["坎特伯雷"], weapons: [],
    power: null, img: "assets/cards/card21.png",
    text: ["[响应]：使对手的1名人物疲劳。", "[响应]：此卡可以在对手的回合中使用。"],
    keywords: ["响应"],
    note: "原文为「人物」，与「角色」术语待统一。"
  },
  {
    id: "card22", set: "set1", name: "钢铁泰坦，出击！", type: "事件",
    cost: 3, attr: "土", factions: ["泰坦王国"], weapons: [],
    power: null, img: "assets/cards/card22.png",
    text: ["使对手所有角色在本回合中战力-2000。"],
    keywords: []
  },
  {
    id: "card23", set: "set1", name: "骑士团长伊娃", type: "角色",
    cost: 3, attr: "光", factions: ["坎特伯雷"], weapons: ["权杖"],
    power: 3000, img: "assets/cards/card23.png",
    text: ["[登场时]：指定己方一名其他角色，使其获得[守护]。", "[守护]：此角色可以阻挡对手对你或你的其他角色发起的攻击。"],
    keywords: ["登场时", "守护"],
    note: "守护授予持续期未写明（对比玛丽安明确写了「本回合内」）。"
  },
  {
    id: "card24", set: "set1", name: "冠军之剑", type: "特殊",
    cost: null, attr: "无", factions: [], weapons: [],
    power: 9999, img: "assets/cards/card24.png",
    text: [],
    keywords: [],
    flavor: "“冠军之剑回应了你的召唤。”",
    note: "无费用、无类型图标、无规则文本，召唤条件与用途待规则确定。"
  }
];

const FACTIONS = ["坎特伯雷", "地牢王国", "泰坦王国", "浮游城", "消逝之都", "神威门", "流浪歌手"];
const ATTRS = ["光", "土", "虚", "无"];
const TYPES = ["角色", "事件", "装备", "特殊"];
