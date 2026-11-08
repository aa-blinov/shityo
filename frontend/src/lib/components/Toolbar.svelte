<script lang="ts">
	import { Button, Checkbox, Spinner } from '@monos/ui';
	import { t } from '$lib/i18n';
	import { ArrowLeft, Download, Keyboard, Layers, Maximize2, Minimize2, PanelLeft, PanelRight, Printer } from 'lucide-svelte';
	import { exportUrl } from '$lib/api';
	import type { CatalogItem } from '$lib/types';

	interface Props {
		catalog: CatalogItem[];
		model: string;
		measurements: Record<string, number>;
		params: Record<string, string | number>;
		overrides: Record<string, number>;
		loading: boolean;
		show3d: boolean;
		source: 'api' | 'fixture';
		toggles: { seam: boolean; grain: boolean; notches: boolean; internal: boolean };
		onModelChange: (id: string) => void;
		onToggle3d: () => void;
		/**
		 * Слой переключили. Значение приходит из контрола, а не вычисляется
		 * наоборот: иначе родитель перезапишет состояние контрола своим
		 * старым значением и щелчок не сработает.
		 */
		onToggle: (key: 'seam' | 'grain' | 'notches' | 'internal', value: boolean) => void;
		onRegenerate: () => void;
		onExport: () => void;
		/** Открыть окно печати (бумага, сборка листов, PDF). */
		onPrint: () => void;
		projectName: string;
		leftOpen: boolean;
		rightOpen: boolean;
		onToggleMeasures: () => void;
		onToggleInspector: () => void;
		onFocus: () => void;
		/** Справка по горячим клавишам. */
		onKeys: () => void;
	}

	let {
		catalog,
		model,
		measurements,
		params,
		overrides,
		loading,
		show3d,
		source,
		toggles,
		onModelChange,
		onToggle3d,
		onToggle,
		onRegenerate,
		onExport,
		onPrint,
		projectName,
		leftOpen,
		rightOpen,
		onToggleMeasures,
		onToggleInspector,
		onFocus,
		onKeys
	}: Props = $props();

	// Обратная косая черта для подсказки: в шаблонной строке её легко потерять.
	const BACKSLASH = String.fromCharCode(92);
	const paper = $derived({ page: 'A4' as const, orientation: 'portrait' as const, calibration: true });
	const svgUrl = $derived(exportUrl(model, 'svg', measurements, params, overrides, paper));
	const dxfUrl = $derived(exportUrl(model, 'dxf', measurements, params, overrides));

	const layerOptions = $derived([
		{ key: 'seam' as const, label: $t('workspace.layerSeam') },
		{ key: 'grain' as const, label: $t('workspace.layerGrain') },
		{ key: 'notches' as const, label: $t('workspace.layerNotches') },
		{ key: 'internal' as const, label: $t('workspace.layerInternal') }
	]);
</script>

<!-- Одна строка: где я (каталог / лекало), как смотрю (слои, панели), что забираю (файлы). -->
<header class="topbar" data-testid="topbar">
	<nav class="crumbs" aria-label={$t('workspace.model')}>
		<a class="back" href="/"><ArrowLeft size={14} aria-hidden="true" />{$t('catalog.title')}</a>
		<span class="sep" aria-hidden="true">/</span>
		<!-- Основа выбирается при создании проекта; внутри проекта она не меняется. -->
		<span class="model" data-testid="model-name">{$t(`model.${model}.name`)}</span>
		{#if projectName}
			<span class="sep project-sep" aria-hidden="true">/</span>
			<span class="project-name" title={projectName}>{projectName}</span>
		{/if}
	</nav>

	<div class="view">
		<div class="panels mode" role="group" aria-label={$t('workspace.view')}>
			<button type="button" class="seg" class:on={!show3d} aria-pressed={!show3d} data-testid="toggle-2d" data-tip={`${$t('keys.view')} (2)`} onclick={() => show3d && onToggle3d()}>2D</button>
			<button type="button" class="seg" class:on={show3d} aria-pressed={show3d} data-testid="toggle-3d" data-tip={`${$t('keys.view')} (3)`} onclick={onToggle3d}>3D</button>
		</div>
		<details class="layer-menu" data-testid="layer-menu">
			<summary class="ctrl icon-ctrl" data-tip={$t('workspace.layers')} aria-label={$t('workspace.layers')}><Layers size={15} strokeWidth={1.7} /><span class="caret" aria-hidden="true"></span></summary>
			<div class="layer-content">
				<fieldset class="layers">
					<legend>{$t('workspace.layers')}</legend>
					{#each layerOptions as layer (layer.key)}
						<Checkbox
							checked={toggles[layer.key]}
							on:change={(event) => onToggle(layer.key, event.currentTarget.checked)}
						>
							{layer.label}
						</Checkbox>
					{/each}
				</fieldset>
				<div class="layer-actions">
					<Button size="sm" variant="quiet" onclick={onRegenerate} disabled={loading}>{$t('workspace.regenerate')}</Button>
				</div>
			</div>
		</details>

		<div class="panels" role="group" aria-label={$t('workspace.restoreShort')}>
			<button type="button" class="seg icon-seg" class:on={leftOpen} data-testid="toggle-measures" aria-pressed={leftOpen} aria-label={$t('workspace.measuresShort')} data-tip={`${$t(leftOpen ? 'workspace.hideMeasures' : 'workspace.showMeasures')} ([)`} onclick={onToggleMeasures}><PanelLeft size={15} strokeWidth={1.7} /></button>
			<button type="button" class="seg icon-seg" class:on={!leftOpen && !rightOpen} data-testid="focus-pattern" aria-pressed={!leftOpen && !rightOpen} aria-label={$t(!leftOpen && !rightOpen ? 'workspace.restoreShort' : 'workspace.focusShort')} data-tip={`${$t(!leftOpen && !rightOpen ? 'workspace.restoreTip' : 'workspace.focusTip')} (${BACKSLASH})`} onclick={onFocus}>{#if !leftOpen && !rightOpen}<Minimize2 size={15} strokeWidth={1.7} />{:else}<Maximize2 size={15} strokeWidth={1.7} />{/if}</button>
			<button type="button" class="seg icon-seg" class:on={rightOpen} data-testid="toggle-inspector" aria-pressed={rightOpen} aria-label={$t('workspace.inspectorShort')} data-tip={`${$t(rightOpen ? 'workspace.hideInspector' : 'workspace.showInspector')} (])`} onclick={onToggleInspector}><PanelRight size={15} strokeWidth={1.7} /></button>
		</div>
	</div>

	<div class="status-area" aria-live="polite">
		<!-- Пересчёт виден, только пока идёт: постоянное «Готово» ничего не сообщало. -->
		<span class="status" data-testid="regenerate-indicator">
			{#if loading}<Spinner size="xs" />{$t('workspace.calculating')}{/if}
		</span>
		{#if source === 'fixture'}
			<span class="status" data-testid="fixture-badge">{$t('workspace.offline')}</span>
		{/if}
	</div>

	<button type="button" class="keys" onclick={onKeys} data-testid="keys-toolbar" aria-label={$t('keys.title')} data-tip={`${$t('keys.title')} (?)`}><Keyboard size={16} strokeWidth={1.7} /></button>
	<button type="button" class="print" onclick={onPrint} data-testid="print-toolbar" data-tip={`${$t('print.tip')} (Ctrl+P)`}><Printer size={14} strokeWidth={1.8} />{$t('print.button')}</button>
	<div class="downloads" role="group" aria-label={$t('print.export')}>
		<span class="downloads-label" data-tip={$t('print.exportTip')}><Download size={14} strokeWidth={1.7} /><span class="sr-only">{$t('print.export')}</span></span>
		<button type="button" class="seg" onclick={onExport} data-testid="project-export" data-tip={$t('project.export')}>JSON</button>
		<button type="button" class="seg" onclick={() => window.open(svgUrl, '_blank', 'noopener,noreferrer')} data-testid="export-toolbar-svg" data-tip={$t('print.svgTip')}>SVG</button>
		<button type="button" class="seg" onclick={() => window.open(dxfUrl, '_blank', 'noopener,noreferrer')} data-testid="export-toolbar-dxf" data-tip={$t('print.dxfTip')}>DXF</button>
	</div>
</header>

<style>
	.keys {
		flex-shrink: 0;
		width: 32px;
		height: var(--bar-h);
		display: grid;
		place-items: center;
		background: transparent;
		border: 1px solid var(--ui-line);
		border-radius: var(--ui-radius);
		color: var(--ui-ink-soft);
		cursor: pointer;
	}
	.keys:hover {
		color: var(--ui-accent);
		border-color: var(--ui-accent);
	}
	.icon-seg {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 32px;
	}
	.icon-ctrl {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
	}
	.print {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
	}
	.downloads-label {
		display: inline-flex;
		align-items: center;
	}
	/* Все элементы строки одной высоты. */
	.topbar {
		--bar-h: 28px;
		display: flex;
		align-items: center;
		gap: var(--space-4);
		padding: var(--space-2) var(--space-4);
		border-bottom: 1px solid var(--ui-line);
		min-width: 0;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	.crumbs {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
		flex: 0 1 auto;
		font-size: 13px;
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		color: var(--ui-ink-soft);
		text-decoration: none;
		white-space: nowrap;
	}
	.back:hover {
		color: var(--ui-ink);
	}
	.sep {
		color: var(--ui-ink-muted);
	}
	.model {
		font-size: 13px;
		font-weight: 700;
		color: var(--ui-ink);
		white-space: nowrap;
	}
	.project-name {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--ui-ink);
	}

	.view {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-shrink: 0;
	}
	.ctrl {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		height: var(--bar-h);
		padding: 0 var(--space-2);
		border: 1px solid var(--ui-line);
		border-radius: var(--ui-radius);
		font-size: 11px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ui-ink-soft);
		cursor: pointer;
		list-style: none;
		white-space: nowrap;
	}
	.ctrl::-webkit-details-marker {
		display: none;
	}
	.ctrl:hover,
	.layer-menu[open] > .ctrl {
		color: var(--ui-ink);
		border-color: var(--ui-ink-soft);
	}
	.caret {
		width: 5px;
		height: 5px;
		border-right: 1px solid currentColor;
		border-bottom: 1px solid currentColor;
		transform: translateY(-2px) rotate(45deg);
	}
	.layer-menu {
		position: relative;
	}
	.layer-content {
		position: absolute;
		top: calc(100% + var(--space-1));
		left: 0;
		width: 240px;
		max-width: calc(100vw - 2 * var(--space-3));
		z-index: 15;
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-3);
		background: var(--ui-surface);
		border: 1px solid var(--ui-ink);
		border-radius: var(--ui-radius);
	}
	.layers {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-2);
		border: 0;
		padding: 0;
		margin: 0;
	}
	.layers legend {
		padding: 0 0 var(--space-1);
		font-size: 11px;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--ui-ink-muted);
	}
	.layer-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		padding-top: var(--space-3);
		border-top: 1px solid var(--ui-line);
	}

	.panels,
	.downloads {
		display: flex;
		align-items: stretch;
		height: var(--bar-h);
		border: 1px solid var(--ui-line);
		border-radius: var(--ui-radius);
		overflow: hidden;
		flex-shrink: 0;
	}
	.seg {
		border: 0;
		border-right: 1px solid var(--ui-line);
		background: transparent;
		padding: 0 var(--space-2);
		font: inherit;
		font-size: 11px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ui-ink-soft);
		cursor: pointer;
		white-space: nowrap;
	}
	.seg:last-child {
		border-right: 0;
	}
	.seg:hover {
		color: var(--ui-ink);
		background: var(--ui-surface);
	}
	.seg:focus-visible {
		outline: 1px solid var(--ui-accent);
		outline-offset: -2px;
	}
	.panels .seg.on {
		background: var(--ui-accent);
		color: var(--ui-surface);
	}
	.downloads-label {
		display: inline-flex;
		align-items: center;
		padding: 0 var(--space-2);
		border-right: 1px solid var(--ui-line);
		font-size: 11px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ui-ink-muted);
	}
	.downloads .seg {
		font-weight: 600;
		letter-spacing: 0.08em;
	}
	.print {
		flex-shrink: 0;
		height: var(--bar-h);
		padding: 0 var(--space-3);
		background: var(--ui-ink);
		border: 1px solid var(--ui-ink);
		border-radius: var(--ui-radius);
		font: inherit;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ui-bg);
		cursor: pointer;
		white-space: nowrap;
	}
	.print:hover {
		background: var(--ui-accent);
		border-color: var(--ui-accent);
	}
	.print:focus-visible {
		outline: 1px solid var(--ui-accent);
		outline-offset: 2px;
	}

	.status-area {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-left: auto;
		min-width: 0;
	}
	.status {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font-size: 11px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--ui-ink-muted);
		white-space: nowrap;
	}

	@media (max-width: 1100px) {
		.project-name,
		.project-sep,
		.status-area,
		.downloads-label {
			display: none;
		}
		.print {
			margin-left: auto;
		}
	}
	@media (max-width: 767px) {
		.topbar {
			flex-wrap: wrap;
			gap: var(--space-2);
			padding: var(--space-2) var(--space-3);
		}
		.crumbs {
			flex: 1 1 auto;
		}
		.view {
			order: 3;
			width: 100%;
		}
		.panels {
			flex: 1;
			height: 44px;
		}
		.panels .seg {
			flex: 1;
			letter-spacing: 0.06em;
		}
		.layer-menu > .ctrl {
			height: 44px;
		}
		.downloads {
			display: none;
		}
	}
</style>

