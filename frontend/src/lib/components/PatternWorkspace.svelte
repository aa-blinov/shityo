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
	import MeasurePanel from '$lib/components/MeasurePanel.svelte';
	import ParamPanel from '$lib/components/ParamPanel.svelte';
	import PieceCanvas from '$lib/components/PieceCanvas.svelte';
	import PieceList from '$lib/components/PieceList.svelte';
	import SizeGrid from '$lib/components/SizeGrid.svelte';
	import Toolbar from '$lib/components/Toolbar.svelte';
	import WarningsPanel from '$lib/components/WarningsPanel.svelte';
	import { t } from '$lib/i18n';
	import type { Issue, SizeGridRow } from '$lib/types';
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
	let pan = $state({ x: 0, y: 0 });
	let regenerateTimer: ReturnType<typeof setTimeout> | undefined;

	const model = $derived(data.item.id);
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
	/>

	<div class="workspace-controls">
  <Button size="sm" variant="secondary" data-testid="toggle-measures" aria-expanded={leftOpen} onclick={()=>togglePanel('left')}>{$t('workspace.measuresShort')}</Button>
  <Button size="sm" variant="secondary" data-testid="focus-pattern" aria-pressed={!leftOpen && !rightOpen} onclick={()=>{const focus=leftOpen || rightOpen;leftOpen=!focus;rightOpen=!focus && !window.matchMedia('(max-width:1180px)').matches;}}>{$t(!leftOpen && !rightOpen?'workspace.restoreShort':'workspace.focusShort')}</Button>
  <Button size="sm" variant="secondary" data-testid="toggle-inspector" aria-expanded={rightOpen} onclick={()=>togglePanel('right')}>{$t('workspace.inspectorShort')}</Button>
 </div>
 {#if errors.length && !rightOpen}<div class="workspace-error" role="alert" data-testid="hidden-errors"><Button size="sm" variant="danger" onclick={()=>{rightOpen=true;if(window.matchMedia('(max-width:1180px)').matches)leftOpen=false;}}>{$t('project.showErrors',{count:errors.length})}</Button></div>{/if}
 <div class="columns" class:left-closed={!leftOpen} class:right-closed={!rightOpen}>
		{#if leftOpen}<aside class="side left" aria-label={$t('measures.title')}>
   <ProjectPanel name={projectName} onName={name=>{projectName=name;projectIssue='';}} onSave={()=>persistProject()} onDuplicate={()=>persistProject(true)} onExport={exportProject} onUndo={undo} onRedo={redo} canUndo={past.length>0} canRedo={future.length>0} disabled={savingProject || store.loading || errors.length>0} issue={projectIssue} {dirty} open={projectOpen}/>
   <ShapeControls {pieces} {overrides} onChange={handleOverrideChange} onReset={()=>{remember();store.overrides={...store.overrides,[model]:{}};scheduleRegenerate();}}/>
			<MeasurePanel
				keys={data.item.measurements}
				values={measurements}
				onChange={handleMeasurementChange}
				profileValues={measurements}
				profileKeys={measurementKeys}
				onApplyProfile={values=>{remember();for(const [key,value] of Object.entries(values))store.setValue(model,key,value);scheduleRegenerate();}}
			/>
			<ParamPanel
				descriptors={data.item.params}
				values={params}
				onChange={handleParamChange}
			/>
		</aside>{/if}

		<main class="center">
			{#if store.show3d}
				<!-- Превью тянет three и Rapier: грузим его по кнопке, иначе
				     страница лекала платит за 3D-движок, даже когда он не нужен. -->
				{#await import('$lib/components/Preview3D.svelte') then preview}
					<preview.default measurements={result.size} {pieces} />
				{/await}
			{:else}
				<PieceCanvas
					{pieces}
                    {highlighted}
					selectedId={store.selectedPieceId}
					{zoom}
					{pan}
					toggles={store.toggles}
					onSelect={(id) => store.selectPiece(id)}
					onZoom={(value) => (zoom = value)}
					onPan={(value) => (pan = value)}
					onOverrideChange={handleOverrideChange}
				/>
			{/if}
		</main>

        {#if rightOpen}<aside class="side right" aria-label={$t('workspace.inspector')}>
            <SeamInspector {pieces} onHighlight={keys=>highlighted=keys}/>
            {#if errors.length || warnings.length}<WarningsPanel {errors} {warnings}/>{/if}
            <ExportPanel {model} {measurements} {params} {overrides} disabled={store.loading || errors.length>0} />
            <PieceList {pieces} selectedId={store.selectedPieceId} onSelect={(id)=>store.selectPiece(id)} />
            {#if !errors.length && !warnings.length}<WarningsPanel {errors} {warnings}/>{/if}
			<SizeGrid rows={sizeGrid} onApply={applySize} />
		</aside>{/if}
	</div>
</div>

<style>
 .workspace-error{padding:var(--space-1) var(--workspace-gap);flex-shrink:0;}
	.workspace {
		display: flex;
		flex-direction: column;
		height: 100%;
        min-height:0;
        --workspace-left:240px;
        --workspace-right:260px;
	}

	.columns {
		flex: 1;
		display: grid;
		grid-template-columns: var(--workspace-left) minmax(0,1fr) var(--workspace-right);
		/* Строка должна иметь определённую высоту, иначе холст растёт
		   под содержимое лекал вместо того, чтобы вписывать его в окно. */
		grid-template-rows: minmax(0, 1fr);
		gap: var(--workspace-gap);
		padding: var(--workspace-gap);
		min-height: 0;
	}

	.side {
		display: flex;
		flex-direction: column;
		gap: var(--workspace-gap);
		overflow-y: auto;
		min-height: 0;
	}

	.center {
		min-height: 0;
		min-width: 0;
		height: 100%;
		display: flex;
		overflow: hidden;
	}


 .workspace-controls{display:flex;gap:var(--workspace-gap);padding:var(--workspace-gap);padding-bottom:0;flex-shrink:0;}
 .columns.left-closed{grid-template-columns:minmax(0,1fr) var(--workspace-right);}
 .columns.right-closed{grid-template-columns:var(--workspace-left) minmax(0,1fr);}
 .columns.left-closed.right-closed{grid-template-columns:minmax(0,1fr);}
 .columns{position:relative;}
 .side{min-width:0;overscroll-behavior:contain;}
 @media(max-width:1180px){
  .columns{grid-template-columns:var(--workspace-left) minmax(0,1fr) var(--workspace-right);}
 }
 @media(max-width:767px){
  .columns,.columns.left-closed,.columns.right-closed,.columns.left-closed.right-closed{grid-template-columns:minmax(0,1fr);}
  .center{grid-column:1;grid-row:1;}
  .side{position:absolute;top:var(--workspace-gap);bottom:var(--workspace-gap);width:min(320px,calc(100% - 2 * var(--workspace-gap)));z-index:5;background:var(--ui-surface);border:1px solid var(--ui-line);border-radius:var(--ui-radius);padding:var(--workspace-gap);box-shadow:0 8px 24px #0003;}
  .left{left:var(--workspace-gap);}.right{right:var(--workspace-gap);}
  .workspace-controls{display:grid;grid-template-columns:1fr 1fr 1fr;gap:var(--space-1);}
  .workspace-controls :global(button){padding-left:var(--space-1);padding-right:var(--space-1);letter-spacing:0;font-size:11px;}
 }
</style>
