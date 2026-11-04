<script lang="ts">
 import PatternWorkspace from '$lib/components/PatternWorkspace.svelte';
 import {page} from '$app/state';
 import type {PageData} from './$types';
 let {data}:{data:PageData}=$props();
</script>
{#key `${data.item.id}:${page.url.searchParams.get('project')??''}:${page.url.searchParams.has('new')}`}
 <PatternWorkspace {data}/>
{/key}
