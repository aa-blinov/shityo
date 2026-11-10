<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { afterNavigate } from '$app/navigation';
	let mainElement:HTMLElement;
	afterNavigate(({from,to})=>{menuOpen=false;if(from?.url.pathname!==to?.url.pathname)mainElement?.scrollTo({top:0,left:0,behavior:'instant'});});
	import { IconButton, SelectField } from '@monos/ui';
	import { Languages, LogOut, Monitor, Moon, Settings as SettingsIcon, Sun, X } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import MigrationBanner from '$lib/components/MigrationBanner.svelte';
	import { session } from '$lib/session.svelte';
	import { restoreLocale, setLocale, locale, t } from '$lib/i18n';
	import ChoiceChips from '$lib/components/ChoiceChips.svelte';
	import { workspaceLayout } from '$lib/workspace-layout.svelte';
	import { sectionOf } from '$lib/navigation';

	// Масштаб интерфейса для тех, кому мелкий текст читать тяжело или кто
	// работает с ноутбука на расстоянии от экрана. Хранится в этом браузере.
	const SCALE_KEY = 'shityo.ui-scale.v1';
	const SCALES = ['100', '115', '130'] as const;
	let scale = $state<string>('100');

	function applyScale(next: string) {
		scale = (SCALES as readonly string[]).includes(next) ? next : '100';
		document.documentElement.style.setProperty('--ui-scale', String(Number(scale) / 100));
		try {
			localStorage.setItem(SCALE_KEY, scale);
		} catch {
			// Без хранилища масштаб действует до перезагрузки.
		}
	}

	let { children } = $props();
	// Раздел шапки: вложенные страницы подсвечивают раздел, из которого открыты.
	const section = $derived(sectionOf(page.url));
	const SECTIONS = [
		['orders', '/orders', 'app.orders'],
		['clients', '/clients', 'app.clients'],
		['catalog', '/', 'app.catalog'],
		['guide', '/guide', 'app.guide']
	] as const;
	// Меню сотрудника: кто вошёл, ателье, выход. Имени ателье в шапке нет:
	// сотрудник работает в одном ателье, и видеть его каждый раз не нужно.
	let menuOpen = $state(false);
	let menuElement = $state<HTMLDetailsElement>();
	const initials = $derived(
		(session.me?.user.name ?? '')
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((word) => word[0]?.toUpperCase() ?? '')
			.join('') || '?'
	);
	function closeMenuOutside(event: PointerEvent) {
		if (menuOpen && menuElement && !menuElement.contains(event.target as Node)) menuOpen = false;
	}
	const onLogin = $derived(page.url.pathname.startsWith('/login'));
	// Сессию знает cookie; имя сотрудника и ателье подгружаются для шапки.
	$effect(() => {
		if (!onLogin && !session.loaded) void session.load();
	});
	async function logout() {
		await session.logout();
		await goto('/login', { replaceState: true });
	}

	// Язык восстанавливается на клиенте: сервер отдаёт русский, чтобы
	// первый экран не мигнул английским до гидрации.
	onMount(() => {
		setLocale(restoreLocale());
		workspaceLayout.load();
		try {
			applyScale(localStorage.getItem(SCALE_KEY) ?? '100');
		} catch {
			applyScale('100');
		}
		document.documentElement.dataset.theme = 'specimen';
		document.documentElement.dataset.hydrated = 'true';
	});

	// Подсказка при наведении для всех элементов с data-tip: одна на
	// приложение, позиционируется над страницей, поэтому не обрезается
	// панелями с overflow: hidden.
	let tip = $state<{ text: string; x: number; y: number; below: boolean } | null>(null);
	function showTip(event: Event) {
		const target = (event.target as Element | null)?.closest?.('[data-tip]') as HTMLElement | null;
		if (!target) return;
		const text = target.dataset.tip ?? '';
		if (!text) return;
		const rect = target.getBoundingClientRect();
		const scale = Number(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) || 1;
		const below = rect.top < 60;
		tip = {
			text,
			x: (rect.left + rect.width / 2) / scale,
			y: (below ? rect.bottom + 6 : rect.top - 6) / scale,
			below
		};
	}
	function hideTip(event: Event) {
		const related = (event as PointerEvent).relatedTarget as Element | null;
		if (related?.closest?.('[data-tip]') === (event.target as Element | null)?.closest?.('[data-tip]')) return;
		tip = null;
	}

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

<svelte:document
	onpointerover={showTip}
	onpointerout={hideTip}
	onfocusin={showTip}
	onfocusout={() => (tip = null)}
	onpointerdown={(event) => {
		tip = null;
		closeMenuOutside(event);
	}}
	onkeydown={(event) => {
		if (event.key === 'Escape' && menuOpen) menuOpen = false;
	}}
/>

<div class="app-shell">
	<section class="narrow-stub" data-testid="narrow-stub" aria-labelledby="narrow-title">
		<span class="brand stub-brand">Shityo<span class="brand-dot">.</span></span>
		<Monitor size={40} strokeWidth={1.3} />
		<h1 id="narrow-title">{$t('narrow.title')}</h1>
		<p>{$t('narrow.text')}</p>
	</section>
	<nav class="app-nav" data-testid="app-nav">
		<a class="brand" href="/" aria-label="Shityo">Shityo<span class="brand-dot" aria-hidden="true">.</span></a>
		<span class="tagline">{$t('app.title')}</span>
		<span class="spacer"></span>
		{#if !onLogin}
			<!-- Единая навигация: заказы и клиенты - работа, основы и справочник - знания. -->
			{#each SECTIONS as [key, href, label] (key)}
				<a class="top-link" class:current={section === key} aria-current={section === key ? 'page' : undefined} {href} data-testid="nav-{key}">{$t(label)}</a>
			{/each}
			{#if session.me}
				<details class="account-menu" bind:open={menuOpen} bind:this={menuElement} data-testid="account-menu">
					<summary class="avatar" class:current={section === 'account'} aria-label={`${$t('nav.accountMenu')}: ${session.me.user.name}`}>{initials}</summary>
					<div class="menu">
						<div class="menu-head">
							<span class="menu-name" data-testid="nav-user">{session.me.user.name}</span>
							<span class="menu-meta">{$t(`staff.role.${session.me.user.role}`)}, {session.me.user.email}</span>
							<span class="menu-atelier" data-testid="nav-atelier">{session.me.atelier.name}</span>
						</div>
						<a class="menu-item" href="/account" data-testid="account-link">{$t('nav.atelierPage')}</a>
						<button type="button" class="menu-item" data-testid="logout" onclick={logout}>
							<LogOut size={14} strokeWidth={1.6} aria-hidden="true" />{$t('auth.logout')}
						</button>
					</div>
				</details>
			{/if}
		{/if}
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
		{#if !onLogin && session.me}<MigrationBanner />{/if}
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

			<ChoiceChips
				testid="scale-switch"
				label={$t('app.scale')}
				value={scale}
				full
				options={SCALES.map((value) => ({ value, label: $t(`app.scale.${value}`) }))}
				onChange={applyScale}
			/>

			<ChoiceChips
				testid="layout-switch"
				label={$t('layout.measuresSide')}
				value={workspaceLayout.swapped ? 'right' : 'left'}
				full
				options={[
					{ value: 'left', label: $t('layout.left') },
					{ value: 'right', label: $t('layout.right') }
				]}
				onChange={(value) => workspaceLayout.setSwapped(value === 'right')}
			/>
			<p class="setting-hint">{$t('layout.hint')}</p>
			<button type="button" class="nav-link reset" data-testid="layout-reset" onclick={() => workspaceLayout.reset()}>{$t('layout.reset')}</button>

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
	{#if tip}
		<div class="tip" class:below={tip.below} role="tooltip" style={`left:${tip.x}px;top:${tip.y}px`}>{tip.text}</div>
	{/if}
</div>

<style>
	.setting-hint {
		margin: calc(-1 * var(--space-2)) 0 0;
		font-size: 12px;
		line-height: 1.5;
		color: var(--ui-ink-muted);
	}
	.reset {
		align-self: flex-start;
		background: none;
		padding: 0;
		cursor: pointer;
		font: inherit;
		font-size: 12px;
		border-top: 0;
		border-left: 0;
		border-right: 0;
	}
	.narrow-stub {
		flex: 1;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-4);
		padding: var(--space-8) var(--space-6);
		text-align: center;
		color: var(--ui-ink-soft);
	}
	.narrow-stub h1 {
		margin: 0;
		font-size: 20px;
		line-height: 1.3;
		color: var(--ui-ink);
	}
	.narrow-stub p {
		margin: 0;
		max-width: 34ch;
		font-size: 15px;
		line-height: 1.55;
	}
	.stub-brand {
		font-size: 34px;
	}
	.top-link {
		font-size: 13px;
		color: var(--ui-ink-soft);
		text-decoration: none;
		padding: var(--space-1) var(--space-2);
		border-bottom: 2px solid transparent;
	}
	.top-link:hover {
		color: var(--ui-ink);
	}
	.top-link.current {
		color: var(--ui-ink);
		border-bottom-color: var(--ui-accent);
	}
	.account-menu {
		position: relative;
	}
	.avatar {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border: 1px solid var(--ui-line);
		border-radius: 50%;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.04em;
		color: var(--ui-ink-soft);
		cursor: pointer;
		list-style: none;
		user-select: none;
	}
	.avatar::-webkit-details-marker {
		display: none;
	}
	.avatar:hover,
	.account-menu[open] .avatar {
		color: var(--ui-ink);
		border-color: var(--ui-ink-soft);
	}
	.avatar.current {
		border-color: var(--ui-accent);
		color: var(--ui-ink);
	}
	.menu {
		position: absolute;
		top: calc(100% + var(--space-2));
		right: 0;
		z-index: 60;
		display: flex;
		flex-direction: column;
		min-width: 240px;
		max-width: 320px;
		padding: var(--space-1) 0;
		background: var(--ui-surface);
		border: 1px solid var(--ui-line);
		border-radius: var(--ui-radius);
		box-shadow: 0 6px 20px color-mix(in srgb, var(--ui-ink) 10%, transparent);
	}
	.menu-head {
		display: flex;
		flex-direction: column;
		gap: var(--space-half);
		padding: var(--space-2) var(--space-3) var(--space-3);
		margin-bottom: var(--space-1);
		border-bottom: 1px solid var(--ui-line);
	}
	.menu-name {
		font-size: 13px;
		font-weight: 600;
		color: var(--ui-ink);
	}
	.menu-meta,
	.menu-atelier {
		overflow: hidden;
		font-size: 12px;
		color: var(--ui-ink-soft);
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.menu-atelier {
		color: var(--ui-ink-muted);
	}
	.menu-item {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border: 0;
		background: none;
		font: inherit;
		font-size: 13px;
		color: var(--ui-ink);
		text-align: left;
		text-decoration: none;
		cursor: pointer;
	}
	.menu-item:hover,
	.menu-item:focus-visible {
		background: color-mix(in srgb, var(--ui-ink) 6%, transparent);
	}
	.tip {
		position: fixed;
		z-index: 100;
		transform: translate(-50%, -100%);
		max-width: 260px;
		padding: var(--space-1) var(--space-2);
		background: var(--ui-ink);
		color: var(--ui-surface);
		border-radius: var(--ui-radius);
		font-size: 12px;
		line-height: 1.4;
		letter-spacing: 0;
		text-transform: none;
		pointer-events: none;
		white-space: normal;
		animation: tip-in 0.12s ease-out 0.25s both;
	}
	.tip.below {
		transform: translate(-50%, 0);
	}
	@keyframes tip-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.tip {
			animation: none;
		}
	}
	.app-nav {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		height: 46px;
		padding: 0 var(--space-4);
		border-bottom: 1px solid var(--ui-line);
		background: var(--ui-bg);
		flex-shrink: 0;
	}

	/* Логотип: рукописная надпись, как подпись мастера на бирке, и
	   акцентная точка - как булавка. */
	.brand {
		font-family: 'Marck Script', 'Segoe Script', 'Brush Script MT', cursive;
		font-size: 26px;
		font-weight: 400;
		line-height: 1;
		letter-spacing: 0;
		color: var(--ui-ink);
		text-decoration: none;
		transform: translateY(1px) rotate(-3deg);
		transition: color 0.15s;
	}
	.brand:hover {
		color: var(--ui-accent-text);
	}
	.brand-dot {
		color: var(--ui-accent);
	}
	/* На планшете шапка не переносится: подзаголовок уходит. */
	@media (max-width: 1100px) {
		.tagline {
			display: none;
		}
	}

	.tagline {
		font-size: 11px;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--ui-ink-muted);
		border-left: 1px solid var(--ui-line);
		padding-left: var(--space-3);
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
		font-size: 12px;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		font-weight: 600;
	}

	.nav-link {
		font-size: 13px;
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
		font-size: 13px;
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
