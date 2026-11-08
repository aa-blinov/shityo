import { error } from '@sveltejs/kit';
import { generatePattern, loadCatalog, loadSizeGrid, modelDefaults } from '$lib/data';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params }) => {
	const catalog = await loadCatalog();
	const item = catalog.data.find((entry) => entry.id === params.model);
	if (!item) {
		error(404, `Модель «${params.model}» не найдена`);
	}

	const defaults = modelDefaults(item);
	const gender = defaults.params.gender;
	const sizes = await loadSizeGrid(item.id, typeof gender === 'string' ? gender : undefined);
	const generated = await generatePattern(
		item.id,
		defaults.measurements,
		defaults.params,
		item
	);

	return {
		catalog: catalog.data,
		item,
		sizes: sizes.data,
		source: generated.source,
		measurements: defaults.measurements,
		params: defaults.params,
		result: generated.data
	};
};
