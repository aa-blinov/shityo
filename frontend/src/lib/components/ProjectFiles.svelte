<script lang="ts">
	import { Button } from '@monos/ui';
	import { t } from '$lib/i18n';
	import type { AttachedFile } from '$lib/projects';

	interface Props {
		files: AttachedFile[];
		onAdd: (file: AttachedFile) => void;
		onDelete: (id: string) => void;
		disabled?: boolean;
	}

	let { files, onAdd, onDelete, disabled = false }: Props = $props();
	let input = $state<HTMLInputElement | null>(null);

	const ACCEPT = '.pdf,.svg,.dxf';
	const MAX_BYTES = 1_000_000;

	function isAllowed(file: File): boolean {
		const lower = file.name.toLowerCase();
		return lower.endsWith('.pdf') || lower.endsWith('.svg') || lower.endsWith('.dxf');
	}

	function handleChange(event: Event) {
		const target = event.currentTarget as HTMLInputElement;
		const file = target.files?.[0];
		if (!file) return;
		if (!isAllowed(file)) {
			window.alert($t('project.fileInvalidType'));
			target.value = '';
			return;
		}
		if (file.size > MAX_BYTES) {
			window.alert($t('project.fileTooLarge'));
			target.value = '';
			return;
		}
		const reader = new FileReader();
		reader.onload = () => {
			onAdd({
				id: crypto.randomUUID(),
				name: file.name,
				type: file.type || 'application/octet-stream',
				size: file.size,
				dataUrl: reader.result as string,
				uploadedAt: new Date().toISOString()
			});
			target.value = '';
		};
		reader.readAsDataURL(file);
	}

	function download(file: AttachedFile) {
		const link = document.createElement('a');
		link.href = file.dataUrl;
		link.download = file.name;
		link.click();
	}
</script>

<div class="files-panel" data-testid="project-files">
	<label class="upload" class:disabled={disabled || files.length >= 10}>
		<input
			bind:this={input}
			type="file"
			accept={ACCEPT}
			onchange={handleChange}
			disabled={disabled || files.length >= 10}
			data-testid="project-file-input"
		/>
		<span class="upload-text">{$t('project.attachFile')}</span>
	</label>
	{#if files.length}
		<ul class="list">
			{#each files as file (file.id)}
				<li class="item">
					<button
						type="button"
						class="name"
						onclick={() => download(file)}
						title={file.name}
					>
						{file.name}
					</button>
					<span class="size">{(file.size / 1024).toFixed(1)} KB</span>
					<Button
						size="sm"
						variant="quiet"
						disabled={disabled}
						onclick={() => onDelete(file.id)}
						data-testid="project-file-delete"
					>
						{$t('project.deleteFile')}
					</Button>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="empty">{$t('project.noFiles')}</p>
	{/if}
</div>

<style>
	.files-panel {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.upload {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-1);
		padding: var(--space-2) var(--space-2);
		border: 1px dashed var(--ui-line);
		border-radius: var(--ui-radius);
		cursor: pointer;
		font-size: 12px;
		color: var(--ui-ink-soft);
		transition: border-color 0.15s, color 0.15s;
	}
	.upload:hover:not(.disabled) {
		border-color: var(--ui-accent);
		color: var(--ui-ink);
	}
	.upload.disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.upload input {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.item {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: 12px;
	}
	.name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		background: none;
		border: 0;
		padding: 0;
		text-align: left;
		color: var(--ui-accent);
		cursor: pointer;
	}
	.name:hover {
		text-decoration: underline;
	}
	.size {
		color: var(--ui-ink-muted);
		white-space: nowrap;
	}
	.empty {
		font-size: 12px;
		color: var(--ui-ink-muted);
		margin: 0;
	}
</style>
