<script lang="ts">
	import ProjectPanel from '$lib/components/ProjectPanel.svelte';
 import ShapeControls from '$lib/components/ShapeControls.svelte';
 import {loadProjects,saveProject,validateProject,downloadProject,type DesignState,type DesignProject} from '$lib/projects';
 import { Button } from '@monos/ui';
 import ClientProfiles from '$lib/components/ClientProfiles.svelte';
 import SeamInspector from '$lib/components/SeamInspector.svelte';
 import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { PatternStore, providePatternStore } from '$lib/stores.svelte';
	import ExportPanel from '$lib/components/ExportPanel.svelte';
	import MeasureHero from '$lib/components/MeasureHero.svelte';
	import ParamPanel from '$lib/components/ParamPanel.svelte';
	import PieceCanvas from '$lib/components/PieceCanvas.svelte';
	import PieceList from '$lib/components/PieceList.svelte';
	import SizeGrid from '$lib/components/SizeGrid.svelte';
	import Toolbar from '$lib/components/Toolbar.svelte';
	import WarningsPanel from '$lib/components/WarningsPanel.svelte';
	import { t } from '$lib/i18n';
	import type { Issue, SizeGridRow } from '$lib/types';
	import { measurementRange } from '$lib/labels';
	import type { PageData } from '../../routes/pattern/[model]/$types';

	let { data }: { data: PageData } = $props();

	const store = providePatternStore(new PatternStore());

	let ready = $state(false);
    onMount(() => {
        ready = true;
        const query=new URLSearchParams(window.location.search);
        projectName=$t('project.defaultName',{model:$t(`model.${model}.name`)});
        if(query.has('new')){projectOpen=true;}
        if(query.has('project')){
         projectOpen=true;
         try{const project=loadProjects(data.catalog).find(p=>p.id===query.get('project') && p.model===model);if(!project)throw new Error();projectName=project.name;projectId=project.id;applyState(project);savedSnapshot=JSON.stringify({name:projectName,...snapshot()});void store.regenerate(model,project.measurements,project.params,data.item,project.overrides);}catch{projectIssue='project.loadError';}
        }
        const compact=window.matchMedia('(max-width: 1180px)');
        const applyLayout=()=>{leftOpen=!compact.matches;rightOpen=!compact.matches;};
        applyLayout();
		narrow = window.matchMedia('(max-width: 767px)').matches;
        if(projectOpen){leftOpen=true;rightOpen=false;}
        compact.addEventListener('change',applyLayout);
        return () => { compact.removeEventListener('change',applyLayout); if (regenerateTimer) clearTimeout(regenerateTimer); store.cancel(); };
    });
	let leftOpen=$state(true),rightOpen=$state(true);
 function togglePanel(side:'left'|'right'){
  const compact=window.matchMedia('(max-width:1180px)').matches;
  if(side==='left'){leftOpen=!leftOpen;if(compact)rightOpen=false;}
  else{rightOpen=!rightOpen;if(compact)leftOpen=false;}
 }
 let highlighted=$state<string[]>([]);
 let projectName=$state(''),projectId=$state(''),projectIssue=$state(''),savedSnapshot=$state('');
 let projectOpen=$state(false),savingProject=$state(false);
 let past=$state<DesignState[]>([]),future=$state<DesignState[]>([]);
 const dirty=$derived(JSON.stringify({name:projectName,...snapshot()})!==savedSnapshot);
 function snapshot():DesignState{return {measurements:{...measurements},params:{...params},overrides:{...overrides}};}
 function remember(){past=[...past.slice(-49),snapshot()];future=[];projectIssue='';}
 function applyState(state:DesignState){
  if(regenerateTimer)clearTimeout(regenerateTimer);
  store.cancel();store.edits={...store.edits,[model]:{...state.measurements,...state.params}};
  store.overrides={...store.overrides,[model]:{...state.overrides}};
 }
 function undo(){if(!past.length)return;const state=past[past.length-1];future=[...future,snapshot()];past=past.slice(0,-1);applyState(state);projectIssue='';scheduleRegenerate();}
 function redo(){if(!future.length)return;const state=future[future.length-1];past=[...past,snapshot()];future=future.slice(0,-1);applyState(state);projectIssue='';scheduleRegenerate();}
 function makeProject(duplicate=false):DesignProject{return validateProject({version:1,id:!duplicate && projectId?projectId:crypto.randomUUID(),name:projectName.trim(),model,updated:new Date().toISOString(),...snapshot()},data.catalog);}
 async function persistProject(duplicate=false){
  savingProject=true;projectIssue='';
  try{
   const project=makeProject(duplicate),captured=JSON.stringify({name:projectName,...snapshot()});
   if(regenerateTimer)clearTimeout(regenerateTimer);
   await store.regenerate(model,project.measurements,project.params,data.item,project.overrides);
   if(captured!==JSON.stringify({name:projectName,...snapshot()})){projectIssue='project.changedDuringSave';return;}
   if(store.error || store.results[model]?.errors?.length){projectIssue='project.invalid';return;}
   saveProject(project,data.catalog);projectId=project.id;projectName=project.name;savedSnapshot=JSON.stringify({name:projectName,...snapshot()});projectIssue='project.saved';
  }catch(error){projectIssue=error instanceof Error && error.message==='project.invalid'?'project.invalid':'project.storageError';}
  finally{savingProject=false;}
 }
 function exportProject(){try{downloadProject(makeProject());}catch{projectIssue='project.invalid';}}
 let zoom = $state(1);
	let narrow = $state(false);
	let pan = $state({ x: 0, y: 0 });
	let regenerateTimer: ReturnType<typeof setTimeout> | undefined;

	const model = $derived(data.item.id);
	const defaultProjectName = $derived(
		$t('project.defaultName', { model: $t(`model.${model}.name`) })
	);
	const measurementKeys = $derived(data.item.measurements);
	const paramKeys = $derived(Object.keys(data.item.params));
	const measurements = $derived(
		store.measurementsFor(model, measurementKeys, data.measurements)
	);
	// Параметры фасона: их показывает панель.
	const params = $derived(store.paramsFor(model, paramKeys, data.params));
	// Переопределения точек из редактора уходят на сервер отдельным полем:
	// чертёж должен строиться по ним, а не по меркам.
	const overrides = $derived(store.overridesFor(model));
	const result = $derived(store.results[model] ?? data.result);
	const sizeGrid = $derived(store.sizeGrids[model] ?? data.sizes);
	const pieces = $derived(result.pieces);
	const source = $derived(store.source ?? data.source);

	// На телефоне панели — оверлеи, поэтому главная мерка живёт полосой над холстом.
	const mobileKey = $derived(
		(data.item.measurements as string[]).includes('bust')
			? 'bust'
			: (data.item.measurements as string[]).includes('waist')
				? 'waist'
				: null
	);
	const mobileRange = $derived(
		mobileKey ? measurementRange(mobileKey) : { min: 0, max: 100, step: 1 }
	);
	const selectedPiece = $derived(pieces.find((p) => p.id === store.selectedPieceId) ?? pieces[0]);
	const measureSummary = $derived(
		selectedPiece
			? `${selectedPiece.name} ${fmt(selectedPiece.bbox.width / 10)} × ${fmt(selectedPiece.bbox.height / 10)} ${$t('unit.cm')}`
			: ''
	);

	const validation = $derived(store.validations[model]);

	/**
	 * Замечания собираются из двух источников - ответа на построение и
	 * ответа на проверку, - но они описывают одно и то же, поэтому
	 * одинаковые замечания уходят в один список.
	 */
	function uniqueIssues(...lists: (Issue[] | undefined)[]): Issue[] {
		const seen = new Set<string>();
		const result: Issue[] = [];
		for (const list of lists) {
			for (const issue of list ?? []) {
				const key = `${issue.code}:${JSON.stringify(issue.params)}`;
				if (seen.has(key)) continue;
				seen.add(key);
				result.push(issue);
			}
		}
		return result;
	}

	const errors = $derived([
		...uniqueIssues(result.errors, validation?.errors),
		...(store.error ? [store.error] : [])
	]);
	const warnings = $derived(uniqueIssues(result.warnings, validation?.warnings));

	function scheduleRegenerate() {
		if (regenerateTimer) clearTimeout(regenerateTimer);
		regenerateTimer = setTimeout(() => {
			// Переопределения читаем здесь, а не при планировании: за эти
			// 200 мс точку могли перетащить ещё раз, и запрос ушёл бы со
			// старым значением.
			void store.regenerate(model, measurements, params, data.item, store.overridesFor(model));
		}, 200);
	}

	function handleMeasurementChange(key: string, value: number) {
		remember();
        store.setValue(model, key, value);
		scheduleRegenerate();
	}

	/** Точка чертежа сдвинута в редакторе. */
	function handleOverrideChange(key: string, value: number) {
		remember();
        store.setOverride(model, key, value);
		scheduleRegenerate();
	}

	function handleParamChange(key: string, value: string | number) {
		remember();
        store.setValue(model, key, value);
		scheduleRegenerate();
	}

	function handleModelChange(id: string) {
		void goto(`/pattern/${id}`);
	}

	function handleToggle(key: 'seam' | 'grain' | 'notches' | 'internal', value: boolean) {
		store.toggles = { ...store.toggles, [key]: value };
	}

	function fmt(value: number): string {
		return Number.isInteger(value) ? String(value) : value.toFixed(1);
	}

	function applySize(row: SizeGridRow) {
		remember();
        store.applySizeRow(model, row);
		scheduleRegenerate();
	}
</script>

<svelte:head>
	<title>{$t(`model.${model}.name`)} — Shityo</title>
</svelte:head>

<div class="workspace" data-ready={ready}>
	<Toolbar
		catalog={data.catalog}
		{model}
		loading={store.loading}
		show3d={store.show3d}
		source={source}
		toggles={store.toggles}
		onModelChange={handleModelChange}
		onToggle3d={() => (store.show3d = !store.show3d)}
		onToggle={handleToggle}
		onRegenerate={() => void store.regenerate(model, measurements, params, data.item, overrides)}
		projectName={projectName && projectName !== defaultProjectName ? projectName : ''}
		{leftOpen}
		{rightOpen}
		onToggleMeasures={() => togglePanel('left')}
		onToggleInspector={() => togglePanel('right')}
		onFocus={() => {
			const focus = leftOpen || rightOpen;
			leftOpen = !focus;
			rightOpen = !focus && !window.matchMedia('(max-width:1180px)').matches;
		}}
	/>

 {#if errors.length && !rightOpen}<div class="workspace-error" role="alert" data-testid="hidden-errors"><Button size="sm" variant="danger" onclick={()=>{rightOpen=true;if(window.matchMedia('(max-width:1180px)').matches)leftOpen=false;}}>{$t('project.showErrors',{count:errors.length})}</Button></div>{/if}
 {#if mobileKey}
  <div class="mobile-measure" data-testid="mobile-measure">
   <span class="mm-label">{$t(`measure.${mobileKey}`)}</span>
   <span class="mm-value num">{fmt(measurements[mobileKey] ?? 0)}</span>
   <span class="mm-unit">{$t('unit.cm')}</span>
   <input class="mm-slider" type="range" min={mobileRange.min} max={mobileRange.max} step={mobileRange.step}
     value={measurements[mobileKey] ?? 0} aria-label={$t(`measure.${mobileKey}`)}
     oninput={(event) => handleMeasurementChange(mobileKey, Number(event.currentTarget.value))}/>
  </div>
 {/if}
 <div class="columns" class:left-closed={!leftOpen} class:right-closed={!rightOpen}>
		{#if leftOpen}<aside class="side left" aria-label={$t('measures.title')}>
			<ProjectPanel name={projectName} onName={name=>{projectName=name;projectIssue='';}} onSave={()=>persistProject()} onDuplicate={()=>persistProject(true)} onExport={exportProject} onUndo={undo} onRedo={redo} canUndo={past.length>0} canRedo={future.length>0} disabled={savingProject || store.loading || errors.length>0} issue={projectIssue} {dirty} open={projectOpen}/>
			<MeasureHero
				keys={data.item.measurements}
				values={measurements}
				defaults={data.item.default_measurements}
				onChange={handleMeasurementChange}
				profileValues={measurements}
				profileKeys={measurementKeys}
				onApplyProfile={values=>{remember();for(const [key,value] of Object.entries(values))store.setValue(model,key,value);scheduleRegenerate();}}
				summary={measureSummary}
			/>
			<ParamPanel
				descriptors={data.item.params}
				values={params}
				onChange={handleParamChange}
			/>
			<ShapeControls {pieces} {overrides} onChange={handleOverrideChange} onReset={()=>{remember();store.overrides={...store.overrides,[model]:{}};scheduleRegenerate();}}/>
		</aside>{/if}

		<main class="center">
			{#if store.show3d}
				<!-- Превью тянет three и Rapier: грузим его по кнопке, иначе
				     страница лекала платит за 3D-движок, даже когда он не нужен. -->
				{#await import('$lib/components/Preview3D.svelte') then preview}
					<preview.default measurements={result.size} {pieces} />
				{/await}
			{:else}
				<div class="canvas-wrap">
					<PieceCanvas
						{pieces}
						{highlighted}
						selectedId={store.selectedPieceId}
						{zoom}
						{pan}
						stacked={narrow}
						toggles={store.toggles}
						onSelect={(id) => store.selectPiece(id)}
						onZoom={(value) => (zoom = value)}
						onPan={(value) => (pan = value)}
						onOverrideChange={handleOverrideChange}
					/>
					<div class="readout" data-testid="canvas-readout">
						{#each pieces as piece (piece.id)}
							<span class="readout-item" class:on={store.selectedPieceId === piece.id}>
								<span class="readout-name">{piece.name}</span>
								<span class="num">{fmt(piece.bbox.width / 10)} × {fmt(piece.bbox.height / 10)}</span>
							</span>
						{/each}
						<span class="readout-scale num">{Math.round(zoom * 100)}%</span>
					</div>
				</div>
			{/if}
		</main>

		{#if rightOpen}<aside class="side right" aria-label={$t('workspace.inspector')}>
			<SeamInspector {pieces} onHighlight={keys=>highlighted=keys}/>
			{#if errors.length || warnings.length}<WarningsPanel {errors} {warnings}/>{/if}
			<PieceList {pieces} selectedId={store.selectedPieceId} onSelect={(id)=>store.selectPiece(id)} />
			<ExportPanel {model} {measurements} {params} {overrides} disabled={store.loading || errors.length>0} />
			{#if !errors.length && !warnings.length}<WarningsPanel {errors} {warnings}/>{/if}
			<SizeGrid rows={sizeGrid} onApply={applySize} />
		</aside>{/if}
	</div>
</div>

<style>
	.workspace-error{padding:var(--space-1) var(--workspace-gap);flex-shrink:0;}
	.workspace{
		display:flex;flex-direction:column;height:100%;min-height:0;
		--workspace-left:296px;--workspace-right:288px;
	}

	.columns{
		flex:1;display:grid;
		grid-template-columns:var(--workspace-left) minmax(0,1fr) var(--workspace-right);
		grid-template-rows:minmax(0,1fr);
		min-height:0;position:relative;
	}

	.side{
		display:flex;flex-direction:column;gap:var(--space-4);
		overflow-y:auto;min-height:0;min-width:0;overscroll-behavior:contain;
		padding:var(--space-4) var(--space-4) var(--space-6);
	}
	.side.left{border-right:1px solid var(--ui-line);}
	.side.right{border-left:1px solid var(--ui-line);}

	.center{min-height:0;min-width:0;height:100%;display:flex;overflow:hidden;}

	.canvas-wrap{flex:1;min-width:0;display:flex;flex-direction:column;min-height:0;}

	.readout{
		display:flex;align-items:center;gap:var(--space-4);flex-wrap:wrap;
		border-top:1px solid var(--ui-line);padding:6px var(--space-4);
		font-size:10px;letter-spacing:.06em;color:var(--ui-ink-muted);
	}
	.readout-item{display:inline-flex;gap:6px;align-items:baseline;}
	.readout-name{text-transform:uppercase;letter-spacing:.14em;}
	.readout-item.on{color:var(--ui-ink);}
	.readout-item.on .readout-name{color:var(--ui-accent);}
	.readout-scale{margin-left:auto;}

		.mobile-measure{display:none;}

	@media(max-width:767px){
		.mobile-measure{
			display:flex;align-items:baseline;gap:var(--space-2);flex-wrap:wrap;
			padding:var(--space-2) var(--space-4);border-bottom:1px solid var(--ui-line);flex-shrink:0;
		}
		.mm-label{font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--ui-ink-muted);width:100%;}
		.mm-value{font-size:40px;font-weight:700;line-height:.9;letter-spacing:-.04em;}
		.mm-unit{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--ui-ink-muted);}
		.mm-slider{flex:1;min-width:120px;accent-color:var(--ui-accent);height:20px;}
	}
	.columns.left-closed{grid-template-columns:minmax(0,1fr) var(--workspace-right);}
	.columns.right-closed{grid-template-columns:var(--workspace-left) minmax(0,1fr);}
	.columns.left-closed.right-closed{grid-template-columns:minmax(0,1fr);}

	@media(max-width:1180px){
		.columns{grid-template-columns:var(--workspace-left) minmax(0,1fr) var(--workspace-right);}
	}
	@media(max-width:767px){
		.columns,.columns.left-closed,.columns.right-closed,.columns.left-closed.right-closed{grid-template-columns:minmax(0,1fr);}
		.center{grid-column:1;grid-row:1;}
		.side{position:absolute;top:0;bottom:0;width:min(320px,calc(100% - 2 * var(--workspace-gap)));z-index:5;background:var(--ui-surface);border:1px solid var(--ui-line);box-shadow:0 8px 24px #0002;padding:var(--space-4);}
		.left{left:0;}.right{right:0;}
	}
</style>
