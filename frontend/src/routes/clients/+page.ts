import { loadCatalog } from '$lib/data';
import type { PageLoad } from './$types';

export const load: PageLoad = async () => {
	const { data, source } = await loadCatalog();
	return { items: data, source };
};
