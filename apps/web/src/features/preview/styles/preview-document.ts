import { buildPreviewThemeSyncScriptTag } from "../lib/preview-theme-sync-script";

const PREVIEW_FONT_STACK =
  'Arial, "Source Han Sans SC", "Noto Sans CJK SC", "Microsoft YaHei", "PingFang SC", sans-serif';

export type PreviewTheme = "light" | "dark";

export const PREVIEW_DOCUMENT_STYLE = `
  :root {
    color-scheme: light;
    font-family: ${PREVIEW_FONT_STACK};
    --preview-background: #ffffff;
    --preview-background-soft: #f8fafc;
    --preview-foreground: #1e293b;
    --preview-muted: #64748b;
    --preview-border: rgba(148, 163, 184, 0.25);
    --preview-border-soft: rgba(148, 163, 184, 0.2);
    --preview-chem-surface: transparent;
    --preview-chem-border: transparent;
    --preview-chem-shadow: none;
    --preview-error-border: rgba(220, 38, 38, 0.18);
    --preview-error-background: rgba(254, 242, 242, 0.92);
    --preview-error-foreground: #b91c1c;
    --preview-edit-background: rgba(255, 255, 255, 0.82);
    --preview-edit-border: rgba(0, 0, 0, 0.1);
    --preview-edit-foreground: #615d59;
    --preview-edit-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
    --preview-edit-hover-background: #f2f9ff;
    --preview-edit-hover-border: rgba(9, 127, 232, 0.28);
    --preview-edit-hover-foreground: #097fe8;
    --preview-edit-hover-shadow: 0 8px 20px rgba(15, 23, 42, 0.1);
    --preview-popover-border: rgba(148, 163, 184, 0.28);
    --preview-popover-background: rgba(255, 255, 255, 0.94);
    --preview-popover-foreground: #0f172a;
    --preview-popover-shadow: 0 16px 38px rgba(15, 23, 42, 0.12);
    --preview-inline-chem-background: rgba(37, 99, 235, 0.1);
    --preview-inline-chem-foreground: #1d4ed8;
    --preview-tlc-line: #3f3f46;
    --preview-tlc-line-soft: #a1a1aa;
    --preview-tlc-label: #1f2937;
    --preview-tlc-base: #111827;
    --preview-tlc-spot-1: #d4d4d8;
    --preview-tlc-spot-2: #a1a1aa;
    --preview-tlc-spot-3: #737373;
    --preview-tlc-spot-4: #404040;
    --preview-tlc-spot-5: #000000;
    --preview-tlc-mess-1: rgba(212, 212, 216, 0.68);
    --preview-tlc-mess-2: rgba(161, 161, 170, 0.74);
    --preview-tlc-mess-3: rgba(115, 115, 115, 0.78);
    --preview-tlc-mess-4: rgba(64, 64, 64, 0.84);
    --preview-tlc-mess-5: rgba(0, 0, 0, 0.92);
  }

  .dark {
    color-scheme: dark;
    --preview-background: #191919;
    --preview-background-soft: #31302e;
    --preview-foreground: rgba(255, 255, 255, 0.95);
    --preview-muted: #a39e98;
    --preview-border: rgba(255, 255, 255, 0.1);
    --preview-border-soft: rgba(255, 255, 255, 0.08);
    --preview-chem-surface:
      linear-gradient(180deg, rgba(18, 18, 18, 0.985) 0%, rgba(11, 11, 11, 0.96) 100%);
    --preview-chem-border: rgba(255, 255, 255, 0.12);
    --preview-chem-shadow: 0 10px 24px rgba(0, 0, 0, 0.24);
    --preview-error-border: rgba(248, 113, 113, 0.28);
    --preview-error-background: rgba(127, 29, 29, 0.32);
    --preview-error-foreground: #fecaca;
    --preview-edit-background: rgba(15, 23, 42, 0.78);
    --preview-edit-border: rgba(148, 163, 184, 0.28);
    --preview-edit-foreground: #e2e8f0;
    --preview-edit-shadow: 0 8px 24px rgba(2, 6, 23, 0.22);
    --preview-edit-hover-background: rgba(30, 41, 59, 0.88);
    --preview-edit-hover-border: rgba(96, 165, 250, 0.32);
    --preview-edit-hover-foreground: #93c5fd;
    --preview-edit-hover-shadow: 0 12px 28px rgba(2, 6, 23, 0.3);
    --preview-popover-border: rgba(255, 255, 255, 0.1);
    --preview-popover-background: rgba(28, 28, 27, 0.94);
    --preview-popover-foreground: rgba(241, 245, 249, 0.96);
    --preview-popover-shadow: 0 20px 40px rgba(0, 0, 0, 0.34);
    --preview-inline-chem-background: rgba(96, 165, 250, 0.16);
    --preview-inline-chem-foreground: #bfdbfe;
    --preview-tlc-line: rgba(255, 255, 255, 0.72);
    --preview-tlc-line-soft: rgba(255, 255, 255, 0.38);
    --preview-tlc-label: rgba(255, 255, 255, 0.92);
    --preview-tlc-base: #f8fafc;
    --preview-tlc-spot-1: rgba(226, 232, 240, 0.46);
    --preview-tlc-spot-2: rgba(226, 232, 240, 0.62);
    --preview-tlc-spot-3: rgba(241, 245, 249, 0.76);
    --preview-tlc-spot-4: rgba(248, 250, 252, 0.9);
    --preview-tlc-spot-5: #ffffff;
    --preview-tlc-mess-1: rgba(226, 232, 240, 0.22);
    --preview-tlc-mess-2: rgba(226, 232, 240, 0.34);
    --preview-tlc-mess-3: rgba(241, 245, 249, 0.46);
    --preview-tlc-mess-4: rgba(248, 250, 252, 0.58);
    --preview-tlc-mess-5: rgba(255, 255, 255, 0.72);
  }

  * {
    box-sizing: border-box;
    scrollbar-width: auto;
    scrollbar-color: auto;
  }

  html,
  body {
    margin: 0;
    padding: 0;
    scrollbar-gutter: stable;
  }

  /* =========================================
     自定义滚动条 - 与 LabStorageManager 对齐
     特性：轻微圆角，悬浮加粗加深，无上下三角，无交界方框
     ========================================= */

  /* 1. 针对 Webkit 浏览器 (Chrome, Edge, Safari) */

  /* 统一定义滚动条容器物理总宽度 (10px) */
  ::-webkit-scrollbar {
    width: 10px;
    height: 10px;
    /* 横向滚动条高度 */
  }

  /* --- 核心：滑块 (Thumb) --- */
  ::-webkit-scrollbar-thumb {
    /* [颜色] 亮色模式初始颜色 */
    background-color: #cbd5e1;
    background-clip: padding-box;
    /* 关键：确保背景只在 border 内部渲染 */

    /* [粗细控制 - 初始] */
    border: 3px solid transparent;
    /* 3px透明边框，使色块视觉宽度为 10 - 3*2 = 4px */

    /* [新增强调：轻微圆角] */
    border-radius: 5px;
    /* 这里设置略大的值，配合 border 挤压会形成轻微的胶囊感 */
  }

  /* [滑块 Hover 状态] */
  ::-webkit-scrollbar-thumb:hover {
    /* [颜色] 悬浮加深 */
    background-color: #94a3b8;

    /* [粗细控制 - Hover] */
    border: 1px solid transparent;
    /* 1px透明边框，色块向外扩张，视觉宽度为 10 - 1*2 = 8px */

    /* [关键：Hover 时必须再次声明圆角] */
    border-radius: 5px;
  }

  /* --- 轨道 (Track) --- */
  ::-webkit-scrollbar-track {
    background: transparent;
    /* 轨道保持透明 */
  }

  /* --- [修正：隐藏所有三角按钮] --- */
  ::-webkit-scrollbar-button {
    display: none;
    width: 0;
    height: 0;
  }

  /* --- [新增强调：删除交界处小方框] --- */
  ::-webkit-scrollbar-corner {
    background: transparent;
    /* 将死角背景设为透明 */
  }

  /* 2. 暗黑模式适配 (基于 .dark 类名) */
  .dark ::-webkit-scrollbar-thumb {
    background-color: #475569;
  }

  .dark ::-webkit-scrollbar-thumb:hover {
    background-color: #64748b;
  }

  /* 3. 针对 Firefox 的降级处理 (Firefox 不支持悬浮变粗和Corner控制) */
  /* 仅在浏览器不支持 webkit 滚动条伪元素时应用 */
  @supports not selector(::-webkit-scrollbar) {
    * {
      scrollbar-width: thin;
      /* Firefox 只能选 standard 或 thin */
      scrollbar-color: #cbd5e1 transparent;
      /* 滑块颜色 轨道颜色 */
    }

    .dark * {
      scrollbar-color: #475569 transparent;
    }
  }

  body {
    font-family: inherit;
    color: var(--preview-foreground);
    background: linear-gradient(180deg, var(--preview-background) 0%, var(--preview-background-soft) 100%);
    line-height: 1.68;
  }

  .chemd-document {
    padding: 1.35rem 1.45rem 1.6rem;
  }

  .chemd-document-header {
    display: grid;
    gap: 0.3rem;
    margin-bottom: 1rem;
    padding-bottom: 0.85rem;
    border-bottom: 1px solid var(--preview-border);
  }

  .chemd-document-title {
    margin: 0;
    font-size: 1.35rem;
    line-height: 1.2;
    letter-spacing: -0.02em;
    color: var(--preview-foreground);
  }

  .chemd-document-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem 0.85rem;
    margin: 0;
    color: var(--preview-muted);
    font-size: 0.95rem;
  }

  .chemd-document-meta-item {
    display: inline-flex;
    align-items: baseline;
    gap: 0.25rem;
  }

  .chemd-document-meta-label {
    font-weight: 600;
    color: var(--preview-foreground);
  }

  .chemd-document-meta-value {
    color: var(--preview-muted);
  }

  .chemd-markdown {
    margin: 0 0 1rem;
  }

  .chemd-block {
    margin: 0 0 1rem;
    padding: 1rem 0;
    border-bottom: 1px solid var(--preview-border-soft);
  }

  .chemd-block--molecule,
  .chemd-block--reaction {
    position: relative;
    isolation: isolate;
  }

  .chemd-block--molecule:hover,
  .chemd-block--reaction:hover,
  .chemd-block--molecule:focus-within,
  .chemd-block--reaction:focus-within {
    z-index: 12;
  }

  .chemd-block h2 {
    margin: 0 0 0.75rem;
    padding-right: 5.5rem;
    font-size: 1rem;
    position: relative;
    z-index: 0;
  }

  .chemd-block-id {
    color: var(--preview-muted);
    font-size: 0.9em;
    font-weight: 500;
    letter-spacing: 0;
  }

  .chemd-graphic {
    display: flex;
    justify-content: center;
    align-items: center;
    margin: 0.55rem 0 0.35rem;
    padding: 0;
    border: 0;
    background: transparent;
    overflow: visible;
  }

  .chemd-graphic[data-chem-render-state="loading"] {
    min-height: 1.6rem;
  }

  .dark .chemd-graphic:not([data-chem-render-state="loading"]) {
    padding: 0.75rem 0.85rem;
    border: 1px solid var(--preview-chem-border);
    border-radius: 1.1rem;
    background: var(--preview-chem-surface);
    box-shadow: var(--preview-chem-shadow);
  }

  .dark .chemd-graphic svg:not(.chemd-loading-svg) {
    filter: invert(0.93) hue-rotate(180deg);
  }

  .chemd-graphic svg {
    display: block;
    width: auto;
    max-width: 100%;
    height: auto;
    background: transparent;
  }

  .chemd-loading-svg {
    width: 1.25rem;
    height: 1.25rem;
    max-width: 100%;
  }

  .chemd-render-error {
    max-width: min(100%, 34rem);
    padding: 0.55rem 0.8rem;
    border: 1px solid var(--preview-error-border);
    border-radius: 0.75rem;
    background: var(--preview-error-background);
    color: var(--preview-error-foreground);
    font-size: 0.92rem;
    line-height: 1.45;
    text-align: center;
    white-space: normal;
  }

  .chemd-graphic svg,
  .chemd-graphic svg text {
    font-family: ${PREVIEW_FONT_STACK};
  }

  .chemd-graphic svg .chemd-reaction-annotation {
    fill: #000000;
    user-select: none;
    -webkit-user-select: none;
    pointer-events: none;
  }

  .chemd-edit-chem {
    display: inline-flex;
    width: 2rem;
    height: 2rem;
    align-items: center;
    justify-content: center;
    margin: 0;
    padding: 0;
    border: 1px solid var(--preview-edit-border);
    border-radius: 999px;
    background: var(--preview-edit-background);
    color: var(--preview-edit-foreground);
    cursor: pointer;
    backdrop-filter: blur(10px);
    box-shadow: var(--preview-edit-shadow);
    transition:
      opacity 160ms ease,
      transform 160ms ease;
  }

  .chemd-edit-chem svg {
    width: 0.95rem;
    height: 0.95rem;
    display: block;
  }

  .chemd-edit-chem {
    position: absolute;
    top: 1rem;
    right: 0;
    z-index: 5;
    opacity: 0;
    pointer-events: none;
    transform: translateX(-0.35rem);
  }

  .chemd-block--molecule:hover > .chemd-edit-chem,
  .chemd-block--reaction:hover > .chemd-edit-chem,
  .chemd-block--molecule:focus-within > .chemd-edit-chem,
  .chemd-block--reaction:focus-within > .chemd-edit-chem,
  .chemd-edit-chem:focus-visible {
    opacity: 1;
    pointer-events: auto;
    transform: translateX(0);
  }

  .chemd-edit-chem:hover,
  .chemd-edit-chem:focus-visible {
    background: var(--preview-edit-hover-background);
    color: var(--preview-edit-hover-foreground);
    border-color: var(--preview-edit-hover-border);
    box-shadow: var(--preview-edit-hover-shadow);
  }

  .chemd-inventory-popover {
    position: absolute;
    top: 0.85rem;
    right: 2.65rem;
    z-index: 32;
    width: min(26rem, calc(100% - 3.25rem));
    max-height: 22rem;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
    display: grid;
    gap: 0.65rem;
    margin: 0;
    padding: 1rem 1.1rem;
    border: 1px solid var(--preview-popover-border);
    border-radius: 18px;
    background: var(--preview-popover-background);
    color: var(--preview-popover-foreground);
    font-size: 16px;
    box-shadow: var(--preview-popover-shadow);
    backdrop-filter: blur(14px);
    opacity: 0;
    pointer-events: none;
    transform: translate3d(0, -0.25rem, 0) scale(0.98);
    transform-origin: top right;
    transition:
      opacity 180ms ease,
      transform 180ms ease;
  }

  .chemd-inventory-popover[data-visible="true"] {
    opacity: 1;
    pointer-events: auto;
    transform: translate3d(0, 0, 0) scale(1);
  }

  .chemd-inventory-popover[data-state="loading"] {
    border-color: rgba(14, 116, 144, 0.24);
  }

  .chemd-inventory-popover[data-state="ready"] {
    border-color: rgba(37, 99, 235, 0.2);
  }

  .chemd-inventory-popover[data-state="error"] {
    border-color: rgba(220, 38, 38, 0.24);
    color: #991b1b;
  }

  .dark .chemd-inventory-popover[data-state="loading"],
  .dark .chemd-inventory-popover[data-state="ready"] {
    border-color: rgba(255, 255, 255, 0.14);
  }

  .dark .chemd-inventory-popover[data-state="error"] {
    border-color: rgba(248, 113, 113, 0.26);
    color: #fecaca;
  }

  .chemd-inventory-popover__title {
    font-size: 1rem;
    font-weight: 700;
    line-height: 1.45;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: var(--preview-muted);
  }

  .chemd-inventory-popover__row {
    display: grid;
    gap: 0.4rem;
    padding-top: 0.65rem;
    border-top: 1px solid rgba(148, 163, 184, 0.16);
  }

  .chemd-inventory-popover__title + .chemd-inventory-popover__row {
    padding-top: 0.1rem;
    border-top: 0;
  }

  .chemd-inventory-popover__name {
    font-size: 1rem;
    font-weight: 600;
    line-height: 1.5;
    color: var(--preview-popover-foreground);
    word-break: break-word;
  }

  .chemd-inventory-popover__meta {
    font-size: 1rem;
    line-height: 1.5;
    color: var(--preview-muted);
    letter-spacing: 0.02em;
  }

  .chemd-inventory-popover__summary,
  .chemd-inventory-popover__empty {
    font-size: 1rem;
    line-height: 1.5;
    color: inherit;
    word-break: break-word;
  }

  .chemd-fields {
    display: grid;
    gap: 0.5rem;
    margin: 0.75rem 0 0;
  }

  .chemd-field {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    font-size: 0.92rem;
  }

  .chemd-field dt {
    color: var(--preview-muted);
    font-weight: 600;
  }

  .chemd-field dd {
    margin: 0;
  }

  .chemd-tlc {
    margin: 0.2rem 0 0.95rem;
  }

  .chemd-tlc-scroll {
    max-width: 100%;
    overflow-x: auto;
    overflow-y: hidden;
    padding-bottom: 0.4rem;
  }

  .chemd-tlc-plate {
    position: relative;
    width: calc((var(--chemd-tlc-lane-count, 1) * 3.25rem) + 3.5rem);
    min-width: 12rem;
    height: 18rem;
    border: 2px solid var(--preview-tlc-line);
  }

  .chemd-tlc-solvent-front {
    position: absolute;
    left: 1rem;
    right: 1rem;
    top: 16%;
    border-top: 2px dashed var(--preview-tlc-line-soft);
  }

  .chemd-tlc-baseline {
    position: absolute;
    left: 1rem;
    right: 1rem;
    top: 84%;
    border-top: 2px solid var(--preview-tlc-line);
  }

  .chemd-tlc-lanes {
    position: absolute;
    inset: 0 1rem;
    display: grid;
    grid-template-columns: repeat(var(--chemd-tlc-lane-count, 1), minmax(2.75rem, 1fr));
  }

  .chemd-tlc-lane {
    position: relative;
    height: 100%;
  }

  .chemd-tlc-lane-track {
    position: absolute;
    inset: 0;
  }

  .chemd-tlc-lane-tick {
    position: absolute;
    left: 50%;
    top: calc(84% - 0.48rem);
    width: 2px;
    height: 0.96rem;
    background: var(--preview-tlc-line);
    transform: translateX(-50%);
  }

  .chemd-tlc-lane-label {
    position: absolute;
    left: 50%;
    top: calc(84% + 0.72rem);
    transform: translateX(-50%);
    color: var(--preview-tlc-label);
    font-size: 0.76rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    white-space: nowrap;
  }

  .chemd-tlc-spot,
  .chemd-tlc-mess,
  .chemd-tlc-base-spot {
    position: absolute;
    left: 50%;
    transform: translate(-50%, -50%);
  }

  .chemd-tlc-spot {
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.18);
  }

  .chemd-tlc-spot[data-shape="circle"] {
    border-radius: 999px;
  }

  .chemd-tlc-spot[data-shape="up"] {
    clip-path: polygon(50% 0%, 0% 100%, 100% 100%);
  }

  .chemd-tlc-spot[data-shape="down"] {
    clip-path: polygon(0% 0%, 100% 0%, 50% 100%);
  }

  .chemd-tlc-spot[data-size-rank="1"] {
    width: 0.42rem;
    height: 0.42rem;
  }

  .chemd-tlc-spot[data-size-rank="2"] {
    width: 0.58rem;
    height: 0.58rem;
  }

  .chemd-tlc-spot[data-size-rank="3"] {
    width: 0.76rem;
    height: 0.76rem;
  }

  .chemd-tlc-spot[data-size-rank="4"] {
    width: 0.94rem;
    height: 0.94rem;
  }

  .chemd-tlc-spot[data-size-rank="5"] {
    width: 1.1rem;
    height: 1.1rem;
  }

  .chemd-tlc-spot[data-intensity-rank="1"] {
    background: var(--preview-tlc-spot-1);
  }

  .chemd-tlc-spot[data-intensity-rank="2"] {
    background: var(--preview-tlc-spot-2);
  }

  .chemd-tlc-spot[data-intensity-rank="3"] {
    background: var(--preview-tlc-spot-3);
  }

  .chemd-tlc-spot[data-intensity-rank="4"] {
    background: var(--preview-tlc-spot-4);
  }

  .chemd-tlc-spot[data-intensity-rank="5"] {
    background: var(--preview-tlc-spot-5);
  }

  .chemd-tlc-mess {
    width: 0.96rem;
    height: 1.55rem;
    border-radius: 999px;
    filter: blur(0.4px);
    opacity: 0.82;
  }

  .chemd-tlc-mess[data-size-rank="1"] {
    width: 0.78rem;
    height: 1.18rem;
  }

  .chemd-tlc-mess[data-size-rank="2"] {
    width: 0.9rem;
    height: 1.38rem;
  }

  .chemd-tlc-mess[data-size-rank="3"] {
    width: 1rem;
    height: 1.6rem;
  }

  .chemd-tlc-mess[data-size-rank="4"] {
    width: 1.12rem;
    height: 1.88rem;
  }

  .chemd-tlc-mess[data-size-rank="5"] {
    width: 1.24rem;
    height: 2.18rem;
  }

  .chemd-tlc-mess[data-intensity-rank="1"] {
    background: var(--preview-tlc-mess-1);
  }

  .chemd-tlc-mess[data-intensity-rank="2"] {
    background: var(--preview-tlc-mess-2);
  }

  .chemd-tlc-mess[data-intensity-rank="3"] {
    background: var(--preview-tlc-mess-3);
  }

  .chemd-tlc-mess[data-intensity-rank="4"] {
    background: var(--preview-tlc-mess-4);
  }

  .chemd-tlc-mess[data-intensity-rank="5"] {
    background: var(--preview-tlc-mess-5);
  }

  .chemd-tlc-base-spot {
    top: 84%;
    width: 1.12rem;
    height: 0.32rem;
    border-radius: 999px;
    background: var(--preview-tlc-base);
  }

  @media (max-width: 640px) {
    .chemd-tlc-plate {
      width: calc((var(--chemd-tlc-lane-count, 1) * 2.8rem) + 2.75rem);
      height: 16.5rem;
    }

    .chemd-tlc-lanes {
      grid-template-columns: repeat(var(--chemd-tlc-lane-count, 1), minmax(2.2rem, 1fr));
    }

    .chemd-tlc-lane-label {
      font-size: 0.72rem;
      letter-spacing: 0.05em;
    }
  }

  .chem-inline {
    display: inline-flex;
    align-items: center;
    padding: 0.05rem 0.4rem;
    border-radius: 999px;
    background: var(--preview-inline-chem-background);
    color: var(--preview-inline-chem-foreground);
    font-weight: 600;
  }

  .chemd-col-grid {
    display: grid;
    grid-template-columns: repeat(var(--chemd-col-columns, 1), minmax(0, 1fr));
    gap: 0 1rem;
    align-items: start;
  }

  .chemd-col-item {
    min-width: 0;
  }

  .chemd-col-item > .chemd-block {
    margin: 0;
    padding: 0;
    border: 0;
  }
`;

const PREVIEW_DOCUMENT_CSP = [
  "default-src 'none'",
  "img-src data: blob: https: http:",
  "style-src 'unsafe-inline'",
  "script-src 'unsafe-inline'",
  "font-src data: https: http:"
].join("; ");

const getPreviewDocumentRootAttributes = (theme: PreviewTheme): string =>
  theme === "dark" ? ' class="dark" data-theme="dark"' : ' data-theme="light"';

export const toSandboxedPreviewDocument = (html: string, theme: PreviewTheme = "light") =>
  `<!doctype html><html${getPreviewDocumentRootAttributes(theme)}><head><meta charset="utf-8" /><meta http-equiv="Content-Security-Policy" content="${PREVIEW_DOCUMENT_CSP}" /><style>${PREVIEW_DOCUMENT_STYLE}</style></head><body>${buildPreviewThemeSyncScriptTag()}${html}</body></html>`;
