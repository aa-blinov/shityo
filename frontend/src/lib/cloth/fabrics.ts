/**
 * Свойства полотна для 3D-превью.
 *
 * Изделия шьют из разных тканей: футболку и кофты - из трикотажа, который
 * тянется и мягко ложится; рубашку, платье и юбку - из лёгкой тканой ткани;
 * брюки, жилет и пальто - из плотной костюмной или пальтовой. Солвер XPBD
 * получает эти свойства через податливость рёбер (чем больше, тем легче
 * ткань растягивается), предел растяжения, затухание и то, насколько далеко
 * ткань может отойти от собранной формы под весом.
 */
export interface Fabric {
	id: 'knit' | 'woven' | 'heavy';
	/** податливость ребра вдоль долевой нити (основа), м/Н: больше - мягче */
	compliance: number;
	/** податливость поперёк долевой (уток) */
	weftCompliance: number;
	/** податливость связей изгиба: больше - ткань легче складывается */
	bend: number;
	/** предел растяжения ребра (1,08 = на 8 %) */
	stretchLimit: number;
	/** затухание скорости за секунду */
	damping: number;
	/** насколько ткань может провиснуть от собранной формы, м */
	drape: number;
}

/** Типовые измеренные параметры полотна класса: растяжение по утку и основе, %, плотность, г/м². */
export const FABRIC_DEFAULTS: Record<Fabric['id'], { weft: number; warp: number; weight: number }> = {
	knit: { weft: 15, warp: 6, weight: 200 },
	woven: { weft: 8, warp: 5, weight: 130 },
	heavy: { weft: 3, warp: 2, weight: 400 }
};

/** Изгибная податливость класса при 200 г/м²: трикотаж мягкий, костюмная жёсткая. */
const BEND_BASE: Record<Fabric['id'], number> = { knit: 1e-4, woven: 3e-5, heavy: 3e-6 };

function compliance(stretch: number): number {
	return Math.pow(10, -7.4 + ((stretch - 3) * 1.4) / 12);
}

/**
 * Полотно по измеренным параметрам ткани, которую швея берёт в работу.
 *
 * Растяжение поперёк (уток) и по долевой (основа), % - как на этикетке или по
 * пробе на 10 см: задают податливость рёбер по их направлению на лекале и
 * предел растяжения. Плотность, г/м²: тяжёлая ткань быстрее гасит колебания
 * и труднее складывается. Провисание растёт с растяжимостью и весом.
 */
export function measuredFabric(
	id: Fabric['id'],
	weft: number,
	warp: number,
	weight: number
): Fabric {
	const across = Math.min(40, Math.max(0, weft));
	const along = Math.min(40, Math.max(0, warp));
	const w = Math.min(800, Math.max(50, weight));
	return {
		id,
		compliance: compliance(along),
		weftCompliance: compliance(across),
		bend: BEND_BASE[id] * (200 / w),
		stretchLimit: 1 + Math.max(across, along) / 100,
		damping: Math.min(0.3, 0.1 + (w / 1000) * 0.25),
		drape: Math.min(0.03, Math.max(0.006, 0.004 + (across / 100) * 0.1 + (w / 1000) * 0.01))
	};
}

export const FABRICS: Record<Fabric['id'], Fabric> = {
	knit: measuredFabric('knit', 15, 6, 200),
	woven: measuredFabric('woven', 8, 5, 130),
	heavy: measuredFabric('heavy', 3, 2, 400)
};

const BY_MODEL: Record<string, Fabric['id']> = {
	tee: 'knit',
	sweatshirt: 'knit',
	hoodie: 'knit',
	jumper: 'knit',
	cardigan: 'knit',
	shirt: 'woven',
	dress: 'woven',
	skirt: 'woven',
	trousers: 'heavy',
	vest: 'heavy',
	coat: 'heavy'
};

export function fabricFor(model: string | undefined): Fabric {
	return FABRICS[(model && BY_MODEL[model]) || 'woven'];
}
