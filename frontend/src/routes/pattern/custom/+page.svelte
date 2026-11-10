<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { Redo2, Undo2 } from 'lucide-svelte';
	import { Button, TextField, SelectField, Checkbox } from '@monos/ui';
	import CustomCanvas from '$lib/components/CustomCanvas.svelte';
	import Crumbs from '$lib/components/Crumbs.svelte';
	import { t } from '$lib/i18n';
	import { customExport, customGenerate, customPrintPlan } from '$lib/api';
	import {
		TEMPLATES,
		SEAM_TOLERANCE_MM,
		applyBinding,
		arrangePieces,
		piecesFor3d,
		clearFold,
		dartAt,
		edgeLength,
		refreshDarts,
		seamCheck,
		setFold,
		shiftAfterInsert,
		shiftAfterRemove,
		shortId,
		type EdgeRef,
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
	// 3D - для выкроек, перенесённых из основы: собираются её сборкой.
	let show3d = $state(false);
	const pieces3d = $derived(project?.source && show3d ? piecesFor3d(project) : []);

	// Отмена и повтор: снимки проекта; серия правок подряд (перетаскивание
	// точки) - один шаг.
	let past = $state<string[]>([]);
	let future = $state<string[]>([]);
	let lastSnap = '';
	let restoring = false;
	$effect(() => {
		if (!project) return;
		const snap = JSON.stringify(project);
		if (restoring) {
			restoring = false;
			lastSnap = snap;
			return;
		}
		if (snap === lastSnap) return;
		const timer = setTimeout(() => {
			if (lastSnap) {
				past = [...past.slice(-99), lastSnap];
				future = [];
			}
			lastSnap = snap;
		}, 300);
		return () => clearTimeout(timer);
	});
	function resetHistory() {
		past = [];
		future = [];
		lastSnap = project ? JSON.stringify(project) : '';
	}
	function restore(snap: string) {
		restoring = true;
		project = JSON.parse(snap) as CustomProject;
		lastSnap = snap;
		selectedPoint = null;
	}
	function undo() {
		if (!project) return;
		const current = JSON.stringify(project);
		const previous = current !== lastSnap ? lastSnap : past[past.length - 1];
		if (!previous) return;
		if (current === lastSnap) past = past.slice(0, -1);
		future = [...future, current];
		restore(previous);
	}
	function redo() {
		const next = future[future.length - 1];
		if (!project || !next) return;
		future = future.slice(0, -1);
		past = [...past, JSON.stringify(project)];
		restore(next);
	}
	function shortcut(event: KeyboardEvent) {
		const target = event.target as HTMLElement | null;
		if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
		if (!(event.ctrlKey || event.metaKey)) return;
		const key = event.code;
		if (key === 'KeyZ' && !event.shiftKey) {
			event.preventDefault();
			undo();
		} else if ((key === 'KeyZ' && event.shiftKey) || key === 'KeyY') {
			event.preventDefault();
			redo();
		}
	}

	// Вытачки и сгиб: раствор и длина в сантиметрах, как в остальных полях.
	let dartWidth = $state(2);
	let dartDepth = $state(10);

	// Срезы и сверка швов.
	let edgeLabel = $state('');
	let edgeFrom = $state(1);
	let edgeTo = $state(2);
	let seamA = $state('');
	let seamA2 = $state('');
	let seamB = $state('');
	let seamB2 = $state('');
	let hover = $state<EdgeRef[]>([]);
	const edgeOptions = $derived([
		{ value: '', label: $t('custom.edgeChoose') },
		...(project?.pieces ?? []).flatMap((piece) =>
			(piece.edges ?? []).map((edge) => ({
				value: `${piece.id}|${edge.id}`,
				label: `${piece.name}: ${edge.label || $t('custom.edgeUnnamed')}`
			}))
		)
	]);
	const refOf = (value: string): EdgeRef | null => {
		const [piece, edge] = value.split('|');
		return piece && edge ? { piece, edge } : null;
	};
	function refLabel(ref: EdgeRef): string {
		const piece = project?.pieces.find((item) => item.id === ref.piece);
		const edge = piece?.edges?.find((item) => item.id === ref.edge);
		return piece && edge ? `${piece.name}: ${edge.label || $t('custom.edgeUnnamed')}` : '?';
	}

	onMount(async () => {
		try {
			projects = await loadProjects();
			// Ссылка ?project= открывает нужную выкройку (например, перенесённую основу).
			const wanted = projects.find((item) => item.id === page.url.searchParams.get('project'));
			const first = wanted ?? projects[0];
			project = first ? $state.snapshot(first) : createProject();
			selectedId = project.pieces[0]?.id ?? null;
			resetHistory();
		} catch {
			issue = 'custom.storageError';
			project = createProject();
			selectedId = project.pieces[0]?.id ?? null;
		}
		try {
			clients = await listClients();
		} catch {
			clients = [];
		}
	});

	async function refreshProjects() {
		try {
			projects = await loadProjects();
		} catch {
			issue = 'custom.storageError';
		}
	}

	function newProject() {
		project = createProject();
		resetHistory();
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
		resetHistory();
		selectedId = project.pieces[0]?.id ?? null;
		selectedPoint = null;
		message = '';
		issue = '';
		plan = null;
	}

	async function persist(asCopy = false) {
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
			project = await saveProject(next);
			await refreshProjects();
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

	async function removeProject() {
		if (!project) return;
		try {
			await deleteProject(project.id);
			await refreshProjects();
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
		// Новая деталь ложится справа от остальных, а не поверх.
		const right = Math.max(
			0,
			...project.pieces.map((item) => Math.max(...item.outline.map((p) => p.x)) + (item.offset?.x ?? 0))
		);
		piece.offset = { x: project.pieces.length ? right + 80 : 0, y: 0 };
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
		const removed = selectedPiece.id;
		project.pieces = project.pieces.filter((piece) => piece.id !== removed);
		project.seams = (project.seams ?? []).filter(
			(seam) => ![...seam.a, ...seam.b].some((ref) => ref.piece === removed)
		);
		selectedId = project.pieces[0]?.id ?? null;
		selectedPoint = null;
	}

	function movePoint(pieceId: string, index: number, x: number, y: number) {
		if (!project) return;
		const piece = project.pieces.find((item) => item.id === pieceId);
		if (!piece || !piece.outline[index]) return;
		piece.outline[index] = { x, y };
		refreshDarts(piece);
	}

	function arrange() {
		if (project) arrangePieces(project.pieces);
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
		shiftAfterInsert(selectedPiece, index + 1);
		refreshDarts(selectedPiece);
		selectedPoint = { pieceId: selectedPiece.id, index: index + 1 };
	}

	function removePoint() {
		if (!selectedPiece || !selectedPoint || selectedPoint.pieceId !== selectedPiece.id) return;
		if (selectedPiece.outline.length <= 3) {
			issue = 'custom.minPoints';
			return;
		}
		selectedPiece.outline.splice(selectedPoint.index, 1);
		shiftAfterRemove(selectedPiece, selectedPoint.index);
		refreshDarts(selectedPiece);
		dropDeadSeams();
		selectedPoint = null;
	}

	function dropDeadSeams() {
		if (!project) return;
		const alive = (ref: EdgeRef) =>
			project!.pieces.some((piece) => piece.id === ref.piece && piece.edges?.some((edge) => edge.id === ref.edge));
		project.seams = (project.seams ?? []).filter((seam) => seam.a.every(alive) && seam.b.every(alive));
	}

	function addDart() {
		if (!selectedPiece || !selectedPoint || selectedPoint.pieceId !== selectedPiece.id) return;
		const dart = dartAt(selectedPiece, selectedPoint.index, dartWidth * 10, dartDepth * 10);
		if (!dart) {
			issue = 'custom.dartInvalid';
			return;
		}
		selectedPiece.internal_lines.push(dart);
		issue = '';
	}

	function changeDart(index: number, field: 'width' | 'depth', cm: number) {
		if (!selectedPiece || !Number.isFinite(cm) || cm <= 0) return;
		const line = selectedPiece.internal_lines[index];
		if (!line || line.anchor === undefined) return;
		line[field] = cm * 10;
		refreshDarts(selectedPiece);
	}

	function addFold() {
		if (!selectedPiece || !selectedPoint || selectedPoint.pieceId !== selectedPiece.id) return;
		if (!setFold(selectedPiece, selectedPoint.index)) {
			issue = 'custom.foldVertical';
			return;
		}
		issue = '';
		message = 'custom.foldSet';
	}

	function addEdge() {
		if (!selectedPiece) return;
		const count = selectedPiece.outline.length;
		const from = Math.round(edgeFrom) - 1;
		const to = Math.round(edgeTo) - 1;
		if (from < 0 || to < 0 || from >= count || to >= count || from === to) {
			issue = 'custom.edgeInvalid';
			return;
		}
		selectedPiece.edges = [
			...(selectedPiece.edges ?? []),
			{ id: shortId(), label: edgeLabel.trim().slice(0, 60), from, to, takeUpMm: 0 }
		];
		edgeLabel = '';
		issue = '';
	}

	function removeEdge(id: string) {
		if (!selectedPiece) return;
		selectedPiece.edges = (selectedPiece.edges ?? []).filter((edge) => edge.id !== id);
		dropDeadSeams();
	}

	function addSeam() {
		if (!project) return;
		const a = [seamA, seamA2].map(refOf).filter((ref): ref is EdgeRef => ref !== null);
		const b = [seamB, seamB2].map(refOf).filter((ref): ref is EdgeRef => ref !== null);
		if (!a.length || !b.length) {
			issue = 'custom.seamInvalid';
			return;
		}
		project.seams = [...(project.seams ?? []), { id: shortId(), a, b, easeMm: 0 }];
		seamA = seamA2 = seamB = seamB2 = '';
		issue = '';
	}

	function fmt(mm: number): string {
		return (Math.round(mm) / 10).toFixed(1);
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

	async function selectClient(id: string) {
		selectedClientId = id;
		selectedSnapshotId = '';
		try {
			snapshots = id ? await listSnapshots(id) : [];
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

<svelte:window onkeydown={shortcut} />

<div class="custom-page">
<header class="custom-bar">
	<Crumbs trail={[{ label: 'app.catalog', href: '/' }]}><span class="current">{$t('custom.title')}</span></Crumbs>
</header>
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
					<Button size="sm" variant="quiet" onclick={undo} disabled={!past.length} data-testid="custom-undo" aria-label={$t('project.undo')}><Undo2 size={14} aria-hidden="true" />{$t('project.undo')}</Button>
					<Button size="sm" variant="quiet" onclick={redo} disabled={!future.length} data-testid="custom-redo" aria-label={$t('project.redo')}><Redo2 size={14} aria-hidden="true" />{$t('project.redo')}</Button>
				</div>
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
				<Button size="sm" variant="quiet" onclick={arrange} data-testid="custom-arrange">{$t('custom.arrange')}</Button>
			</section>
		</aside>

		<main class="center">
			{#if project.source}
				<div class="view-switch" role="group" aria-label={$t('workspace.view')}>
					<button type="button" class="seg" class:on={!show3d} aria-pressed={!show3d} onclick={() => (show3d = false)} data-testid="custom-2d">2D</button>
					<button type="button" class="seg" class:on={show3d} aria-pressed={show3d} onclick={() => (show3d = true)} data-testid="custom-3d">3D</button>
				</div>
			{/if}
			{#if show3d && project.source}
				{#await import('$lib/components/Preview3D.svelte') then preview}
					<preview.default measurements={project.source.measurements} pieces={pieces3d as never} model={project.source.model} gender={project.source.gender} />
				{/await}
			{:else}
			<CustomCanvas
				pieces={project.pieces}
				{selectedId}
				{selectedPoint}
				highlight={hover}
				onSelectPiece={(id) => {
					selectedId = id;
					selectedPoint = null;
				}}
				onSelectPoint={(pieceId, index) => {
					selectedPoint = { pieceId, index };
					selectedId = pieceId;
					edgeFrom = edgeTo;
					edgeTo = index + 1;
				}}
				onMovePoint={movePoint}
			/>
			{/if}
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

				<section class="panel" data-testid="custom-darts">
					<h2>{$t('custom.dartsFold')}</h2>
					<p class="status">{$t('custom.dartsHint')}</p>
					<div class="binding-row">
						<TextField id="dart-width" size="sm" type="number" label={$t('custom.dartWidth')} value={String(dartWidth)} min={0.2} step={0.1} onchange={(event) => (dartWidth = Number(event.currentTarget.value) || dartWidth)} />
						<TextField id="dart-depth" size="sm" type="number" label={$t('custom.dartDepth')} value={String(dartDepth)} min={0.5} step={0.5} onchange={(event) => (dartDepth = Number(event.currentTarget.value) || dartDepth)} />
					</div>
					<div class="actions">
						<Button size="sm" variant="quiet" onclick={addDart} disabled={!selectedPoint} data-testid="custom-add-dart">{$t('custom.addDart')}</Button>
						<Button size="sm" variant="quiet" onclick={addFold} disabled={!selectedPoint} data-testid="custom-add-fold">{$t('custom.addFold')}</Button>
						{#if selectedPiece.internal_lines.some((line) => line.type === 'fold')}
							<Button size="sm" variant="quiet" onclick={() => selectedPiece && clearFold(selectedPiece)}>{$t('custom.clearFold')}</Button>
						{/if}
					</div>
					{#each selectedPiece.internal_lines as line, index (index)}
						{#if line.type === 'dart' && line.anchor !== undefined}
							<div class="notch-row">
								<TextField size="sm" type="number" label={$t('custom.dartWidth')} value={String((line.width ?? 0) / 10)} step={0.1} onchange={(event) => changeDart(index, 'width', Number(event.currentTarget.value))} />
								<TextField size="sm" type="number" label={$t('custom.dartDepth')} value={String((line.depth ?? 0) / 10)} step={0.5} onchange={(event) => changeDart(index, 'depth', Number(event.currentTarget.value))} />
								<Button size="sm" variant="quiet" onclick={() => selectedPiece && selectedPiece.internal_lines.splice(index, 1)}>{$t('custom.remove')}</Button>
							</div>
						{/if}
					{/each}
				</section>

				<section class="panel" data-testid="custom-edges">
					<h2>{$t('custom.edges')}</h2>
					<p class="status">{$t('custom.edgesHint')}</p>
					{#if selectedPiece.edges?.length}
						<ul class="edge-list">
							{#each selectedPiece.edges as edge (edge.id)}
								<li
									onpointerenter={() => (hover = [{ piece: selectedPiece.id, edge: edge.id }])}
									onpointerleave={() => (hover = [])}
								>
									<span>{edge.label || $t('custom.edgeUnnamed')}</span>
									<span class="num">{edge.from + 1}–{edge.to + 1}</span>
									<span class="num">{fmt(edgeLength(selectedPiece, edge))} {$t('unit.cm')}</span>
									<input
										class="registry-field ease-input num"
										type="number"
										min="0"
										max="50"
										step="1"
										placeholder={String(selectedPiece.seam_allowance_mm)}
										value={edge.allowanceMm ?? ''}
										aria-label={$t('custom.edgeAllowance', { name: edge.label || $t('custom.edgeUnnamed') })}
										title={$t('custom.edgeAllowanceHint')}
										data-testid="custom-edge-allowance"
										onchange={(event) => {
											const raw = event.currentTarget.value.trim();
											const value = Number(raw);
											edge.allowanceMm = raw === '' || !Number.isFinite(value) ? null : Math.max(0, Math.min(50, value));
										}}
									/>
									<button type="button" class="link-button" onclick={() => removeEdge(edge.id)}>{$t('custom.remove')}</button>
								</li>
							{/each}
						</ul>
					{/if}
					<TextField id="edge-label" size="sm" label={$t('custom.edgeName')} value={edgeLabel} oninput={(event: Event) => (edgeLabel = (event.currentTarget as HTMLInputElement).value)} />
					<div class="binding-row">
						<TextField id="edge-from" size="sm" type="number" label={$t('custom.edgeFrom')} value={String(edgeFrom)} min={1} step={1} onchange={(event) => (edgeFrom = Number(event.currentTarget.value))} />
						<TextField id="edge-to" size="sm" type="number" label={$t('custom.edgeTo')} value={String(edgeTo)} min={1} step={1} onchange={(event) => (edgeTo = Number(event.currentTarget.value))} />
					</div>
					<Button size="sm" variant="quiet" onclick={addEdge} data-testid="custom-add-edge">{$t('custom.addEdge')}</Button>
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
			<section class="panel" data-testid="custom-seams">
				<h2>{$t('custom.seams')}</h2>
				<p class="status">{$t('custom.seamsHint', { tolerance: SEAM_TOLERANCE_MM / 10 })}</p>
				{#each project.seams ?? [] as seam (seam.id)}
					{@const check = seamCheck(project, seam)}
					<div
						class="seam-row"
						class:bad={check && !check.ok}
						data-testid="custom-seam"
						role="group"
						onpointerenter={() => (hover = [...seam.a, ...seam.b])}
						onpointerleave={() => (hover = [])}
					>
						<span class="seam-side">{seam.a.map(refLabel).join(' + ')}</span>
						<span class="seam-side">{seam.b.map(refLabel).join(' + ')}</span>
						<div class="seam-meta">
							{#if check}
								<span class="num">{fmt(check.a)} / {fmt(check.b)} {$t('unit.cm')}</span>
								<span class="num seam-diff" data-testid="custom-seam-diff">{check.ok ? $t('custom.seamOk') : $t('custom.seamDiff', { value: fmt(check.diff) })}</span>
							{/if}
							<label class="ease">
								<span>{$t('custom.seamEase')}</span>
								<input class="registry-field ease-input num" type="number" step="0.1" value={seam.easeMm / 10} onchange={(event) => {
									const value = Number(event.currentTarget.value);
									if (Number.isFinite(value)) seam.easeMm = value * 10;
								}} />
							</label>
							<button type="button" class="link-button" onclick={() => project && (project.seams = (project.seams ?? []).filter((item) => item.id !== seam.id))}>{$t('custom.remove')}</button>
						</div>
					</div>
				{/each}
				{#if edgeOptions.length > 1}
					<div class="seam-add">
						<SelectField id="seam-a" size="sm" label={$t('custom.seamA')} options={edgeOptions} value={seamA} onchange={(event) => (seamA = event.currentTarget.value)} />
						<SelectField id="seam-a2" size="sm" label={$t('custom.seamPlus')} options={edgeOptions} value={seamA2} onchange={(event) => (seamA2 = event.currentTarget.value)} />
						<SelectField id="seam-b" size="sm" label={$t('custom.seamB')} options={edgeOptions} value={seamB} onchange={(event) => (seamB = event.currentTarget.value)} />
						<SelectField id="seam-b2" size="sm" label={$t('custom.seamPlus')} options={edgeOptions} value={seamB2} onchange={(event) => (seamB2 = event.currentTarget.value)} />
						<Button size="sm" variant="quiet" onclick={addSeam} data-testid="custom-add-seam">{$t('custom.addSeam')}</Button>
					</div>
				{:else}
					<p class="status">{$t('custom.seamsEmpty')}</p>
				{/if}
			</section>
			{#if message}<p class="ok" role="status">{$t(message)}</p>{/if}
			{#if issue}<p class="error" role="alert">{$t(issue)}</p>{/if}
		</aside>
	</div>
{:else}
	<div class="loading" data-testid="custom-loading">{$t('custom.loading')}</div>
{/if}
</div>

<style>
	.center {
		position: relative;
	}
	.view-switch {
		position: absolute;
		top: 8px;
		left: 8px;
		z-index: 3;
		display: flex;
		border: 1px solid var(--ui-line);
		border-radius: var(--ui-radius);
		overflow: hidden;
		background: var(--ui-surface);
	}
	.seg {
		height: 28px;
		padding: 0 var(--space-3);
		border: 0;
		background: none;
		font: inherit;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.12em;
		color: var(--ui-ink-soft);
		cursor: pointer;
	}
	.seg.on {
		background: var(--ui-accent);
		color: var(--ui-surface);
	}
	.edge-list {
		display: flex;
		flex-direction: column;
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: 12px;
	}
	.edge-list li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto auto 56px auto;
		gap: var(--space-2);
		align-items: baseline;
		padding: var(--space-1) 0;
		border-bottom: 1px solid var(--ui-line);
	}
	.link-button {
		padding: 0;
		border: 0;
		background: none;
		font: inherit;
		color: var(--ui-ink-soft);
		text-decoration: underline;
		text-underline-offset: 3px;
		cursor: pointer;
	}
	.seam-row {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		padding: var(--space-2) 0;
		border-bottom: 1px solid var(--ui-line);
		font-size: 12px;
	}
	.seam-side {
		color: var(--ui-ink);
	}
	.seam-diff {
		color: var(--ui-ink-soft);
	}
	.seam-row.bad .seam-diff {
		color: var(--ui-danger-text, var(--ui-accent-text));
		font-weight: 600;
	}
	.seam-meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-3);
		color: var(--ui-ink-soft);
	}
	.ease {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
	}
	.ease-input,
	.edge-list .ease-input {
		width: 64px;
		height: 24px;
	}
	.seam-add {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.custom-page {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
	}
	.custom-bar {
		display: flex;
		align-items: center;
		min-height: 44px;
		padding: var(--space-2) var(--space-4);
		border-bottom: 1px solid var(--ui-line);
		flex-shrink: 0;
	}
	.current {
		font-size: 13px;
		font-weight: 700;
		color: var(--ui-ink);
	}
	.editor {
		display: grid;
		grid-template-columns: 280px minmax(0, 1fr) 320px;
		flex: 1;
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
