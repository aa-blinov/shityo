<script lang="ts" module>
	/** Выбор в начале нового лекала. */
	export interface StartChoice {
		name: string;
		clientId: string;
		/** Мерки, которые надо подставить; пустой объект - оставить мерки основы. */
		measurements: Record<string, number>;
		params: Record<string, string | number>;
	}
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { Button, TextField } from '@monos/ui';
	import ChoiceChips from '$lib/components/ChoiceChips.svelte';
	import { hasKey, locale, t } from '$lib/i18n';
	import { listClients, listSnapshots, type Client, type MeasurementSnapshot } from '$lib/clients';
	import { measurementRange } from '$lib/labels';
	import { presetEase, presetsFor, presetValues, type FitPreset } from '$lib/presets';
	import { heightsOf, rowHeight, rowsForHeight } from '$lib/sizes';
	import type { CatalogItem, SizeGridRow } from '$lib/types';

	/**
	 * Начало нового лекала: название, чьи мерки и посадка. Три решения, с
	 * которых швея всё равно начинает; дальше всё правится в редакторе.
	 */
	interface Props {
		item: CatalogItem;
		sizes: SizeGridRow[];
		/** Ряд размеров другого пола: женский и мужской ряды разные. */
		loadSizes: (gender: string) => Promise<SizeGridRow[]>;
		onStart: (choice: StartChoice) => void;
		onSkip: () => void;
		/** Клиент, для которого открыт новый проект (из кабинета). */
		clientId?: string;
	}

	let { item, sizes: initialSizes, loadSizes, onStart, onSkip, clientId: wantedClient = '' }: Props = $props();

	type Source = 'client' | 'size' | 'default';
	let clients = $state<Client[]>([]);
	let snapshots = $state<MeasurementSnapshot[]>([]);
	let source = $state<Source>('size');
	let clientId = $state('');
	let snapshotId = $state('');
	let size = $state('');
	// Пол фигуры, если у модели есть женский и мужской вариант.
	const genderSpec = $derived(item.params.gender);
	let gender = $state('');
	let sizes = $state<SizeGridRow[]>([]);
	/** Ходовой размер ряда: 46 у женщин, 50 у мужчин, иначе середина ряда. */
	// Рост типовой фигуры: основной для ряда (164 у женщин, 176 у мужчин).
	let height = $state(0);
	const heights = $derived(heightsOf(sizes));
	const visibleSizes = $derived(rowsForHeight(sizes, height || undefined));
	function usualSize(rows: SizeGridRow[]): string {
		const middle = heightsOf(rows);
		height = middle[Math.floor(middle.length / 2)] ?? 0;
		const pool = rowsForHeight(rows, height || undefined);
		const usual = pool.find((row) => row.size === (row.gender === 'male' ? '50' : '46'));
		return (usual ?? pool[Math.floor(pool.length / 2)])?.size ?? '';
	}
	async function pickGender(next: string) {
		gender = next;
		try {
			sizes = await loadSizes(next);
		} catch {
			sizes = [];
		}
		size = usualSize(sizes);
	}
	let presetId = $state('regular');
	let name = $state('');
	let nameTouched = $state(false);
	let dialog = $state<HTMLDivElement | null>(null);

	const modelName = $derived($t(`model.${item.id}.name`));
	const presets = $derived(presetsFor(item));
	const client = $derived(clients.find((c) => c.id === clientId));
	const autoName = $derived(
		source === 'client' && client
			? $t('start.nameClient', { model: modelName, client: client.name })
			: source === 'size' && size
				? $t('start.nameSize', { model: modelName, size })
				: $t('project.defaultName', { model: modelName })
	);
	const shownName = $derived(nameTouched ? name : autoName);

	onMount(() => {
		try {
			clients = listClients();
		} catch {
			clients = [];
		}
		// Клиент подставляется, только если проект открыт для него из кабинета:
		// иначе новый проект молча уходил бы первому клиенту в списке.
		if (wantedClient && clients.some((c) => c.id === wantedClient)) {
			source = 'client';
			pickClient(wantedClient);
		} else if (clients.length) {
			pickClient('');
		}
		gender = String(item.params.gender?.default ?? '');
		sizes = initialSizes;
		size = usualSize(sizes);
		if (!presets.some((p) => p.id === presetId)) presetId = presets[0]?.id ?? '';
		dialog?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
	});

	function pickClient(id: string) {
		clientId = id;
		try {
			snapshots = id ? listSnapshots(id) : [];
		} catch {
			snapshots = [];
		}
		snapshotId = snapshots[0]?.id ?? '';
	}

	/** Только мерки этой модели и в допустимых пределах: остальное не трогаем. */
	function usable(values: Record<string, number>): Record<string, number> {
		return Object.fromEntries(
			item.measurements
				.filter((key) => {
					const range = measurementRange(key);
					const value = values[key];
					return Number.isFinite(value) && value >= range.min && value <= range.max;
				})
				.map((key) => [key, values[key]])
		);
	}

	function chosenMeasurements(): Record<string, number> {
		if (source === 'client') {
			const snapshot = snapshots.find((s) => s.id === snapshotId);
			return snapshot ? usable(snapshot.values) : {};
		}
		if (source === 'size') {
			const row = visibleSizes.find((r) => r.size === size);
			return row ? usable(row.measurements) : {};
		}
		return {};
	}

	function start() {
		const preset = presets.find((p) => p.id === presetId);
		onStart({
			name: shownName.trim() || autoName,
			clientId: source === 'client' ? clientId : '',
			measurements: chosenMeasurements(),
			params: { ...(preset ? presetValues(item, preset) : {}), ...(gender ? { gender } : {}) }
		});
	}

	function presetName(preset: FitPreset): string {
		const own = `preset.${item.id}.${preset.id}`;
		return hasKey(own) ? $t(own) : $t(`preset.${preset.id}`);
	}

	function presetText(preset: FitPreset): string {
		const own = `preset.${item.id}.${preset.id}.text`;
		return hasKey(own) ? $t(own) : $t(`preset.${preset.id}.text`);
	}

	function easeLine(preset: FitPreset): string {
		return Object.entries(presetEase(item, preset))
			.filter(([key, value]) => value !== null && key !== 'ease_length')
			.map(([key, value]) => `${$t(`fit.short.${key}`)} +${decimal(Number(value))}`)
			.join(', ');
	}

	/** Дробная часть через запятую, как принято в русских мерках. */
	function decimal(value: number): string {
		return value.toLocaleString($locale === 'ru' ? 'ru-RU' : 'en-US', { maximumFractionDigits: 1 });
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			onSkip();
			return;
		}
		// Фокус не уходит под диалог: Tab ходит по кругу внутри него.
		if (event.key !== 'Tab' || !dialog) return;
		const focusable = Array.from(
			dialog.querySelectorAll<HTMLElement>('button, input, select, textarea, [href]')
		).filter((el) => !el.matches(':disabled'));
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		if (!first || !last) return;
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}

	const sources = $derived<{ value: Source; label: string }[]>([
		{ value: 'client', label: $t('start.source.client') },
		{ value: 'size', label: $t('start.source.size') },
		{ value: 'default', label: $t('start.source.default') }
	]);
</script>

<svelte:window onkeydown={onKeydown} />

<!-- Щелчок по фону вне окна закрывает его, как «Пропустить». -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
	class="overlay"
	data-testid="project-start"
	onclick={(event) => {
		if (event.target === event.currentTarget) onSkip();
	}}
>
	<div
		class="dialog"
		role="dialog"
		aria-modal="true"
		aria-labelledby="start-title"
		bind:this={dialog}
	>
		<header>
			<h2 id="start-title">{$t('start.title', { model: modelName })}</h2>
			<p class="lead">{$t('start.lead')}</p>
		</header>

		<div class="body">

		<section class="step">
			<h3><span class="n num">1</span>{$t('start.whose')}</h3>
			{#if genderSpec?.options && genderSpec.options.length > 1}
				<ChoiceChips
					testid="start-gender"
					label={$t('param.gender')}
					value={gender}
					full
					options={genderSpec.options.map((o) => ({ value: o.value, label: $t(`param.gender.${o.value}`) }))}
					onChange={(value) => void pickGender(value)}
				/>
			{/if}
			<ChoiceChips
				testid="start-source"
				label={$t('start.source')}
				value={source}
				full
				options={sources}
				onChange={(value) => (source = value as Source)}
			/>
			{#if source === 'client'}
				{#if clients.length}
					<ChoiceChips
						testid="start-client"
						label={$t('start.client')}
						value={clientId}
						options={clients.map((c) => ({ value: c.id, label: c.name }))}
						onChange={pickClient}
					/>
					{#if snapshots.length}
						<ChoiceChips
							testid="start-snapshot"
							label={$t('start.snapshot')}
							value={snapshotId}
							options={snapshots.map((s) => ({ value: s.id, label: s.label }))}
							onChange={(value) => (snapshotId = value)}
						/>
					{/if}
					{#if !snapshots.length}<p class="note">{$t('start.noSnapshots')}</p>{/if}
				{:else}
					<p class="note">{$t('start.noClients')}</p>
				{/if}
			{:else if source === 'size'}
				<ChoiceChips
					testid="start-size"
					label={$t('start.size')}
					value={size}
					options={visibleSizes.map((row) => ({ value: row.size, label: row.size }))}
					onChange={(value) => (size = value)}
				/>
				{#if heights.length > 1}
					<ChoiceChips
						testid="start-height"
						label={$t('sizes.height')}
						value={String(height)}
						options={heights.map((h) => ({ value: String(h), label: String(h) }))}
						onChange={(value) => (height = Number(value))}
					/>
				{/if}
				{@const chosen = visibleSizes.find((r) => r.size === size)}
				<p class="note">
					{chosen?.designation ? $t('sizes.designation', { value: chosen.designation }) + '. ' : ''}{$t('start.sizeNote')}
				</p>
			{:else}
				<p class="note">{$t('start.defaultNote')}</p>
			{/if}
		</section>

		{#if presets.length}
			<section class="step">
				<h3><span class="n num">2</span>{$t('start.fit')}</h3>
				<div class="presets" role="group" aria-label={$t('start.fit')}>
					{#each presets as preset (preset.id)}
						<button
							type="button"
							class="preset"
							class:on={presetId === preset.id}
							aria-pressed={presetId === preset.id}
							data-testid="start-preset-{preset.id}"
							onclick={() => (presetId = preset.id)}
						>
							<span class="p-name">{presetName(preset)}</span>
							<span class="p-text">{presetText(preset)}</span>
							{#if easeLine(preset)}<span class="p-ease num">{easeLine(preset)}</span>{/if}
						</button>
					{/each}
				</div>
			</section>
		{/if}

		<section class="step">
			<h3><span class="n num">{presets.length ? 3 : 2}</span>{$t('start.name')}</h3>
			<TextField
				id="start-name"
				size="sm"
				label={$t('project.name')}
				value={shownName}
				maxlength="120"
				oninput={(event: Event) => {
					name = (event.currentTarget as HTMLInputElement).value;
					nameTouched = true;
				}}
			/>
		</section>
		</div>

		<footer>
			<Button variant="quiet" size="sm" onclick={onSkip} data-testid="start-skip">{$t('start.skip')}</Button>
			<Button variant="primary" class="cta" onclick={start} data-testid="start-submit" data-autofocus
				>{$t('start.submit')}</Button
			>
		</footer>
	</div>
</div>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 40;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--space-4);
		background: color-mix(in srgb, var(--ui-bg) 82%, transparent);
	}
	.dialog {
		/* Высота не зависит от выбранного варианта: кнопки внизу не прыгают. */
		width: min(560px, 100%);
		height: min(780px, calc(100dvh - 2 * var(--space-4)));
		display: flex;
		flex-direction: column;
		background: var(--ui-surface);
		border: 1px solid var(--ui-ink);
		border-radius: var(--ui-radius);
	}
	header {
		padding: var(--space-6) var(--space-6) var(--space-4);
		border-bottom: 1px solid var(--ui-line);
	}
	.body {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
		padding: var(--space-5) var(--space-6);
	}
	h2 {
		margin: 0;
		font-size: 18px;
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--ui-ink);
	}
	.lead {
		margin: var(--space-2) 0 0;
		font-size: 13px;
		line-height: 1.5;
		color: var(--ui-ink-soft);
	}
	.step {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	h3 {
		margin: 0;
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--ui-ink);
	}
	.n {
		width: 18px;
		height: 18px;
		display: inline-grid;
		place-items: center;
		border: 1px solid var(--ui-ink);
		border-radius: var(--ui-radius);
		font-size: 11px;
	}
	.preset {
		background: var(--ui-surface);
		border: 1px solid var(--ui-line);
		border-radius: var(--ui-radius);
		color: var(--ui-ink-soft);
		cursor: pointer;
		font: inherit;
	}
	.preset:hover {
		color: var(--ui-ink);
		border-color: var(--ui-ink-soft);
	}
	.preset:focus-visible {
		outline: 1px solid var(--ui-accent);
		outline-offset: 1px;
	}
	.preset.on {
		background: var(--ui-accent);
		border-color: var(--ui-accent);
		color: var(--ui-surface);
	}
	.note {
		margin: 0;
		font-size: 12px;
		line-height: 1.5;
		color: var(--ui-ink-muted);
	}
	.presets {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: var(--space-1);
	}
	.preset {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-1);
		padding: var(--space-2) var(--space-2);
		text-align: left;
		color: var(--ui-ink);
	}
	.p-name {
		font-size: 13px;
		font-weight: 700;
	}
	.p-text {
		font-size: 12px;
		line-height: 1.4;
		color: var(--ui-ink-soft);
	}
	.p-ease {
		font-size: 11px;
		color: var(--ui-ink-muted);
	}
	.preset.on .p-text,
	.preset.on .p-ease {
		color: color-mix(in srgb, var(--ui-bg) 78%, transparent);
	}
	footer {
		display: flex;
		justify-content: flex-end;
		align-items: center;
		gap: var(--space-2);
		border-top: 1px solid var(--ui-line);
		padding: var(--space-4) var(--space-6);
	}
	@media (max-width: 767px) {
		header,
		.body,
		footer {
			padding-left: var(--space-4);
			padding-right: var(--space-4);
		}
		.body {
			gap: var(--space-4);
		}
	}
</style>
