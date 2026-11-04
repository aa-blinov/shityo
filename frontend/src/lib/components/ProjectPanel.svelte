<script lang="ts">
 import {Button,Card,TextField} from '@monos/ui';
 import {t} from '$lib/i18n';
 let {name,onName,onSave,onExport,onDuplicate,onUndo,onRedo,canUndo,canRedo,disabled,issue,dirty,open=false}:{name:string;onName:(name:string)=>void;onSave:()=>void;onExport:()=>void;onDuplicate:()=>void;onUndo:()=>void;onRedo:()=>void;canUndo:boolean;canRedo:boolean;disabled:boolean;issue:string;dirty:boolean;open?:boolean}=$props();
</script>
<Card><details {open} data-testid="project-panel"><summary>{$t('project.title')} {dirty?'•':''}</summary><div class="fields">
 <TextField id="project-name" label={$t('project.name')} value={name} maxlength="120" onchange={e=>onName(e.currentTarget.value)}/>
 <div class="actions"><Button size="sm" disabled={disabled||!name.trim()} onclick={onSave} data-testid="project-save">{$t('project.save')}</Button><Button size="sm" variant="secondary" disabled={disabled||!name.trim()} onclick={onDuplicate}>{$t('project.duplicate')}</Button></div>
 <div class="actions"><Button size="sm" disabled={!canUndo} onclick={onUndo} data-testid="project-undo">{$t('project.undo')}</Button><Button size="sm" disabled={!canRedo} onclick={onRedo} data-testid="project-redo">{$t('project.redo')}</Button></div>
 <Button size="sm" variant="secondary" disabled={!name.trim()} onclick={onExport}>{$t('project.export')}</Button>
 <p>{$t('project.local')}</p><p role="status" data-testid="project-status">{issue?$t(issue):dirty?$t('project.unsaved'):''}</p>
</div></details></Card>
<style>
 summary{cursor:pointer;font-size:14px;font-weight:600;}.fields{display:flex;flex-direction:column;gap:var(--space-3);padding-top:var(--space-3);}.actions{display:flex;flex-wrap:wrap;gap:var(--space-2);}p{font-size:12px;line-height:1.5;margin:0;color:var(--ui-ink-soft);}
</style>
