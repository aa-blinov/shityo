<script lang="ts">
 import { t } from '$lib/i18n';
 let {src,alt,srcset='',sizes='100vw',eager=false}:{src:string;alt:string;srcset?:string;sizes?:string;eager?:boolean}=$props();
 let failed=$state(false);
 $effect(()=>{src;failed=false;});
</script>
{#if failed || !src}<span class="unavailable">{$t('library.imageUnavailable')}</span>
{:else}<img {src} {alt} srcset={srcset || undefined} sizes={srcset?sizes:undefined} width="600" height="800" loading={eager?'eager':'lazy'} decoding="async" fetchpriority={eager?'high':'auto'} referrerpolicy="no-referrer" onerror={()=>failed=true}/>{/if}
<style>
 img{display:block;width:100%;height:100%;object-fit:cover;}
 .unavailable{display:flex;align-items:center;justify-content:center;min-height:120px;height:100%;padding:12px;background:var(--ui-surface-2);color:var(--ui-ink-soft);font-size:12px;}
</style>
