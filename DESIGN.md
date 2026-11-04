---
name: Shityo
description: A compact pattern drafting workspace using Monos UI tokens.
colors:
  primary: "#83a598"
  canvas: "#282828"
  surface: "#3c3836"
  ink: "#ebdbb2"
typography:
  body:
    fontFamily: "Medeo Mono, ui-monospace, monospace"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
  title:
    fontFamily: "Medeo Mono, ui-monospace, monospace"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.4
rounded:
  md: "6px"
spacing:
  tight: "4px"
  base: "8px"
  field: "12px"
  section: "24px"
---

# Design System: Shityo

## Overview

The working metaphor is a tailor's cutting table: the drawing carries the task,
with measurements on one side and checking or printing on the other. Operate
mode prioritizes readable dimensions, predictable controls and saved work.

## Colors

The frontmatter records the default Gruvbox dark palette. Implementation uses
Monos UI semantic variables, so six themes can share each component. Accent
marks selection; warning marks allowances and notches. Text names each state.

## Typography

Use the kit's Medeo Mono for controls, labels and measurements. Screen titles
are 24 px; panel headings are 12-16 px; field copy is 12-14 px. Numeric values
must remain legible at the supported viewport sizes.

## Layout

Use the 4/8/12/16/24 px scale. The editor has 240 and 260 px side panels on wide
screens. At 1180 px or less they open individually; below 768 px they overlay
the drawing. The app fills 100dvh. Catalog filters are selects, with a single
column on narrow screens. The drawing stays visible when panels are collapsed.

## Elevation & Depth

Borders and surface tones separate work areas. The kit supplies resting card
shadows; menus and overlay panels use a small displaced soft shadow. Avoid
adding depth to emphasize an ordinary measurement or repeated catalog entry.

## Shapes

Use the kit's 6 px radius and thin borders. Preserve image aspect ratios and
show the full garment in main previews. Curve outlines retain their geometric
coordinates; visual styling must not change exported dimensions.

## Components

Use Monos UI Button, SelectField, TextField, Checkbox, Card and Notice. Provide
loading, error and disabled states. Project JSON backup remains available when
network validation fails. Lazy images use publisher-provided srcset where one
exists; unavailable media gets a text fallback. Legends name every line type.

## Do's and Don'ts

- Do use semantic tokens and the shared spacing scale.
- Do show source attribution and the limits of an external pattern entry.
- Do keep print scale and drawing measurements explicit.
- Don't replace a missing pattern or image with an invented design.
- Don't hide calculation errors just because the checking panel is closed.
