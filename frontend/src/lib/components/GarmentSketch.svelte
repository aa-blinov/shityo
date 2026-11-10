<script lang="ts">
	/**
	 * Технический эскиз основы: плоский силуэт изделия одной линией.
	 *
	 * Мастер узнаёт основу по силуэту быстрее, чем по описанию, поэтому
	 * в каталоге у каждой карточки есть эскиз. Рисунок условный: это не
	 * чертёж и не масштаб, пропорции подобраны для узнавания.
	 */
	/** allowance: только внешний контур пунктиром - линия припуска вокруг изделия. */
	let { id, allowance = false }: { id: string; allowance?: boolean } = $props();

	const OUTLINES: Record<string, string[]> = {
		tee: ['M17 8 L12 10 L5 16 L9 21 L13 18 L13 42 L35 42 L35 18 L39 21 L43 16 L36 10 L31 8 Q24 13 17 8 Z'],
		longsleeve: [
			'M17 8 L12 10 L6 22 L4 38 L9 39 L13 24 L13 42 L35 42 L35 24 L39 39 L44 38 L42 22 L36 10 L31 8 Q24 13 17 8 Z'
		],
		shirt: [
			'M18 8 L12 10 L6 22 L4 37 L9 38 L13 24 L13 43 L35 43 L35 24 L39 38 L44 37 L42 22 L36 10 L30 8',
			'M18 8 L22 14 L24 12 L26 14 L30 8 L28 6 L20 6 Z',
			'M24 12 L24 43',
			'M4 37 L4 40 L9 41 L9 38 M44 37 L44 40 L39 41 L39 38'
		],
		dress: [
			'M18 6 L16 7 Q15 13 13 16 Q15 21 15 26 Q14 34 12 44 L36 44 Q34 34 33 26 Q33 21 35 16 Q33 13 32 7 L30 6 Q24 11 18 6 Z'
		],
		vest: [
			'M18 6 L14 8 Q14 14 12 17 L12 38 L22 40 L24 38 L26 40 L36 38 L36 17 Q34 14 34 8 L30 6 L24 22 Z',
			'M24 22 L24 38'
		],
		// Пальто узнаётся по длине ниже колена, лацканам, двубортной застёжке и поясу.
		coat: [
			'M20 5 L15 7 L8 28 L11.5 29 L15.5 15 L13 46 L35 46 L32.5 15 L36.5 29 L40 28 L33 7 L28 5',
			'M20 5 Q24 3.6 28 5',
			'M20 5 L18.6 10.5 L20.6 11 L24 21 M28 5 L29.4 10.5 L27.4 11 L24 21',
			'M24 21 L24 46',
			'M14.3 30 L33.7 30 M14.2 32 L33.8 32',
			'M16.5 37 L21 37 M27 37 L31.5 37'
		],
		// Бельё.
		briefs: ['M10 14 L38 14 L37 20 Q30 24 26 34 L22 34 Q18 24 11 20 Z', 'M10.4 17 L37.6 17', 'M22 31 L26 31'],
		boxers: ['M11 12 L37 12 L38 31 L27 33 L24 25 L21 33 L10 31 Z', 'M11 15.5 L37 15.5', 'M20.5 16 Q24 25 27.5 16'],
		bralette: [
			'M8 30 L40 30 L40 35 L8 35 Z',
			'M9 30 Q11 18 18 14 Q22 22 24 30 M24 30 Q26 22 30 14 Q37 18 39 30',
			'M18 14 L16 4 M30 14 L32 4',
			'M10.6 24 Q16 22 21.8 25 M26.2 25 Q32 22 37.4 24'
		],
		slip: ['M15 12 Q24 23 33 12 L35 22 Q33 28 34 32 L37 45 L11 45 L14 32 Q15 28 13 22 Z', 'M16 13 L17 4 M32 13 L31 4'],
		trousers: ['M14 6 L34 6 L36 44 L27 44 L24 18 L21 44 L12 44 Z', 'M14 9 L34 9'],
		skirt: ['M16 8 L32 8 L39 40 Q24 43 9 40 Z', 'M16 11 L32 11'],
		sweatshirt: [
			'M17 9 L11 11 L5 24 L4 37 L10 38 L13 25 L13 40 L35 40 L35 25 L38 38 L44 37 L43 24 L37 11 L31 9 Q24 13 17 9 Z',
			'M17 9 Q24 15 31 9',
			'M13 40 L13 43 L35 43 L35 40',
			'M4 37 L4 40 L10 41 L10 38 M44 37 L44 40 L38 41 L38 38'
		],
		hoodie: [
			'M17 9 L11 11 L5 24 L4 37 L10 38 L13 25 L13 40 L35 40 L35 25 L38 38 L44 37 L43 24 L37 11 L31 9 Q24 13 17 9 Z',
			'M17 9 Q16 2 24 2 Q32 2 31 9',
			'M13 40 L13 43 L35 43 L35 40',
			'M4 37 L4 40 L10 41 L10 38 M44 37 L44 40 L38 41 L38 38',
			'M18 30 L30 30 L32 37 L16 37 Z'
		],
		jumper: [
			'M18 8 L12 10 L7 24 L6 38 L10 39 L13 25 L14 41 L34 41 L35 25 L38 39 L42 38 L41 24 L36 10 L30 8 L24 17 Z',
			'M14 41 L14 43 L34 43 L34 41'
		],
		cardigan: [
			'M18 8 L12 10 L7 24 L6 38 L10 39 L13 25 L14 41 L34 41 L35 25 L38 39 L42 38 L41 24 L36 10 L30 8 L24 17 Z',
			'M14 41 L14 43 L34 43 L34 41',
			'M24 17 L24 43'
		],
		// С нуля: деталь по точкам - контур, долевая и узлы, которые двигает мастер.
		custom: ['M15 8 L33 8 L39 40 L9 40 Z', 'M24 14 L24 34 M22 16 L24 13 L26 16 M22 32 L24 35 L26 32']
	};
	const BUTTONS: Record<string, [number, number][]> = {
		shirt: [
			[25.5, 20],
			[25.5, 27],
			[25.5, 34]
		],
		cardigan: [
			[25.5, 23],
			[25.5, 29],
			[25.5, 35]
		],
		custom: [
			[15, 8],
			[33, 8],
			[39, 40],
			[9, 40]
		],
		coat: [
			[21.5, 23],
			[21.5, 27],
			[26.5, 23],
			[26.5, 27]
		]
	};

	const paths = $derived(allowance ? (OUTLINES[id] ?? []).slice(0, 1) : (OUTLINES[id] ?? []));
	const buttons = $derived(allowance ? [] : (BUTTONS[id] ?? []));
</script>

<svg class="sketch" class:allowance viewBox="0 0 48 48" aria-hidden="true" focusable="false">
	{#each paths as d, index (index)}
		<path {d} />
	{/each}
	{#each buttons as [cx, cy], index (index)}
		<circle {cx} {cy} r="0.9" />
	{/each}
</svg>

<style>
	.sketch {
		display: block;
		width: 100%;
		height: auto;
		color: var(--ui-ink);
	}
	path {
		fill: none;
		stroke: currentColor;
		stroke-width: 1.1;
		stroke-linejoin: round;
		stroke-linecap: round;
	}
	circle {
		fill: currentColor;
	}
	/* Как на чертеже: контур сплошной, припуск - тонкий пунктир приглушённым цветом. */
	.allowance {
		color: var(--ui-ink-muted);
	}
	.allowance path {
		stroke-width: 0.6;
		stroke-dasharray: 1.6 1.2;
	}
</style>
