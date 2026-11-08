---
name: Autonomous Agentic Cockpit
colors:
  surface: '#0b1326'
  surface-dim: '#0b1326'
  surface-bright: '#31394d'
  surface-container-lowest: '#060e20'
  surface-container-low: '#131b2e'
  surface-container: '#171f33'
  surface-container-high: '#222a3d'
  surface-container-highest: '#2d3449'
  on-surface: '#dae2fd'
  on-surface-variant: '#c7c4d7'
  inverse-surface: '#dae2fd'
  inverse-on-surface: '#283044'
  outline: '#908fa0'
  outline-variant: '#464554'
  surface-tint: '#c0c1ff'
  primary: '#c0c1ff'
  on-primary: '#1000a9'
  primary-container: '#8083ff'
  on-primary-container: '#0d0096'
  inverse-primary: '#494bd6'
  secondary: '#4cd7f6'
  on-secondary: '#003640'
  secondary-container: '#03b5d3'
  on-secondary-container: '#00424e'
  tertiary: '#4edea3'
  on-tertiary: '#003824'
  tertiary-container: '#00885d'
  on-tertiary-container: '#000703'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#e1e0ff'
  primary-fixed-dim: '#c0c1ff'
  on-primary-fixed: '#07006c'
  on-primary-fixed-variant: '#2f2ebe'
  secondary-fixed: '#acedff'
  secondary-fixed-dim: '#4cd7f6'
  on-secondary-fixed: '#001f26'
  on-secondary-fixed-variant: '#004e5c'
  tertiary-fixed: '#6ffbbe'
  tertiary-fixed-dim: '#4edea3'
  on-tertiary-fixed: '#002113'
  on-tertiary-fixed-variant: '#005236'
  background: '#0b1326'
  on-background: '#dae2fd'
  surface-variant: '#2d3449'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: 0em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: 0em
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0.01em
  code-lg:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 22px
    letterSpacing: 0em
  code-md:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0em
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.08em
  headline-xl-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.015em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  margin: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
---

## Brand & Style

This design system embodies an advanced engineering cockpit: subdued cyberpunk meets high-tech development studio. It prioritizes extreme data legibility, low cognitive fatigue during long operational sessions, and clear mission-critical telemetry.

### Tone & Personality
- **Surgical Precision:** Strict geometry, clear signal ratios, and no ornamental clutter.
- **Controlled Cyberpunk:** Dark slate surfaces with calibrated, functional luminescent accents rather than loud, distracting neons.
- **Operational Authority:** Real-time visibility into autonomous agent chains (thought trees, ReAct loops, tool executions) and high-visibility human-in-the-loop (HITL) intervention gates.

### Aesthetic Foundation
- Dark slate multi-layered canvas (`#0a0f1d`, `#0f172a`, `#1e293b`).
- Glassmorphic panels with disciplined backdrop filters (`backdrop-blur-md`).
- Fine hairline borders with soft inner glows (`rgba(99, 102, 241, 0.2)`).
- Micro-interactions anchored by hardware-like tactile feedback, smooth telemetry sweeps, and rhythmic status pulses.

## Colors

The palette is engineered for high contrast in low-light environments, mapping each hue to a semantic role in agent orchestration.

### Base Canvases & Surfaces
- **Void Canvas (`#0a0f1d`):** Primary viewport backdrop, canvas workspace, and deep background.
- **Cockpit Surface (`#0f172a`):** Standard panel, rail, and inspector background.
- **Elevated Pod (`#1e293b`):** Cards, modals, toolbars, and contextual drawers.
- **Structural Stroke (`#334155` / `rgba(51, 65, 85, 0.6)`): Baseline structural dividers.
- **Active Accent Stroke (`rgba(99, 102, 241, 0.35)`): Selected nodes, active agent runs, focused inputs.

### Semantic & Agent Accents
- **Primary Indigo (`#6366f1`):** System operations, orchestration nodes, core CTA states, and model reasoning threads.
- **Cyan (`#06b6d4`):** Data streams, I/O payloads, tool executions, and external API calls.
- **Emerald (`#10b981`):** Validated states, successful tool exits, agent consensus, and nominal operational health.
- **Amber (`#f59e0b`):** Non-blocking warnings, fallback model triggers, token rate limits, and latency spikes.
- **Rose HITL (`#f43f5e`):** Human-In-The-Loop interrupts, authorization gates, validation failures, and kill switches.

### Text & Metrics Hierarchy
- **Primary Text (`#f8fafc`):** High-priority titles, agent decisions, active code.
- **Secondary Text (`#94a3b8`):** UI labels, telemetry axes, timestamps.
- **Muted Text (`#475569`):** Inactive logs, metadata tags, structural hints.

## Typography

The type system is dual-engine: `Inter` handles operational layout, structural navigation, and high-density interface widgets; `JetBrains Mono` handles model runtime logs, ReAct chains, memory structures, and hardware telemetry.

### Typographic Rules
- **Numerical Alignment:** All tabular telemetry, latencies, and token counters must use tabular figures (`font-variant-numeric: tabular-nums`) within `JetBrains Mono`.
- **Micro Labels:** Operational metadata and system telemetry headers rely on `label-caps` in uppercase format with wide tracking to maintain readability at scale.
- **Log Streaming:** Real-time log feeds, JSON parameters, and reasoning chains must not break mid-token; set explicit overflow control and horizontal scroll limits on `code-md` and `code-sm`.

## Layout & Spacing

The layout is built for multi-pane orchestration, splitting viewports into dedicated modules: agent workspace/graph canvas, streaming log drawer, and inspector/telemetry rails.

### Multi-Pane Architecture
- **Desktop (>= 1280px):** Fixed navigation rail (64px), left agent canvas/workspace (fluid), and right collapsible telemetry inspector (380px or 440px). Gutters set to `1rem` with dense internal margins (`0.75rem` to `1rem`) to maximize screen efficiency.
- **Tablet (768px - 1279px):** Split-view workspace with floating telemetry bottom sheet or slide-over drawer.
- **Mobile (< 768px):** Single-column stacked cockpit. Log terminal transitions to full-screen modal sheets triggered by bottom tab controls.

### Density & Rhythms
- Base internal component spacing adheres strictly to compact scales (`0.25rem` to `0.75rem`) to maintain developer-grade information density.
- Section gutters isolate tool execution blocks from model thought threads without introducing unnecessary vertical whitespace.

## Shapes

The design system maintains a technical, industrial silhouette with restrained curvature (`roundedness: 1`).

- **Base Components (Inputs, Chips, Buttons):** `0.25rem` (4px). Provides a solid, mechanical feel reminiscent of physical flight and devops instruments.
- **Panels & Module Cards:** `0.5rem` (8px). Softens dense data windows without wasting display corners.
- **Drawers & Modals:** `0.75rem` (12px). Applied strictly to root modal boundaries and slide-out telemetry frames.
- **Badges & Terminal Chips:** Full pill curves are prohibited; all tags must use `0.25rem` radius or angled brackets for consistency with monospace metadata.

## Components

### Buttons
- **Primary Action (Execute / Deploy):** High-contrast background `#6366f1` with text `#ffffff`, hairline border `rgba(255, 255, 255, 0.2)`, and subtle indigo luminescence on hover (`box-shadow: 0 0 12px rgba(99, 102, 241, 0.4)`).
- **Secondary (Tool Action):** Semi-transparent `#1e293b` with border `1px solid #334155`, text `#f8fafc`. Hover triggers text `#06b6d4` and border `rgba(6, 182, 212, 0.4)`.
- **Critical / HITL Abort:** Border and text `#f43f5e`, background `rgba(244, 63, 94, 0.1)`. Active focus triggers pulsing ring `rgba(244, 63, 94, 0.4)`.

### Chips & Telemetry Tags
- Rendered in `JetBrains Mono` at `code-sm` or `label-caps`.
- Composed of an inner status dot (6px) and status copy.
- Variants:
  - **ReAct Run:** Slate border with Cyan text (`rgba(6, 182, 212, 0.2)` fill).
  - **Tool Exec:** Indigo border with Indigo text (`rgba(99, 102, 241, 0.2)` fill).
  - **Idle / Muted:** `#334155` border with `#94a3b8` text.

### Status Indicators (Pulsing Badges)
- High-visibility agent status pips consisting of a central 6px core and a 14px concentric pulsating halo:
  - **Streaming / Thinking:** Indigo pulse (`2s` ease-in-out infinite).
  - **Tool Active:** Cyan pulse (`1.2s` ease-in-out infinite).
  - **Awaiting Human Input (HITL):** Rose strobe (`0.8s` ease-in-out infinite).
  - **Operational Nominal:** Static Emerald pip with no strobe.

### Inputs & Command Terminal
- **Prompt & Param Input:** Background `rgba(10, 15, 29, 0.8)`, border `1px solid #334155`, text `#f8fafc`, placeholder `#475569`.
- **Focus State:** Border shifts to `#6366f1` with an outer glow `0 0 0 1px #6366f1, 0 0 10px rgba(99, 102, 241, 0.25)`.
- Includes leading agent context tag (e.g., `agent:hernest-core$`) in `JetBrains Mono` Amber.

### Cards & Execution Nodes
- Layered glassmorphic container: `backdrop-filter: blur(12px)`, background `rgba(15, 23, 42, 0.7)`.
- Border: `1px solid rgba(51, 65, 85, 0.7)`.
- Header: Collapsible toolbar containing step counter, agent role tag, execution duration (e.g., `142ms`), and token cost metrics.

### Lists & Step Traversal (Thought / ReAct Trees)
- Connected with fine `1px` vertical guide rails in `#334155`.
- Node states update dynamically from dashed guides (in-progress) to solid lines (completed) with color-matched check indicators.

### Checkboxes & Switches
- Squared with `0.125rem` (2px) radius.
- Inactive: `#0f172a` fill, `#334155` border.
- Active: `#6366f1` fill with white checkmark glyph.
- System switch toggles use rectangular micro-track design (14px height) with high-visibility slider thumb.