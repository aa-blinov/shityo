<script lang="ts">
	import ProjectPanel from '$lib/components/ProjectPanel.svelte';
 import ShapeControls from '$lib/components/ShapeControls.svelte';
 import {loadProjects,saveProject,validateProject,downloadProject,listVersions,addVersion,autosaveEnabled,setAutosave,type DesignState,type DesignProject,type AttachedFile,type ProjectVersion,type Stage} from '$lib/projects';
 import { Button } from '@monos/ui';
 import ClientProfiles from '$lib/components/ClientProfiles.svelte';
 import ProjectFiles from '$lib/components/ProjectFiles.svelte';
 import ProjectVersions from '$lib/components/ProjectVersions.svelte';
 import { workspaceLayout } from '$lib/workspace-layout.svelte';
 import SeamInspector from '$lib/components/SeamInspector.svelte';
 import { onMount } from 'svelte';
 import { beforeNavigate } from '$app/navigation';
 import { fade } from 'svelte/transition';
	import { goto, replaceState } from '$app/navigation';
	import { PatternStore, providePatternStore } from '$lib/stores.svelte';
	import ExportPanel from '$lib/components/ExportPanel.svelte';
	import MeasureHero from '$lib/components/MeasureHero.svelte';
	import ParamPanel from '$lib/components/ParamPanel.svelte';
	import PieceCanvas from '$lib/components/PieceCanvas.svelte';
	import PieceList from '$lib/components/PieceList.svelte';
	import SizeGrid from '$lib/components/SizeGrid.svelte';
	import Toolbar from '$lib/components/Toolbar.svelte';
	import WarningsPanel from '$lib/components/WarningsPanel.svelte';
	import Onboarding from '$lib/components/Onboarding.svelte';
	import FitPanel from '$lib/components/FitPanel.svelte';
	import PrintDialog from '$lib/components/PrintDialog.svelte';
	import WorkspaceSection from '$lib/components/WorkspaceSection.svelte';
	import ProjectStart, { type StartChoice } from '$lib/components/ProjectStart.svelte';
	import { matchPreset } from '$lib/presets';
	import { loadSizeGrid } from '$lib/data';
	import { nearestSize } from '$lib/sizes';
	import ChoiceChips from '$lib/components/ChoiceChips.svelte';
	import { hasKey, t } from '$lib/i18n';
	import type { Issue, SizeGridRow } from '$lib/types';
	import { measurementRange } from '$lib/labels';
	import type { PageData } from '../../routes/pattern/[model]/$types';

	let { data }: { data: PageData } = $props();

	const store = providePatternStore(new PatternStore());

	let ready = $state(false);
    onMount(() => {
        workspaceLayout.load();
        // Закрытие вкладки с несохранёнными правками - только после вопроса.
        const guard=(event:BeforeUnloadEvent)=>{if(dirty&&(projectId||past.length)){event.preventDefault();event.returnValue='';}};
        window.addEventListener('beforeunload',guard);
        ready = true;
        const query=new URLSearchParams(window.location.search);
        projectName=$t('project.defaultName',{model:$t(`model.${model}.name`)});
        if(query.has('project')){
         projectOpen=true;
         try{const project=loadProjects(data.catalog).find(p=>p.id===query.get('project') && p.model===model);if(!project)throw new Error();projectName=project.name;projectId=project.id;projectFiles=project.files??[];activeClientId=project.clientId??'';stage=project.stage??'draft';loadedClient=activeClientId;loadedStage=stage;versions=listVersions(project.id);applyState(project);savedSnapshot=persistKey();void store.regenerate(model,project.measurements,project.params,data.item,project.overrides);}catch{projectIssue='project.loadError';}
        }else if(query.has('new')){
         // Новое лекало начинается с выбора мерок и посадки, а не с пустой основы.
         startOpen=true;startClient=query.get('client')??'';
        }
        const compact=window.matchMedia('(max-width: 1180px)');
        const applyLayout=()=>{leftOpen=!compact.matches;rightOpen=!compact.matches;};
        applyLayout();
		narrow = window.matchMedia('(max-width: 767px)').matches;
        if(projectOpen){leftOpen=true;rightOpen=false;}
        compact.addEventListener('change',applyLayout);
        return () => { window.removeEventListener('beforeunload',guard); compact.removeEventListener('change',applyLayout); if (regenerateTimer) clearTimeout(regenerateTimer); store.cancel(); };
    });
	let leftOpen=$state(true),rightOpen=$state(true);
 // Раскладка из настроек: мерки слева или справа, ширина панелей.
 const RAIL=32;
 const measuresWidth=$derived(leftOpen?workspaceLayout.measures:RAIL);
 const inspectorWidth=$derived(rightOpen?workspaceLayout.inspector:RAIL);
 const firstWidth=$derived(workspaceLayout.swapped?inspectorWidth:measuresWidth);
 const secondWidth=$derived(workspaceLayout.swapped?measuresWidth:inspectorWidth);
 let dragging=$state<null|'first'|'second'>(null);
 /** Перетаскивание края панели меняет её ширину. */
 function startResize(edge:'first'|'second',event:PointerEvent){
  const panel=(edge==='first')!==workspaceLayout.swapped?'measures':'inspector';
  const start=event.clientX,width=workspaceLayout[panel];
  const scale=Number(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale'))||1;
  dragging=edge;
  const move=(e:PointerEvent)=>{const dx=(e.clientX-start)/scale;workspaceLayout.resize(panel,edge==='first'?width+dx:width-dx);};
  const up=()=>{dragging=null;window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);};
  window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);
  event.preventDefault();
 }
 function resizeByKey(edge:'first'|'second',event:KeyboardEvent){
  const panel=(edge==='first')!==workspaceLayout.swapped?'measures':'inspector';
  const step=event.shiftKey?40:10,grow=edge==='first'?1:-1;
  if(event.key==='ArrowRight'){workspaceLayout.resize(panel,workspaceLayout[panel]+step*grow);event.preventDefault();}
  if(event.key==='ArrowLeft'){workspaceLayout.resize(panel,workspaceLayout[panel]-step*grow);event.preventDefault();}
 }
 function togglePanel(side:'left'|'right'){
  const compact=window.matchMedia('(max-width:1180px)').matches;
  if(side==='left'){leftOpen=!leftOpen;if(compact)rightOpen=false;}
  else{rightOpen=!rightOpen;if(compact)leftOpen=false;}
 }
 let highlighted=$state<string[]>([]);
 let activeClientId=$state(''),stage=$state<Stage>('draft');
 let projectName=$state(''),projectId=$state(''),projectIssue=$state(''),savedSnapshot=$state('');
 let projectFiles=$state<AttachedFile[]>([]);
 let projectOpen=$state(false),savingProject=$state(false);
 let past=$state<DesignState[]>([]),future=$state<DesignState[]>([]);
 const dirty=$derived(persistKey()!==savedSnapshot);
 // Стадия и клиент на момент открытия: если их сменили в кабинете (другая
 // вкладка), а здесь не трогали - при сохранении берутся новые значения.
 let loadedStage=$state<Stage>('draft'),loadedClient=$state('');
 function adoptExternal(){
  if(!projectId)return;
  try{
   const stored=loadProjects(data.catalog).find(p=>p.id===projectId);
   if(!stored)return;
   if(stage===loadedStage&&(stored.stage??'draft')!==loadedStage)stage=stored.stage??'draft';
   if(activeClientId===loadedClient&&(stored.clientId??'')!==loadedClient)activeClientId=stored.clientId??'';
  }catch{/* хранилище недоступно - сохраняется то, что на экране */}
 }
 /** Всё, что сохраняется в проекте: по этому ключу видно несохранённые правки. */
 // Вложения сравниваются по отпечатку, а не по содержимому: data URL до 1 МБ
 // не сериализуется на каждое движение ползунка.
 function persistKey(){return JSON.stringify({name:projectName,files:projectFiles.map(f=>`${f.id}:${f.size}:${f.uploadedAt}`),clientId:activeClientId,stage,...snapshot()});}
 function snapshot():DesignState{return {measurements:{...measurements},params:{...params},overrides:{...overrides}};}
 function remember(){past=[...past.slice(-49),snapshot()];future=[];projectIssue='';}
 function applyState(state:DesignState){
  if(regenerateTimer)clearTimeout(regenerateTimer);
  store.cancel();store.edits={...store.edits,[model]:{...state.measurements,...state.params}};
  store.overrides={...store.overrides,[model]:{...state.overrides}};
 }
 function undo(){if(!past.length)return;const state=past[past.length-1];future=[...future,snapshot()];past=past.slice(0,-1);applyState(state);projectIssue='';scheduleRegenerate();}
 function redo(){if(!future.length)return;const state=future[future.length-1];past=[...past,snapshot()];future=future.slice(0,-1);applyState(state);projectIssue='';scheduleRegenerate();}
 function makeProject(duplicate=false):DesignProject{return validateProject({version:1,id:!duplicate && projectId?projectId:crypto.randomUUID(),name:projectName.trim(),model,updated:new Date().toISOString(),...snapshot(),files:$state.snapshot(projectFiles),...(activeClientId?{clientId:activeClientId}:{}),stage},data.catalog);}
 let versions=$state<ProjectVersion[]>([]),autosave=$state(autosaveEnabled()),autosaveTimer:ReturnType<typeof setTimeout>|undefined;
 /** Откат к версии - обычная правка: её можно отменить. */
 function restoreVersion(version:ProjectVersion){remember();applyState(structuredClone(version.state));scheduleRegenerate();}
 // Автосохранение: уже сохранённый проект пишется сам через 2 с после
 // последней правки, если чертёж без ошибок. Новый проект сохраняется вручную
 // один раз - иначе каждая открытая основа попадала бы в «Мои проекты».
 $effect(()=>{
  const pending=autosave && !!projectId && dirty && !savingProject && !store.loading && !errors.length && !!projectName.trim();
  if(autosaveTimer)clearTimeout(autosaveTimer);
  if(pending)autosaveTimer=setTimeout(()=>void persistProject(false,true),2000);
  return ()=>{if(autosaveTimer)clearTimeout(autosaveTimer);};
 });
 async function persistProject(duplicate=false,auto=false){
  savingProject=true;projectIssue='';
  adoptExternal();
  try{
   const project=makeProject(duplicate),captured=persistKey();
   if(regenerateTimer)clearTimeout(regenerateTimer);
   await store.regenerate(model,project.measurements,project.params,data.item,project.overrides);
   if(captured!==persistKey()){projectIssue='project.changedDuringSave';return;}
   if(store.error || store.results[model]?.errors?.length){projectIssue='project.invalid';return;}
   saveProject(project,data.catalog);projectId=project.id;projectName=project.name;projectFiles=project.files??[];savedSnapshot=persistKey();projectIssue=auto?'project.autosaved':'project.saved';loadedStage=stage;loadedClient=activeClientId;
   try{versions=addVersion(project.id,$t(auto?'versions.auto':'versions.manual'),snapshot());}catch{/* история - удобство, сохранение проекта важнее */}
  }catch(error){projectIssue=error instanceof DOMException && error.name==='QuotaExceededError'?'project.quota':error instanceof Error && error.message==='project.invalid'?'project.invalid':'project.storageError';}
  finally{savingProject=false;}
 }
 let startOpen=$state(false),printOpen=$state(false),startClient=$state('');
 /**
  * Старт нового лекала: мерки и посадка подставляются одним шагом, и проект
  * сразу сохраняется, чтобы появиться в «Моих моделях». Отмены этого шага нет:
  * до него отменять нечего.
  */
 async function startProject(choice:StartChoice){
  startOpen=false;
  for(const [key,value] of Object.entries(choice.measurements))store.setValue(model,key,value);
  for(const [key,value] of Object.entries(choice.params))store.setValue(model,key,value);
  // «Чьи мерки» и «чей заказ» - разные решения: клиент из кабинета остаётся
  // заказчиком, даже если мерки взяты из типового размера.
  projectName=choice.name;activeClientId=choice.clientId||startClient;
  await persistProject();
  // Перезагрузка страницы откроет сохранённый проект, а не новый диалог.
  if(projectId)replaceState(`${window.location.pathname}?project=${encodeURIComponent(projectId)}`,{});
 }
 /** Несколько параметров сразу (пресет): один шаг в истории, один пересчёт. */
 function handleParamsApply(values:Record<string,string|number>){
  remember();
  for(const [key,value] of Object.entries(values))store.setValue(model,key,value);
  scheduleRegenerate();
 }
 /**
  * Горячие клавиши мастерской: отмена и повтор, сохранение, печать. Отмена
  * не перехватывается в поле ввода - там она отменяет набранный текст.
  */
 beforeNavigate((nav)=>{if(nav.type==='leave'||nav.willUnload)return;if(nav.to?.url.pathname===nav.from?.url.pathname)return;if(dirty&&(projectId||past.length)&&!confirm($t('project.leaveUnsaved')))nav.cancel();});
 let keysOpen=$state(false),keysReturn:HTMLElement|null=null;
 /** Справка: фокус переходит в окно и возвращается туда, откуда её открыли. */
 function openKeys(){keysReturn=document.activeElement as HTMLElement|null;keysOpen=true;}
 $effect(()=>{if(keysOpen)queueMicrotask(()=>document.querySelector<HTMLElement>('[data-testid=keys-dialog] button')?.focus());else keysReturn?.focus?.();});
 /** Список для справки: клавиши и что они делают. */
 const SHORTCUTS:[string,string][]=[['Ctrl+S','keys.save'],['Ctrl+Z','keys.undo'],['Ctrl+Shift+Z','keys.redo'],['Ctrl+P','keys.print'],['[','keys.measures'],[']','keys.inspector'],['\\','keys.focus'],['2 / 3','keys.view'],['?','keys.help'],['Esc','keys.close']];
 function handleShortcut(event:KeyboardEvent){
  if(startOpen||printOpen)return;
  if(keysOpen){
   // Под окном справки ничего не меняется: работают только Esc, ? и Tab по кругу.
   if(event.key==='Escape'||event.key==='?'||(event.code==='Slash'&&event.shiftKey)){event.preventDefault();keysOpen=false;return;}
   if(event.key==='Tab'){const box=document.querySelector<HTMLElement>('[data-testid=keys-dialog]');const items=box?Array.from(box.querySelectorAll<HTMLElement>('button')):[];if(items.length){event.preventDefault();const i=items.indexOf(document.activeElement as HTMLElement);items[(i+(event.shiftKey?-1:1)+items.length)%items.length].focus();}}
   return;
  }
  // Клавиши определяются по физическому положению (event.code), а не по
  // символу: в русской раскладке S даёт «ы», а [ - «х».
  const code=event.code;
  const typing=event.target instanceof HTMLElement&&event.target.closest('input,textarea,select,[contenteditable]');
  if(!(event.ctrlKey||event.metaKey||event.altKey)){
   // Одиночные клавиши работают вне полей ввода: там они вводят текст.
   if(typing)return;
   if(event.key==='Escape'&&keysOpen){keysOpen=false;return;}
   if(event.key==='?'||(code==='Slash'&&event.shiftKey)){event.preventDefault();openKeys();return;}
   if(code==='BracketLeft'){event.preventDefault();togglePanel('left');return;}
   if(code==='BracketRight'){event.preventDefault();togglePanel('right');return;}
   if(code==='Backslash'){event.preventDefault();const focus=leftOpen||rightOpen;leftOpen=!focus;rightOpen=!focus&&!window.matchMedia('(max-width:1180px)').matches;return;}
   if((code==='Digit2'||code==='Numpad2')&&store.show3d){store.show3d=false;return;}
   if((code==='Digit3'||code==='Numpad3')&&!store.show3d){store.show3d=true;return;}
   return;
  }
  if(code==='KeyS'){event.preventDefault();if(!savingProject&&!store.loading&&!errors.length&&projectName.trim())void persistProject();return;}
  if(code==='KeyP'){event.preventDefault();printOpen=true;return;}
  if(typing)return;
  if(code==='KeyZ'&&!event.shiftKey){event.preventDefault();undo();return;}
  if((code==='KeyZ'&&event.shiftKey)||code==='KeyY'){event.preventDefault();redo();}
 }
 function exportProject(){try{downloadProject(makeProject());}catch{projectIssue='project.invalid';}}
 function handleAddFile(file:AttachedFile){projectFiles=[...projectFiles,file];}
 function handleDeleteFile(id:string){projectFiles=projectFiles.filter(f=>f.id!==id);}
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
	// Пол фигуры: у женского и мужского ряда разные размеры (ГОСТ 31396/31399).
	const gender = $derived(typeof params.gender === 'string' ? params.gender : '');
	const defaultGender = $derived(String(data.item.params.gender?.default ?? ''));
	const sizeGrid = $derived(
		store.sizeGrids[`${model}:${gender}`] ?? (gender === defaultGender || !gender ? data.sizes : [])
	);
	$effect(() => {
		const key = `${model}:${gender}`;
		if (!gender || gender === defaultGender || store.sizeGrids[key]) return;
		void loadSizeGrid(model, gender).then((loaded) => {
			store.sizeGrids = { ...store.sizeGrids, [key]: loaded.data };
		});
	});
	const genderOptions = $derived(
		(data.item.params.gender?.options ?? []).map((option) => ({
			value: option.value,
			label: $t(`param.gender.${option.value}`)
		}))
	);
	/**
	 * Смена пола подставляет размер нового ряда, ближайший к текущей фигуре:
	 * лекало сразу строится по типовым меркам этого пола. Шаг отменяемый.
	 */
	async function handleGenderChange(next: string) {
		if (next === gender) return;
		remember();
		store.setValue(model, 'gender', next);
		const key = `${model}:${next}`;
		const rows =
			store.sizeGrids[key] ??
			(next === defaultGender ? data.sizes : (await loadSizeGrid(model, next)).data);
		store.sizeGrids = { ...store.sizeGrids, [key]: rows };
		// Рост - основной для нового пола: мужской 176 не переносится на женский ряд.
		const { height: _height, ...girths } = measurements;
		const row = nearestSize(rows, girths);
		if (row) store.applySizeRow(model, row);
		scheduleRegenerate();
	}
	const pieces = $derived(result.pieces);
	const source = $derived(store.source ?? data.source);

	// На телефоне панели — оверлеи, поэтому главная мерка живёт полосой над холстом.
	const mobileKey = $derived((data.item.measurements as string[])[0] ?? null);
	const mobileRange = $derived(
		mobileKey ? measurementRange(mobileKey) : { min: 0, max: 100, step: 1 }
	);
	let mobilePreview: number | null = $state(null);
	let mobileTimer: ReturnType<typeof setTimeout> | undefined;
	const mobileDisplayValue = $derived(
		mobilePreview !== null ? mobilePreview : (mobileKey ? measurements[mobileKey] ?? 0 : 0)
	);
	function commitMobile(value: number) {
		mobilePreview = null;
		if (mobileTimer) clearTimeout(mobileTimer);
		if (mobileKey) handleMeasurementChange(mobileKey, value);
	}
	function previewMobile(value: number) {
		mobilePreview = value;
		if (mobileTimer) clearTimeout(mobileTimer);
		mobileTimer = setTimeout(() => commitMobile(value), 200);
	}
	const selectedPiece = $derived(pieces.find((p) => p.id === store.selectedPieceId) ?? pieces[0]);
	const measureSummary = $derived(
		selectedPiece
			? `${selectedPiece.name} ${fmt(selectedPiece.bbox.width / 10)} × ${fmt(selectedPiece.bbox.height / 10)} ${$t('unit.cm')}`
			: ''
	);

	const validation = $derived(store.validations[model]);

	// Подписи разделов: швея видит состояние подгонки, не раскрывая разделы.
	const fitMatch = $derived(matchPreset(data.item, params));
	const fitMeta = $derived(
		fitMatch.preset
			? `${presetLabel(fitMatch.preset.id)}${fitMatch.tuned ? ' *' : ''}`
			: $t('fit.customShort')
	);
	function presetLabel(id: string): string {
		const own = `preset.${model}.${id}`;
		return hasKey(own) ? $t(own) : $t(`preset.${id}`);
	}
	// Посадку и прибавки показывает раздел «Посадка», пол - раздел «Мерки».
	const isFitParam = (key: string) => key === 'fit' || key === 'gender' || key.startsWith('ease_');
	const hasStyleParams = $derived(paramKeys.some((key) => !isFitParam(key)));
	const currentSize = $derived(
		sizeGrid.find((row) => {
			const entries = Object.entries(row.measurements);
			return entries.length > 0 && entries.every(([key, value]) => measurements[key] === value);
		})
	);
	// Обозначение по ГОСТ (164-92-98) понятнее швее, чем номер размера.
	const sizeMeta = $derived(currentSize?.designation ?? currentSize?.size ?? '');
	// Правка точек поддержана только для футболки и рубашки (см. validateProject).
	const shapeEditable = $derived(['tee', 'shirt'].includes(model) && pieces.some((p) => p.id === 'front'));

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

<svelte:window onkeydown={handleShortcut} />

<svelte:head>
	<title>{$t(`model.${model}.name`)} — Shityo</title>
</svelte:head>

<div class="workspace" data-ready={ready}>
	<Toolbar
		catalog={data.catalog}
		{model}
		{measurements}
		{params}
		{overrides}
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
		onExport={exportProject}
		onPrint={() => (printOpen = true)}
		onKeys={openKeys}
	/>

 {#if errors.length && !rightOpen}<div class="workspace-error" role="alert" data-testid="hidden-errors"><Button size="sm" variant="danger" onclick={()=>{rightOpen=true;if(window.matchMedia('(max-width:1180px)').matches)leftOpen=false;}}>{$t('project.showErrors',{count:errors.length})}</Button></div>{/if}
 {#if mobileKey}
  <div class="mobile-measure" data-testid="mobile-measure">
   <span class="mm-label">{$t(`measure.${mobileKey}`)}</span>
   <input class="mm-value num" type="number" min={mobileRange.min} max={mobileRange.max} step={mobileRange.step}
     value={mobileDisplayValue} aria-label={$t(`measure.${mobileKey}`)}
     oninput={(event) => previewMobile(Number(event.currentTarget.value))}
     onchange={(event) => commitMobile(Number(event.currentTarget.value))}/>
   <span class="mm-unit">{$t('unit.cm')}</span>
   <input class="mm-slider" type="range" min={mobileRange.min} max={mobileRange.max} step={mobileRange.step}
     value={mobileDisplayValue} aria-label={$t(`measure.${mobileKey}`)}
     oninput={(event) => (mobilePreview = Number(event.currentTarget.value))}
     onchange={(event) => commitMobile(Number(event.currentTarget.value))}/>
  </div>
 {/if}
 <div class="columns" class:left-closed={!leftOpen} class:right-closed={!rightOpen} class:swapped={workspaceLayout.swapped} class:dragging={dragging!==null} style={`--lw:${firstWidth}px;--rw:${secondWidth}px`}>
		{#if (workspaceLayout.swapped ? rightOpen : leftOpen)}<button type="button" class="resizer first" style={`left:${firstWidth - 3}px`} aria-label={$t('layout.resize')} data-tip={$t('layout.resizeTip')} onpointerdown={(e)=>startResize('first',e)} onkeydown={(e)=>resizeByKey('first',e)}></button>{/if}
		{#if (workspaceLayout.swapped ? leftOpen : rightOpen)}<button type="button" class="resizer second" style={`right:${secondWidth - 3}px`} aria-label={$t('layout.resize')} data-tip={$t('layout.resizeTip')} onpointerdown={(e)=>startResize('second',e)} onkeydown={(e)=>resizeByKey('second',e)}></button>{/if}
		<aside class="side left" class:closed={!leftOpen} aria-label={$t('workspace.measuresShort')}>
			{#if !leftOpen}<button type="button" class="edge-toggle" data-testid="edge-left" aria-expanded="false" aria-label={`${$t('workspace.showPanel')}: ${$t('workspace.measuresShort')}`} onclick={()=>togglePanel('left')}><span class="chev" aria-hidden="true"></span><span class="rail-label">{$t('workspace.measuresShort')}</span></button>{/if}
			{#if leftOpen}<div class="side-body" in:fade={{duration:160,delay:90}}>
			<ProjectPanel name={projectName} onName={name=>{projectName=name;projectIssue='';}} onSave={()=>persistProject()} onDuplicate={()=>persistProject(true)} clientId={activeClientId} onClient={(id)=>{activeClientId=id;}} {stage} onStage={(next)=>{stage=next;}} onUndo={undo} onRedo={redo} canUndo={past.length>0} canRedo={future.length>0} disabled={savingProject || store.loading || errors.length>0} blockedByErrors={errors.length} issue={projectIssue} {dirty} saved={!!projectId}/>
			<WorkspaceSection step={1} title={$t('workspace.step.measures')} meta={[gender ? $t(`param.gender.${gender}`) : '', sizeMeta && !currentSize?.designation ? `${$t('sizes.size')} ${sizeMeta}` : sizeMeta].filter(Boolean).join(', ')} testid="section-measures">
				{#if genderOptions.length > 1}
					<ChoiceChips testid="param-gender" label={$t('param.gender')} options={genderOptions} value={gender} full onChange={(value) => void handleGenderChange(value)}/>
				{/if}
				<MeasureHero
					keys={data.item.measurements}
					values={measurements}
					defaults={data.item.default_measurements}
					onChange={handleMeasurementChange}
					summary={measureSummary}
				>
					{#snippet source()}
						<ClientProfiles values={measurements} keys={measurementKeys} initialClientId={activeClientId} onApply={values=>{remember();for(const [key,value] of Object.entries(values))store.setValue(model,key,value);scheduleRegenerate();}}/>
						<SizeGrid rows={sizeGrid} values={measurements} onApply={applySize} />
					{/snippet}
				</MeasureHero>
			</WorkspaceSection>
			<WorkspaceSection step={2} title={$t('workspace.step.fit')} meta={fitMeta} testid="section-fit">
				<FitPanel item={data.item} {params} onApply={handleParamsApply} onChange={handleParamChange}/>
			</WorkspaceSection>
			{#if hasStyleParams}
				<WorkspaceSection step={3} title={$t('workspace.step.style')} testid="section-style">
					<ParamPanel descriptors={data.item.params} values={params} onChange={handleParamChange} exclude={isFitParam}/>
				</WorkspaceSection>
			{/if}
			{#if shapeEditable}
				<WorkspaceSection step={hasStyleParams ? 4 : 3} title={$t('workspace.step.shape')} meta={Object.keys(overrides).length ? $t('workspace.shapeMeta',{count:Object.keys(overrides).length}) : ''} open={false} testid="section-shape">
					<ShapeControls {pieces} {overrides} onChange={handleOverrideChange} onReset={()=>{remember();store.overrides={...store.overrides,[model]:{}};scheduleRegenerate();}}/>
				</WorkspaceSection>
			{/if}
		</div>{/if}
		</aside>

		<main class="center">
			{#if store.loading}<div class="load-bar" role="progressbar" aria-label={$t('workspace.calculating')}></div>{/if}
			{#if store.show3d}
				<!-- Превью тянет three и Rapier: грузим его по кнопке, иначе
				     страница лекала платит за 3D-движок, даже когда он не нужен. -->
				{#await import('$lib/components/Preview3D.svelte') then preview}
					<preview.default measurements={result.size} {pieces} {model} gender={gender === 'female' || gender === 'male' ? gender : model === 'dress' || model === 'skirt' ? 'female' : undefined} />
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
						focused={!leftOpen && !rightOpen}
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
						<button type="button" class="keys-button" data-testid="keys-open" data-tip={$t('keys.title')} aria-label={$t('keys.title')} onclick={openKeys}>?</button>
					</div>
				</div>
			{/if}
		</main>

		<aside class="side right" class:closed={!rightOpen} aria-label={$t('workspace.inspector')}>
			{#if !rightOpen}<button type="button" class="edge-toggle" data-testid="edge-right" aria-expanded="false" aria-label={`${$t('workspace.showPanel')}: ${$t('workspace.inspectorShort')}`} onclick={()=>togglePanel('right')}><span class="chev" aria-hidden="true"></span><span class="rail-label">{$t('workspace.inspectorShort')}</span></button>{/if}
			{#if rightOpen}<div class="side-body" in:fade={{duration:160,delay:90}}>
			<WorkspaceSection
				title={$t('workspace.step.check')}
				meta={errors.length ? $t('workspace.checkErrors',{count:errors.length}) : warnings.length ? $t('workspace.checkIssues',{count:warnings.length}) : $t('workspace.checkOk')}
				tone={errors.length ? 'danger' : warnings.length ? 'warning' : 'success'}
				open={errors.length + warnings.length > 0}
				testid="section-check"
			>
				<WarningsPanel {errors} {warnings}/>
			</WorkspaceSection>
			<WorkspaceSection title={$t('workspace.step.seams')} testid="section-seams">
				<SeamInspector {pieces} onHighlight={keys=>highlighted=keys}/>
			</WorkspaceSection>
			<WorkspaceSection title={$t('workspace.step.pieces')} meta={$t('workspace.pieceCount',{count:pieces.length})} open={false} testid="section-pieces">
				<PieceList {pieces} selectedId={store.selectedPieceId} onSelect={(id)=>store.selectPiece(id)} />
			</WorkspaceSection>
			<WorkspaceSection title={$t('versions.title')} meta={versions.length ? String(versions.length) : ''} open={false} testid="section-versions">
				<ProjectVersions {versions} {autosave} {dirty} saved={!!projectId} onAutosave={(on)=>{autosave=on;setAutosave(on);}} onRestore={restoreVersion}/>
			</WorkspaceSection>
			<WorkspaceSection title={$t('workspace.step.files')} meta={projectFiles.length ? String(projectFiles.length) : ''} open={false} testid="section-files">
				<ProjectFiles files={projectFiles} onAdd={handleAddFile} onDelete={handleDeleteFile} disabled={savingProject || store.loading}/>
			</WorkspaceSection>
		</div>{/if}
		</aside>
	</div>
</div>

{#if keysOpen}
 <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
 <div class="keys-overlay" onclick={(e)=>{if(e.target===e.currentTarget)keysOpen=false;}}>
  <div class="keys-dialog" role="dialog" aria-modal="true" aria-labelledby="keys-title" data-testid="keys-dialog">
   <h2 id="keys-title">{$t('keys.title')}</h2>
   <dl>
    {#each SHORTCUTS as [combo,label] (combo)}<dt><kbd>{combo}</kbd></dt><dd>{$t(label)}</dd>{/each}
   </dl>
   <Button size="sm" onclick={()=>(keysOpen=false)}>{$t('app.close')}</Button>
  </div>
 </div>
{/if}
{#if printOpen}
	<PrintDialog onClose={() => (printOpen = false)}>
		<ExportPanel {model} {measurements} {params} {overrides} disabled={store.loading || errors.length>0} />
	</PrintDialog>
{/if}

{#if startOpen}
	<ProjectStart item={data.item} sizes={sizeGrid} loadSizes={async (g) => (await loadSizeGrid(model, g)).data} onStart={choice=>void startProject(choice)} onSkip={()=>{startOpen=false;if(startClient)activeClientId=startClient;}} clientId={startClient}/>
{:else}
	<Onboarding />
{/if}

<style>
	.workspace-error{padding:var(--space-1) var(--workspace-gap);flex-shrink:0;}
	.workspace{
		display:flex;flex-direction:column;height:100%;min-height:0;
		--workspace-left:320px;--workspace-right:288px;
	}

	.columns{
		/* Боковые панели выезжают: ширина колонки плавно меняется между
		   панелью и узкой полосой с кнопкой, холст занимает освободившееся место. */
		--rail:32px;
		flex:1;display:grid;
		grid-template-columns:var(--lw) minmax(0,1fr) var(--rw);
		transition:grid-template-columns .24s cubic-bezier(.2,.7,.2,1);
		grid-template-rows:minmax(0,1fr);
		min-height:0;position:relative;
	}

	.side{
		position:relative;
		display:flex;flex-direction:column;gap:0;
		overflow-x:hidden;overflow-y:auto;min-height:0;min-width:0;overscroll-behavior:contain;
		padding:var(--space-4) var(--space-4) var(--space-6);
		background:var(--ui-surface);
	}
	.side-body{display:flex;flex-direction:column;min-width:calc(var(--workspace-left) - 2 * var(--space-4));}
	.side.right .side-body{min-width:calc(var(--workspace-right) - 2 * var(--space-4));}
	.side.left{border-right:1px solid var(--ui-line);}
	.side.right{border-left:1px solid var(--ui-line);}
	.side.closed{padding:0;overflow:hidden;cursor:pointer;}
	.side.closed:hover{background:color-mix(in srgb,var(--ui-ink) 4%,var(--ui-surface));}
	/* Кнопка на внутреннем крае панели: свернуть; у свёрнутой - вся полоса. */
	.edge-toggle{position:absolute;inset:0;width:100%;border:0;background:transparent;color:var(--ui-ink-soft);cursor:pointer;padding:var(--space-3) 0 0;}
	.edge-toggle:hover{color:var(--ui-accent);}
	.edge-toggle:focus-visible{outline:1px solid var(--ui-accent);outline-offset:1px;}
	.side.closed .edge-toggle{
		display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:var(--space-3);
		padding-top:var(--space-3);
	}
	.chev{width:6px;height:6px;border-left:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(45deg);margin-left:2px;}
	.side.right .chev{transform:rotate(-135deg);margin-left:0;margin-right:2px;}
	.side.left.closed .chev{transform:rotate(-135deg);margin-left:0;margin-right:2px;}
	.side.right.closed .chev{transform:rotate(45deg);margin-right:0;margin-left:2px;}
	.rail-label{writing-mode:vertical-rl;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--ui-ink-soft);}
	@media (prefers-reduced-motion: reduce){.columns{transition:none;}}

	.center{position:relative;min-height:0;min-width:0;height:100%;display:flex;overflow:hidden;}

	.canvas-wrap{flex:1;min-width:0;display:flex;flex-direction:column;min-height:0;}

	.readout{
		display:flex;align-items:center;gap:var(--space-4);flex-wrap:wrap;
		border-top:1px solid var(--ui-line);padding:var(--space-2) var(--space-4);
		font-size:11px;letter-spacing:.06em;color:var(--ui-ink-muted);
	}
	.readout-item{display:inline-flex;gap:var(--space-2);align-items:baseline;}
	.readout-name{text-transform:uppercase;letter-spacing:.14em;}
	.readout-item.on{color:var(--ui-ink);}
	.readout-item.on .readout-name{color:var(--ui-accent);}
	.readout-scale{margin-left:auto;}
	.keys-button{width:22px;height:22px;display:grid;place-items:center;border:1px solid var(--ui-line);border-radius:var(--ui-radius);background:var(--ui-surface);color:var(--ui-ink-soft);font:inherit;font-size:12px;cursor:pointer;padding:0;}
	.keys-button:hover{color:var(--ui-accent);border-color:var(--ui-accent);}
	.keys-overlay{position:fixed;inset:0;z-index:40;display:grid;place-items:center;padding:var(--space-4);background:color-mix(in srgb,var(--ui-bg) 82%,transparent);}
	.keys-dialog{width:min(420px,100%);display:flex;flex-direction:column;gap:var(--space-4);padding:var(--space-6);background:var(--ui-surface);border:1px solid var(--ui-ink);border-radius:var(--ui-radius);}
	.keys-dialog h2{margin:0;font-size:14px;letter-spacing:.16em;text-transform:uppercase;}
	.keys-dialog dl{display:grid;grid-template-columns:max-content 1fr;gap:var(--space-2) var(--space-4);margin:0;font-size:13px;}
	.keys-dialog dt{margin:0;}
	.keys-dialog dd{margin:0;color:var(--ui-ink-soft);}
	kbd{font:inherit;font-size:12px;padding:1px var(--space-1);border:1px solid var(--ui-line);border-bottom-width:2px;border-radius:var(--ui-radius);background:var(--ui-bg);}

		.mobile-measure{display:none;}

	@media(max-width:767px){
		.mobile-measure{
			display:flex;align-items:center;gap:var(--space-2);flex-wrap:nowrap;
			padding:var(--space-1) var(--space-3);border-bottom:1px solid var(--ui-line);flex-shrink:0;
		}
		.mm-label{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--ui-ink-muted);}
		.mm-value{font-size:28px;font-weight:700;line-height:1;letter-spacing:-.04em;width:80px;background:color-mix(in srgb,var(--ui-ink) 4%,transparent);border:1px solid transparent;padding:0 var(--space-half);text-align:right;color:var(--ui-ink);}
		.mm-value:focus{outline:none;border-color:var(--ui-accent);background:var(--ui-surface);}
		.mm-value::-webkit-outer-spin-button,.mm-value::-webkit-inner-spin-button{appearance:none;margin:0;}
		.mm-unit{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--ui-ink-muted);}
		.mm-slider{flex:1;min-width:100px;accent-color:var(--ui-accent);height:14px;}
	}
	.center{grid-column:2;grid-row:1;}
	.side.left{grid-column:1;grid-row:1;}
	.side.right{grid-column:3;grid-row:1;}
	.columns.swapped .side.left{grid-column:3;border-right:0;border-left:1px solid var(--ui-line);}
	.columns.swapped .side.right{grid-column:1;border-left:0;border-right:1px solid var(--ui-line);}
	.columns.swapped .side.left.closed .chev{transform:rotate(45deg);margin-left:2px;margin-right:0;}
	.columns.swapped .side.right.closed .chev{transform:rotate(-135deg);margin-left:0;margin-right:2px;}
	.columns.dragging{transition:none;cursor:col-resize;user-select:none;}
	/* Край панели: потянуть - изменить ширину; стрелки с клавиатуры тоже. */
	.resizer{position:absolute;top:0;bottom:0;width:6px;z-index:6;cursor:col-resize;background:transparent;border:0;padding:0;transition:background .12s;}
	.resizer:hover,.resizer:focus-visible,.columns.dragging .resizer{background:color-mix(in srgb,var(--ui-accent) 45%,transparent);outline:none;}
	/* Ноутбук поуже и планшет: чертёж на всю ширину, панели выезжают поверх
	   него с края и закрываются кнопками тулбара или клавишами [ и ]. */
	@media(max-width:1180px){
		.columns,.columns.left-closed,.columns.right-closed,.columns.left-closed.right-closed{grid-template-columns:minmax(0,1fr);}
		.side.closed{display:none;}
		.resizer{display:none;}
		.edge-toggle{display:none;}
		.center{grid-column:1;grid-row:1;}
		.side,.columns.swapped .side.left,.columns.swapped .side.right{position:absolute;top:0;bottom:0;width:min(340px,calc(100% - 2 * var(--workspace-gap)));z-index:5;background:var(--ui-surface);border:1px solid var(--ui-line);box-shadow:0 12px 32px color-mix(in srgb,var(--ui-ink) 14%,transparent);padding:var(--space-4);animation:drawer-in .22s cubic-bezier(.2,.7,.2,1);}
		.side.left{left:0;--from:-100%;}.side.right{right:0;--from:100%;}
		.columns.swapped .side.left{left:auto;right:0;--from:100%;}
		.columns.swapped .side.right{right:auto;left:0;--from:-100%;}
	}
	@keyframes drawer-in{from{transform:translateX(var(--from));opacity:.4;}to{transform:none;opacity:1;}}
	@media(prefers-reduced-motion:reduce){.side{animation:none !important;}}
</style>
