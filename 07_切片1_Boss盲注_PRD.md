# 切片 1 PRD：Boss 盲注（6 个）

> 目标：让每局不一样。当前 6 个盲注是 6 次数值检查，Boss 位只有名字没有规则。
> 范围：只做 Boss 规则与表现，不做星球牌、不做塔罗、不加底注。
> 验收方式：每步一验 + 最后总体验收（第十节）。

---

## 一、用户故事

> 我打到第 3 个盲注时，看到它不是"数字更大的小盲"，而是"这一手得换个打法"，于是我得重新算一遍牌。

现在的问题：Boss 位的目标只是 600，和前面的 450 没有性质差异。玩家没有任何理由改变出牌方式。

---

## 二、核心设计：规则用数据表，不用函数

```ts
interface BlindRule {
  targetMultiplier?: number;   // 目标分数倍率
  forbidDiscards?: boolean;    // 禁止弃牌
  handSizeDelta?: number;      // 手牌上限增量
  requirePlayedCards?: number; // 必须恰好打出 N 张
  debuffSuit?: Suit;           // 该花色不计分
  debuffFace?: boolean;        // J/Q/K 不计分
}
```

**为什么不能每个 Boss 写一个 `apply(state)`：** ① 函数进不了 `localStorage`，存档会坏；② 每个 Boss 都要造一整套状态才能测；③ `run.ts` 会被特判塞满，20 个 Boss 之后无法维护。

规则表只有一个入口 `applyBlindRule()`，8 行数据 = 8 个 Boss。字段随时可扩（`maxPlayedCards`、`handsDelta` 等已在设计里预留位置）。

---

## 三、6 个 Boss

| # | id | 名字 | 效果 | 规则字段 | 初值 | 为什么改变打法 |
|---|---|---|---|---|---|---|
| 1 | `rampart` | 铁壁 | 目标分数提高 | `targetMultiplier` | ×1.5 | 逼你算清"这一手够不够"，不能再拖到最后 |
| 2 | `drought` | 干涸 | 本回合不能弃牌 | `forbidDiscards` | true | 不能靠弃牌找牌，起手定生死 |
| 3 | `girdle` | 束带 | 手牌上限 -1 | `handSizeDelta` | -1（8→7） | 可选空间变窄，5 张的取舍变难 |
| 4 | `decree` | 铁律 | 每手必须出满 5 张 | `requirePlayedCards` | 5 | 对子/三条不能单出，必须凑 5 张 |
| 5 | `fade` | 失色 | 本底注随机一种花色不计分 | `debuffSuit` | 4 选 1 | 你堆的同花可能整副废掉 |
| 6 | `nameless` | 无名 | J / Q / K 不计分 | `debuffFace` | — | 人头牌流直接失效 |

**抽取规则**：每个底注的 Boss 由 `(seed, ante)` 确定性决定，同 seed 同底注结果固定。2 个底注 = 2 个不同 Boss（用不同 rng 流，理论上可能重复，允许）。

**失色** 的花色同样由 `(seed, ante)` 决定，存档重开后不变。

---

## 四、规则如何生效（唯一入口）

| 时机 | 处理 |
|---|---|
| 进入盲注（`selectBlind`） | 解析 Boss → 写入 `bossId` / `bossRule`；`target = 基础目标 × targetMultiplier`；`discardsLeft = max(0, 3 + discardsDelta)`；`handSize = max(1, 8 + handSizeDelta)` |
| 出牌校验（`playHand`） | `requirePlayedCards` 存在且选中数不等于它 → 不响应 |
| 计分（`scoreHand`） | 被 debuff 的牌**仍参与牌型识别**（葫芦还是葫芦），但**不计筹码也不计入计分序列** |
| 亮牌提示 | 被 debuff 的牌在选牌预览时标红斜线，否则玩家不知道分为什么低 |
| 换盲注 | `bossId` / `bossRule` 清空 |

沿用 Balatro 的语义：debuff 只影响计分，不影响牌型判定。这条如果不遵守，"无名"会让所有含人头牌的牌型直接降级，玩家会觉得是 bug。

---

## 五、界面

1. **盲注选择页**：Boss 卡上第二行写 `铁壁 · 目标分数 ×1.5`，不用点进去才知道。
2. **牌桌顶部**：当前生效规则常驻一行（`Boss · 铁壁：目标分数 ×1.5`）。
3. **出牌按钮**：铁律时选中不足 5 张 → 禁用，按钮下方提示"必须出满 5 张"。
4. **被 debuff 的牌**：选牌预览时加红色斜线 + 降透明度。

---

## 六、数据结构变更

```ts
interface RunState {
  version: number;              // 新增，存档迁移用
  bossId: string | null;        // 新增
  bossRule: BlindRule | null;   // 新增（纯数据，可序列化）
  handSize: number;             // 新增，本回合手牌上限
}
interface ScoreResult {
  debuffedCardIds: string[];    // 新增，供界面标注
}
```

`version` 当前存档无此字段 → 迁移时补 `version = 2`、`bossId = null`、`bossRule = null`、`handSize = 8`。

---

## 七、分步实施与验收门禁

| 步 | 内容 | 验收标准（必须全过才进下一步） |
|---|---|---|
| **S1** | `BlindRule` 类型 + 6 个 Boss 数据表 + `rollBoss()` | 6 条规则字段合法；`rollBoss` 同 seed 稳定、不同 seed 能抽到不同 Boss；失色花色落在 4 种之内 |
| **S2** | `selectBlind` 应用规则 + `handSize` + `bossId` + 存档 version | 6 个 Boss 各自的 `target` / `handSize` / `discardsLeft` 断言通过；旧存档能读 |
| **S3** | 计分过滤 + 铁律校验 | 失色/无名不计筹码但牌型不变；铁律下出 3 张无效、出 5 张生效 |
| **S4** | 界面（盲注卡、规则条、禁用态、标红） | 渲染冒烟：6 个 Boss 名与效果都出现在 HTML；铁律时按钮 `disabled` |
| **S5** | 总体验收 | 全量测试 + `tsc` + `build` + E2E 脚本 + 浏览器实跑 |

---

## 八、测试清单（数量预估 53 → 70+）

- 数据表：6 条规则合法性、id 唯一、`rollBoss` 确定性 ×3 组 seed
- 每个 Boss 一条状态断言（`target` / `discardsLeft` / `handSize`）
- 计分：失色排除该花色、无名排除 JQK、牌型识别不受影响
- 铁律：选中 3 张 → 状态不变；选中 5 张 → 正常结算
- 存档：旧存档（无 version）迁移、新存档 round-trip
- 渲染：Boss 卡文案、规则条、禁用态

---

## 九、不做

塔罗、星球牌、优惠券、补充包、标签、`maxPlayedCards`（先不实现，字段预留）、Boss 的 3D 表现/动画、多 Boss 同时生效。

---

## 十、总体验收（切片 1 完成定义）

1. `npx vitest run` 全绿（≥70 项），`npx tsc --noEmit` 干净，`npx vite build` 通过。
2. **E2E 脚本**：对 6 个 Boss 各跑一遍「进入盲注 → 出牌 → 结算」，断言状态转移正确；再跑一条完整 run（2 底注 × 3 盲注）到 `won`。
3. **浏览器实跑**：进入 2 个不同底注的 Boss，肉眼确认规则条、目标数字、手牌数、禁用态与预期一致。
4. 旧存档（模拟无 version 的 JSON）刷新后不白屏。
5. 提交并推送，README 与 `06` 文档同步更新进度。

---

## 十一、验收记录（2026-11-07 实际执行）

### 分步门禁

| 步 | 门禁 | 结果 | 证据 |
|---|---|---|---|
| S1 | 6 条规则合法、id 唯一、`rollBoss` 稳定、失色花色合法 | ✅ | `boss.test.ts` 7 项 |
| S2 | 6 个 Boss 的 target / 手牌数 / 弃牌数；非 Boss 无规则；未知 id 回退；打完清空 | ✅ | `boss.test.ts` 9 项 |
| S3 | 失色与无名不计分但牌型不变；空规则等价；铁律 3 张被拒 / 5 张通过；存档迁移 | ✅ | `boss.test.ts` 9 项 |
| S4 | 盲注卡显示 Boss 名与效果；规则条；禁用态；手牌 7 张 | ✅ | `render.test.tsx` 11 项 |
| S5 | 6 个 Boss 各走一手；完整 6 盲注到 won；中途存档续玩；失败路径 | ✅ | `e2e.test.ts` 9 项 |

### 总体验收

| 项 | 结果 |
|---|---|
| `vitest run` | **93 项全绿**（53 → 93，新增 40） |
| `tsc --noEmit` | 干净 |
| `vite build` | 通过（CSS 8.34kB / JS 248.74kB） |
| 浏览器实跑 | 6 个 Boss 逐个截图核对，见下 |
| 旧存档迁移 | 无 version 的 JSON 能读，字段补全为 `bossId=null / bossRule=null / handSize=8` |

### 截图核对（headless Chrome，1280×900）

| Boss | 期望 | 实际 |
|---|---|---|
| 铁壁 | 目标 900、规则条「目标分数 ×1.5」 | ✅ |
| 干涸 | 弃牌计数 0、弃牌按钮禁用 | ✅ |
| 束带 | 只发 7 张、规则条「手牌上限 -1」 | ✅ |
| 铁律 | 「必须出满 5 张」提示、未满 5 张时按钮禁用 | ✅ |
| 失色 | 被点名花色画红斜线；对子 9♠+9♥ 只算 9♥ → 19×2=38 | ✅ 与手算一致 |
| 无名 | J/Q/K 画红斜线；两对 4+6+J+J 只算 4+4 → 28×2=56 | ✅ 与手算一致 |
| 盲注选择页 | Boss 名 + 效果 + 乘过倍率的实际目标 | ✅ |

### 过程中被门禁挡下的问题

1. **`tsc` 首轮 3 个错误**：新增 `version / bossId / bossRule / handSize / debuffedCardIds` 是必填字段，未同步到 `createRun` 与 `scoreHand`。属于预期内，按步骤补齐。
2. **铁律用例断言写错**：第一版假设"出满 5 张会结束回合"，实际是分数没到 900。改成只断言"张数达标 + 手牌补满 + 牌数守恒"。
3. **App 里 Boss 预览解构错**：`bossPreview` 是 `{boss, rule}`，写成 `boss.name` 取不到名字，被 `tsc` 抓到。
4. **失色那手棋差点被误判**：截图里 5 张牌看着像"2 7 8 9 Q"，实际是"2 7 9 9 Q"，被压制的 9♠ 不计分 → 19×2。说明**红斜线标记是必要的**，否则玩家会以为是 bug。

