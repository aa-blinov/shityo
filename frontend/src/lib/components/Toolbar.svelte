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
		onRegenerate
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

	<div class="model-switch">
		<SelectField
			id="model-switch"
			data-testid="model-switch"
			label={$t('workspace.model')}
			value={model}
			options={modelOptions}
			onchange={(event) => onModelChange(event.currentTarget.value)}
		/>
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
 .layer-menu{position:relative;flex-shrink:0;}
 .layer-menu>summary{cursor:pointer;padding:var(--space-2);font-size:12px;}
 .layer-content{position:absolute;top:100%;right:0;width:260px;max-width:calc(100vw - 24px);z-index:15;background:var(--ui-surface);border:1px solid var(--ui-line);border-radius:var(--ui-radius);padding:var(--space-3);box-shadow:0 8px 24px #0003;}
 .layer-content .layers{flex-direction:column;align-items:flex-start;gap:var(--space-3);}
 .compact-regenerate{display:none;}
 @media(max-width:767px){
  .topbar{flex-wrap:nowrap !important;}
  .model-switch{flex:1;width:auto;min-width:0 !important;}
  .actions{margin-left:0 !important;gap:var(--space-1) !important;flex-shrink:0;}
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
		padding: var(--workspace-gap);
		background: var(--ui-surface);
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
		min-width: 140px;
        width:180px;
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
