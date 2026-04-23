# HP Field Estimator — Design Ideas

## Approach A — Industrial Clipboard
**Design Movement:** Industrial / Utilitarian Craft
**Core Principles:** Density without clutter, tactile card surfaces, high-contrast data hierarchy
**Color Philosophy:** Warm off-white (#F7F5F2) background with deep slate (#1C2333) text, HP blue (#1B5FA8) as primary action, amber (#D97706) for warnings, green (#16A34A) for OK margins
**Layout Paradigm:** Left sidebar for trade navigation, right main panel for step flow — mimics a physical clipboard with tabs
**Signature Elements:** Hairline rule separators, monospace numbers for dollar values, subtle paper-grain texture on cards
**Interaction Philosophy:** Every input change triggers instant recalc — no submit buttons, live feedback
**Animation:** Subtle number count-up on price changes, smooth step transitions
**Typography System:** IBM Plex Sans (body) + IBM Plex Mono (numbers/prices) — industrial precision
**Probability:** 0.07

## Approach B — Contractor Dashboard (CHOSEN)
**Design Movement:** Modern SaaS / Professional Tool
**Core Principles:** Scannable at a glance, sticky live metrics, clear visual hierarchy, mobile-first for field use
**Color Philosophy:** Clean white cards on warm stone (#F4F3F0) background; HP blue (#1B5FA8) primary; slate-900 for headings; semantic colors for margin flags (green/amber/red)
**Layout Paradigm:** Single-column scrollable flow with sticky top metrics bar; trade sections as collapsible accordion panels; step indicator within each trade
**Signature Elements:** Numbered step badges, tier selection cards with color-coded borders, live margin badge that pulses on change
**Interaction Philosophy:** Progressive disclosure — each step unlocks the next; breakdown is always visible below each trade
**Animation:** Step completion checkmarks, smooth accordion expand, number transitions on recalc
**Typography System:** DM Sans (headings/UI) + JetBrains Mono (all dollar values and numbers) — professional clarity
**Probability:** 0.09

## Approach C — Field Notebook
**Design Movement:** Brutalist Utility / Analog Digital
**Core Principles:** No decoration, maximum information density, keyboard-first, print-ready
**Color Philosophy:** Pure white (#FFFFFF) with black (#000000) text, single accent color (HP blue) for interactive elements only
**Layout Paradigm:** Full-width table-like rows, no cards, everything inline — like a spreadsheet
**Signature Elements:** Bold section headers with thick left borders, inline edit fields, compact row layout
**Interaction Philosophy:** Tab through fields like a spreadsheet, all data visible simultaneously
**Animation:** None — pure utility
**Typography System:** System font stack + Courier New for numbers
**Probability:** 0.04
