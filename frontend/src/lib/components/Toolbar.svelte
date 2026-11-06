<script lang="ts">
	import { Button, Checkbox, SelectField, Spinner } from '@monos/ui';
	import { t } from '$lib/i18n';
	import type { CatalogItem } from '$lib/types';

	interface Props {
		catalog: CatalogItem[];
		model: string;
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
		projectName: string;
		leftOpen: boolean;
		rightOpen: boolean;
		onToggleMeasures: () => void;
		onToggleInspector: () => void;
		onFocus: () => void;
	}

	let {
		catalog,
		model,
		loading,
		show3d,
		source,
		toggles,
		onModelChange,
		onToggle3d,
		onToggle,
		onRegenerate,
		projectName,
		leftOpen,
		rightOpen,
		onToggleMeasures,
		onToggleInspector,
		onFocus
	}: Props = $props();


	const modelOptions = $derived(
		catalog.map((item) => ({ value: item.id, label: $t(`model.${item.id}.name`) }))
	);

	const layerOptions = $derived([
		{ key: 'seam' as const, label: $t('workspace.layerSeam') },
		{ key: 'grain' as const, label: $t('workspace.layerGrain') },
		{ key: 'notches' as const, label: $t('workspace.layerNotches') },
		{ key: 'internal' as const, label: $t('workspace.layerInternal') }
	]);
</script>

<header class="topbar" data-testid="topbar">
	<div class="brand">
		<span class="logo">Shityo</span>
		<nav><a href="/">{$t('catalog.title')}</a></nav>
	</div>

	<div class="model-switch" role="group" aria-label={$t('workspace.model')}>
		<div class="model-segments">
			{#each modelOptions as option (option.value)}
				<button
					type="button"
					class="seg model-seg"
					class:on={model === option.value}
					aria-pressed={model === option.value}
					data-testid="model-switch-{option.value}"
					onclick={() => onModelChange(option.value)}
				>
					{option.label}
				</button>
			{/each}
		</div>
		<div class="model-select">
			<SelectField
				id="model-switch"
				data-testid="model-switch"
				label={$t('workspace.model')}
				value={model}
				options={modelOptions}
				onchange={(event) => onModelChange(event.currentTarget.value)}
			/>
		</div>
	</div>

	<details class="layer-menu"><summary>{$t('workspace.layers')}</summary><div class="layer-content"><fieldset class="layers">
		<legend>{$t('workspace.layers')}</legend>
		{#each layerOptions as layer (layer.key)}
			<Checkbox
				checked={toggles[layer.key]}
				on:change={(event) => onToggle(layer.key, event.currentTarget.checked)}
			>
				{layer.label}
			</Checkbox>
		{/each}
	</fieldset><div class="compact-regenerate"><Button size="sm" variant="secondary" onclick={onRegenerate} disabled={loading}>{$t('workspace.regenerate')}</Button></div></div></details>

	{#if projectName}<span class="project-name">{projectName}</span>{/if}

	<div class="panels" role="group" aria-label={$t('workspace.restoreShort')}>
		<button type="button" class="seg" class:on={leftOpen} data-testid="toggle-measures" aria-pressed={leftOpen} onclick={onToggleMeasures}>{$t('workspace.measuresShort')}</button>
		<button type="button" class="seg" class:on={!leftOpen && !rightOpen} data-testid="focus-pattern" aria-pressed={!leftOpen && !rightOpen} onclick={onFocus}>{$t(!leftOpen && !rightOpen ? 'workspace.restoreShort' : 'workspace.focusShort')}</button>
		<button type="button" class="seg" class:on={rightOpen} data-testid="toggle-inspector" aria-pressed={rightOpen} onclick={onToggleInspector}>{$t('workspace.inspectorShort')}</button>
	</div>

	<div class="actions">
		{#if loading}
			<span class="status" data-testid="regenerate-indicator">
				<Spinner size="xs" />
				{$t('workspace.calculating')}
			</span>
		{:else}
			<span class="status" data-testid="regenerate-indicator">{$t('workspace.ready')}</span>
		{/if}
		{#if source === 'fixture'}
			<span class="status" data-testid="fixture-badge">{$t('workspace.offline')}</span>
		{/if}
		<Button class="regenerate" variant="secondary" size="sm" onclick={onRegenerate} disabled={loading}>
			{$t('workspace.regenerate')}
		</Button>
		<Button variant="primary" size="sm" onclick={onToggle3d} data-testid="toggle-3d">
			{show3d ? $t('workspace.hide3d') : $t('workspace.show3d')}
		</Button>
	</div>
</header>

<style>
 .brand{display:none !important;}
 @media(max-width:1100px){.project-name{display:none;}.status{display:none;}}
 .layer-menu{position:relative;flex-shrink:0;}
 .layer-menu>summary{cursor:pointer;padding:var(--space-2);font-size:12px;}
 .layer-content{position:absolute;top:100%;right:0;width:260px;max-width:calc(100vw - 24px);z-index:15;background:var(--ui-surface);border:1px solid var(--ui-line);border-radius:var(--ui-radius);padding:var(--space-3);box-shadow:0 8px 24px #0003;}
 .layer-content .layers{flex-direction:column;align-items:flex-start;gap:var(--space-3);}
 .compact-regenerate{display:none;}
 .panels{display:flex;gap:0;border:1px solid var(--ui-line);}
 .panels .seg{border:0;border-right:1px solid var(--ui-line);border-radius:0;background:transparent;padding:4px 10px;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--ui-ink-soft);cursor:pointer;white-space:nowrap;}
 .panels .seg:last-child{border-right:0;}
 .panels .seg:hover{color:var(--ui-ink);}
 .panels .seg.on{background:var(--ui-ink);color:var(--ui-bg);}
 @media(max-width:767px){
  .topbar{flex-wrap:wrap !important;row-gap:2px;padding:4px var(--space-3);}
  .model-switch{flex:1 1 150px;width:auto;min-width:0 !important;}
  .layer-menu{order:2;}
  .actions{margin-left:auto !important;gap:var(--space-1) !important;flex-shrink:0;order:2;}
  .panels{order:3;width:100%;}
  .panels .seg{flex:1;padding:6px 4px;font-size:10px;letter-spacing:.06em;}
  .status{display:none !important;}
  .actions :global(.regenerate){display:none;}
  .compact-regenerate{display:block;margin-top:var(--space-3);}
  .layer-menu>summary{padding:var(--space-1);min-height:44px;display:flex;align-items:center;}
 }

	.topbar {
		display: flex;
		align-items: center;
		gap: var(--workspace-gap);
		flex-wrap: wrap;
		padding: 2px var(--space-4);
		background: transparent;
		border-bottom: 1px solid var(--ui-line);
	}

	.brand {
		display: flex;
		align-items: center;
		gap: var(--ui-space-base);
	}

	.logo {
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.brand a {
		color: var(--ui-ink-soft);
		text-decoration: none;
		font-size: 13px;
	}

	.brand a:hover {
		color: var(--ui-ink);
		text-decoration: underline;
	}

	.model-switch {
		display: flex;
		gap: 0;
	}

	.model-segments {
		display: flex;
		gap: 0;
		border: 1px solid var(--ui-line);
	}

	.model-select {
		display: none;
		min-width: 140px;
		width: 180px;
	}

	.model-seg {
		border: 0;
		border-right: 1px solid var(--ui-line);
		border-radius: 0;
		background: transparent;
		padding: 4px 10px;
		font-size: 10px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--ui-ink-soft);
		cursor: pointer;
		white-space: nowrap;
	}

	.model-seg:last-child {
		border-right: 0;
	}

	.model-seg:hover {
		color: var(--ui-ink);
	}

	.model-seg.on {
		background: var(--ui-ink);
		color: var(--ui-bg);
	}

	@media (max-width: 767px) {
		.model-segments {
			display: none;
		}
		.model-select {
			display: block;
		}
	}

	.layers {
		display: flex;
		align-items: center;
		gap: var(--ui-space-base);
		flex-wrap: wrap;
		border: 0;
		padding: 0;
		margin: 0;
	}

	.layers legend {
		padding: 0;
		font-size: 11px;
		color: var(--ui-ink-muted);
	}

	.actions {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: var(--workspace-gap);
	}

	.status {
		display: inline-flex;
		align-items: center;
		gap: var(--ui-space-field);
		color: var(--ui-ink-muted);
		font-size: 12px;
	}
</style>
