<script lang="ts">
	import { Button, TextField } from '@monos/ui';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { ApiError } from '$lib/api';
	import { t } from '$lib/i18n';
	import { session } from '$lib/session.svelte';
	import GarmentSketch from '$lib/components/GarmentSketch.svelte';

	/**
	 * Вход сотрудника и регистрация нового ателье. Сотрудников в уже
	 * существующее ателье заводит владелец, поэтому регистрация здесь всегда
	 * создаёт ателье и делает регистрирующегося его владельцем.
	 */
	let mode = $state<'login' | 'register'>('login');
	let email = $state('');
	let password = $state('');
	let name = $state('');
	let atelier = $state('');
	let issue = $state('');
	let busy = $state(false);

	// Лист раскроя справа: три основы из разных групп каталога и линейки в сантиметрах.
	const SHEET = ['coat', 'dress', 'trousers'];
	const TICKS = Array.from({ length: 13 }, (_, index) => index * 5);

	// Возврат только на свои адреса: параметр next не должен уводить на чужой сайт.
	const next = $derived.by(() => {
		const raw = page.url.searchParams.get('next') ?? '/';
		return raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/login') ? raw : '/';
	});

	const canSubmit = $derived(
		!!email.trim() &&
			password.length >= (mode === 'register' ? 8 : 1) &&
			(mode === 'login' || (!!name.trim() && !!atelier.trim()))
	);

	function value(event: Event): string {
		return (event.currentTarget as HTMLInputElement).value;
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (!canSubmit || busy) return;
		busy = true;
		issue = '';
		try {
			if (mode === 'login') await session.login(email.trim(), password);
			else await session.register({ atelier: atelier.trim(), name: name.trim(), email: email.trim(), password });
			await goto(next, { replaceState: true, invalidateAll: true });
		} catch (error) {
			issue =
				error instanceof ApiError
					? error.status === 401
						? 'auth.invalid'
						: error.status === 409
							? 'auth.taken'
							: error.status === 429
								? 'auth.throttled'
								: error.status === 422
									? 'auth.invalidInput'
									: 'auth.unavailable'
					: 'auth.unavailable';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>{$t(mode === 'login' ? 'auth.loginTitle' : 'auth.registerTitle')} — Shityo</title>
</svelte:head>

<div class="page">
	<div class="panel">
		<h1>{$t(mode === 'login' ? 'auth.loginTitle' : 'auth.registerTitle')}</h1>
		<p class="lead">{$t(mode === 'login' ? 'auth.loginLead' : 'auth.registerLead')}</p>

		<form class="form" onsubmit={submit} novalidate>
			{#if mode === 'register'}
				<TextField
					id="auth-atelier"
					label={$t('auth.atelier')}
					placeholder={$t('auth.atelierPlaceholder')}
					value={atelier}
					autocomplete="organization"
					oninput={(e: Event) => (atelier = value(e))}
				/>
				<TextField
					id="auth-name"
					label={$t('auth.name')}
					value={name}
					autocomplete="name"
					oninput={(e: Event) => (name = value(e))}
				/>
			{/if}
			<TextField
				id="auth-email"
				type="email"
				label={$t('auth.email')}
				value={email}
				autocomplete="username"
				oninput={(e: Event) => (email = value(e))}
			/>
			<TextField
				id="auth-password"
				type="password"
				label={$t('auth.password')}
				hint={mode === 'register' ? $t('auth.passwordHint') : undefined}
				value={password}
				autocomplete={mode === 'login' ? 'current-password' : 'new-password'}
				oninput={(e: Event) => (password = value(e))}
			/>
			{#if issue}<p class="error" role="alert">{$t(issue)}</p>{/if}
			<Button type="submit" class="cta submit" disabled={!canSubmit || busy} data-testid="auth-submit">
				{$t(mode === 'login' ? 'auth.login' : 'auth.createAtelier')}
			</Button>
		</form>
		<p class="note">{$t(mode === 'login' ? 'auth.staffNote' : 'auth.ownerNote')}</p>
		<p class="switch">
			{$t(mode === 'login' ? 'auth.noAtelier' : 'auth.haveAccount')}
			<button
				type="button"
				data-testid="auth-switch"
				onclick={() => {
					mode = mode === 'login' ? 'register' : 'login';
					issue = '';
				}}
			>
				{$t(mode === 'login' ? 'auth.registerLink' : 'auth.loginLink')}
			</button>
		</p>
	</div>

	<aside class="sheet" aria-hidden="true">
		<div class="ruler top">{#each TICKS as tick (tick)}<span class="num">{tick}</span>{/each}</div>
		<div class="ruler left">{#each TICKS as tick (tick)}<span class="num">{tick}</span>{/each}</div>
		<div class="pieces">
			{#each SHEET as id (id)}
				<figure class="piece">
					<div class="drawing">
						<div class="seam"><GarmentSketch {id} allowance /></div>
						<GarmentSketch {id} />
					</div>
					<figcaption>{$t(`model.${id}.name`)}</figcaption>
				</figure>
			{/each}
		</div>
		<p class="caption">{$t('auth.sheetCaption')}</p>
	</aside>
</div>

<style>
	/* Форма слева, лист раскроя справа: экран входа показывает, ради чего приложение. */
	.page {
		display: grid;
		grid-template-columns: minmax(360px, 5fr) 7fr;
		min-height: 100%;
	}
	.panel {
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: var(--space-4);
		width: min(400px, 100%);
		margin: 0 auto;
		padding: var(--space-8) var(--space-4);
	}
	.form :global(.submit) {
		width: 100%;
		margin-top: var(--space-2);
	}

	.sheet {
		--cell: 24px;
		--rule: 28px;
		position: relative;
		overflow: hidden;
		border-left: 1px solid var(--ui-line);
		background-color: var(--ui-surface);
		/* Сетка раскройного листа: тонкая клетка и линия погуще через пять клеток. */
		background-image:
			linear-gradient(color-mix(in srgb, var(--ui-line) 90%, transparent) 1px, transparent 1px),
			linear-gradient(90deg, color-mix(in srgb, var(--ui-line) 90%, transparent) 1px, transparent 1px),
			linear-gradient(color-mix(in srgb, var(--ui-line) 45%, transparent) 1px, transparent 1px),
			linear-gradient(90deg, color-mix(in srgb, var(--ui-line) 45%, transparent) 1px, transparent 1px);
		background-size:
			calc(var(--cell) * 5) calc(var(--cell) * 5),
			calc(var(--cell) * 5) calc(var(--cell) * 5),
			var(--cell) var(--cell),
			var(--cell) var(--cell);
		background-position: var(--rule) var(--rule);
	}
	.ruler {
		position: absolute;
		display: flex;
		background: var(--ui-bg);
		color: var(--ui-ink-muted);
		font-size: 10px;
	}
	.ruler.top {
		top: 0;
		left: var(--rule);
		right: 0;
		height: var(--rule);
		border-bottom: 1px solid var(--ui-ink-muted);
		background-image:
			linear-gradient(90deg, var(--ui-ink-muted) 1px, transparent 1px),
			linear-gradient(90deg, var(--ui-line) 1px, transparent 1px);
		background-size:
			calc(var(--cell) * 5) 10px,
			var(--cell) 5px;
		background-position: 0 100%;
		background-repeat: repeat-x;
	}
	.ruler.left {
		top: var(--rule);
		left: 0;
		bottom: 0;
		width: var(--rule);
		flex-direction: column;
		border-right: 1px solid var(--ui-ink-muted);
		background-image:
			linear-gradient(var(--ui-ink-muted) 1px, transparent 1px),
			linear-gradient(var(--ui-line) 1px, transparent 1px);
		background-size:
			10px calc(var(--cell) * 5),
			5px var(--cell);
		background-position: 100% 0;
		background-repeat: repeat-y;
	}
	.ruler span {
		flex: none;
		box-sizing: border-box;
	}
	.ruler.top span {
		width: calc(var(--cell) * 5);
		padding: var(--space-1) 0 0 var(--space-1);
	}
	.ruler.left span {
		height: calc(var(--cell) * 5);
		padding: var(--space-1) 0 0 var(--space-1);
	}
	/* Эскизы лежат по центру листа, подпись листа - отдельной строкой у нижнего края. */
	.pieces {
		position: absolute;
		top: calc(var(--rule) + var(--space-8));
		bottom: calc(var(--space-8) * 2);
		left: calc(var(--rule) + var(--space-8));
		right: var(--space-8);
		display: grid;
		grid-template-columns: 1.3fr 1fr 1fr;
		align-items: end;
		align-content: center;
		gap: var(--space-8);
		max-width: 640px;
		margin: 0 auto;
	}
	/* Линия эскиза постоянной толщины, как на чертеже, а не растущая с размером. */
	.piece :global(path) {
		vector-effect: non-scaling-stroke;
		stroke-width: 1.5px;
	}
	.piece :global(.allowance path) {
		stroke-width: 1px;
		stroke-dasharray: 5 4;
	}
	.piece {
		margin: 0;
	}
	.drawing {
		position: relative;
	}
	/* Пунктир припуска чуть шире контура: изделие лежит на листе с припуском по срезам. */
	.seam {
		position: absolute;
		inset: 0;
		transform: scale(1.08);
	}
	figcaption {
		margin-top: var(--space-3);
		padding-top: var(--space-2);
		border-top: 1px solid var(--ui-ink);
		font-size: 11px;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--ui-ink-soft);
	}
	.caption {
		position: absolute;
		left: calc(var(--rule) + var(--space-8));
		right: var(--space-8);
		bottom: var(--space-6);
		margin: 0;
		text-align: center;
		font-size: 11px;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--ui-ink-muted);
	}
	@media (max-width: 960px) {
		.page {
			grid-template-columns: 1fr;
		}
		.sheet {
			display: none;
		}
	}
	h1 {
		margin: 0;
		font-size: 20px;
		font-weight: 700;
		letter-spacing: 0.2em;
		text-transform: uppercase;
	}
	.lead,
	.note {
		margin: 0;
		font-size: 13px;
		line-height: 1.5;
		color: var(--ui-ink-soft);
	}
	.note {
		color: var(--ui-ink-muted);
	}
	.form {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.switch {
		margin: 0;
		padding-top: var(--space-4);
		border-top: 1px solid var(--ui-line);
		font-size: 13px;
		color: var(--ui-ink-soft);
	}
	.switch button {
		padding: 0;
		border: 0;
		background: none;
		font: inherit;
		font-weight: 600;
		color: var(--ui-ink);
		text-decoration: underline;
		text-underline-offset: 3px;
		cursor: pointer;
	}
	.switch button:hover,
	.switch button:focus-visible {
		color: var(--ui-accent);
	}
	.error {
		margin: 0;
		font-size: 13px;
		color: var(--ui-danger-text);
	}
</style>
