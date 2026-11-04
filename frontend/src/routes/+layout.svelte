<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
 import { afterNavigate } from '$app/navigation';
 let mainElement:HTMLElement;
 afterNavigate(({from,to})=>{if(from?.url.pathname!==to?.url.pathname)mainElement?.scrollTo({top:0,left:0,behavior:'instant'});});
	import { IconButton, SelectField } from '@monos/ui';
	import { Languages, Moon, Palette, Sun } from 'lucide-svelte';
	import { restoreLocale, setLocale, locale, t } from '$lib/i18n';

	let { children } = $props();

	// Язык восстанавливается на клиенте: сервер отдаёт русский, чтобы
	// первый экран не мигнул английским до гидрации.
	onMount(() => {
		setLocale(restoreLocale());
		// Метка готовности: браузерные сценарии ждут её, прежде чем
		// нажимать на контролы. До монтирования обработчики не подписаны,
		// и щелчок прошёл бы в никуда.
		document.documentElement.dataset.hydrated = 'true';
	});

	const themes = [
		{ id: 'gruvbox', label: 'Gruvbox' },
		{ id: 'github', label: 'GitHub' },
		{ id: 'dracula', label: 'Dracula' },
		{ id: 'nord', label: 'Nord' },
		{ id: 'solarized', label: 'Solarized' },
		{ id: 'catppuccin', label: 'Catppuccin' }
	] as const;

	let theme = $state('gruvbox');
	let mode = $state<'light' | 'dark'>('dark');

	const languageOptions = $derived([
		{ value: 'ru', label: $t('app.languageRu') },
		{ value: 'en', label: $t('app.languageEn') }
	]);
	const themeOptions = $derived(
		themes.map((option) => ({ value: option.id, label: option.label }))
	);

	function applyTheme() {
		const root = document.documentElement;
		root.setAttribute('data-theme', theme);
		root.setAttribute('data-mode', mode);
	}

	function toggleMode() {
		mode = mode === 'dark' ? 'light' : 'dark';
		applyTheme();
	}
</script>

<svelte:head>
	<meta name="color-scheme" content={mode} />
</svelte:head>

<div class="app-shell">
	<nav class="app-nav" data-testid="app-nav">
		<a class="brand" href="/">{$t('app.title')}</a>
		<details class="settings"><summary>{$t('app.settings')}</summary>
        <a class="nav-link" href="/icons">{$t('icons.title')}</a>

		<div class="app-nav-controls">
			<label class="control" for="language-switch">
				<span class="control-label">
					<Languages size={14} strokeWidth={1.7} />
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

			<label class="control" for="theme-switch">
				<span class="control-label">
					<Palette size={14} strokeWidth={1.7} />
					{$t('app.theme')}
				</span>
				<SelectField
					id="theme-switch"
					data-testid="theme-switch"
					variant="boxed"
					size="sm"
					options={themeOptions}
					value={theme}
					onchange={(event) => {
						theme = event.currentTarget.value as typeof theme;
						applyTheme();
					}}
				/>
			</label>

			<IconButton
				label={mode === 'dark' ? $t('app.themeLight') : $t('app.themeDark')}
				size="sm"
				variant="ghost"
				data-testid="mode-toggle"
				onclick={toggleMode}
			>
				{#if mode === 'dark'}
					<Sun size={16} strokeWidth={1.7} />
				{:else}
					<Moon size={16} strokeWidth={1.7} />
				{/if}
			</IconButton>
		</div>
        </details>
	</nav>

	<main class="app-main" bind:this={mainElement}>
		{@render children()}
	</main>
</div>

<style>
 .settings{margin-left:auto;position:relative;}
 .settings>summary{cursor:pointer;font-size:13px;padding:var(--space-1);min-height:24px;}
 .settings[open]{position:absolute;right:var(--space-3);top:var(--space-2);z-index:20;background:var(--ui-surface);border:1px solid var(--ui-line);border-radius:var(--ui-radius);padding:var(--space-2);max-width:calc(100% - 24px);}
 .settings[open] .app-nav-controls{margin-top:var(--space-2);}

	.app-shell {
		display: flex;
		flex-direction: column;
		height: 100dvh;
		min-height: 0;
	}

	.app-nav {
		display: flex;
		align-items: center;
		gap: var(--ui-space-comfortable);
		padding: var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--ui-line);
		background: var(--ui-surface);
	}

	.brand {
        font-size:13px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ui-ink);
		text-decoration: none;
	}

	.nav-link {
		font-size: 12px;
		color: var(--ui-ink-soft);
		text-decoration: none;
		padding: var(--ui-space-tight) var(--ui-space-snug);
		border-radius: var(--ui-radius);
	}

	.nav-link:hover {
		color: var(--ui-ink);
		background: var(--ui-surface-2);
	}

	.app-nav-controls {
		margin-left: auto;
		display: grid;
		/* Подписи и выпадашки стоят в своих колонках: подписи разной длины,
		   а выпадашки должны быть одной ширины и стоять на одной линии. */
		grid-template-columns: var(--nav-label) var(--nav-control) var(--nav-label) var(--nav-control) auto;
		align-items: center;
		gap: var(--ui-space-snug) var(--ui-space-base);
	}

	.control {
		display: contents;
		font-size: 12px;
		color: var(--ui-ink-soft);
	}

	.control-label {
		display: inline-flex;
		align-items: center;
		gap: var(--ui-space-field);
		white-space: nowrap;
	}

	.app-nav {
		--nav-label: 96px;
		--nav-control: 148px;
	}

	.app-main {
		flex: 1;
		min-height: 0;
		overflow: auto;
	}
	@media (max-width: 850px) {
		.app-nav { flex-wrap: wrap; }
		.app-nav-controls { width: 100%; margin-left: 0; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; }
		.control { display: flex; flex-direction: column; align-items: stretch; gap: var(--ui-space-tight); min-width: 0; }
	}
</style>
