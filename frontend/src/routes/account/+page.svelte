<script lang="ts">
	import { onMount } from 'svelte';
	import { Button, TextField } from '@monos/ui';
	import { locale, t } from '$lib/i18n';
	import { shortDate } from '$lib/format';
	import { session, type Role, type User } from '$lib/session.svelte';
	import {
		changePassword,
		createStaff,
		exportAll,
		importData,
		listStaff,
		saveAtelier,
		updateStaff,
		type ImportResult
	} from '$lib/atelier';
	import { browserPayload, markMigrated } from '$lib/browser-data';
	import { ApiError } from '$lib/api';

	// Сообщения хранятся уже переведёнными: часть приходит текстом с сервера.
	/**
	 * Ателье: реквизиты, сотрудники, свой пароль и резервная копия.
	 * Рабочие списки (заказы, клиенты) живут в своих реестрах; здесь только
	 * то, что настраивают редко. Реквизиты и сотрудников меняет владелец.
	 */
	let staff = $state<User[]>([]);
	let issue = $state('');
	let message = $state('');

	let atelierName = $state('');
	let city = $state('');
	let notes = $state('');

	let newName = $state('');
	let newEmail = $state('');
	let newPassword = $state('');
	let newRole = $state<Role>('master');

	let currentPassword = $state('');
	let nextPassword = $state('');

	const browserCount = $derived.by(() => {
		if (typeof localStorage === 'undefined') return 0;
		const payload = browserPayload();
		return payload.designProjects.length + payload.clients.clients.length + payload.customProjects.length;
	});

	$effect(() => {
		const me = session.me;
		if (me) {
			atelierName = me.atelier.name;
			city = me.atelier.city;
			notes = me.atelier.notes;
		}
	});

	onMount(async () => {
		try {
			staff = await listStaff();
		} catch {
			issue = $t('registry.loadError');
		}
	});

	function value(event: Event): string {
		return (event.currentTarget as HTMLInputElement).value;
	}

	function fail(error: unknown) {
		message = '';
		issue =
			error instanceof ApiError && error.status === 409
				? $t('auth.taken')
				: error instanceof ApiError && error.status === 400
					? error.message
					: error instanceof ApiError && error.status === 422
						? $t('auth.invalidInput')
						: $t('registry.saveError');
	}

	async function saveRequisites() {
		try {
			const atelier = await saveAtelier({ name: atelierName.trim(), city: city.trim(), notes: notes.trim() });
			if (session.me) session.me = { ...session.me, atelier };
			issue = '';
			message = $t('account.saved');
		} catch (error) {
			fail(error);
		}
	}

	async function addStaff(event: SubmitEvent) {
		event.preventDefault();
		try {
			const user = await createStaff({ name: newName.trim(), email: newEmail.trim(), password: newPassword, role: newRole });
			staff = [...staff, user].sort((a, b) => a.name.localeCompare(b.name));
			newName = newEmail = newPassword = '';
			newRole = 'master';
			issue = '';
			message = $t('staff.created');
		} catch (error) {
			fail(error);
		}
	}

	async function patchStaff(user: User, patch: { role?: Role; active?: boolean; password?: string }) {
		try {
			const saved = await updateStaff(user.id, patch);
			staff = staff.map((item) => (item.id === saved.id ? saved : item));
			issue = '';
			message = patch.password ? $t('staff.passwordReset') : $t('account.saved');
		} catch (error) {
			fail(error);
		}
	}

	async function resetPassword(user: User) {
		const next = prompt($t('staff.resetPrompt', { name: user.name }));
		if (next === null) return;
		if (next.length < 8) {
			issue = $t('auth.passwordHint');
			return;
		}
		await patchStaff(user, { password: next });
	}

	async function savePassword(event: SubmitEvent) {
		event.preventDefault();
		try {
			await changePassword(currentPassword, nextPassword);
			currentPassword = nextPassword = '';
			issue = '';
			message = $t('account.passwordChanged');
		} catch (error) {
			fail(error);
		}
	}

	function summary(result: ImportResult): string {
		return $t('migrate.done', {
			projects: result.projects,
			clients: result.clients,
			custom: result.custom,
			skipped: result.skipped
		});
	}

	async function importFile(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		try {
			if (file.size > 50_000_000) throw new Error();
			const result = await importData(JSON.parse(await file.text()));
			issue = '';
			message = summary(result);
		} catch {
			message = '';
			issue = $t('project.invalid');
		} finally {
			input.value = '';
		}
	}

	async function importBrowser() {
		try {
			const result = await importData(browserPayload());
			markMigrated();
			issue = '';
			message = summary(result);
		} catch (error) {
			fail(error);
		}
	}

	async function backup() {
		try {
			await exportAll();
			issue = '';
			message = $t('account.exported');
		} catch (error) {
			fail(error);
		}
	}
</script>

<svelte:head>
	<title>{session.me?.atelier.name ?? $t('account.title')} — Shityo</title>
</svelte:head>

<div class="registry">
	<div class="registry-title">
		<h1 data-testid="atelier-title">{session.me?.atelier.name ?? $t('account.title')}</h1>
		{#if session.me}
			<span class="count">{$t(`staff.role.${session.me.user.role}`)}, {session.me.user.email}</span>
		{/if}
	</div>

	{#if issue}<p class="registry-error" role="alert">{issue}</p>{/if}
	{#if message}<p class="ok" role="status">{message}</p>{/if}

	<div class="columns">
		<section class="registry-section" aria-labelledby="requisites-title">
			<div class="registry-head"><h2 id="requisites-title">{$t('account.requisites')}</h2></div>
			<div class="fields">
				<TextField id="atelier-name" label={$t('auth.atelier')} value={atelierName} disabled={!session.isOwner} oninput={(e: Event) => (atelierName = value(e))} />
				<TextField id="atelier-city" label={$t('account.city')} placeholder={$t('account.cityPlaceholder')} value={city} disabled={!session.isOwner} oninput={(e: Event) => (city = value(e))} />
				<TextField id="atelier-notes" label={$t('account.notes')} placeholder={$t('account.notesPlaceholder')} value={notes} disabled={!session.isOwner} oninput={(e: Event) => (notes = value(e))} />
				{#if session.isOwner}
					<Button size="sm" disabled={!atelierName.trim()} onclick={saveRequisites} data-testid="atelier-save">{$t('account.saveRequisites')}</Button>
				{:else}
					<p class="registry-muted">{$t('account.ownerOnly')}</p>
				{/if}
			</div>
		</section>

		<section class="registry-section" aria-labelledby="password-title">
			<div class="registry-head"><h2 id="password-title">{$t('account.password')}</h2></div>
			<form class="fields" onsubmit={savePassword}>
				<TextField id="password-current" type="password" label={$t('account.currentPassword')} value={currentPassword} autocomplete="current-password" oninput={(e: Event) => (currentPassword = value(e))} />
				<TextField id="password-next" type="password" label={$t('account.nextPassword')} hint={$t('auth.passwordHint')} value={nextPassword} autocomplete="new-password" oninput={(e: Event) => (nextPassword = value(e))} />
				<Button size="sm" type="submit" disabled={!currentPassword || nextPassword.length < 8} data-testid="password-save">{$t('account.changePassword')}</Button>
			</form>
		</section>
	</div>

	<section class="registry-section" aria-labelledby="staff-title" data-testid="staff">
		<div class="registry-head">
			<h2 id="staff-title">{$t('staff.title')}</h2>
			<span class="registry-muted num">{staff.length}</span>
		</div>
		<ul class="registry-rows staff">
			{#each staff as user (user.id)}
				<li data-testid="staff-row" class:inactive={!user.active}>
					<span class="name">{user.name}{user.id === session.me?.user.id ? ` (${$t('staff.you')})` : ''}</span>
					<span class="registry-muted">{user.email}</span>
					{#if session.isOwner}
						<select value={user.role} aria-label={`${$t('staff.roleLabel')}: ${user.name}`} onchange={(e) => patchStaff(user, { role: e.currentTarget.value as Role })}>
							<option value="owner">{$t('staff.role.owner')}</option>
							<option value="master">{$t('staff.role.master')}</option>
						</select>
						<span class="row-actions">
							{#if user.id !== session.me?.user.id}
								<Button size="sm" variant="quiet" onclick={() => resetPassword(user)}>{$t('staff.reset')}</Button>
								<Button size="sm" variant="quiet" onclick={() => patchStaff(user, { active: !user.active })} data-testid="staff-toggle">
									{$t(user.active ? $t('staff.disable') : 'staff.enable')}
								</Button>
							{/if}
						</span>
					{:else}
						<span class="registry-caps">{$t(`staff.role.${user.role}`)}</span>
						<span></span>
					{/if}
				</li>
			{/each}
		</ul>
		{#if session.isOwner}
			<form class="add-staff" onsubmit={addStaff}>
				<input class="registry-field" placeholder={$t('auth.name')} aria-label={$t('auth.name')} maxlength="120" bind:value={newName} data-testid="staff-name" />
				<input class="registry-field" type="email" placeholder={$t('auth.email')} aria-label={$t('auth.email')} bind:value={newEmail} data-testid="staff-email" />
				<input class="registry-field" type="text" placeholder={$t('staff.tempPassword')} aria-label={$t('staff.tempPassword')} bind:value={newPassword} autocomplete="off" data-testid="staff-password" />
				<select class="registry-field" bind:value={newRole} aria-label={$t('staff.roleLabel')}>
					<option value="master">{$t('staff.role.master')}</option>
					<option value="owner">{$t('staff.role.owner')}</option>
				</select>
				<Button size="sm" type="submit" disabled={!newName.trim() || !newEmail.trim() || newPassword.length < 8} data-testid="staff-add">{$t('staff.add')}</Button>
			</form>
			<p class="registry-muted hint">{$t('staff.hint')}</p>
		{/if}
	</section>

	<section class="registry-section" aria-labelledby="data-title">
		<div class="registry-head"><h2 id="data-title">{$t('account.data')}</h2></div>
		<p class="hint">{$t('account.serverNote')}</p>
		<div class="data-actions">
			<Button size="sm" onclick={backup} data-testid="account-export">{$t('account.export')}</Button>
			<label class="import">
				<input class="file-input" type="file" accept=".json,application/json" onchange={importFile} data-testid="account-import" />
				<span>{$t('account.importBackup')}</span>
			</label>
			{#if browserCount}
				<Button size="sm" variant="quiet" onclick={importBrowser} data-testid="account-migrate">{$t('migrate.run')}</Button>
			{/if}
		</div>
	</section>
</div>

<style>
	.ok {
		margin: 0 0 var(--space-2);
		font-size: 13px;
		color: var(--ui-ink-soft);
	}
	.columns {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-6);
	}
	.columns .registry-section {
		margin-top: 0;
	}
	.fields {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding-top: var(--space-3);
		max-width: 420px;
	}
	.fields :global(button) {
		width: fit-content;
	}
	.staff > li {
		grid-template-columns: minmax(0, 1.4fr) minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1.6fr);
	}
	.staff > li.inactive {
		opacity: 0.55;
	}
	.name {
		overflow: hidden;
		font-weight: 600;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.row-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-1);
	}
	.add-staff {
		display: grid;
		grid-template-columns: minmax(0, 1.4fr) minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 0.8fr) auto;
		gap: var(--space-2);
		margin-top: var(--space-3);
	}
	.hint {
		margin: var(--space-2) 0 0;
		max-width: 72ch;
		font-size: 12.5px;
		line-height: 1.5;
		color: var(--ui-ink-soft);
		white-space: normal;
	}
	.data-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3);
		margin-top: var(--space-3);
	}
	.import {
		position: relative;
		display: inline-flex;
		align-items: center;
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--ui-line);
		font-size: 11px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ui-ink-soft);
		cursor: pointer;
	}
	.import:hover,
	.import:focus-within {
		color: var(--ui-accent);
		border-color: var(--ui-accent);
	}
	.file-input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		overflow: hidden;
	}
	@media (max-width: 900px) {
		.columns,
		.add-staff {
			grid-template-columns: 1fr;
		}
	}
</style>
