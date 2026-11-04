import ui from '@monos/ui/tailwind-preset';

/** @type {import('tailwindcss').Config} */
export default {
	presets: [ui],
	// Кит поставляет исходники, поэтому Tailwind должен видеть и его
	// классы: без этого они вырезаются из сборки.
	content: [
		'./src/**/*.{svelte,js,ts}',
		'./node_modules/@monos/ui/src/**/*.svelte'
	]
};
