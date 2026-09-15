# IsDB-BISEW Frontend Design Direction

## Three stylistic approaches

| Theme Name | Very Brief Intro | Probability |
| --- | --- | ---: |
| Institutional Ledger | A calm, documentation-led administrative interface that feels trustworthy, structured, and appropriate for examination governance. It prioritizes density without crowding. | 0.06 |
| Campus Signal | A welcoming contemporary education portal with softer cards and prominent learning cues, designed to reduce anxiety for administrators and students. | 0.04 |
| Secure Console | A dark, high-contrast control-room approach that foregrounds active examination monitoring and system status. | 0.09 |

## Selected approach: Institutional Ledger

### Design Movement

This direction draws on **contemporary civic-service and institutional information design**: refined editorial hierarchy, calm surfaces, and disciplined visual grouping rather than visual novelty. It is a measured, serious interface for educators, examination administrators, and candidates.

### Core Principles

1. **Operational clarity first.** Each page exposes its purpose, state, and next permitted action without ornamental distraction.
2. **Layered information density.** Page headers, filter bands, data tables, and detail panels use distinct spacing and tonal layers so complex institutional data remains scannable.
3. **Status is meaningful.** Muted semantic colors, badges, and concise supporting copy make examination and record states legible without relying on color alone.
4. **Calm confidence.** Large surfaces, moderate radius, measured shadows, and limited motion create a professional environment rather than a consumer-product dashboard.

### Color Philosophy

The visual system is founded on deep **IsDB green** and ink-blue as anchors of integrity, scholarship, and accountability. A parchment-adjacent warm neutral softens high-density data views and creates a reading-friendly administrative canvas. Semantic green, amber, and red are reserved for workflow states rather than decoration, ensuring important alerts are unmistakable. The signature color is a deep mineral green that carries from admin navigation to student exam focus elements.

### Layout Paradigm

The application is an **administrative reading room**: a persistent vertical ledger rail organizes access, while the content area is composed in stacked working bands rather than a single centered card. Pages typically use an asymmetric header with metadata to the left and actions to the right, a dedicated filter strip, and a horizontally resilient data canvas. The student portal sheds the rail entirely and adopts a focused, two-zone examination workspace.

### Signature Elements

1. A **ledger rail**: the charcoal-green administration sidebar uses small section captions, a compact brand seal, and selected-item insets.
2. **Institutional rule lines**: low-contrast horizontal dividers and inset accents frame headings, data groups, and exam states.
3. **Evidence labels**: small uppercase labels with generous tracking identify record metadata, states, and system context throughout the product.

### Interaction Philosophy

Interactions should feel deliberate and accountable. Filters reveal only relevant data, confirmation dialogs articulate consequences, and success feedback confirms what record state changed. Navigation is instant and predictable; destructive actions always require explicit acknowledgement. Student exam actions are clear, high-contrast, and never hidden behind decorative effects.

### Animation

Motion is sparse and informational. Drawers and dialogs enter with a 180–240ms opacity-and-translate transition using a decisive ease-out. Row hover and button feedback use 120–160ms color and transform changes; buttons compress subtly on press. Loading skeletons use a restrained shimmer. No decorative looping animations are used. All nonessential motion respects `prefers-reduced-motion`.

### Typography System

**IBM Plex Sans** is the working typeface for interfaces, forms, and tabular content because it remains clear at compact sizes. **Source Serif 4** is reserved for high-level page titles, institutional messages, and the student completion experience, adding measured academic character. Headlines use serif semibold at spacious line heights; labels use Plex Sans medium in uppercase with tracking; body copy uses Plex Sans regular; tabular numbers use the font’s tabular numeral feature when available.

### Brand Essence

**IsDB-BISEW Examination Management System is the accountable workspace for education teams to govern examinations and give candidates a focused, secure attempt experience.**

Personality: **methodical, trustworthy, composed**.

### Brand Voice

The voice is direct, respectful, and action-led. It explains workflow context without bureaucratic excess. Headlines state the task; calls to action state the committed action; error copy names the useful recovery path.

Example lines:

> “Review this batch before scheduling its examination.”

> “Your answers are being saved as you work.”

### Wordmark & Logo

The mark is a bold, text-free **interlocking open-book and check-shield symbol**, built from two opposing folio shapes meeting around a central verified check. It represents curriculum, assessment, and accountable records. The accompanying wordmark uses a custom-spaced Source Serif 4 treatment in the implementation rather than a generic default font.

### Signature Brand Color

**Ledger Green — `#0E5A4F`**. It is the brand’s ownable anchor, used for selected navigation, trusted primary actions, active examination indicators, and the identity mark.

## Style Decisions

- Authenticated administrator screens must introduce the charcoal-green ledger rail, parchment-neutral canvas, asymmetric header, and stacked working bands in the first viewport. Split archival image panels are reserved for public authentication surfaces.
- The interlocking open-book/check-shield mark is displayed inside a light institutional seal so its shape remains legible at navigation size; the Source Serif wordmark uses deliberate editorial tracking.
- Administrative copy describes accountable records, permissions, and permitted actions. Student copy provides calm examination guidance and never implies access to results or administrative records.
- Public authentication screens include archival rule lines, evidence-label metadata, and a ledger texture; their form surfaces use a warmer document-like neutral rather than generic application white.
- Local demonstration-account selection is a subdued testing utility. It never competes with primary sign-in and is hidden when live Laravel API mode is active.
- User-facing access copy refers to authorized roles, permitted records, and examination governance rather than implementation frameworks.
