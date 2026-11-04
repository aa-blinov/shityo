/**
 * Манекен: тело строится по меркам (обхват груди, талии, ширина плеч, рост,
 * длина рукава, обхват шеи). Та же модель используется и для построения
 * поверхности, на которую ложится ткань, и для коллайдеров физики.
 *
 * Система координат: Y - вверх, Z - вперёд (лицо), X - вправо.
 * Все величины - в метрах.
 */

import type { Piece } from '$lib/types';

/** Slight display A-pose keeps the hands clear of the hips and wide trousers. */
export const ARM_SPREAD = 0.12;

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
}

export interface BodyModel {
    crotchY: number;
	height: number;
	/** высота плечевой линии */
	shoulderY: number;
	/** высота основания шеи */
	neckY: number;
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
	const { a } = bodyRadius(model, model.armpitY, Math.PI / 2);
	return { x: side * a, y: model.armpitY, z: 0 };
}

/**
 * Модель тела по меркам. Плечи, шея и руки выводятся из ширины плеч и
 * длины рукава, остальные обхваты - из груди и талии.
 */
export function buildBodyModel(measurements: Record<string, number>): BodyModel {
	const height = cm(measurements.height, 176);
	const bust = cm(measurements.bust, 96);
	const waist = cm(measurements.waist, 84);
	const shoulderWidth = cm(measurements.shoulder_width, 46);
	const neckGirth = cm(measurements.neck_circumference, 40);
	const armLength = cm(measurements.sleeve_length, 62);

	const shoulderY = height * 0.815;
	const neckY = height * 0.845;
	const neckR = neckGirth / (2 * Math.PI);
	const shoulderR = shoulderWidth / 2;
	const hip = cm(measurements.hip, bust * 103);
	const hipY = height * 0.53;
	const waistY = height * 0.62;
    const crotchY = waistY - cm(measurements.crotch_depth,30);
	const bustY = height * 0.72;

	// От плечевой точки до подмышки пройма идёт почти вертикально: столько
	// же ткани уходит на пройму в лекале. Обе точки привязаны к линии плеч -
	// к ней же привязана раскладка, иначе пройма в 3D не совпадает с
	// проймой лекала.
	const shoulderSlope = ((measurements.shoulder_slope ?? 13) * Math.PI) / 180;
	const shoulderTipY = shoulderY - (shoulderR - neckR) * Math.tan(shoulderSlope);
	const armholeDepth = cm(measurements.neck_to_waist, 44) - cm(measurements.waist_to_armpit, 22) * 0.955;
	const armpitY = shoulderY - armholeDepth;
	// Радиус руки - из обхвата бицепса: окружность бицепса и есть обхват
	// руки. Раньше радиус считался от обхвата груди, и рука получалась
	// втрое толще, чем на мерках: рукав в неё не влезал.
	const biceps = cm(measurements.biceps, 0);
	const armGirth = biceps > 0 ? biceps : Math.max(0.28, bust * 0.34);
	// Масштаб профиля подбирается так, чтобы обхват в бицепсе совпал с меркой.
	const armR = solveArmScale(armGirth);
	const armProfile = ARM_SHAPE.map((p) => ({ ...p }));

	// Обхват груди и остальные обхваты - из мерок.
	const shoulderGirth = bust * 0.92;

	// Глубина торса: у мужской фигуры грудь шире, чем вглубь, у женской -
	// наоборот. Отношение бёдер к груди отличает одно от другого лучше,
	// чем отдельная мерка пола.
	const hipsVsBust = hip / bust;
	const depthRatio = hipsVsBust > 0.99 ? 1.06 : hipsVsBust > 0.94 ? 1.18 : 1.34;

	const chest = ellipseAxes(bust, depthRatio);
	const waistAxes = ellipseAxes(waist, depthRatio * 0.92);
	const hipAxes = ellipseAxes(hip, depthRatio * 0.98);
	const shoulderAxes = ellipseAxes(shoulderGirth, 1.5);

	const rings: Ring[] = [
		{ y: hipY - height * 0.06, a: hipAxes.a * 0.97, b: hipAxes.b * 0.97 },
		{ y: hipY, a: hipAxes.a, b: hipAxes.b },
		{ y: waistY, a: waistAxes.a, b: waistAxes.b },
		{ y: bustY, a: chest.a, b: chest.b },
		// Плечи манекена шире груди и доходят до дельты: трапеция и дельта
		// образуют площадку под лопаткой. Если торс уже дельты, ткань между
		// плечевым швом и проймой натягивается через пустоту и рвётся
		// зубцами на плече.
		{ y: shoulderTipY, a: Math.max(shoulderAxes.a, shoulderR * 0.985), b: shoulderAxes.b * 1.12 },
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

	return {
		height,
        crotchY,
		shoulderY,
		shoulderTipY,
		armpitY,
		neckY,
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
			const e = t * t * (3 - 2 * t);
			return { a: lo.a + (hi.a - lo.a) * e, b: lo.b + (hi.b - lo.b) * e };
		}
	}
	const last = rings[rings.length - 1];
	return { a: last.a, b: last.b };
}

/** Точка на поверхности торса (без зазора). */
export function torsoPoint(model: BodyModel, theta: number, y: number): Vec3 {
	const { a, b } = bodyRadius(model, y, theta);
	return { x: a * Math.sin(theta), y, z: b * Math.cos(theta) };
}

/**
 * Кривая "воротнико- плечо" передней/задней половины: от точки у шеи
 * (theta = 90 градусов) до плечевого шва (верх плеча). Возвращает точку на
 * поверхности тела с небольшим зазором.
 */
export function shoulderEdgePoint(model: BodyModel, side: 1 | -1, t: number): Vec3 {
    const fraction = Math.max(0, Math.min(1, t));
    const x = model.neckR + (model.shoulderR-model.neckR)*fraction;
    // A pin must lie on the actual upper torso surface. A free Bezier
    // between neck and shoulder can pass centimetres inside the mannequin.
    let lo=model.shoulderTipY,hi=model.neckY;
    for(let i=0;i<40;i++) {
        const y=(lo+hi)/2;
        if(bodyRadius(model,y,Math.PI/2).a>x) lo=y; else hi=y;
    }
    return {x:side*x,y:(lo+hi)/2+0.004,z:0};
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
	count = 32
): { front: ArmholeHalf; back: ArmholeHalf } {
	const sUnder = model.shoulderTipY - model.armpitY;
	const frame = armFrame(model, side);

	/** Точка окружности вокруг руки при угле psi. */
	const point = (psi: number, front: boolean): Vec3 => {
		const s = (sUnder * (1 - Math.cos(psi))) / 2;
		const r = armSurfaceRadius(model, s, psi) + LOOP_GAP * Math.sin(psi);
        const centre=armPoint(model,side,s);
		const c = Math.cos(psi);
		const n = front ? Math.sin(psi) : -Math.sin(psi);
		return {
			x: centre.x + frame.out.x * r * c + frame.forward.x * r * n,
			y: centre.y,
			z: frame.origin.z + frame.out.z * r * c + frame.forward.z * r * n
		};
	};

	const build = (front: boolean): ArmholeHalf => {
		const points: Vec3[] = [];
		const psi: number[] = [];
		let length = 0;
		let prev = point(0, front);
		for (let i = 0; i <= count; i++) {
			const angle = (Math.PI * i) / count;
			const current = point(angle, front);
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
        {y:base-0.01,a:model.neckR*1.4,b:model.neckR*1.28},
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
    return {a:base.a*(0.6+0.4*s),b:0.0001+(base.b-0.0001)*s};
}

const legProfiles = new WeakMap<BodyModel,{x:number;rings:Ring[]}>();

/** The same anatomical leg sections drive rendering and cloth contact. */
export function legProfile(model:BodyModel):{x:number;rings:Ring[]} {
    const cached=legProfiles.get(model);if(cached)return cached;
    const hip=model.rings[0],x=hip.a*0.42;
    const source=[
        {y:hip.y+0.06,a:hip.a*0.62,b:hip.b*0.66},
        {y:model.height*0.47,a:hip.a*0.54,b:hip.b*0.58},
        {y:model.height*0.285,a:hip.a*0.38,b:hip.b*0.4},
        {y:model.height*0.12,a:hip.a*0.28,b:hip.b*0.3},
        {y:model.height*0.045,a:hip.a*0.22,b:hip.b*0.24}
    ];
    const interpolate=(a:number,b:number,c:number,d:number,t:number)=>0.5*(2*b+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t);
    const rings:Ring[]=[];
    for(let i=0;i<source.length-1;i++)for(let j=0;j<12;j++) {
        const t=j/12,p=source[Math.max(0,i-1)],a=source[i],b=source[i+1],n=source[Math.min(source.length-1,i+2)];
        rings.push({y:a.y+(b.y-a.y)*t,a:Math.min(x-0.007,Math.max(0.001,interpolate(p.a,a.a,b.a,n.a,t))),b:Math.max(0.001,interpolate(p.b,a.b,b.b,n.b,t))});
    }
    rings.push(source[source.length-1]);
    const profile={x,rings};legProfiles.set(model,profile);return profile;
}
