<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	let mainElement:HTMLElement;
	afterNavigate(({from,to})=>{if(from?.url.pathname!==to?.url.pathname)mainElement?.scrollTo({top:0,left:0,behavior:'instant'});});
	import { IconButton, SelectField } from '@monos/ui';
	import { Languages, Moon, Settings as SettingsIcon, Sun, X } from 'lucide-svelte';
	import { restoreLocale, setLocale, locale, t } from '$lib/i18n';

	let { children } = $props();

	// Язык восстанавливается на клиенте: сервер отдаёт русский, чтобы
	// первый экран не мигнул английским до гидрации.
	onMount(() => {
		setLocale(restoreLocale());
		document.documentElement.dataset.theme = 'specimen';
		document.documentElement.dataset.hydrated = 'true';
	});

	let mode = $state<'light' | 'dark'>('light');
	let settingsOpen = $state(false);

	const languageOptions = $derived([
		{ value: 'ru', label: $t('app.languageRu') },
		{ value: 'en', label: $t('app.languageEn') }
	]);

	function applyMode() {
		document.documentElement.setAttribute('data-mode', mode);
	}

	function toggleMode() {
		mode = mode === 'dark' ? 'light' : 'dark';
		applyMode();
	}
</script>

<svelte:head>
	<meta name="color-scheme" content={mode} />
</svelte:head>

<div class="app-shell">
	<nav class="app-nav" data-testid="app-nav">
		<a class="brand" href="/">Shityo</a>
		<span class="tagline">{$t('app.title')}</span>
		<span class="spacer"></span>
		<IconButton
			label={$t('app.settings')}
			size="sm"
			variant="ghost"
			data-testid="settings-toggle"
			onclick={() => (settingsOpen = !settingsOpen)}
		>
			<SettingsIcon size={15} strokeWidth={1.6} />
		</IconButton>
	</nav>

	<main class="app-main" bind:this={mainElement}>
		{@render children()}
	</main>

	{#if settingsOpen}
		<aside class="drawer" data-testid="settings-panel" aria-label={$t('app.settings')}>
			<div class="drawer-head">
				<h2>{$t('app.settings')}</h2>
				<IconButton
					label={$t('app.close')}
					size="sm"
					variant="ghost"
					data-testid="settings-close"
					onclick={() => (settingsOpen = false)}
				>
					<X size={15} strokeWidth={1.6} />
				</IconButton>
			</div>
			<a class="nav-link" href="/icons">{$t('icons.title')}</a>

			<label class="control" for="language-switch">
				<span class="control-label">
					<Languages size={13} strokeWidth={1.6} />
					{$t('app.language')}
				</span>
				<SelectField
					id="language-switch"
					data-testid="language-switch"
					variant="boxed"
					size="sm"
					options={languageOptions}
					value={$locale}
					onchange={(event) => setLocale(event.currentTarget.value as 'ru' | 'en')}
				/>
			</label>

			<div class="control">
				<span class="control-label">
					{#if mode === 'dark'}<Sun size={13} strokeWidth={1.6} />{:else}<Moon size={13} strokeWidth={1.6} />{/if}
					{$t('app.theme')}
				</span>
				<IconButton
					label={mode === 'dark' ? $t('app.themeLight') : $t('app.themeDark')}
					size="sm"
					variant="ghost"
					data-testid="mode-toggle"
					onclick={toggleMode}
				>
					{#if mode === 'dark'}
						<Sun size={15} strokeWidth={1.6} />
					{:else}
						<Moon size={15} strokeWidth={1.6} />
					{/if}
				</IconButton>
			</div>
		</aside>
	{/if}
</div>

<style>
	.app-nav {
		display: flex;
		align-items: center;
		gap: var(--ui-space-base);
		height: 46px;
		padding: 0 var(--space-4);
		border-bottom: 1px solid var(--ui-line);
		background: var(--ui-bg);
		flex-shrink: 0;
	}

	.brand {
		font-size: 13px;
		font-weight: 700;
		letter-spacing: 0.26em;
		text-transform: uppercase;
		color: var(--ui-ink);
		text-decoration: none;
	}

	.tagline {
		font-size: 10px;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--ui-ink-muted);
		border-left: 1px solid var(--ui-line);
		padding-left: var(--ui-space-base);
	}

	.spacer {
		flex: 1;
	}

	.drawer {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		width: min(320px, 92vw);
		z-index: 50;
		background: var(--ui-surface);
		border-left: 1px solid var(--ui-line);
		padding: var(--space-4);
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.drawer-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		padding-bottom: var(--space-2);
		border-bottom: 1px solid var(--ui-line);
	}

	.drawer-head h2 {
		margin: 0;
		font-size: 11px;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		font-weight: 600;
	}

	.nav-link {
		font-size: 12px;
		color: var(--ui-ink-soft);
		text-decoration: none;
		border-bottom: 1px solid var(--ui-line);
		padding-bottom: var(--space-2);
	}

	.nav-link:hover {
		color: var(--ui-ink);
	}

	.control {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		font-size: 12px;
		color: var(--ui-ink-soft);
	}

	.control-label {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		white-space: nowrap;
	}

	.app-main {
		flex: 1;
		min-height: 0;
		overflow: auto;
	}
</style>
