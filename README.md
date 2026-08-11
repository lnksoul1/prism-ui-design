# UI Design MCP Server

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js >= 18](https://img.shields.io/badge/node-%3E%3D18-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![MCP Protocol](https://img.shields.io/badge/MCP-Protocol-purple.svg)](https://modelcontextprotocol.io/)

An MCP (Model Context Protocol) server that provides comprehensive UI design assistance tools for LLMs. Generate color palettes, typography pairings, spacing systems, shadow systems, design tokens, and more — all through the MCP protocol.

> **中文文档**：请阅读 [README.zh-CN.md](./README.zh-CN.md)

## Features

- **10 design tools** covering the full spectrum of UI design needs
- **Color theory engine** with HSL-based harmony generation (monochromatic, analogous, complementary, split-complementary, triadic, tetradic)
- **WCAG 2.1 contrast checker** with AA/AAA compliance scoring
- **Curated font pairings** with Google Fonts integration
- **Complete design token system** generation in a single call
- **Dual transport support**: stdio (local) and Streamable HTTP (remote)
- **Zero external API dependencies** — all generation is algorithmic

## Quick Start

```bash
# Install dependencies
npm install

# Build
npm run build

# Run via stdio (default)
npm start

# Run via HTTP
TRANSPORT=http PORT=3100 npm start
```

## Tools

| Tool | Description |
|------|-------------|
| `ui_generate_color_palette` | Generate harmonious color palettes from a base color using color theory |
| `ui_suggest_typography` | Get curated font pairings (display + body) with Google Fonts links |
| `ui_generate_type_scale` | Generate modular typography scales (golden ratio, perfect fourth, etc.) |
| `ui_generate_spacing_scale` | Generate spacing systems (linear, geometric, fibonacci strategies) |
| `ui_generate_shadow_system` | Generate elevation shadow systems (subtle, medium, sharp) |
| `ui_generate_border_radius_scale` | Generate border-radius scales (sharp, subtle, rounded, pill) |
| `ui_check_color_contrast` | Check WCAG 2.1 contrast ratios with AA/AAA grading |
| `ui_generate_gradient` | Generate CSS gradients with harmonious color stops |
| `ui_suggest_breakpoints` | Generate responsive breakpoint systems (Tailwind, Bootstrap, Material, custom) |
| `ui_generate_design_tokens` | Generate a complete design token system (colors, type, spacing, shadows, radii, transitions) |

## Configuration

### stdio (local)

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

### Streamable HTTP (remote)

```bash
TRANSPORT=http PORT=3100 npm start
```

Endpoint: `http://localhost:3100/mcp`

## Style Presets

| Style | Description | Shadow | Radius | Spacing Base |
|-------|-------------|--------|--------|-------------|
| `minimal` | Clean, airy, neutral palette | subtle | subtle | 8px |
| `bold` | High contrast, vibrant accents | medium | rounded | 8px |
| `playful` | Warm, friendly, rounded shapes | medium | pill | 8px |
| `dark` | Dark-first, luminous accents | sharp | subtle | 8px |
| `editorial` | Magazine-like, elegant serif | subtle | sharp | 8px |
| `tech` | Futuristic, precise, cyan/blue | sharp | sharp | 4px |

## Example Usage

### Generate a complementary color palette

```
Tool: ui_generate_color_palette
Arguments: { "base_color": "#3B82F6", "scheme": "complementary" }
```

### Check WCAG contrast

```
Tool: ui_check_color_contrast
Arguments: { "foreground": "#333333", "background": "#FFFFFF" }
```

### Generate complete design tokens for a dark theme

```
Tool: ui_generate_design_tokens
Arguments: { "style": "dark", "base_color": "#6366F1", "dark_mode": true }
```

## Project Structure

```
ui-design-mcp-server/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Main entry point
│   ├── types.ts              # TypeScript interfaces
│   ├── constants.ts          # Font pairings, style presets, breakpoints
│   ├── utils/
│   │   ├── color.ts          # Color theory engine (HSL, contrast, harmony)
│   │   └── formatter.ts      # Output formatting helpers
│   └── tools/
│       ├── color-palette.ts   # Color palette generation
│       ├── typography.ts      # Font pairing + type scale
│       ├── spacing.ts         # Spacing scale generation
│       ├── shadows.ts         # Shadow system generation
│       ├── border-radius.ts   # Border radius scale
│       ├── contrast.ts        # WCAG contrast checking
│       ├── gradient.ts        # Gradient generation
│       ├── breakpoints.ts     # Responsive breakpoints
│       └── design-tokens.ts   # Complete design token system
└── dist/                      # Built JavaScript
```

## Development

```bash
# Development with auto-reload
npm run dev

# Build
npm run build

# Clean build artifacts
npm run clean
```

## Requirements

- Node.js >= 18
- npm
