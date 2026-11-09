/**
 * Манекен: тело строится по меркам (обхват груди, талии, ширина плеч, рост,
 * длина рукава, обхват шеи). Та же модель используется и для построения
 * поверхности, на которую ложится ткань, и для коллайдеров физики.
 *
 * Система координат: Y - вверх, Z - вперёд (лицо), X - вправо.
 * Все величины - в метрах.
 */

import { bodyField, fieldDistance, snapTo } from './field';
import type { Piece } from '$lib/types';
import mannequin from './mannequin.json';

/**
 * Руки чуть отведены, как у демонстрационного манекена: при плечах
 * правильной ширины рука у подмышки иначе заходит в бок торса.
 */
export const ARM_SPREAD = 0.17;

export interface Vec3 {
	x: number;
	y: number;
	z: number;
}

export interface Ring {
	y: number;
	/** полуось по X (поперёк) */
	a: number;
	/** полуось по Z (вглубь) */
	b: number;
	/** от предыдущего кольца - по прямой (скат плеча), а не плавной кривой */
	linear?: boolean;
	/** сдвиг центра вперёд (+) или назад (-), м: икра выступает назад */
	z?: number;
}

/**
 * Какие части у манекена. Портновский манекен - торс на стойке; руки
 * ставятся для изделий с рукавом, ноги - для брюк. Чего нет, того нет и в
 * столкновениях: ткань висит, как на настоящем манекене.
 */
export interface BodyParts {
	arms: boolean;
	legs: boolean;
}

export interface BodyModel {
	/** женская фигура: от пола зависит рельеф торса */
	female: boolean;
	/** части манекена; по умолчанию все (регрессии, раскладка) */
	parts: BodyParts;
	/** сечения торса по MakeHuman, подогнанные под мерки (см. sculptTrunk) */
	sculpt: Sculpt;
    crotchY: number;
	height: number;
	/** высота плечевой линии */
	shoulderY: number;
	/** высота основания шеи */
	neckY: number;
	/** высота колена */
	kneeY: number;
	/** радиус основания шеи */
	neckR: number;
	/** радиус плеча (половина ширины плеч) */
	shoulderR: number;
	/** высота плечевой точки: конец плечевого шва */
	shoulderTipY: number;
	/** высота подмышки: нижняя точка проймы */
	armpitY: number;
	/** обхват груди */
	bust: number;
	/** обхват талии */
	waist: number;
	/** обхват бёдер */
	hip: number;
	/** высота нижнего края (бедро/верх бедра) */
	hipY: number;
	/** высота талии */
	waistY: number;
	/** высота груди */
	bustY: number;
	/** длина руки (плечо → запястье) */
	armLength: number;
	/**
	 * Профиль руки: контрольные точки (расстояние от плеча в метрах, полуоси).
	 *
	 * Рука - не цилиндр: у плеча её сужает дельтовидная мышца, дальше
	 * расходится до бицепса и сужается к запястью. Сечение руки эллиптическое:
	 * рука прилегает к боку, поэтому по бокам она уже, чем вглубь.
	 *
	 * Полуоси заданы в долях `armR` - радиуса круга с тем же обхватом, что
	 * бицепс. Масштаб `armR` подбирается так, чтобы обхват в бицепсе совпал
	 * с меркой.
	 */
	armProfile: { s: number; a: number; b: number }[];
	/** радиус круга с обхватом бицепса */
	armR: number;
	/** положение верхней точки руки (плечевая точка) */
	armOrigin: Vec3;
	/** положение запястья */
	wrist: Vec3;
	rings: Ring[];
}

/** Перевод из сантиметров в метры. */
export function cm(v: number | undefined, fallback: number): number {
	return (v === undefined || !Number.isFinite(v) ? fallback : v) / 100;
}

/**
 * Эллипс заданного обхвата: полуоси a (поперёк) и b (вглубь).
 * Обхват эллипса приблизительно π*(a+b) для близких осей; уточняем
 * итеративно по формуле Рамананана.
 */
function ellipseAxes(girth: number, ratio: number): { a: number; b: number } {
	const g = Math.max(0.05, girth);
	let a = g / (2 * Math.PI) * 1.5;
	for (let i = 0; i < 24; i++) {
		const b = a / ratio;
		const p = Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
		a *= g / p;
	}
	const b = a / ratio;
	return { a, b };
}

export interface ArmFrame {
	/** верхняя точка руки (плечевая точка) */
	origin: Vec3;
	/** единичный вектор вниз по руке */
	axis: Vec3;
	/** горизонтальное направление «наружу от тела» */
	out: Vec3;
	/** перпендикуляр «вперёд» */
	forward: Vec3;
}

/**
 * Рамка руки: начало в верхней точке руки, ось вниз, «наружу» и «вперёд».
 *
 * В этой рамке считается пройма и строится рукав: пройма обходит руку, а
 * рукав спускается по оси. Оба строятся в одном базисе, иначе ткань
 * перекручивается.
 */
export function armFrame(model: BodyModel, side: 1 | -1): ArmFrame {
	const origin: Vec3 = { x: side * model.armOrigin.x, y: model.armOrigin.y, z: 0 };
	// Slight A-pose, with horizontal cross-sections following armPoint().
	const axis: Vec3 = { x: side*ARM_SPREAD/Math.hypot(1,ARM_SPREAD), y: -1/Math.hypot(1,ARM_SPREAD), z: 0 };
	const forward: Vec3 = { x: 0, y: 0, z: 1 };
	const out: Vec3 = { x: side, y: 0, z: 0 };
	return { origin, axis, out, forward };
}

/**
 * Точка плеча: конец плечевого шва и начало проймы.
 */
export function shoulderTipPoint(model: BodyModel, side: 1 | -1): Vec3 {
	return { x: side * model.shoulderR, y: model.shoulderTipY, z: 0 };
}

/**
 * Точка подмышки: низ проймы и начало бокового шва.
 */
export function armpitPoint(model: BodyModel, side: 1 | -1): Vec3 {
	const a = trunkRadius(model, model.armpitY, Math.PI / 2);
	return { x: side * a, y: model.armpitY, z: 0 };
}

/**
 * Модель тела по меркам. Плечи, шея и руки выводятся из ширины плеч и
 * длины рукава, остальные обхваты - из груди и талии.
 */
/**
 * Типовая фигура по ГОСТ (женщина 164-92-100, мужчина 176-100-104): ей
 * заполняются мерки, которых у изделия нет. Юбке не нужен обхват груди,
 * но манекену он нужен - иначе под юбкой стоял бы мужской торс.
 */
const TYPICAL: Record<'female' | 'male', Record<string, number>> = {
	female: {
		height: 164,
		bust: 92,
		waist: 74,
		hip: 100,
		shoulder_width: 39.2,
		shoulder_slope: 18,
		neck_circumference: 35.4,
		neck_to_waist: 40.3,
		waist_to_armpit: 21.1,
		biceps: 28.4,
		sleeve_length: 57.9,
		crotch_depth: 27
	},
	male: {
		height: 176,
		bust: 100,
		waist: 88,
		hip: 104,
		shoulder_width: 47,
		shoulder_slope: 16,
		neck_circumference: 39.2,
		neck_to_waist: 44.4,
		waist_to_armpit: 21.8,
		biceps: 32,
		sleeve_length: 61.9,
		crotch_depth: 28
	}
};

export type BodyGender = 'female' | 'male';

/**
 * Мерки манекена из мерок изделия.
 *
 * Полуобхваты платья и пальто переводятся в обхваты, длина спинки до талии
 * и глубина проймы - в мерки торса. Недостающее берётся из типовой фигуры
 * своего пола и масштабируется по известному обхвату, чтобы фигура осталась
 * соразмерной.
 */
export function bodyMeasurements(
	measurements: Record<string, number>,
	gender: BodyGender
): Record<string, number> {
	const m: Record<string, number> = {};
	for (const [key, value] of Object.entries(measurements)) {
		if (Number.isFinite(value)) m[key] = value;
	}
	const half = (key: string, full: string) => {
		if (m[full] === undefined && m[key] !== undefined) m[full] = m[key] * 2;
	};
	half('half_bust', 'bust');
	half('half_waist', 'waist');
	half('half_hip', 'hip');
	half('half_neck', 'neck_circumference');
	if (m.neck_to_waist === undefined && m.back_waist_length !== undefined) {
		m.neck_to_waist = m.back_waist_length;
	}
	if (m.waist_to_armpit === undefined && m.back_waist_length !== undefined && m.armhole_depth !== undefined) {
		m.waist_to_armpit = m.back_waist_length - m.armhole_depth;
	}
	const typical = TYPICAL[gender];
	// Масштаб обхватов: по груди, а если её нет - по бёдрам.
	const scale =
		m.bust !== undefined ? m.bust / typical.bust : m.hip !== undefined ? m.hip / typical.hip : 1;
	for (const key of ['bust', 'waist', 'hip', 'neck_circumference', 'biceps', 'shoulder_width']) {
		if (m[key] === undefined) m[key] = typical[key] * scale;
	}
	for (const [key, value] of Object.entries(typical)) {
		if (m[key] === undefined) m[key] = value;
	}
	return m;
}

export function buildBodyModel(
	source: Record<string, number>,
	options: { gender?: BodyGender; parts?: Partial<BodyParts> } = {}
): BodyModel {
	// Пол фигуры: из изделия, а если не задан - по соотношению бёдер и груди.
	const guessed =
		source.hip !== undefined && source.bust !== undefined && source.hip / source.bust > 0.99
			? 'female'
			: 'male';
	const gender: BodyGender = options.gender ?? guessed;
	const measurements = bodyMeasurements(source, gender);
	const female = gender === 'female';
	const height = cm(measurements.height, 176);
	const bust = cm(measurements.bust, 96);
	const waist = cm(measurements.waist, 84);
	// Ширину плеч меряют по спине, через выпуклость лопаток; между плечевыми
	// точками по прямой она примерно на 8 % короче (0,22-0,245 роста).
	const shoulderWidth = cm(measurements.shoulder_width, 46) * 0.92;
	const neckGirth = cm(measurements.neck_circumference, 40);
	// Длину рукава меряют по слегка согнутому локтю; прямая рука до
	// запястья короче: по ГОСТ 55,2-55,6 см при рукаве 57,9 см.
	const armLength = cm(measurements.sleeve_length, 62) * 0.955;

	const neckR = neckGirth / (2 * Math.PI);
	const shoulderR = shoulderWidth / 2;
	const hip = cm(measurements.hip, bust * 103);
	// Высоты - по меркам клиента, а где мерок нет - по типовым долям роста
	// (ГОСТ 31396/31399): талия 0,62-0,63 роста, основание шеи 0,84,
	// плечевая точка 0,81, колено 0,285.
	const within = (v: number, lo: number, hi: number) => Math.min(height * hi, Math.max(height * lo, v));
	const legHeight =
		source.inseam_length !== undefined && source.crotch_depth !== undefined
			? cm(source.inseam_length + source.crotch_depth, 0)
			: height * (female ? 0.625 : 0.62);
	const waistY = within(legHeight, 0.57, 0.67);
	// Длина спины до талии меряется от седьмого позвонка по изгибу спины;
	// по вертикали спина короче мерки. С долей 0,88 дуга спины манекена от
	// основания шеи до талии выходила на 4 см короче той же длины на лекале,
	// и лишняя ткань лифа собиралась складкой над поясницей. С 0,92 дуга
	// совпадает с лекалом (около 38 см при мерке 40,2).
	const backLength = cm(measurements.neck_to_waist, height * 0.25 * 100);
	const shoulderY = within(waistY + backLength * 0.92, 0.8, 0.88);
	const neckY = shoulderY + height * 0.03;
	const hipY =
		source.waist_to_hip !== undefined
			? within(waistY - cm(source.waist_to_hip, 0), 0.45, 0.58)
			: height * (female ? 0.52 : 0.53);
    const crotchY = waistY - cm(measurements.crotch_depth,30);
	const kneeY =
		source.knee_length !== undefined
			? within(waistY - cm(source.knee_length, 0), 0.22, 0.34)
			: height * 0.285;

	// От плечевой точки до подмышки пройма идёт почти вертикально: столько
	// же ткани уходит на пройму в лекале. Обе точки привязаны к линии плеч -
	// к ней же привязана раскладка, иначе пройма в 3D не совпадает с
	// проймой лекала.
	const shoulderSlope = ((measurements.shoulder_slope ?? 13) * Math.PI) / 180;
	const shoulderTipY = shoulderY - (shoulderR - neckR) * Math.tan(shoulderSlope);
	const armholeDepth = cm(measurements.neck_to_waist, 44) - cm(measurements.waist_to_armpit, 22) * 0.955;
	const armpitY = shoulderY - armholeDepth;
	// Высота груди - от основания шеи до точки груди; без мерки - доля роста.
	const bustY = Math.min(
		armpitY - height * 0.01,
		source.bust_height !== undefined ? shoulderY - cm(source.bust_height, 0) : height * (female ? 0.715 : 0.72)
	);
	// Радиус руки - из обхвата бицепса: окружность бицепса и есть обхват
	// руки. Раньше радиус считался от обхвата груди, и рука получалась
	// втрое толще, чем на мерках: рукав в неё не влезал.
	const biceps = cm(measurements.biceps, 0);
	const armGirth = biceps > 0 ? biceps : Math.max(0.28, bust * 0.34);
	// Масштаб профиля подбирается так, чтобы обхват в бицепсе совпал с меркой.
	const armR = solveArmScale(armGirth);
	const armProfile = armShape(female ? 'female' : 'male', armLength);

	// Обхват груди и остальные обхваты - из мерок.
	const shoulderGirth = bust * 0.92;

	// Сечения торса по полу. Мужская грудная клетка шире, чем вглубь; у
	// женской фигуры грудь выступает вперёд (сечение глубже), под грудью
	// торс заметно уже, а бёдра шире талии сильнее, чем у мужской.
	// Отношения - для основы под рельеф: грудь и ягодицы добавляют глубины
	// сами, поэтому основа шире, чем вглубь.
	// Сечение живого торса - не эллипс: при том же обхвате эллипс выходит
	// шире. Отношения подобраны так, чтобы ширина груди была около 0,18
	// роста у женщины и 0,19 у мужчины, как у типовых фигур.
	const chest = ellipseAxes(bust, female ? 1.16 : 1.24);
	const waistAxes = ellipseAxes(waist, female ? 1.36 : 1.24);
	const hipAxes = ellipseAxes(hip, female ? 1.45 : 1.34);
	const shoulderAxes = ellipseAxes(shoulderGirth, female ? 1.55 : 1.5);
	const underbust = ellipseAxes(bust * 0.86, 1.2);

	const rings: Ring[] = [
		// Нижнее кольцо таза - над линией шага: глубина сидения из мерок
		// может поднять шаг выше доли роста, и тогда таз и ноги расходились.
		{ y: Math.max(hipY - height * 0.06, crotchY + 0.02), a: hipAxes.a * 0.97, b: hipAxes.b * 0.97 },
		{ y: hipY, a: hipAxes.a, b: hipAxes.b },
		{ y: waistY, a: waistAxes.a, b: waistAxes.b },
		...(female
			? [{ y: bustY - height * 0.04, a: underbust.a, b: underbust.b }]
			: []),
		{ y: bustY, a: chest.a, b: chest.b },
		// Плечи манекена шире груди и доходят до дельты: трапеция и дельта
		// образуют площадку под лопаткой. Если торс уже дельты, ткань между
		// плечевым швом и проймой натягивается через пустоту и рвётся
		// зубцами на плече.
		{ y: shoulderTipY, a: Math.max(shoulderAxes.a, shoulderR * 0.985), b: shoulderAxes.b * 1.12 },
		// Скат плеча - трапециевидная мышца: прямая от плечевой точки к
		// основанию шеи под углом мерки «наклон плеча». Плавная кривая между
		// плечом и шеей давала «бутылку»: шея будто начиналась от плеч.
		// Над плечевой точкой - скругление дельты, дальше прямая трапеция.
		// Сверху плечо - гребень: спереди оно уходит к ключице, сзади к
		// лопатке, поэтому вглубь оно тоньше, чем на уровне подмышки.
		{
			y: shoulderTipY + (shoulderY - shoulderTipY) * 0.22,
			a: Math.max(shoulderAxes.a, shoulderR * 0.985) - 0.018,
			b: shoulderAxes.b * 0.95
		},
		{
			y: shoulderTipY + (shoulderY - shoulderTipY) * 0.6,
			a: Math.max(shoulderAxes.a, shoulderR * 0.985) * 0.4 + neckR * 1.3 * 0.6,
			b: neckR * 1.3,
			linear: true
		},
		{ y: shoulderY, a: neckR * 1.3, b: neckR * 1.25, linear: true },
		{ y: neckY, a: neckR, b: neckR },
	];
	// Рука висит сбоку от торса, осью вниз. Её верхняя точка - плечевая
	// точка тела: дельта приходится ровно под конец плечевого шва, и пройма
	// идёт по поверхности дельты, а не сквозь руку.
	const armOrigin: Vec3 = {
		x: shoulderR - armSemiAxis(armProfile, armR, 0).a,
		y: shoulderTipY,
		z: 0
	};
	const wrist: Vec3 = { x: armOrigin.x+armLength*ARM_SPREAD, y: armOrigin.y - armLength, z: 0 };

	const model: Omit<BodyModel, 'sculpt' | 'parts'> = {
		female,
		height,
        crotchY,
		shoulderY,
		shoulderTipY,
		armpitY,
		neckY,
		kneeY,
		neckR,
		shoulderR,
		bust,
		waist,
		hip,
		hipY,
		waistY,
		bustY,
		armLength,
		armProfile,
		armR,
		armOrigin,
		wrist,
		rings,
	};
	const parts: BodyParts = { arms: options.parts?.arms ?? true, legs: options.parts?.legs ?? true };
	return { ...model, parts, sculpt: sculptTrunk({ ...model, parts } as BodyModel, female ? 'female' : 'male') };
}

/** Радиус тела в направлении theta (0 - вперед, pi/2 - вбок) на высоте y. */
export function bodyRadius(model: BodyModel, y: number, theta: number): { a: number; b: number } {
	const rings = model.rings;
	if (y <= rings[0].y) return { a: rings[0].a, b: rings[0].b };
	for (let i = 0; i < rings.length - 1; i++) {
		const lo = rings[i];
		const hi = rings[i + 1];
		if (y <= hi.y) {
			const t = (y - lo.y) / (hi.y - lo.y);
			const e = hi.linear ? t : t * t * (3 - 2 * t);
			return { a: lo.a + (hi.a - lo.a) * e, b: lo.b + (hi.b - lo.b) * e };
		}
	}
	const last = rings[rings.length - 1];
	return { a: last.a, b: last.b };
}

/** Сечения торса, подогнанные под мерки: высоты срезов и радиусы по углу, м. */
export interface Sculpt {
	ys: number[];
	rows: Float64Array[];
	angles: number;
	/**
	 * Ядро торса для гладкого манекена (поле расстояний, field.ts): выше
	 * подмышки без среза по ширине плеч и бокового овала, бок срезан по
	 * внутренней стороне руки. Плечо дают трапеция и дельта, слитые с ним.
	 */
	core: Float64Array[];
}

/** Полярный радиус эллипса в направлении phi. */
function ellipsePolar(a: number, b: number, phi: number): number {
	const s = Math.sin(phi) / a;
	const c = Math.cos(phi) / b;
	return 1 / Math.sqrt(s * s + c * c);
}

function rowGirth(row: ArrayLike<number>): number {
	const n = row.length;
	let total = 0;
	for (let k = 0; k < n; k++) {
		const p0 = (2 * Math.PI * k) / n;
		const p1 = (2 * Math.PI * (k + 1)) / n;
		const r0 = row[k];
		const r1 = row[(k + 1) % n];
		total += Math.hypot(r1 * Math.sin(p1) - r0 * Math.sin(p0), r1 * Math.cos(p1) - r0 * Math.cos(p0));
	}
	return total;
}

/**
 * Торс манекена по базовой модели MakeHuman (CC0), подогнанный под мерки.
 *
 * Эллипс по меркам - бочка: в нём нет ни груди, ни лопаток, ни ягодиц.
 * Поэтому форма сечений берётся у модели живого человека (таблицу строит
 * scripts/build_mannequin.py), а размеры - у клиента:
 * - высоты срезов переносятся с ориентиров модели (шаг, бёдра, талия,
 *   грудь, подмышка, плечевая точка, основание шеи) на высоты по меркам;
 * - ниже подмышки срез масштабируется до обхвата по меркам на этой высоте,
 *   ниже бёдер - как на бёдрах (таз сходится к шагу по форме модели);
 * - выше подмышки масштаб плавно переходит к ширине плеч и обхвату шеи.
 */
function sculptTrunk(model: BodyModel, gender: 'female' | 'male'): Sculpt {
	const table = mannequin[gender];
	const lm = table.landmarks;
	const pairs: [number, number][] = [
		[lm.crotch, model.crotchY],
		[lm.hip, model.hipY],
		[lm.waist, model.waistY],
		[lm.bust, model.bustY],
		[lm.armpit, model.armpitY],
		[lm.shoulderTip, model.shoulderTipY],
		[lm.sideNeck, model.shoulderY],
		[lm.neckTop, model.neckY]
	];
	for (let i = 1; i < pairs.length; i++) pairs[i][1] = Math.max(pairs[i][1], pairs[i - 1][1] + 0.005);
	const map = (y: number) => {
		for (let i = 1; i < pairs.length; i++) {
			const [m0, b0] = pairs[i - 1];
			const [m1, b1] = pairs[i];
			if (y <= m1 || i === pairs.length - 1) return b0 + ((y - m0) / (m1 - m0)) * (b1 - b0);
		}
		return y;
	};
	const n = mannequin.angles;
	const ys = table.ys.map(map);
	// Ниже бёдер срез захватывает оба бедра ног, и в сечении остаются
	// острые доли; ткань на них срезала угол. Здесь сечение сглаживается
	// до подгонки обхватов, иначе обхват уменьшился бы.
	const radii = table.radii.map((row, i) => {
		const width = ys[i] < model.hipY ? 5 : ys[i] < model.waistY ? 3 : 2;
		return row.map((_, k) => {
			let sum = 0;
			for (let d = -width; d <= width; d++) sum += row[(k + d + n) % n];
			return sum / (2 * width + 1);
		});
	});
	const side = (row: number[]) => Math.max(row[n / 4], row[(3 * n) / 4]);
	const nearest = (y: number) => ys.reduce((best, v, i) => (Math.abs(v - y) < Math.abs(ys[best] - y) ? i : best), 0);
	const girthScale = (i: number) => {
		const { a, b } = bodyRadius(model, ys[i], 0);
		return ellipseGirth(a, b) / rowGirth(radii[i]);
	};
	const sHip = girthScale(nearest(model.hipY));
	const sArmpit = girthScale(nearest(model.armpitY));
	const sTip = (model.shoulderR * 0.985) / side(radii[nearest(model.shoulderTipY)]);
	const sNeck = model.neckR / side(radii[radii.length - 1]);
	const scale = (i: number) => {
		const y = ys[i];
		if (y < model.hipY) return sHip;
		if (y < model.armpitY) return girthScale(i);
		if (y < model.shoulderTipY) return sArmpit + ((y - model.armpitY) / (model.shoulderTipY - model.armpitY)) * (sTip - sArmpit);
		return sTip + ((y - model.shoulderTipY) / Math.max(1e-6, model.neckY - model.shoulderTipY)) * (sNeck - sTip);
	};
	// Выше подмышки торс срезан по ширине плеч: модель стоит в A-позе, и
	// плечо у неё уходит в руку. Без среза оно торчало крыльями за руку.
	// Дальняя точка ног по лучу; между бёдрами луч ног не встречает, и там
	// таз сходится к промежности.
	const legs = legProfile(model);
	const top = legs.rings[0];
	const legsFar = (k: number) => {
		const phi = (2 * Math.PI * k) / n;
		const dx = Math.sin(phi);
		const dz = Math.cos(phi);
		let far = 0.01;
		for (const side of [-1, 1]) {
			const cx = side * legs.x;
			const A = (dx / top.a) ** 2 + (dz / top.b) ** 2;
			const B = (-2 * cx * dx) / (top.a * top.a);
			const C = (cx / top.a) ** 2 - 1;
			const D = B * B - 4 * A * C;
			if (D >= 0) far = Math.max(far, (-B + Math.sqrt(D)) / (2 * A) + 0.004);
		}
		return far;
	};
	const clampUnderArm = (y: number, out: Float64Array) => {
		if (y >= model.armpitY + 0.06 || y <= model.armpitY - 0.12) return;
		// Выше подмышки ограничение плавно сходит на нет: резкий край давал ступеньку.
		const f = Math.max(0, (y - model.armpitY) / 0.06);
		const loose = 1 + 3 * f * f;
		const s0 = model.shoulderTipY - y;
		const inner = model.armOrigin.x + s0 * ARM_SPREAD - armSemiAxis(model.armProfile, model.armR, s0).a - 0.012;
		for (let k = 0; k < n; k++) {
			const sn = Math.abs(Math.sin((2 * Math.PI * k) / n));
			if (sn > 1e-6) out[k] = Math.min(out[k], (Math.max(inner, 0.05) * loose) / sn);
		}
	};
	// Ядро выше подмышки: бок не шире внутренней стороны руки, выше плечевой
	// точки - не шире основания руки. Остальное плечо - фигуры поля.
	const coreClamp = (y: number, out: Float64Array) => {
		if (y < model.armpitY - 0.01 || y > model.shoulderY) return;
		const s0 = Math.max(0, model.shoulderTipY - y);
		const inner = model.armOrigin.x + s0 * ARM_SPREAD - armSemiAxis(model.armProfile, model.armR, s0).a - 0.004;
		for (let k = 0; k < n; k++) {
			const sn = Math.abs(Math.sin((2 * Math.PI * k) / n));
			if (sn > 1e-6) out[k] = Math.min(out[k], Math.max(inner, 0.05) / sn);
		}
	};
	const cores: Float64Array[] = new Array(radii.length);
	const rows = radii.map((row, i) => {
		const out = Float64Array.from(row, (r) => r * scale(i));
		const y = ys[i];
		// Низ таза за 5 см до шага сходится к ногам: иначе под тазом во всю
		// ширину бёдер получается ступенька.
		if (y < model.crotchY + 0.05) {
			const t = Math.max(0, (y - model.crotchY) / 0.05);
			const e = t * t * (3 - 2 * t);
			for (let k = 0; k < n; k++) out[k] = legsFar(k) + (out[k] - legsFar(k)) * e;
		}
		// Под мышкой бок торса не заходит в руку: модель в A-позе шире там,
		// где у манекена висит рука.
		if (y < model.armpitY + 0.06 && y > model.armpitY - 0.12) {
			// Выше подмышки ограничение плавно сходит на нет: резкий край давал ступеньку.
			clampUnderArm(y, out);
			// Обхват, срезанный с боков, возвращается спереди и сзади: обхват
			// груди по мерке не должен уменьшаться.
			// Выше подмышки возврат сходит на нет плавно: обрыв ровно на подмышке
			// давал на груди уступ в 3 см, и ткань лифа ложилась ступенькой.
			const restore = y < model.armpitY ? 1 : Math.max(0, 1 - (y - model.armpitY) / 0.04);
			if (restore > 0) {
				const full = rowGirth(Float64Array.from(row, (r) => r * scale(i)));
				const target = rowGirth(out) + (full - rowGirth(out)) * restore * restore * (3 - 2 * restore);
				const base = Float64Array.from(out);
				let lo = 0;
				let hi = 1;
				for (let it = 0; it < 30; it++) {
					const c = (lo + hi) / 2;
					const trial = base.map((r, k) => r * (1 + c * Math.cos((2 * Math.PI * k) / n) ** 2));
					if (rowGirth(trial) < target) lo = c;
					else hi = c;
				}
				for (let k = 0; k < n; k++) out[k] = base[k] * (1 + lo * Math.cos((2 * Math.PI * k) / n) ** 2);
			}
		}
		// Шея выше основания сходится к кругу обхвата шеи: у модели она
		// стоит впереди центра торса, и воротник спереди уходил внутрь шеи.
		if (y > model.shoulderY) {
			const t = Math.min(1, (y - model.shoulderY) / Math.max(1e-6, model.neckY - model.shoulderY));
			const e = t * t * (3 - 2 * t);
			for (let k = 0; k < n; k++) out[k] = out[k] + (model.neckR - out[k]) * e;
			cores[i] = Float64Array.from(out);
			return out;
		}
		if (y < model.armpitY - 0.01) {
			cores[i] = Float64Array.from(out);
			return out;
		}
		const core = Float64Array.from(out);
		coreClamp(y, core);
		cores[i] = core;
		const axis = model.shoulderR * 0.985;
		for (let k = 0; k < n; k++) {
			const s = Math.abs(Math.sin((2 * Math.PI * k) / n));
			if (s > 1e-6) out[k] = Math.min(out[k], axis / s);
		}
		// Сбоку плечо огибает овал плеча манекена: ширина - по кольцам
		// (от ширины плеч к шее), глубина - у модели. От модели в A-позе
		// выше подмышки сбоку остаётся узкий обрубок руки, на который
		// натыкалась ткань.
		const ring = bodyRadius(model, y, 0);
		const ringA = Math.min(axis, ring.a);
		// Овал плеча включается плавно: резкое начало под подмышкой давало излом.
		const rise = Math.max(0, Math.min(1, (y - (model.armpitY - 0.01)) / 0.06));
		const blend = rise * rise * (3 - 2 * rise);
		// Слишком плоский овал даёт острые края, на которых ткань срезает угол.
		const front = Math.max(out[0], ring.b * 0.8);
		const back = Math.max(out[n / 2], ring.b * 0.8);
		for (let k = 0; k < n; k++) {
			const phi = (2 * Math.PI * k) / n;
			const depth = Math.cos(phi) >= 0 ? front : back;
			// Только сбоку, у руки: спереди и сзади скат плеча - у модели.
			const lateral = Math.sin(phi) ** 4;
			out[k] = Math.max(out[k], out[k] + (ellipsePolar(ringA, depth, phi) - out[k]) * blend * lateral);
		}
		return out;
	});
	// Бок таза по высоте сглаживается: сход к ногам под тазом встречается
	// с сужением к талии, и на линии бёдер получался гребень с радиусом
	// кривизны около 2 см. Натянутая юбка срезала его хордой, и сквозь ткань
	// просвечивал манекен.
	// Так же сглаживается полоса груди у подмышки: ниже подмышки бока
	// срезаны по руке и обхват возвращён спереди, выше - срезы модели в
	// A-позе захватывают начало рук. На стыке был уступ в 2-3 см.
	const bands: [number, number, number][] = [
		[model.crotchY + 0.01, model.hipY + 0.12, 0.025],
		[model.armpitY - 0.1, model.armpitY + 0.06, 0.02]
	];
	const smooth = (
		source: Float64Array[],
		bandList: [number, number, number][],
		clamp: (y: number, out: Float64Array) => void
	) =>
		source.map((row, i) => {
			const band = bandList.find(([lo, hi]) => ys[i] > lo && ys[i] < hi);
			if (!band) return row;
			const [lo, hi, window] = band;
			const out = new Float64Array(n);
			let total = 0;
			for (let j = 0; j < source.length; j++) {
				const d = (ys[j] - ys[i]) / window;
				if (Math.abs(d) > 2 || ys[j] <= lo - window || ys[j] >= hi + window) continue;
				const w = Math.exp(-d * d);
				total += w;
				for (let k = 0; k < n; k++) out[k] += source[j][k] * w;
			}
			for (let k = 0; k < n; k++) out[k] /= total;
			// К краям полосы сглаживание сходит на нет: обрыв на краю давал
			// поперечный валик на спине и складку под грудью.
			// Нижний край полосы таза - шаг, естественная граница: там не гасим.
			const fadeLow = lo > model.crotchY + 0.05;
			const ramp = Math.min(1, fadeLow ? (ys[i] - lo) / (2 * window) : 1, (hi - ys[i]) / (2 * window));
			const e = ramp * ramp * (3 - 2 * ramp);
			for (let k = 0; k < n; k++) out[k] = row[k] + (out[k] - row[k]) * e;
			// Сглаживание по высоте возвращает под руку ширину соседних срезов:
			// бок снова обрезается по руке, иначе торс заходит в руку.
			clamp(ys[i], out);
			return out;
		});
	const smoothed = smooth(rows, bands, clampUnderArm);
	// Ядро сглаживается и выше подмышки, до основания шеи: там стык с
	// плечевым поясом.
	const smoothedCore = smooth(cores, [bands[0], [model.armpitY - 0.12, model.shoulderY + 0.02, 0.03]], (y, out) => {
		clampUnderArm(y, out);
		coreClamp(y, out);
	});
	// Ядро у шеи сходится к кругу шеи быстро, от 3 см ниже её основания до
	// 1 см выше: при плавном переходе до верха шеи бок у шеи тянулся вверх
	// воронкой, шея выглядела толстой, и горловина ложилась на неё стойкой.
	// Переход к плечу дают трапеция и гладкий минимум поля.
	smoothedCore.forEach((row, i) => {
		const y = ys[i];
		if (y < model.shoulderY - 0.03) return;
		const t = Math.min(1, (y - (model.shoulderY - 0.03)) / 0.04);
		const e = t * t * (3 - 2 * t);
		const out = Float64Array.from(row);
		for (let k = 0; k < n; k++) out[k] = out[k] + (Math.min(out[k], model.neckR) - out[k]) * e;
		smoothedCore[i] = out;
	});
	rows.splice(0, rows.length, ...(smoothed as typeof rows));
	// Самый нижний срез - ровно на шаге, по одним ногам.
	if (ys[0] > model.crotchY) {
		ys.unshift(model.crotchY);
		rows.unshift(Float64Array.from({ length: n }, (_, k) => legsFar(k)));
		smoothedCore.unshift(Float64Array.from({ length: n }, (_, k) => legsFar(k)));
	}
	return { ys, rows, angles: n, core: smoothedCore };
}

/**
 * Радиус торса (вместе с тазом) в направлении phi на высоте y, м.
 *
 * Через эту функцию идут и манекен, и раскладка ткани, и столкновения:
 * ткань ложится на то же тело, что видно на экране.
 */
export function trunkRadius(model: BodyModel, y: number, phi: number): number {
	const { ys, rows, angles } = model.sculpt;
	let hi = ys.findIndex((v) => v >= y);
	if (hi <= 0) hi = hi === 0 ? 1 : ys.length - 1;
	const lo = hi - 1;
	const t = Math.max(0, Math.min(1, (y - ys[lo]) / (ys[hi] - ys[lo] || 1)));
	const u = ((((phi / (2 * Math.PI)) % 1) + 1) % 1) * angles;
	const k0 = Math.floor(u) % angles;
	const k1 = (k0 + 1) % angles;
	const f = u - Math.floor(u);
	const at = (row: Float64Array) => row[k0] * (1 - f) + row[k1] * f;
	return at(rows[lo]) * (1 - t) + at(rows[hi]) * t;
}

/** Радиусы ядра торса на высоте y по всем углам таблицы (для поля расстояний). */
export function coreRow(model: BodyModel, y: number): Float64Array {
	const { ys, core, angles } = model.sculpt;
	let hi = ys.findIndex((v) => v >= y);
	if (hi <= 0) hi = hi === 0 ? 1 : ys.length - 1;
	const lo = hi - 1;
	const t = Math.max(0, Math.min(1, (y - ys[lo]) / (ys[hi] - ys[lo] || 1)));
	const out = new Float64Array(angles);
	for (let k = 0; k < angles; k++) out[k] = core[lo][k] * (1 - t) + core[hi][k] * t;
	return out;
}

/**
 * Точка, куда кладётся ткань перед драпировкой; theta - параметр эллипса.
 *
 * Выше бёдер - поверхность торса. Ниже таз у шага сходится в узкую линзу,
 * а между бёдрами щель: ткань, положенная на тело, уходила в центр и
 * рвалась. Ткань перекрывает эту щель мостом: ниже бёдер она лежит на
 * эллипсе, который огибает таз и обе ноги.
 */
export function drapePoint(model: BodyModel, theta: number, y: number): Vec3 {
	const base = model.rings[0];
	if (y >= base.y) return torsoPoint(model, theta, y);
	const legs = legProfile(model);
	const top = legs.rings[0];
	const a = Math.max(base.a, legs.x + top.a + 0.01);
	const b = Math.max(base.b, top.b + 0.01);
	return { x: a * Math.sin(theta), y, z: b * Math.cos(theta) };
}

/** Точка на поверхности торса (без зазора); theta - параметр эллипса. */
export function torsoPoint(model: BodyModel, theta: number, y: number): Vec3 {
	const { a, b } = bodyRadius(model, y, theta);
	const phi = Math.atan2(a * Math.sin(theta), b * Math.cos(theta));
	const r = trunkRadius(model, y, phi);
	return { x: r * Math.sin(phi), y, z: r * Math.cos(phi) };
}

/**
 * Кривая "воротнико- плечо" передней/задней половины: от точки у шеи
 * (theta = 90 градусов) до плечевого шва (верх плеча). Возвращает точку на
 * поверхности тела с небольшим зазором.
 */
export function shoulderEdgePoint(model: BodyModel, side: 1 | -1, t: number): Vec3 {
    const fraction = Math.max(0, Math.min(1, t));
    // От основания шеи (чуть шире шеи: на самой шее ширина одинакова по
    // всей высоте, и шов уезжал к подбородку) к плечевой точке.
    const start = model.neckR * 1.12;
    const x = start + (model.shoulderR - start) * fraction;
    // Точка лежит на видимом теле (поле с плечевым поясом): ищется верх
    // поверхности над этой точкой плеча, сверху вниз.
    const field = bodyField(model);
    // У шеи шов чуть сзади (седьмой позвонок за центром шеи), к плечевой
    // точке - на оси руки: там с ним сходится пройма.
    const z = -0.006 * (1 - fraction);
    let hi = model.neckY + 0.06;
    let lo = model.shoulderTipY - 0.06;
    for (let y = hi; y > lo; y -= 0.004) {
        if (fieldDistance(field, x, y, z) <= 0) {
            lo = y;
            hi = y + 0.004;
            break;
        }
    }
    for (let i = 0; i < 30; i++) {
        const y = (lo + hi) / 2;
        if (fieldDistance(field, x, y, z) <= 0) lo = y;
        else hi = y;
    }
    return { x: side * x, y: (lo + hi) / 2 + 0.004, z };
}

/**
 * Форма руки: доля длины руки и полуоси в долях `armR`.
 *
 * `s` - расстояние от плечевой точки в метрах.
 * `a` - полуось поперёк тела, `b` - полуось вглубь.
 */
const ARM_SHAPE: { s: number; a: number; b: number }[] = [
	{ s: 0.0, a: 0.47, b: 0.67 },
	{ s: 0.1, a: 0.75, b: 0.9 },
	{ s: 0.19, a: 0.83, b: 1.0 },
	{ s: 0.3, a: 0.79, b: 0.95 },
	{ s: 0.47, a: 0.65, b: 0.77 },
	{ s: 0.62, a: 0.47, b: 0.53 }
];

/**
 * Профиль руки по модели MakeHuman: срезы от 20 % длины до запястья, в
 * долях `armR`. Бицепс приведён к обхвату пика ARM_SHAPE, поэтому масштаб
 * по мерке бицепса ищется как прежде. Верх руки под плечом (первые 20 %)
 * у модели срезан вместе с грудью и подмышкой - там остаётся узкое начало
 * руки, которое прячется под плечом.
 */
function armShape(gender: 'female' | 'male', armLength: number): { s: number; a: number; b: number }[] {
	const rows = mannequin[gender].arm.filter((r) => r.s >= 0.2);
	const biceps = rows.filter((r) => r.s >= 0.25 && r.s <= 0.45).reduce((m, r) => (ellipseGirth(r.a, r.b) > ellipseGirth(m.a, m.b) ? r : m));
	const k = ellipseGirth(ARM_SHAPE[2].a, ARM_SHAPE[2].b) / ellipseGirth(biceps.a, biceps.b);
	return [ARM_SHAPE[0], ...rows.map((r) => ({ s: r.s * armLength, a: r.a * k, b: r.b * k }))];
}

/** Обхват эллипса с полуосями a и b (формула Рамананана). */
function ellipseGirth(a: number, b: number): number {
	return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
}

/**
 * Масштаб профиля руки под заданный обхват бицепса.
 *
 * Профиль задан в долях `armR`, поэтому масштаб ищется так, чтобы обхват
 * сечения в бицепсе совпал с меркой.
 */
function solveArmScale(girth: number): number {
	let lo = 0.01;
	let hi = 0.2;
	for (let i = 0; i < 40; i++) {
		const mid = (lo + hi) / 2;
		const peak = ARM_SHAPE[2];
		if (ellipseGirth(peak.a * mid, peak.b * mid) < girth) lo = mid;
		else hi = mid;
	}
	return (lo + hi) / 2;
}

/** Полуоси сечения руки на расстоянии s от плечевой точки, м. */
export function armSemiAxis(
	profile: { s: number; a: number; b: number }[],
	armR: number,
	s: number
): { a: number; b: number } {
	const t = Math.max(0, Math.min(1, s));
	if (t <= profile[0].s) return { a: profile[0].a * armR, b: profile[0].b * armR };
	for (let i = 0; i < profile.length - 1; i++) {
		const lo = profile[i];
		const hi = profile[i + 1];
		if (t <= hi.s) {
			const k = (t - lo.s) / (hi.s - lo.s);
			const e = k * k * (3 - 2 * k);
			return { a: (lo.a + (hi.a - lo.a) * e) * armR, b: (lo.b + (hi.b - lo.b) * e) * armR };
		}
	}
	const last = profile[profile.length - 1];
	return { a: last.a * armR, b: last.b * armR };
}

/** Точка на оси руки: s - расстояние от плечевой точки вниз, м. */
export function armPoint(model: BodyModel, side: 1 | -1, s: number): Vec3 {
	return { x: side * (model.armOrigin.x+s*ARM_SPREAD), y: model.armOrigin.y - s, z: 0 };
}

/**
 * Радиус поверхности руки в направлении psi.
 *
 * psi = 0 - наружу от тела, psi = pi/2 - вперёд. Сечение руки эллиптическое,
 * поэтому радиус зависит от направления.
 */
export function armSurfaceRadius(model: BodyModel, s: number, psi: number): number {
	const { a, b } = armSemiAxis(model.armProfile, model.armR, s);
	const c = Math.cos(psi);
	const n = Math.sin(psi);
	return 1 / Math.sqrt((c / a) ** 2 + (n / b) ** 2);
}

/** Зазор петли проймы до поверхности руки, м. */
const LOOP_GAP = 0.004;

export interface ArmholeHalf {
	/** точки петли от плечевой точки к подмышке */
	points: Vec3[];
	/** угол вокруг оси руки для каждой точки, рад */
	psi: number[];
	/** длина половины петли, м */
	length: number;
}

/**
 * Петля проймы: шов переда и шов спинки идут по одной окружности вокруг руки.
 *
 * Пройма - это шов между корпусом и рукавом. Он идёт от плечевой точки вниз
 * по передней стороне руки до подмышки, сзади - то же самое. Обе половины
 * лежат на одной окружности вокруг оси руки, поэтому рукав, построенный
 * вокруг той же оси, сходится с ними без зазора.
 *
 * Длина петли задана телом: шов идёт по поверхности руки. Ткани в лекале
 * может быть меньше - тогда она собирается в сборки, как у настоящего оката.
 */
export function armholeLoop(
	model: BodyModel,
	side: 1 | -1,
	count = 32,
	sleeveless = false
): { front: ArmholeHalf; back: ArmholeHalf } {
	const sUnder = model.shoulderTipY - model.armpitY;
	const frame = armFrame(model, side);

	/** Точка окружности вокруг руки при угле psi. */
	const point = (psi: number, front: boolean): Vec3 => {
		const s = (sUnder * (1 - Math.cos(psi))) / 2;
		const r = armSurfaceRadius(model, s, psi) + LOOP_GAP * Math.sin(psi);
        const centre=armPoint(model,side,s);
		// Без рукава срез проймы не обходит руку снаружи, а идёт по стыку
		// руки с торсом: от переда (или спинки) руки у плеча к внутренней
		// стороне у подмышки. Иначе ткань обматывает плечо лохмотьями.
		const angle = sleeveless ? Math.PI / 2 + psi / 2 : psi;
		const c = Math.cos(angle);
		const n = front ? Math.sin(angle) : -Math.sin(angle);
		return {
			x: centre.x + frame.out.x * r * c + frame.forward.x * r * n,
			y: centre.y,
			z: frame.origin.z + frame.out.z * r * c + frame.forward.z * r * n
		};
	};

	/**
	 * Без рукава выше подмышки торс огибает плечо овалом, и окружность вокруг
	 * руки уходит внутрь торса на 2-8 см. Тогда срез кладётся в складку, где
	 * поверхность торса спереди (или сзади) уходит в руку: идём по торсу от
	 * середины переда к боку, пока точка не упрётся в руку.
	 */
	const onBody = (p: Vec3, front: boolean, psi: number): Vec3 => {
		const phi0 = Math.atan2(p.x, p.z);
		if (Math.hypot(p.x, p.z) >= trunkRadius(model, p.y, phi0) + LOOP_GAP) return snapTo(bodyField(model), p, LOOP_GAP);
		// У подмышки половины переда и спинки сходятся в одну точку на боку
		// торса: туда же приходит боковой шов.
		const sideR = trunkRadius(model, p.y, phi0) + LOOP_GAP;
		const lateral: Vec3 = { x: sideR * Math.sin(phi0), y: p.y, z: sideR * Math.cos(phi0) };
		const t = Math.max(0, Math.min(1, (psi - 0.7 * Math.PI) / (0.3 * Math.PI)));
		const toSide = t * t * (3 - 2 * t);
		const station = model.armOrigin.y - p.y;
		const arm =
			station >= 0 && station <= model.armLength
				? { x: armPoint(model, side, station).x, ...armSemiAxis(model.armProfile, model.armR, station) }
				: null;
		let last: Vec3 = p;
		for (let i = 0; i <= 90; i++) {
			const phi = side * ((front ? i : 180 - i) * Math.PI) / 180;
			const r = trunkRadius(model, p.y, phi) + LOOP_GAP;
			const q = { x: r * Math.sin(phi), y: p.y, z: r * Math.cos(phi) };
			if (arm && ((q.x - arm.x) / (arm.a + LOOP_GAP)) ** 2 + (q.z / (arm.b + LOOP_GAP)) ** 2 < 1) break;
			last = q;
		}
		// Складка найдена по торсу раскладки; на видимом теле (поле с
		// плечевым поясом) срез доводится до поверхности по нормали.
		return snapTo(bodyField(model), {
			x: last.x + (lateral.x - last.x) * toSide,
			y: p.y,
			z: last.z + (lateral.z - last.z) * toSide
		}, LOOP_GAP);
	};

	const build = (front: boolean): ArmholeHalf => {
		const points: Vec3[] = [];
		const psi: number[] = [];
		let length = 0;
		// С рукавом петля идёт вокруг руки, но у плеча рука теперь слита с
		// дельтой (поле тела): точки доводятся до видимой поверхности, иначе
		// окат ложился внутрь дельты и выталкивался складками.
		const at = (angle: number) =>
			sleeveless ? onBody(point(angle, front), front, angle) : snapTo(bodyField(model), point(angle, front), LOOP_GAP);
		let prev = at(0);
		for (let i = 0; i <= count; i++) {
			const angle = (Math.PI * i) / count;
			const current = at(angle);
			length += Math.hypot(current.x - prev.x, current.y - prev.y, current.z - prev.z);
			points.push(current);
			psi.push(angle);
			prev = current;
		}
		return { points, psi, length };
	};

	return { front: build(true), back: build(false) };
}

/**
 * Разбор детали на цепи контура: цепи нужны для поиска швов.
 * Надсечки (notches) служат якорями: они указывают, где кончается шов.
 */
export interface PieceChains {
	pieceId: string;
	/** цепь контура: индексы вершин контура */
	chains: { from: number; to: number; indices: number[]; length: number }[];
	/** индексы вершин надсечек в контуре */
	notchIndices: number[];
}

/** Надсечка ближайшая к заданной точке контура. */
export function nearestNotchIndex(piece: Piece, point: { x: number; y: number }): number {
	let best = 0;
	let bestD = Infinity;
	piece.outline.forEach((p, i) => {
		const d = Math.hypot(p.x - point.x, p.y - point.y);
		if (d < bestD) {
			bestD = d;
			best = i;
		}
	});
	return best;
}

const neckProfiles = new WeakMap<BodyModel,Ring[]>();

/** Shared by the visible neck mesh and cloth contact surface. */
export function neckProfile(model:BodyModel):Ring[] {
    const cached=neckProfiles.get(model);
    if(cached) return cached;
    const base=model.rings[model.rings.length-2].y;
    const rings=[
        // Низ шеи прячется в торс. Торс сам сходится к кругу шеи к neckY,
        // поэтому шея начинается чуть ниже и не толще него: прежнее широкое
        // кольцо у плеч торчало сзади за торсом, и горловина резалась о него.
        {y:Math.max(base,model.neckY-0.01),a:model.neckR*0.97,b:model.neckR*0.97},
        {y:(base+model.height-model.height/7.5/2)/2,a:model.neckR*0.9,b:model.neckR*0.94},
        {y:model.height-model.height/7.5/2+0.012,a:model.neckR*0.96,b:model.neckR}
    ];
    neckProfiles.set(model,rings);
    return rings;
}

/** Rounded pelvis below the hip ring, shared by visible anatomy and contact. */
export function pelvisRadius(model:BodyModel,y:number):{a:number;b:number}|null {
    const base=model.rings[0];
    if(y<model.crotchY || y>base.y || model.crotchY>=base.y) return null;
    const t=(y-model.crotchY)/(base.y-model.crotchY);
    const s=t*t*(3-2*t);
    // Сбоку на уровне шага ширину задают бёдра ног: таз уже них прятал
    // боковой шов внутри ноги, и ткань рвалась в промежуток между ногами.
    const legs=legProfile(model),thigh=legs.x+legs.rings[0].a;
    return {a:Math.max(base.a*(0.6+0.4*s),Math.min(base.a,thigh)),b:0.0001+(base.b-0.0001)*s};
}

const legProfiles = new WeakMap<BodyModel,{x:number;rings:Ring[]}>();

/** The same anatomical leg sections drive rendering and cloth contact. */
export function legProfile(model:BodyModel):{x:number;rings:Ring[]} {
    const cached=legProfiles.get(model);if(cached)return cached;
    const hip=model.rings[0],x=hip.a*0.48;
    // Нога - по срезам модели MakeHuman: бедро, колено, икра, лодыжка.
    // Высоты срезов переносятся с шага, колена и лодыжки модели на высоты
    // по меркам, толщина - по обхвату бёдер, как у таза.
    const H=model.height;
    const table=mannequin[model.female ? 'female' : 'male'];
    const joints=table.legJoints;
    const hk=Math.hypot(joints.knee[0]-joints.hip[0],joints.knee[1]-joints.hip[1],joints.knee[2]-joints.hip[2]);
    const ka=Math.hypot(joints.ankle[0]-joints.knee[0],joints.ankle[1]-joints.knee[1],joints.ankle[2]-joints.knee[2]);
    const meshY=(f:number)=>{const along=f*(hk+ka);return along<=hk ? joints.hip[1]+(joints.knee[1]-joints.hip[1])*along/hk : joints.knee[1]+(joints.ankle[1]-joints.knee[1])*(along-hk)/ka;};
    const crotchMesh=table.landmarks.crotch,ankleY=H*0.043;
    const toModel=(y:number)=>y>=joints.knee[1]
        ? model.kneeY+(y-joints.knee[1])/(crotchMesh-joints.knee[1])*(model.crotchY-model.kneeY)
        : ankleY+(y-joints.ankle[1])/(joints.knee[1]-joints.ankle[1])*(model.kneeY-ankleY);
    const f=model.hip/table.hipGirth;
    const rows=table.leg.filter(r=>r.s<=0.95).map(r=>({y:toModel(meshY(r.s)),a:r.a*f,b:r.b*f,z:0}));
    const source=[
        {y:hip.y+0.06,a:rows[0].a,b:rows[0].b,z:0},
        ...rows.filter(r=>r.y<hip.y+0.05),
        {y:H*0.035,a:rows[rows.length-1].a,b:rows[rows.length-1].b,z:0}
    ];
    const interpolate=(a:number,b:number,c:number,d:number,t:number)=>0.5*(2*b+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t);
    const rings:Ring[]=[];
    for(let i=0;i<source.length-1;i++)for(let j=0;j<12;j++) {
        const t=j/12,p=source[Math.max(0,i-1)],a=source[i],b=source[i+1],n=source[Math.min(source.length-1,i+2)];
        rings.push({y:a.y+(b.y-a.y)*t,a:Math.min(x-0.007,Math.max(0.001,interpolate(p.a,a.a,b.a,n.a,t))),b:Math.max(0.001,interpolate(p.b,a.b,b.b,n.b,t)),z:interpolate(p.z,a.z,b.z,n.z,t)});
    }
    rings.push(source[source.length-1]);
    const profile={x,rings};legProfiles.set(model,profile);return profile;
}
