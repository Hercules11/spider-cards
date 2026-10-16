# spider-cards

蜘蛛纸牌（Spider Solitaire）Web 游戏：经典 104 张牌、10 列牌桌，支持简单（1 花色）、
中等（2 花色）、困难（4 花色）三种难度与亮/暗主题、中英文切换。单击牌组自动移到合适的
落点（同花延续优先），也可按住拖拽自选落点（微软式规则：任意连续递减序列可整组拖动）；
K→A 同花顺自动收走，集齐 8 组获胜；全部亮牌后可一键「自动完成」收尾；
含撤销、提示、计时计分、各难度最佳成绩与牌局自动保存（刷新可接着玩）。

## 快速开始

环境要求：Node.js ≥ 20，pnpm ≥ 9。

```sh
pnpm install          # 安装依赖，pre-commit 钩子经 prepare 脚本自动生效
pnpm dev              # 启动开发服务器（Vite HMR）
pnpm check:all        # 提交前完整门禁：lint + 类型检查 + 单测 + 构建 + e2e
```

IDE 建议 [VSCode](https://code.visualstudio.com/) +
[Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar)（禁用 Vetur），
TypeScript 才能正确理解 `.vue` 文件的类型。

## 常用命令

| 命令                            | 说明                                                     |
| ------------------------------- | -------------------------------------------------------- |
| `pnpm dev`                      | 启动开发服务器（Vite HMR）                               |
| `pnpm build`                    | 类型检查 + 生产构建（产物输出到 `dist/`）                |
| `pnpm preview`                  | 预览生产构建                                             |
| `pnpm test`                     | 运行全部单元/组件测试（Vitest + jsdom，一次性）          |
| `pnpm test:watch`               | 监听模式运行测试                                         |
| `pnpm test:coverage`            | 运行测试并生成覆盖率报告（`coverage/` 目录）             |
| `pnpm test:e2e`                 | 运行 Playwright 端到端冒烟测试（自动构建并启动 preview） |
| `pnpm lint:check` / `pnpm lint` | ESLint 校验（前者 0 warning 才通过；后者自动修复）       |
| `pnpm check`                    | lint + 类型检查 + 单测 + 构建                            |
| `pnpm check:all`                | `check` + e2e，提交前的完整门禁                          |
| `pnpm format`                   | Prettier 格式化 `src/`                                   |

## 目录结构

```
src/
├─ core/            # 纯函数游戏引擎（无 Vue 依赖，可独立测试）
│  ├─ cards.ts      # 牌堆生成（按难度）、洗牌、显示工具
│  ├─ rules.ts      # 可移动牌组、落点判定、完成检测、发牌条件
│  ├─ engine.ts     # 开局发牌、移动/发牌结算、提示、自动移动
│  └─ autocomplete.ts # 全明牌收尾求解器（记忆化 DFS + 启发式排序）
├─ composables/
│  ├─ useGame.ts    # 响应式状态中枢：撤销历史、计时、成绩、存档
│  ├─ useTheme.ts   # 亮/暗主题（antd 算法色板 + CSS 变量）
│  └─ useLocale.ts  # 中英文切换与持久化
├─ components/
│  ├─ CardView.vue        # 单张扑克牌（正面/背面）
│  ├─ GameBoard.vue       # 牌桌：撑满画布的堆叠布局、单击自动移动、指针拖拽、
│  │                      #   FLIP 滑移/翻面/发牌/收牌飞行动画（原生 WAAPI）
│  ├─ StatsBar.vue        # 分数/步数/时间/完成槽位/发牌堆/操作按钮
│  ├─ DifficultyModal.vue # 首次进入的难度选择
│  ├─ HelpModal.vue       # 规则说明
│  └─ WinModal.vue        # 通关结算（本局成绩 + 历史最佳）
└─ lang/            # zh / en 文案
```

游戏逻辑集中在 `src/core/`（纯函数、写时复制），UI 层只负责渲染与交互分发；
`useGame` 持有一份状态快照历史用于撤销，并把每步结果持久化到 localStorage。

## 部署（GitHub Pages）

与 typing-faster 相同的部署方式：

1. `dist/` 随提交入库：pre-commit 钩子依次执行 `lint-staged` → `pnpm test` →
   `pnpm build` → 自动 `git add dist/`（Vite `base` 已是 `/spider-cards/`，与仓库名一致）。
2. 推送到 GitHub 后，在仓库 Settings → Pages 把 Source 设为 **GitHub Actions**；
   `.github/workflows/static.yml` 会在每次 push 到 `main` 时把 `./dist` 发布到 Pages。

线上地址：`https://<用户名>.github.io/spider-cards/`
（若仓库名不同，请同步修改 `vite.config.ts` 的 `base`）。

## 文档

| 文档   | 内容                           |
| ------ | ------------------------------ |
| 本文档 | 快速开始、命令、目录结构、部署 |
