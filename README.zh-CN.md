# Prism — UI Design MCP Server

一个为 AI Agent 提供 UI 设计能力的 MCP（Model Context Protocol）服务器。用户下载到本地后，AI Agent 通过 MCP 协议调用设计工具进行创作，同时用户可通过浏览器客户端实时监控和调整设计。

## 核心特性

### 双通道实时协作架构

```
┌──────────┐     stdio      ┌──────────────────┐
│ AI Agent │ ←─────────────→ │  MCP Server       │
│ (Trae /  │                 │                    │
│  Claude) │                 │  ┌──────────────┐ │
└──────────┘                 │  │ Design State │ │
                             │  │ Store        │ │
                             │  └──────┬───────┘ │
                             │         │         │
┌──────────┐   WebSocket     │  ┌──────▼───────┐ │
│ Browser  │ ←─────────────→ │  │ HTTP + WS    │ │
│ Client   │                 │  │ Server       │ │
│ (Canvas) │                 │  └──────────────┘ │
└──────────┘                 └──────────────────┘
```

- **AI Agent 通道（stdio）**：AI 通过 MCP 协议调用工具，初始化设计、添加组件、设置动画
- **用户通道（WebSocket）**：浏览器客户端实时显示 AI 的操作，用户可调整令牌、删除组件
- **双向同步**：AI 的操作实时推送到客户端，用户的调整也同步回状态存储，AI 下次查询时可见

### 17 个工具

| 工具 | 类型 | 功能说明 |
|------|------|----------|
| `design_init` | 实时 | 初始化设计项目，设置风格并生成完整令牌集 |
| `design_add_component` | 实时 | 向画布添加 UI 组件（hero、navbar、card 等 17 种） |
| `design_update_component` | 实时 | 更新已有组件的属性 |
| `design_remove_component` | 实时 | 从画布移除组件 |
| `design_set_animation` | 实时 | 为组件设置入场和悬停动画 |
| `design_set_token` | 实时 | 设置或更新单个设计令牌 |
| `design_get_state` | 实时 | 获取完整设计状态（令牌、组件、活动日志） |
| `ui_generate_color_palette` | 生成 | 基于色彩理论生成六种和谐配色方案 |
| `ui_suggest_typography` | 生成 | 精选字体配对，附带 Google Fonts 链接 |
| `ui_generate_type_scale` | 生成 | 模数化字号系统（8 种比率） |
| `ui_generate_spacing_scale` | 生成 | 间距系统（线性、几何、斐波那契） |
| `ui_generate_shadow_system` | 生成 | 阴影层级系统（3 种风格） |
| `ui_generate_border_radius_scale` | 生成 | 圆角系统（4 种风格） |
| `ui_check_color_contrast` | 生成 | WCAG 2.1 对比度检查 |
| `ui_generate_gradient` | 生成 | CSS 渐变生成 |
| `ui_suggest_breakpoints` | 生成 | 响应式断点系统 |
| `ui_generate_design_tokens` | 生成 | 一键生成完整设计令牌系统 |

## 快速开始

### 1. 安装

```bash
git clone <repo-url>
cd ui-design-mcp-server
npm install
npm run build
```

### 2. 启动服务器

```bash
npm start
```

启动后会同时运行：
- **MCP stdio 传输**：供 AI Agent 连接
- **HTTP + WebSocket 服务器**：供浏览器客户端访问（默认端口 3100）

输出示例：
```
[ui-design-mcp-server v1.0.0] MCP stdio transport ready for AI agent
[ui-design-mcp-server] Dashboard: http://localhost:3100
[ui-design-mcp-server] WebSocket: ws://localhost:3100/ws
```

### 3. 配置 AI Agent

在你的 AI 客户端（Trae、Claude Desktop 等）的 MCP 配置中添加：

```json
{
  "mcpServers": {
    "ui-design": {
      "command": "node",
      "args": ["/path/to/ui-design-mcp-server/dist/index.js"]
    }
  }
}
```

### 4. 打开客户端 Dashboard

浏览器访问 `http://localhost:3100`，你将看到三栏界面：

- **左侧 — 活动日志**：实时显示 AI 的每一步操作和你的调整
- **中间 — 画布预览**：AI 添加的组件实时渲染，带动画效果
- **右侧 — 设计令牌**：可编辑的颜色、字体、间距、圆角令牌

### 5. 开始创作

对 AI Agent 说：
> "帮我设计一个电商促销页面，风格是 bold，主色用橙色"

AI 会依次调用 `design_init` 初始化项目、`design_add_component` 添加 Hero 区、导航栏、商品卡片等组件。你在浏览器中可以实时看到每一步操作，并可以：
- 点击颜色色板调整主色
- 拖动滑块修改间距和字号
- 点击组件右上角的删除按钮移除不需要的部分

## 客户端 Dashboard 功能

### 实时画布

支持 17 种组件类型的实时渲染：

| 组件 | 变体 | 说明 |
|------|------|------|
| `hero` | centered, split, fullbleed | 首屏大图区 |
| `navbar` | simple, with_cta, mega | 导航栏 |
| `card_grid` | 2col, 3col, 4col | 卡片网格 |
| `card` | product, feature, article, profile | 单卡片 |
| `button` | primary, secondary, ghost | 按钮 |
| `cta` | centered, split, banner | 行动号召区 |
| `footer` | — | 页脚 |
| `text_section` | — | 文本区块 |
| `feature_list` | — | 功能特性列表 |
| `stats` | — | 数据统计 |
| `pricing` | — | 定价方案 |
| `testimonial` | — | 用户评价 |
| `banner` | — | 横幅通知 |
| `timeline` | — | 时间线 |
| `faq` | — | 常见问题 |
| `form` | — | 表单 |
| `image` | — | 图片 |

### 设计令牌面板

四个标签页可切换：
- **色彩**：带色板预览，点击可拾色
- **字体**：展示字体、正文字体、字号阶梯
- **间距**：带数值滑块
- **圆角**：带数值滑块

每个令牌标记来源（AI / 用户），方便追踪修改历史。

### 动画支持

AI 可通过 `design_set_animation` 为组件设置：
- **入场动画**：fadeUp、fadeIn、scaleIn、slideRight、slideLeft、slideUp、spring
- **悬停动画**：scaleUp、lift、glow
- **自定义参数**：持续时间、延迟、缓动曲线

## 风格预设

| 风格 | 描述 | 主色相 | 阴影 | 圆角 | 间距基数 |
|------|------|--------|------|------|----------|
| `minimal` | 干净通透，中性色调 | 220° 蓝 | subtle | subtle | 8px |
| `bold` | 高对比度，鲜艳强调色 | 25° 橙 | medium | rounded | 8px |
| `playful` | 温暖友好，圆润形状 | 340° 粉 | medium | pill | 8px |
| `dark` | 深色优先，发光强调色 | 260° 紫 | sharp | subtle | 8px |
| `editorial` | 杂志风格，优雅衬线体 | 30° 棕 | subtle | sharp | 8px |
| `tech` | 未来科技感，青蓝精确 | 180° 青 | sharp | sharp | 4px |

## 使用示例

### AI 初始化项目并添加组件

```
AI 调用: design_init
参数: { "project_name": "夏季促销", "style": "bold", "base_color": "#F97316" }

AI 调用: design_add_component
参数: { "type": "hero", "variant": "centered", "props": { "title": "夏季大促", "subtitle": "精选商品5折起", "button_text": "立即抢购" } }

AI 调用: design_add_component
参数: { "type": "card_grid", "variant": "3col", "props": { "items": [...] } }

AI 调用: design_set_animation
参数: { "component_id": "comp_xxx", "entry": "fadeUp", "duration": 0.5, "delay": 0.2 }
```

### 用户在客户端调整

用户在浏览器中：
1. 点击 `color-primary` 色板，选择新颜色
2. 拖动 `space-md` 滑块调整间距
3. 点击某个组件的删除按钮

这些操作通过 WebSocket 实时同步到状态存储，AI 下次调用 `design_get_state` 时可以看到用户的修改。

## 项目结构

```
ui-design-mcp-server/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # 主入口：MCP stdio + HTTP/WebSocket 服务器
│   ├── state.ts              # 设计状态存储（单例，事件驱动）
│   ├── types.ts              # TypeScript 类型定义
│   ├── constants.ts          # 风格预设、字体配对库、断点预设
│   ├── utils/
│   │   ├── color.ts          # 色彩理论引擎
│   │   └── formatter.ts      # 输出格式化
│   └── tools/
│       ├── design-tools.ts    # 实时设计工具（init, add, update, remove, animation）
│       ├── design-tokens.ts   # 完整设计令牌生成
│       ├── color-palette.ts   # 调色板生成
│       ├── typography.ts      # 字体配对 + 字号系统
│       ├── spacing.ts         # 间距系统
│       ├── shadows.ts         # 阴影系统
│       ├── border-radius.ts   # 圆角系统
│       ├── contrast.ts        # WCAG 对比度检查
│       ├── gradient.ts        # 渐变生成
│       └── breakpoints.ts     # 响应式断点
├── client/                    # 浏览器客户端 Dashboard
│   ├── index.html            # 三栏布局界面
│   ├── style.css             # 暗色主题样式
│   └── app.js                # WebSocket 通信 + 组件渲染 + 用户交互
└── dist/                      # 编译后的 JavaScript
```

## API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/` | GET | 客户端 Dashboard 页面 |
| `/health` | GET | 健康检查，返回服务器状态和连接数 |
| `/api/state` | GET | 获取完整设计状态 |
| `/api/token` | POST | 更新设计令牌（用户调整） |
| `/api/component/:id` | POST | 更新组件属性（用户编辑） |
| `/api/component/:id` | DELETE | 删除组件（用户操作） |
| `/ws` | WebSocket | 实时双向通信 |

## 开发

```bash
# 开发模式（自动重载）
npm run dev

# 编译 TypeScript
npm run build

# 清理编译产物
npm run clean
```

自定义端口：
```bash
DASHBOARD_PORT=4200 npm start
```

## 环境要求

- Node.js >= 18
- npm

## 技术栈

- **MCP SDK**：`@modelcontextprotocol/sdk`
- **HTTP 服务器**：Express
- **WebSocket**：ws
- **参数校验**：Zod
- **语言**：TypeScript
- **客户端**：原生 HTML / CSS / JavaScript（零依赖）
