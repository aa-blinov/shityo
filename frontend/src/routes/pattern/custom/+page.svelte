<script lang="ts">
	import { onMount } from 'svelte';
	import { Button, TextField, SelectField, Checkbox } from '@monos/ui';
	import CustomCanvas from '$lib/components/CustomCanvas.svelte';
	import { t } from '$lib/i18n';
	import { customExport, customGenerate, customPrintPlan } from '$lib/api';
	import {
		TEMPLATES,
		applyBinding,
		createPiece,
		createProject,
		deleteProject,
		downloadProject,
		loadProjects,
		makeGrainline,
		outlineIsValid,
		pieceSizeMm,
		projectPayload,
		saveProject,
		type CustomPiece,
		type CustomProject,
		type TemplateId
	} from '$lib/custom';
	import { listClients, listSnapshots, type Client, type MeasurementSnapshot } from '$lib/clients';
	import { MEASUREMENT_RANGES } from '$lib/labels';
	import type { PaperOptions, PrintPlan } from '$lib/types';

	let projects = $state<CustomProject[]>([]);
	let project = $state<CustomProject | null>(null);
	let selectedId = $state<string | null>(null);
	let selectedPoint = $state<{ pieceId: string; index: number } | null>(null);
	let message = $state('');
	let issue = $state('');
	let saving = $state(false);
	let plan = $state<PrintPlan | null>(null);
	let planLoading = $state(false);
	let planIssue = $state('');
	let exporting = $state('');
	let paper = $state<PaperOptions>({ page: 'A4', orientation: 'portrait', calibration: true });

	let clients = $state<Client[]>([]);
	let snapshots = $state<MeasurementSnapshot[]>([]);
	let selectedClientId = $state('');
	let selectedSnapshotId = $state('');

	const selectedPiece = $derived(
		project?.pieces.find((piece) => piece.id === selectedId) ?? project?.pieces[0] ?? null
	);
	const selectedSize = $derived(selectedPiece ? pieceSizeMm(selectedPiece) : null);
	const measurementKeys = $derived(
		snapshots.find((item) => item.id === selectedSnapshotId)
			? Object.keys(snapshots.find((item) => item.id === selectedSnapshotId)!.values)
			: Object.keys(MEASUREMENT_RANGES)
	);
	const measurementOptions = $derived([
		{ value: '', label: $t('custom.notBound') },
		...measurementKeys.map((key) => ({ value: key, label: $t(`measure.${key}`) }))
	]);
	const clientOptions = $derived([
		{ value: '', label: $t('clients.chooseClient') },
		...clients.map((client) => ({ value: client.id, label: client.name }))
	]);
	const snapshotOptions = $derived([
		{ value: '', label: $t('clients.chooseSnapshot') },
		...snapshots.map((snapshot) => ({ value: snapshot.id, label: snapshot.label }))
	]);
	const projectOptions = $derived(
		projects.map((item) => ({ value: item.id, label: item.name }))
	);
	const templateOptions = $derived(
		TEMPLATES.map((item) => ({ value: item.id, label: $t(item.labelKey) }))
	);
	let template = $state<TemplateId>('rectangle');

	onMount(() => {
		try {
			projects = loadProjects();
			project = projects[0] ? $state.snapshot(projects[0]) : createProject();
			selectedId = project.pieces[0]?.id ?? null;
		} catch {
			issue = 'custom.storageError';
			project = createProject();
			selectedId = project.pieces[0]?.id ?? null;
		}
		try {
			clients = listClients();
		} catch {
			clients = [];
		}
	});

	function refreshProjects() {
		try {
			projects = loadProjects();
		} catch {
			issue = 'custom.storageError';
		}
	}

	function newProject() {
		project = createProject();
		selectedId = project.pieces[0]?.id ?? null;
		selectedPoint = null;
		message = '';
		issue = '';
		plan = null;
	}

	function openProject(id: string) {
		const found = projects.find((item) => item.id === id);
		if (!found) return;
		project = $state.snapshot(found);
		selectedId = project.pieces[0]?.id ?? null;
		selectedPoint = null;
		message = '';
		issue = '';
		plan = null;
	}

	function persist(asCopy = false) {
		if (!project) return;
		issue = '';
		if (!project.pieces.length) {
			issue = 'custom.empty';
			return;
		}
		if (!project.pieces.every((piece) => outlineIsValid(piece.outline))) {
			issue = 'custom.invalidOutline';
			return;
		}
		saving = true;
		try {
			const snapshot = $state.snapshot(project);
			const next = asCopy
				? { ...snapshot, id: crypto.randomUUID(), updated: new Date().toISOString() }
				: { ...snapshot, updated: new Date().toISOString() };
			project = saveProject(next);
			refreshProjects();
			message = asCopy ? 'custom.savedCopy' : 'custom.saved';
		} catch (error) {
			issue =
				error instanceof Error && error.message === 'custom.invalid'
					? 'custom.invalid'
					: 'custom.storageError';
		} finally {
			saving = false;
		}
	}

	function removeProject() {
		if (!project) return;
		try {
			deleteProject(project.id);
			refreshProjects();
			if (projects.length) {
				project = $state.snapshot(projects[0]);
				selectedId = project.pieces[0]?.id ?? null;
			} else {
				newProject();
			}
			message = 'custom.deleted';
		} catch {
			issue = 'custom.storageError';
		}
	}

	function addPiece() {
		if (!project) return;
		if (project.pieces.length >= 32) {
			issue = 'custom.tooManyPieces';
			return;
		}
		const piece = createPiece(template, project.pieces.length);
		project.pieces.push(piece);
		selectedId = piece.id;
		selectedPoint = null;
	}

	function removePiece() {
		if (!project || !selectedPiece) return;
		if (project.pieces.length <= 1) {
			issue = 'custom.lastPiece';
			return;
		}
		project.pieces = project.pieces.filter((piece) => piece.id !== selectedPiece.id);
		selectedId = project.pieces[0]?.id ?? null;
		selectedPoint = null;
	}

	function movePoint(pieceId: string, index: number, x: number, y: number) {
		if (!project) return;
		const piece = project.pieces.find((item) => item.id === pieceId);
		if (!piece || !piece.outline[index]) return;
		piece.outline[index] = { x, y };
	}

	function addPoint() {
		if (!selectedPiece || !selectedPoint || selectedPoint.pieceId !== selectedPiece.id) return;
		const outline = selectedPiece.outline;
		const index = selectedPoint.index;
		const a = outline[index];
		const b = outline[(index + 1) % outline.length];
		outline.splice(index + 1, 0, {
			x: Math.round(((a.x + b.x) / 2) * 10) / 10,
			y: Math.round(((a.y + b.y) / 2) * 10) / 10
		});
		selectedPoint = { pieceId: selectedPiece.id, index: index + 1 };
	}

	function removePoint() {
		if (!selectedPiece || !selectedPoint || selectedPoint.pieceId !== selectedPiece.id) return;
		if (selectedPiece.outline.length <= 3) {
			issue = 'custom.minPoints';
			return;
		}
		selectedPiece.outline.splice(selectedPoint.index, 1);
		selectedPoint = null;
	}

	function resetGrainline() {
		if (!selectedPiece) return;
		selectedPiece.grainline = makeGrainline(selectedPiece.outline);
	}

	function addNotch() {
		if (!selectedPiece || !selectedPoint) return;
		const point = selectedPiece.outline[selectedPoint.index];
		if (!point) return;
		selectedPiece.notches.push({ x: point.x, y: point.y, label: '' });
	}

	function changeNotch(index: number, axis: 'x' | 'y', value: number) {
		if (!selectedPiece || !Number.isFinite(value)) return;
		selectedPiece.notches[index][axis] = value;
	}

	function selectClient(id: string) {
		selectedClientId = id;
		selectedSnapshotId = '';
		try {
			snapshots = id ? listSnapshots(id) : [];
		} catch {
			snapshots = [];
		}
	}

	function applyClientMeasurements() {
		const snapshot = snapshots.find((item) => item.id === selectedSnapshotId);
		if (!project || !snapshot) return;
		let changed = 0;
		for (const piece of project.pieces) {
			if (applyBinding(piece, snapshot.values)) changed++;
		}
		message = changed ? 'custom.measurementsApplied' : 'custom.noBindings';
	}

	function setBindingMeasurement(axis: 'width' | 'height', raw: string) {
		if (!selectedPiece) return;
		const value = raw.trim() || null;
		if (axis === 'width') selectedPiece.binding.widthMeasurement = value;
		else selectedPiece.binding.heightMeasurement = value;
	}

	function setBindingNumber(
		axis: 'width' | 'height',
		field: 'factor' | 'offset',
		value: number
	) {
		if (!selectedPiece || !Number.isFinite(value)) return;
		if (axis === 'width') {
			if (field === 'factor') selectedPiece.binding.widthFactor = Math.max(0.01, value);
			else selectedPiece.binding.widthOffsetMm = value;
		} else {
			if (field === 'factor') selectedPiece.binding.heightFactor = Math.max(0.01, value);
			else selectedPiece.binding.heightOffsetMm = value;
		}
	}

	function payload() {
		return project ? projectPayload(project) : { pieces: [] };
	}

	function download(format: 'svg' | 'dxf' | 'pdf') {
		if (!project) return;
		exporting = format;
		issue = '';
		customExport(payload(), format, paper)
			.then((blob) => {
				const url = URL.createObjectURL(blob);
				const link = document.createElement('a');
				link.href = url;
				link.download = `shityo-custom.${format}`;
				link.click();
				setTimeout(() => URL.revokeObjectURL(url), 1000);
			})
			.catch((error) => {
				issue = error instanceof Error ? error.message : String(error);
			})
			.finally(() => {
				exporting = '';
			});
	}

	function refreshPlan() {
		if (!project) return;
		planLoading = true;
		planIssue = '';
		customPrintPlan(payload(), paper)
			.then((next) => {
				plan = next;
			})
			.catch((error) => {
				plan = null;
				planIssue = error instanceof Error ? error.message : String(error);
			})
			.finally(() => {
				planLoading = false;
			});
	}

	async function checkOnServer() {
		if (!project) return;
		issue = '';
		try {
			await customGenerate(payload());
			message = 'custom.checked';
		} catch (error) {
			issue = error instanceof Error ? error.message : String(error);
		}
	}

	$effect(() => {
		if (!project) return;
		const snapshot = JSON.stringify(project);
		const timer = setTimeout(() => {
			if (JSON.stringify(project) === snapshot) refreshPlan();
		}, 400);
		return () => clearTimeout(timer);
	});
</script>

<svelte:head>
	<title>{$t('custom.title')} — Shityo</title>
</svelte:head>

{#if project}
	<div class="editor" data-testid="custom-editor">
		<aside class="side left" aria-label={$t('custom.pieces')}>
			<section class="panel">
				<h2>{$t('custom.project')}</h2>
				<SelectField
					id="custom-project"
					size="sm"
					label={$t('custom.open')}
					options={projectOptions}
					value={project.id}
					onchange={(event) => openProject(event.currentTarget.value)}
				/>
				<TextField
					id="custom-name"
					size="sm"
					label={$t('custom.name')}
					value={project.name}
					oninput={(event: Event) => {
						if (project) project.name = (event.currentTarget as HTMLInputElement).value;
					}}
				/>
				<div class="actions">
					<Button size="sm" data-testid="custom-save" onclick={() => persist()} disabled={saving}>{$t('custom.save')}</Button>
					<Button size="sm" variant="quiet" onclick={() => persist(true)} disabled={saving}>{$t('custom.saveCopy')}</Button>
				</div>
				<div class="actions">
					<Button size="sm" variant="quiet" onclick={newProject}>{$t('custom.new')}</Button>
					<Button size="sm" variant="quiet" onclick={() => downloadProject(project!)}>{$t('custom.exportJson')}</Button>
					<Button size="sm" variant="danger" onclick={removeProject}>{$t('custom.delete')}</Button>
				</div>
			</section>

			<section class="panel">
				<h2>{$t('custom.client')}</h2>
				<SelectField
					id="custom-client"
					size="sm"
					label={$t('custom.client')}
					options={clientOptions}
					value={selectedClientId}
					onchange={(event) => selectClient(event.currentTarget.value)}
				/>
				<SelectField
					id="custom-client-snapshot"
					size="sm"
					label={$t('custom.clientSnapshot')}
					options={snapshotOptions}
					value={selectedSnapshotId}
					disabled={!selectedClientId}
					onchange={(event) => (selectedSnapshotId = event.currentTarget.value)}
				/>
				<Button size="sm" disabled={!selectedSnapshotId} onclick={applyClientMeasurements}>
					{$t('custom.applyMeasurements')}
				</Button>
			</section>

			<section class="panel">
				<h2>{$t('custom.pieces')}</h2>
				<ul class="piece-list">
					{#each project.pieces as piece (piece.id)}
						<li>
							<button
								class:active={piece.id === selectedId}
								onclick={() => {
									selectedId = piece.id;
									selectedPoint = null;
								}}
							>
								<span>{piece.name}</span>
								<span class="num">{piece.outline.length}</span>
							</button>
						</li>
					{/each}
				</ul>
				<SelectField
					id="custom-template"
					size="sm"
					label={$t('custom.template')}
					options={templateOptions}
					value={template}
					onchange={(event) => (template = event.currentTarget.value as TemplateId)}
				/>
				<Button size="sm" data-testid="custom-add-piece" onclick={addPiece}>{$t('custom.addPiece')}</Button>
				<Button size="sm" variant="quiet" onclick={removePiece}>{$t('custom.removePiece')}</Button>
			</section>
		</aside>

		<main class="center">
			<CustomCanvas
				pieces={project.pieces}
				{selectedId}
				{selectedPoint}
				onSelectPiece={(id) => {
					selectedId = id;
					selectedPoint = null;
				}}
				onSelectPoint={(pieceId, index) => {
					selectedPoint = { pieceId, index };
					selectedId = pieceId;
				}}
				onMovePoint={movePoint}
			/>
		</main>

		<aside class="side right" aria-label={$t('custom.properties')}>
			{#if selectedPiece}
				<section class="panel">
					<h2>{$t('custom.properties')}</h2>
					<TextField
						id="piece-name"
						size="sm"
						label={$t('custom.pieceName')}
						value={selectedPiece.name}
						oninput={(event: Event) => {
							if (selectedPiece) selectedPiece.name = (event.currentTarget as HTMLInputElement).value;
						}}
					/>
					<TextField
						id="piece-cut"
						size="sm"
						type="number"
						label={$t('custom.cut')}
						value={String(selectedPiece.cut)}
						min={1}
						max={8}
						step={1}
						onchange={(event) => {
							if (!selectedPiece) return;
							const value = Number(event.currentTarget.value);
							if (Number.isInteger(value) && value >= 1 && value <= 8) selectedPiece.cut = value;
						}}
					/>
					<TextField
						id="piece-seam"
						size="sm"
						type="number"
						label={$t('custom.seam')}
						value={String(selectedPiece.seam_allowance_mm)}
						min={0}
						max={50}
						step={0.5}
						onchange={(event) => {
							if (!selectedPiece) return;
							const value = Number(event.currentTarget.value);
							if (Number.isFinite(value) && value >= 0 && value <= 50) {
								selectedPiece.seam_allowance_mm = value;
							}
						}}
					/>
					<Checkbox
						checked={selectedPiece.smooth}
						onchange={(event) => {
							if (selectedPiece) selectedPiece.smooth = event.currentTarget.checked;
						}}
					>
						{$t('custom.smooth')}
					</Checkbox>
					<Checkbox
						checked={selectedPiece.mirrored}
						onchange={(event) => {
							if (selectedPiece) selectedPiece.mirrored = event.currentTarget.checked;
						}}
					>
						{$t('custom.mirrored')}
					</Checkbox>
					<div class="actions">
						<Button size="sm" variant="quiet" onclick={resetGrainline}>{$t('custom.grainline')}</Button>
						<Button size="sm" variant="quiet" onclick={addNotch} disabled={!selectedPoint}>{$t('custom.addNotch')}</Button>
					</div>
				</section>

				<section class="panel">
					<h2>{$t('custom.binding')}</h2>
					{#if selectedSize}
						<p class="status">
							{$t('custom.currentSize', {
								width: (selectedSize.width / 10).toFixed(1),
								height: (selectedSize.height / 10).toFixed(1)
							})}
						</p>
					{/if}
					<SelectField
						id="binding-width"
						size="sm"
						label={$t('custom.widthBy')}
						options={measurementOptions}
						value={selectedPiece.binding.widthMeasurement ?? ''}
						onchange={(event) => setBindingMeasurement('width', event.currentTarget.value)}
					/>
					<div class="binding-row">
						<TextField
							id="binding-width-factor"
							size="sm"
							type="number"
							label={$t('custom.factor')}
							value={String(selectedPiece.binding.widthFactor)}
							min={0.01}
							step={0.1}
							onchange={(event) =>
								setBindingNumber('width', 'factor', Number(event.currentTarget.value))}
						/>
						<TextField
							id="binding-width-offset"
							size="sm"
							type="number"
							label={$t('custom.offset')}
							value={String(selectedPiece.binding.widthOffsetMm)}
							step={1}
							onchange={(event) =>
								setBindingNumber('width', 'offset', Number(event.currentTarget.value))}
						/>
					</div>
					<SelectField
						id="binding-height"
						size="sm"
						label={$t('custom.heightBy')}
						options={measurementOptions}
						value={selectedPiece.binding.heightMeasurement ?? ''}
						onchange={(event) => setBindingMeasurement('height', event.currentTarget.value)}
					/>
					<div class="binding-row">
						<TextField
							id="binding-height-factor"
							size="sm"
							type="number"
							label={$t('custom.factor')}
							value={String(selectedPiece.binding.heightFactor)}
							min={0.01}
							step={0.1}
							onchange={(event) =>
								setBindingNumber('height', 'factor', Number(event.currentTarget.value))}
						/>
						<TextField
							id="binding-height-offset"
							size="sm"
							type="number"
							label={$t('custom.offset')}
							value={String(selectedPiece.binding.heightOffsetMm)}
							step={1}
							onchange={(event) =>
								setBindingNumber('height', 'offset', Number(event.currentTarget.value))}
						/>
					</div>
				</section>

				<section class="panel">
					<h2>{$t('custom.points')}</h2>
					<ul class="point-list">
						{#each selectedPiece.outline as point, index (index)}
							<li class:active={selectedPoint?.index === index && selectedPoint?.pieceId === selectedPiece.id}>
								<button onclick={() => (selectedPoint = { pieceId: selectedPiece.id, index })}>
									<span class="num">{index + 1}</span>
									<span class="num">{Math.round(point.x) / 10}, {Math.round(point.y) / 10} {$t('unit.cm')}</span>
								</button>
							</li>
						{/each}
					</ul>
					<div class="actions">
						<Button size="sm" variant="quiet" onclick={addPoint} disabled={!selectedPoint}>{$t('custom.addPoint')}</Button>
						<Button size="sm" variant="quiet" onclick={removePoint} disabled={!selectedPoint}>{$t('custom.removePoint')}</Button>
					</div>
					{#if selectedPiece.notches.length}
						<div class="notches">
							<h3>{$t('custom.notches')}</h3>
							{#each selectedPiece.notches as notch, index (index)}
								<div class="notch-row">
									<TextField
										size="sm"
										type="number"
										label="X"
										value={String(notch.x)}
										onchange={(event) => changeNotch(index, 'x', Number(event.currentTarget.value))}
									/>
									<TextField
										size="sm"
										type="number"
										label="Y"
										value={String(notch.y)}
										onchange={(event) => changeNotch(index, 'y', Number(event.currentTarget.value))}
									/>
									<Button
										size="sm"
										variant="quiet"
										onclick={() => {
											if (selectedPiece) selectedPiece.notches.splice(index, 1);
										}}
									>
										{$t('custom.remove')}
									</Button>
								</div>
							{/each}
						</div>
					{/if}
				</section>

				<section class="panel">
					<h2>{$t('custom.print')}</h2>
					<SelectField
						id="custom-paper"
						size="sm"
						label={$t('print.paper')}
						value={paper.page}
						options={[
							...['A4', 'A3', 'A2', 'A1', 'A0'].map((value) => ({ value, label: value })),
							{ value: 'FULL', label: $t('print.full') }
						]}
						onchange={(event) => {
							paper.page = event.currentTarget.value as PaperOptions['page'];
							paper.calibration = paper.page !== 'FULL';
						}}
					/>
					{#if paper.page !== 'FULL'}
						<SelectField
							id="custom-orientation"
							size="sm"
							label={$t('print.orientation')}
							value={paper.orientation}
							options={[
								{ value: 'portrait', label: $t('print.portrait') },
								{ value: 'landscape', label: $t('print.landscape') }
							]}
							onchange={(event) => (paper.orientation = event.currentTarget.value as PaperOptions['orientation'])}
						/>
					{/if}
					<p class="status" aria-live="polite">
						{#if planLoading}{$t('print.loading')}
						{:else if planIssue}{$t('print.unavailable', { reason: planIssue })}
						{:else if plan}{$t('print.count', { count: plan.page_count })}
						{/if}
					</p>
					<div class="actions">
						<Button size="sm" data-testid="custom-export-pdf" onclick={() => download('pdf')} disabled={!!exporting}>{$t('custom.pdf')}</Button>
						<Button size="sm" variant="quiet" data-testid="custom-export-svg" onclick={() => download('svg')} disabled={!!exporting}>{$t('custom.svg')}</Button>
						<Button size="sm" variant="quiet" data-testid="custom-export-dxf" onclick={() => download('dxf')} disabled={!!exporting}>{$t('custom.dxf')}</Button>
					</div>
					<Button size="sm" variant="quiet" onclick={checkOnServer}>{$t('custom.check')}</Button>
				</section>
			{/if}
			{#if message}<p class="ok" role="status">{$t(message)}</p>{/if}
			{#if issue}<p class="error" role="alert">{$t(issue)}</p>{/if}
		</aside>
	</div>
{:else}
	<div class="loading" data-testid="custom-loading">{$t('custom.loading')}</div>
{/if}

<style>
	.editor {
		display: grid;
		grid-template-columns: 280px minmax(0, 1fr) 320px;
		height: 100%;
		min-height: 0;
	}
	.side {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		overflow-y: auto;
		min-height: 0;
		padding: var(--space-4);
	}
	.side.left {
		border-right: 1px solid var(--ui-line);
	}
	.side.right {
		border-left: 1px solid var(--ui-line);
	}
	.center {
		min-height: 0;
		min-width: 0;
		display: flex;
	}
	.panel {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}
	h2 {
		margin: 0;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--ui-ink-muted);
		padding-bottom: var(--space-2);
		border-bottom: 1px solid var(--ui-line);
	}
	h3 {
		margin: 0;
		font-size: 12px;
		font-weight: 600;
		color: var(--ui-ink-soft);
	}
	.actions {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
	.piece-list,
	.point-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-half);
		max-height: 220px;
		overflow-y: auto;
	}
	.piece-list button,
	.point-list button {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		background: none;
		border: 1px solid transparent;
		padding: var(--space-1) var(--space-2);
		font-size: 13px;
		text-align: left;
		color: var(--ui-ink-soft);
		cursor: pointer;
	}
	.piece-list button:hover,
	.point-list button:hover,
	.piece-list button.active,
	.point-list li.active button {
		color: var(--ui-accent);
		border-color: var(--ui-accent);
	}
	.notches {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.notch-row {
		display: grid;
		grid-template-columns: 1fr 1fr auto;
		gap: var(--space-2);
		align-items: end;
	}
	.binding-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-2);
		align-items: end;
	}
	.status {
		margin: 0;
		font-size: 12px;
		line-height: 1.5;
		color: var(--ui-ink-soft);
	}
	.ok,
	.error {
		margin: 0;
		font-size: 12px;
		line-height: 1.5;
	}
	.ok {
		color: var(--ui-accent);
	}
	.error {
		color: var(--ui-danger-text, #b42318);
	}
	.loading {
		padding: var(--space-6);
		font-size: 13px;
		color: var(--ui-ink-muted);
	}
	@media (max-width: 1180px) {
		.editor {
			grid-template-columns: 240px minmax(0, 1fr) 280px;
		}
	}
	@media (max-width: 767px) {
		.editor {
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: minmax(0, 1fr) auto;
		}
		.center {
			grid-row: 1;
		}
		.side {
			max-height: 45dvh;
			border: 0;
			border-top: 1px solid var(--ui-line);
		}
	}
</style>
