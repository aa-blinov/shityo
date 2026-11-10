# Product

<!-- impeccable:product-schema 1 -->

## Platform

Web application. Desktop, laptop and tablet are the primary work surfaces;
phone layouts provide a compact drawing area and overlay panels.

## Users

Independent tailors and micro-ateliers sewing made to measure, roughly one to
ten individual orders per week. A typical job is taking a client's
measurements, drafting a block (tee, long sleeve, shirt, dress, vest, coat, trousers,
skirt, sweatshirt, hoodie, jumper, cardigan, briefs, boxers, bralette or slip), checking seams,
saving the named order with its client in the atelier, then printing a
full-scale tiled PDF for a toile. An atelier has an owner and a few tailors who
share clients and orders; each order can have a responsible tailor. Hobbyists
browsing ready sizes and production teams needing grading are explicitly out
of scope.

## Product Purpose

Turn a client's body measurements into an editable block and a full-scale
printable pattern for that order. Success means the drawing, seam
measurements and exported PDF agree, and the design can be reopened for the
next fitting of the same client.

## Positioning

Four deterministic drafting blocks are the core: they share one 2D editor,
approximate 3D preview and paper-layout engine. The external pattern library
is secondary inspiration and reference; it preserves publisher identity and
never feeds geometry into the order workflow. No exclusive market claim or
validated fit guarantee has been established.

## Operating Context

Sign in, start from the orders in progress, a client card or a local block,
apply the client's latest measurement set, adjust style or supported
construction points, compare seams, save the order for the client, then print
at 100 percent and measure the calibration square. The client card compares
measurement sets and flags orders drafted from older ones. External models open on the publisher's website and stay outside the
order flow.

## Capabilities and Constraints

Core order flow: sixteen blocks (including four lingerie blocks with negative
ease) on GOST women's and men's size rows with height
groups (docs/SIZING.md), fit presets; ateliers with owner and tailor roles;
client and order registries; measurement history; MongoDB storage with GridFS
files and a JSON backup; SVG, DXF and tiled PDF; seam inspection and supported
point edits. Secondary: 85 external source entries for reference. 3D does not
simulate industrial fit. Arbitrary freehand pattern authoring, external-pattern
editing, email invitations, offline sync and production grading are absent.

## Brand Commitments

Shityo is the product name. Monos UI supplies the component vocabulary, six
palettes and light/dark modes. Russian and English are supported.

## Evidence on Hand

The drafting engine and tests live in backend. Browser workflows cover search,
project validation and transfer, printing and responsive layouts. Source records
carry publisher addresses, attribution and verification dates. The screenshots
use demonstration measurements. No customer counts or fit trials are claimed.

## Product Principles

1. Keep dimensions and exports consistent, with explicit units.
2. Preserve user work and reject invalid imported state before applying it.
3. Attribute real designs and distinguish the external catalog from local blocks.
4. Give the drawing space before adding controls or decoration.
5. Optimize for the repeat client: named designs and profiles beat one-off browsing.

## Accessibility & Inclusion

Controls use labels and visible focus. Construction coordinates have numeric
inputs as an alternative to dragging. Line meanings have text labels. Responsive
checks are browser emulation, not physical-device or formal WCAG certification.
