/// <reference types="@webgpu/types" />
/**
 * Солвер ткани на видеокарте (WebGPU).
 *
 * Тот же XPBD, что в xpbd.ts, но шаг идёт вычислительными шейдерами:
 *
 * 1. интегрирование - каждая частица отдельно;
 * 2. рёбра - по цветам: рёбра одного цвета не делят частиц, поэтому
 *    решаются параллельно без гонок, а цвета идут по очереди, как
 *    Гаусс-Зейдель на процессоре;
 * 3. столкновения - с тем же полем расстояний до манекена (field.ts):
 *    трилинейная интерполяция и шаги Ньютона, как pushOut;
 * 4. ограничение смещения от собранной формы.
 *
 * Шаги ставятся в очередь без ожидания; позиции читаются обратно
 * асинхронно (sync), когда нужно обновить отрисовку.
 *
 * Без WebGPU (Node, старые браузеры, нет адаптера) используется солвер
 * на процессоре (physics.ts) - результат по смыслу тот же.
 */
import type { BodyModel } from './body';
import { bodyField, fieldGpuInputs, ROW_STRIDE, storeBodyField, type BodyField } from './field';
import { FABRICS, type Fabric } from './fabrics';
import { buildClothSystem, type ClothPiece, type ClothSim, type SeamPair } from './physics';

const WORKGROUP = 64;
/** подшагов на шаг кадра: на мелкой сетке так ткань сходится лучше итераций */
const SUBSTEPS = 1;
/**
 * итераций ограничений на подшаг. Массы частиц единичные, а податливость
 * ткани подобрана под шаг 1/60 с: подшаги делали ткань мягче, поэтому
 * сходимость добирается итерациями, а прогиб - длинными привязками.
 */
const SUBSTEP_ITERATIONS = 16;
/** толщина ткани: на этом расстоянии она держится от тела, м */
const THICKNESS = 0.003;
/** ячеек хеш-сетки соседей и частиц в ячейке */
const HASH_SIZE = 1 << 17;
const HASH_CAP = 12;
/** шаг между слотами параметров: минимальное выравнивание динамического смещения */
const SLOT = 256;

const SHADER = /* wgsl */ `
struct Params {
	dt: f32,
	keep: f32,
	gravity: f32,
	nodeCount: u32,
	offset: u32,
	count: u32,
	edgeTotal: u32,
	pad: u32,
};
struct Field {
	origin: vec4<f32>,
	size: vec4<u32>,
};
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> pos: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> prev: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read> rest: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read> edges: array<vec4<u32>>;
@group(0) @binding(5) var<storage, read_write> lambdas: array<f32>;
@group(0) @binding(6) var<storage, read> field: array<f32>;
@group(0) @binding(7) var<uniform> grid: Field;
// Хеш-сетка одним буфером (лимит WebGPU - 8 буферов хранения на шейдер):
// сначала HASH счётчиков, затем по CAP частиц на ячейку.
@group(0) @binding(8) var<storage, read_write> cells: array<atomic<u32>>;
@group(0) @binding(9) var<storage, read_write> delta: array<vec4<f32>>;
@group(0) @binding(10) var<uniform> contact: vec4<f32>;

const GAP: f32 = ${THICKNESS};
const HASH: u32 = ${HASH_SIZE}u;
const CAP: u32 = ${HASH_CAP}u;

@compute @workgroup_size(${WORKGROUP})
fn integrate(@builtin(global_invocation_id) id: vec3<u32>) {
	let i = id.x;
	if (i >= params.nodeCount) { return; }
	let p = pos[i];
	if (p.w == 0.0) { return; }
	let v = (p.xyz - prev[i].xyz) / params.dt;
	prev[i] = vec4<f32>(p.xyz, 0.0);
	// Положение на начало шага: столкновение возвращает частицу по пути.
	delta[i] = vec4<f32>(p.xyz, 0.0);
	let next = p.xyz + (v + vec3<f32>(0.0, params.gravity * params.dt, 0.0)) * params.keep * params.dt;
	pos[i] = vec4<f32>(next, p.w);
}

@compute @workgroup_size(${WORKGROUP})
fn clearLambdas(@builtin(global_invocation_id) id: vec3<u32>) {
	if (id.x < params.edgeTotal) { lambdas[id.x] = 0.0; }
}

@compute @workgroup_size(${WORKGROUP})
fn solveEdges(@builtin(global_invocation_id) id: vec3<u32>) {
	if (id.x >= params.count) { return; }
	let e = params.offset + id.x;
	let edge = edges[e];
	let pa = pos[edge.x];
	let pb = pos[edge.y];
	let w = pa.w + pb.w;
	if (w == 0.0) { return; }
	let d = pb.xyz - pa.xyz;
	let dist = length(d);
	if (dist < 1e-9) { return; }
	let restLength = bitcast<f32>(edge.z);
	let alpha = bitcast<f32>(edge.w) / (params.dt * params.dt);
	let delta = (-(dist - restLength) - alpha * lambdas[e]) / (w + alpha);
	lambdas[e] = lambdas[e] + delta;
	let c = d * (delta / dist);
	if (pa.w > 0.0) { pos[edge.x] = vec4<f32>(pa.xyz - c * pa.w, pa.w); }
	if (pb.w > 0.0) { pos[edge.y] = vec4<f32>(pb.xyz + c * pb.w, pb.w); }
}

struct Sample { d: f32, g: vec3<f32>, inside: bool };

fn sampleField(p: vec3<f32>) -> Sample {
	let step = grid.origin.w;
	let f = (p - grid.origin.xyz) / step;
	let n = grid.size.xyz;
	if (any(f < vec3<f32>(0.0)) || f.x >= f32(n.x - 1u) || f.y >= f32(n.y - 1u) || f.z >= f32(n.z - 1u)) {
		return Sample(1.0, vec3<f32>(0.0), false);
	}
	let c = vec3<u32>(floor(f));
	let t = f - floor(f);
	let sy = n.x;
	let sz = n.x * n.y;
	let base = c.z * sz + c.y * sy + c.x;
	let c000 = field[base];
	let c100 = field[base + 1u];
	let c010 = field[base + sy];
	let c110 = field[base + sy + 1u];
	let c001 = field[base + sz];
	let c101 = field[base + sz + 1u];
	let c011 = field[base + sz + sy];
	let c111 = field[base + sz + sy + 1u];
	let x00 = mix(c000, c100, t.x);
	let x10 = mix(c010, c110, t.x);
	let x01 = mix(c001, c101, t.x);
	let x11 = mix(c011, c111, t.x);
	let y0 = mix(x00, x10, t.y);
	let y1 = mix(x01, x11, t.y);
	let dx0 = mix(c100 - c000, c110 - c010, t.y);
	let dx1 = mix(c101 - c001, c111 - c011, t.y);
	let g = vec3<f32>(mix(dx0, dx1, t.z), mix(x10 - x00, x11 - x01, t.z), y1 - y0) / step;
	return Sample(mix(y0, y1, t.z), g, true);
}

@compute @workgroup_size(${WORKGROUP})
fn collide(@builtin(global_invocation_id) id: vec3<u32>) {
	let i = id.x;
	if (i >= params.nodeCount) { return; }
	let p = pos[i];
	if (p.w == 0.0) { return; }
	var s = sampleField(p.xyz);
	if (!s.inside || s.d >= GAP) { return; }
	// Была снаружи на начало шага - назад по своему пути до слоя GAP
	// (иначе выталкивание из глубины выносило ткань спинки спереди).
	let start = delta[i];
	if (start.w == 0.0) {
		let origin = sampleField(start.xyz);
		// Допуск 0,5 мм: Ньютон ставит частицу на слой с точностью 0,1 мм.
		if (origin.inside && origin.d >= GAP - 0.0005) {
			var lo = 0.0;
			var hi = 1.0;
			for (var k = 0; k < 12; k = k + 1) {
				let mid = (lo + hi) * 0.5;
				let probe = sampleField(mix(start.xyz, p.xyz, mid));
				if (probe.d >= GAP) { lo = mid; } else { hi = mid; }
			}
			let back = mix(start.xyz, p.xyz, lo);
			pos[i] = vec4<f32>(back, p.w);
			prev[i] = vec4<f32>(prev[i].xyz + (back - p.xyz), 0.0);
			return;
		}
	}
	// Шаги Ньютона к поверхности (как solveLevel в field.ts): шаг делится
	// на длину градиента, ухудшивший результат шаг - пополам.
	var q = p.xyz;
	var best = q;
	var found = false;
	for (var it = 0; it < 12; it = it + 1) {
		if (abs(s.d - GAP) <= 1e-4) { break; }
		let len = length(s.g);
		var u = vec3<f32>(select(-1.0, 1.0, q.x >= 0.0), 0.0, 0.0);
		if (len > 1e-9) { u = s.g / len; }
		var stepLength = clamp((GAP - s.d) / max(len, 0.2), -0.05, 0.05);
		var next = q;
		var sn = s;
		for (var tries = 0; tries < 5; tries = tries + 1) {
			next = q + u * stepLength;
			sn = sampleField(next);
			if (!sn.inside || abs(sn.d - GAP) < abs(s.d - GAP)) { break; }
			stepLength = stepLength * 0.5;
		}
		q = next;
		s = sn;
		if (!s.inside) { break; }
		if (s.d >= GAP - 1e-4) { best = q; found = true; }
	}
	if (!(abs(s.d - GAP) <= 1e-4) && found) { q = best; }
	let shift = q - p.xyz;
	pos[i] = vec4<f32>(q, p.w);
	prev[i] = vec4<f32>(prev[i].xyz + shift, 0.0);
}

@compute @workgroup_size(${WORKGROUP})
fn limit(@builtin(global_invocation_id) id: vec3<u32>) {
	let i = id.x;
	if (i >= params.nodeCount) { return; }
	let p = pos[i];
	if (p.w == 0.0) { return; }
	let r = rest[i];
	let d = p.xyz - r.xyz;
	let dist = length(d);
	if (dist > r.w) {
		let q = r.xyz + d * (r.w / dist);
		pos[i] = vec4<f32>(q, p.w);
		prev[i] = vec4<f32>(q, 0.0);
	}
}

// Ткань о ткань: частицы в хеш-сетке ячеек размером с толщину слоя; частица
// отталкивается от чужих частиц ближе contact.x. Соседи по сетке ткани
// (в собранной форме ближе contact.y) не считаются: их держат рёбра.
fn cellHash(c: vec3<i32>) -> u32 {
	let h = (u32(c.x) * 73856093u) ^ (u32(c.y) * 19349663u) ^ (u32(c.z) * 83492791u);
	return h % HASH;
}

@compute @workgroup_size(${WORKGROUP})
fn clearCells(@builtin(global_invocation_id) id: vec3<u32>) {
	if (id.x < HASH) { atomicStore(&cells[id.x], 0u); }
}

@compute @workgroup_size(${WORKGROUP})
fn insertCells(@builtin(global_invocation_id) id: vec3<u32>) {
	let i = id.x;
	if (i >= params.nodeCount) { return; }
	let p = pos[i];
	if (p.w == 0.0) { return; }
	let h = cellHash(vec3<i32>(floor(p.xyz / contact.x)));
	let slot = atomicAdd(&cells[h], 1u);
	if (slot < CAP) { atomicStore(&cells[HASH + h * CAP + slot], i); }
}

@compute @workgroup_size(${WORKGROUP})
fn selfCollide(@builtin(global_invocation_id) id: vec3<u32>) {
	let i = id.x;
	if (i >= params.nodeCount) { return; }
	let p = pos[i];
	var push = vec3<f32>(0.0);
	if (p.w > 0.0) {
		let base = vec3<i32>(floor(p.xyz / contact.x));
		let r = rest[i].xyz;
		for (var dz = -1; dz <= 1; dz = dz + 1) {
			for (var dy = -1; dy <= 1; dy = dy + 1) {
				for (var dx = -1; dx <= 1; dx = dx + 1) {
					let h = cellHash(base + vec3<i32>(dx, dy, dz));
					let count = min(atomicLoad(&cells[h]), CAP);
					for (var k = 0u; k < count; k = k + 1u) {
						let j = atomicLoad(&cells[HASH + h * CAP + k]);
						if (j == i) { continue; }
						let d = p.xyz - pos[j].xyz;
						let dist = length(d);
						if (dist >= contact.x || dist < 1e-7) { continue; }
						if (distance(r, rest[j].xyz) < contact.y) { continue; }
						push = push + d / dist * (contact.x - dist) * 0.5;
					}
				}
			}
		}
		let len = length(push);
		if (len > contact.x) { push = push * (contact.x / len); }
	}
	delta[i] = vec4<f32>(push, 1.0);
}

@compute @workgroup_size(${WORKGROUP})
fn tether(@builtin(global_invocation_id) id: vec3<u32>) {
	let i = id.x;
	if (i >= params.nodeCount) { return; }
	let t = edges[params.edgeTotal + i];
	if (t.x == 0xffffffffu) { return; }
	let p = pos[i];
	if (p.w == 0.0) { return; }
	let anchor = pos[t.x].xyz;
	let d = p.xyz - anchor;
	let dist = length(d);
	let len = bitcast<f32>(t.z);
	if (dist > len) { pos[i] = vec4<f32>(anchor + d * (len / dist), p.w); }
}

@compute @workgroup_size(${WORKGROUP})
fn applyDelta(@builtin(global_invocation_id) id: vec3<u32>) {
	let i = id.x;
	if (i >= params.nodeCount) { return; }
	let p = pos[i];
	if (p.w == 0.0) { return; }
	let d = delta[i].xyz;
	pos[i] = vec4<f32>(p.xyz + d, p.w);
	prev[i] = vec4<f32>(prev[i].xyz + d, 0.0);
	// Начало пути для следующего столкновения - положение до отталкивания
	// (оно уже снаружи тела): если ткань о ткань втолкнула частицу в тело,
	// она возвращается назад по этому сдвигу, а не выталкивается по нормали
	// из глубины - так ткань спинки выходила спереди.
	delta[i] = vec4<f32>(p.xyz, 0.0);
}
`;

let device: Promise<GPUDevice | null> | null = null;

/**
 * Устройство WebGPU, если браузер его даёт; одно на страницу. Без WebGPU
 * или без адаптера - null, и ткань считает процессор.
 */
export function gpuDevice(): Promise<GPUDevice | null> {
	device ??= requestDevice().then((d) => {
		d?.lost.then(() => {
			device = null;
		});
		return d;
	});
	return device;
}

async function requestDevice(): Promise<GPUDevice | null> {
	try {
		const gpu = (globalThis.navigator as Navigator | undefined)?.gpu;
		if (!gpu) return null;
		const adapter = await gpu.requestAdapter();
		if (!adapter) return null;
		const need = 32 * 1024 * 1024;
		if (adapter.limits.maxStorageBufferBindingSize < need) return null;
		return await adapter.requestDevice({ requiredLimits: { maxStorageBufferBindingSize: need } });
	} catch {
		return null;
	}
}

/**
 * Раскраска рёбер: у рёбер одного цвета нет общих частиц. Жадно: ребру -
 * наименьший цвет, которого ещё нет у его концов.
 */
export function colourEdges(edgeEnds: [number, number][], nodeCount: number): number[] {
	const used: Set<number>[] = Array.from({ length: nodeCount }, () => new Set<number>());
	return edgeEnds.map(([a, b]) => {
		let c = 0;
		while (used[a].has(c) || used[b].has(c)) c++;
		used[a].add(c);
		used[b].add(c);
		return c;
	});
}

/**
 * Построить симуляцию изделия на видеокарте. Тот же интерфейс, что у
 * createSimulation: шаги ставятся в очередь, позиции - после sync().
 */
export async function createGpuSimulation(
	device: GPUDevice,
	pieces: ClothPiece[],
	seams: { a: string; b: string; pair: SeamPair }[],
	pins: { piece: string; vertex: number; position: [number, number, number] }[],
	model: BodyModel,
	fabric: Fabric = FABRICS.woven,
	/** шаг сетки ткани, м: по нему - толщина слоя для столкновений ткани о ткань */
	meshStep = 0.015
): Promise<ClothSim> {
	// Ткань сталкивается сама с собой, поэтому её больше не держат у собранной
	// формы: она свободно падает под весом. Предел 25 см - только страховка
	// от разлёта при сбое. Длины рёбер деталей - с лекала: ткань того размера,
	// как выкроена, а не как её растянула раскладка.
	// Исключение - кофты на резинке: пояс, манжеты и карман у нас неподвижная
	// отделка (trim-), и свободно оседающая ткань расходилась бы с ней. Их
	// ткань, как раньше, держится у собранной формы.
	const rigidTrims = pieces.some((piece) => piece.id.startsWith('trim-'));
	const system = buildClothSystem(pieces, seams, pins, fabric, rigidTrims ? 'placement' : 'pattern');
	const { nodes, edges, options, reference } = system;
	const n = nodes.length;
	const displacementLimits = rigidTrims ? system.displacementLimits : new Float32Array(n).fill(0.25);

	// Рёбра по цветам: каждый цвет - отрезок общего буфера.
	const colours = colourEdges(
		edges.map((e) => [e.a, e.b]),
		n
	);
	const colourCount = colours.reduce((m, c) => Math.max(m, c + 1), 0);
	const order = edges.map((_, i) => i).sort((a, b) => colours[a] - colours[b]);
	const ranges: { offset: number; count: number }[] = Array.from({ length: colourCount }, () => ({ offset: 0, count: 0 }));
	order.forEach((edgeIndex, k) => {
		const r = ranges[colours[edgeIndex]];
		if (r.count === 0) r.offset = k;
		r.count++;
	});
	// За рёбрами - длинные привязки, по одной на частицу (без неё - 0xffffffff).
	const edgeData = new ArrayBuffer(Math.max(1, edges.length + n) * 16);
	const edgeU32 = new Uint32Array(edgeData);
	const edgeF32 = new Float32Array(edgeData);
	order.forEach((edgeIndex, k) => {
		const e = edges[edgeIndex];
		edgeU32[k * 4] = e.a;
		edgeU32[k * 4 + 1] = e.b;
		edgeF32[k * 4 + 2] = e.rest;
		edgeF32[k * 4 + 3] = e.compliance;
	});
	for (let i = 0; i < n; i++) edgeU32[(edges.length + i) * 4] = 0xffffffff;
	for (const t of system.tethers) {
		edgeU32[(edges.length + t.node) * 4] = t.anchor;
		edgeF32[(edges.length + t.node) * 4 + 2] = t.length;
	}

	const posData = new Float32Array(n * 4);
	const restData = new Float32Array(n * 4);
	nodes.forEach((node, i) => {
		posData.set([node.p.x, node.p.y, node.p.z, node.invMass], i * 4);
		restData.set([reference[i].x, reference[i].y, reference[i].z, displacementLimits[i]], i * 4);
	});
	const prevData = new Float32Array(n * 4);
	nodes.forEach((node, i) => prevData.set([node.prev.x, node.prev.y, node.prev.z, 0], i * 4));

	const field = bodyField(model);
	const gridData = new ArrayBuffer(32);
	new Float32Array(gridData, 0, 4).set([field.x0, field.y0, field.z0, field.step]);
	new Uint32Array(gridData, 16, 4).set([field.nx, field.ny, field.nz, 0]);

	const storage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
	const make = (data: ArrayBufferView | ArrayBuffer, usage: number) => {
		const bytes = data instanceof ArrayBuffer ? data.byteLength : data.byteLength;
		const buffer = device.createBuffer({ size: Math.max(16, Math.ceil(bytes / 16) * 16), usage });
		device.queue.writeBuffer(buffer, 0, data instanceof ArrayBuffer ? data : (data.buffer as ArrayBuffer), data instanceof ArrayBuffer ? 0 : data.byteOffset, bytes);
		return buffer;
	};
	const posBuffer = make(posData, storage | GPUBufferUsage.COPY_SRC);
	const prevBuffer = make(prevData, storage);
	const restBuffer = make(restData, storage);
	const edgeBuffer = make(edgeData, storage);
	const lambdaBuffer = device.createBuffer({ size: Math.max(16, edges.length * 4), usage: storage });
	const fieldBuffer = make(field.data, storage);
	const gridBuffer = make(gridData, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
	const readBuffer = device.createBuffer({ size: n * 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
	const cellBuffer = device.createBuffer({ size: HASH_SIZE * (1 + HASH_CAP) * 4, usage: GPUBufferUsage.STORAGE });
	const deltaBuffer = device.createBuffer({ size: n * 16, usage: GPUBufferUsage.STORAGE });
	// Слой ткани - 0,6 шага сетки; соседи по сетке ближе 2,5 шагов не
	// отталкиваются: их держат рёбра.
	const contactBuffer = make(new Float32Array([meshStep * 0.6, meshStep * 2.5, 0, 0]), GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);

	// Параметры: слот 0 - общий шаг, слот 1+c - цвет c. Шаг кадра делится
	// на подшаги: в шейдер уходит шаг подшага.
	const dt = options.dt;
	const subDt = dt / SUBSTEPS;
	const keep = Math.pow(Math.max(0, 1 - options.damping), subDt);
	const paramsData = new ArrayBuffer(SLOT * (colourCount + 1));
	const writeSlot = (slot: number, offset: number, count: number) => {
		const f = new Float32Array(paramsData, slot * SLOT, 3);
		f.set([subDt, keep, options.gravity]);
		new Uint32Array(paramsData, slot * SLOT + 12, 5).set([n, offset, count, edges.length, 0]);
	};
	writeSlot(0, 0, 0);
	ranges.forEach((r, c) => writeSlot(c + 1, r.offset, r.count));
	const paramsBuffer = make(paramsData, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);

	const module = device.createShaderModule({ code: SHADER });
	// Ошибка шейдера не роняет WebGPU, а молча оставляет ткань на месте:
	// проверяем компиляцию и при ошибке отказываемся (дальше - процессор).
	const compiled = await module.getCompilationInfo();
	const shaderError = compiled.messages.find((m) => m.type === 'error');
	if (shaderError) throw new Error(`cloth shader: ${shaderError.message} at ${shaderError.lineNum}:${shaderError.linePos}`);
	device.pushErrorScope('validation');
	const layout = device.createBindGroupLayout({
		entries: [
			{ binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform', hasDynamicOffset: true } },
			{ binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
			{ binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
			{ binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
			{ binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
			{ binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
			{ binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
			{ binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
			{ binding: 8, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
			{ binding: 9, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
			{ binding: 10, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } }
		]
	});
	const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [layout] });
	const pipeline = (entryPoint: string) => device.createComputePipeline({ layout: pipelineLayout, compute: { module, entryPoint } });
	const integrate = pipeline('integrate');
	const clearLambdas = pipeline('clearLambdas');
	const solveEdges = pipeline('solveEdges');
	const collide = pipeline('collide');
	const limit = pipeline('limit');
	const clearCells = pipeline('clearCells');
	const insertCells = pipeline('insertCells');
	const selfCollide = pipeline('selfCollide');
	const applyDelta = pipeline('applyDelta');
	const tetherPipeline = pipeline('tether');
	const bindGroup = device.createBindGroup({
		layout,
		entries: [
			{ binding: 0, resource: { buffer: paramsBuffer, size: 32 } },
			{ binding: 1, resource: { buffer: posBuffer } },
			{ binding: 2, resource: { buffer: prevBuffer } },
			{ binding: 3, resource: { buffer: restBuffer } },
			{ binding: 4, resource: { buffer: edgeBuffer } },
			{ binding: 5, resource: { buffer: lambdaBuffer } },
			{ binding: 6, resource: { buffer: fieldBuffer } },
			{ binding: 7, resource: { buffer: gridBuffer } },
			{ binding: 8, resource: { buffer: cellBuffer } },
			{ binding: 9, resource: { buffer: deltaBuffer } },
			{ binding: 10, resource: { buffer: contactBuffer } }
		]
	});
	const setupError = await device.popErrorScope();
	if (setupError) throw new Error(`cloth pipeline: ${setupError.message}`);
	const groups = (count: number) => Math.max(1, Math.ceil(count / WORKGROUP));

	// Позиции на процессоре - последний прочитанный кадр.
	const latest = new Float32Array(n * 3);
	nodes.forEach((node, i) => latest.set([node.p.x, node.p.y, node.p.z], i * 3));
	let pending = 0;
	let lost = false;
	device.lost.then(() => {
		lost = true;
	});

	return {
		positions() {
			return latest.slice();
		},
		pieceOffsets() {
			return new Map(system.pieceOffsets);
		},
		partTriangles() {
			return new Map(system.partTriangles);
		},
		partVertexMap() {
			return new Map(system.partVertexMap);
		},
		step(stepDt: number) {
			if (lost || Math.abs(stepDt - dt) > 1e-6) return;
			const encoder = device.createCommandEncoder();
			const pass = encoder.beginComputePass();
			for (let sub = 0; sub < SUBSTEPS; sub++) {
				pass.setBindGroup(0, bindGroup, [0]);
				pass.setPipeline(integrate);
				pass.dispatchWorkgroups(groups(n));
				pass.setPipeline(clearLambdas);
				pass.dispatchWorkgroups(groups(edges.length));
				for (let it = 0; it < SUBSTEP_ITERATIONS; it++) {
					pass.setPipeline(solveEdges);
					ranges.forEach((r, c) => {
						if (r.count === 0) return;
						pass.setBindGroup(0, bindGroup, [(c + 1) * SLOT]);
						pass.dispatchWorkgroups(groups(r.count));
					});
					pass.setBindGroup(0, bindGroup, [0]);
					pass.setPipeline(tetherPipeline);
					pass.dispatchWorkgroups(groups(n));
					pass.setPipeline(collide);
					pass.dispatchWorkgroups(groups(n));
				}
				// Ткань о ткань - раз за подшаг: хеш-сетка заново, отталкивание.
				pass.setPipeline(clearCells);
				pass.dispatchWorkgroups(groups(HASH_SIZE));
				pass.setPipeline(insertCells);
				pass.dispatchWorkgroups(groups(n));
				pass.setPipeline(selfCollide);
				pass.dispatchWorkgroups(groups(n));
				pass.setPipeline(applyDelta);
				pass.dispatchWorkgroups(groups(n));
				pass.setPipeline(collide);
				pass.dispatchWorkgroups(groups(n));
			}
			pass.setPipeline(limit);
			pass.dispatchWorkgroups(groups(n));
			pass.end();
			device.queue.submit([encoder.finish()]);
			pending++;
		},
		async sync() {
			if (lost || pending === 0) return;
			pending = 0;
			const encoder = device.createCommandEncoder();
			encoder.copyBufferToBuffer(posBuffer, 0, readBuffer, 0, n * 16);
			device.queue.submit([encoder.finish()]);
			await readBuffer.mapAsync(GPUMapMode.READ);
			const data = new Float32Array(readBuffer.getMappedRange().slice(0));
			readBuffer.unmap();
			for (let i = 0; i < n; i++) {
				latest[i * 3] = data[i * 4];
				latest[i * 3 + 1] = data[i * 4 + 1];
				latest[i * 3 + 2] = data[i * 4 + 2];
			}
		},
		backend: 'gpu',
		dispose() {
			for (const buffer of [posBuffer, prevBuffer, restBuffer, edgeBuffer, lambdaBuffer, fieldBuffer, gridBuffer, readBuffer, paramsBuffer, cellBuffer, deltaBuffer, contactBuffer])
				buffer.destroy();
		}
	};
}

const FIELD_SHADER = /* wgsl */ `
struct Grid {
	origin: vec4<f32>,
	size: vec4<u32>,
};
@group(0) @binding(0) var<uniform> grid: Grid;
@group(0) @binding(1) var<storage, read> rows: array<f32>;
@group(0) @binding(2) var<uniform> shapes: array<vec4<f32>, 4>;
@group(0) @binding(3) var<storage, read_write> out: array<f32>;

const ROW: u32 = ${ROW_STRIDE}u;
const ANGLES: u32 = 72u;
const TAU: f32 = 6.283185307179586;

fn smin(a: f32, b: f32, k: f32) -> f32 {
	if (k <= 0.0) { return min(a, b); }
	let h = max(k - abs(a - b), 0.0) / k;
	return min(a, b) - h * h * k / 4.0;
}
fn smax(a: f32, b: f32, k: f32) -> f32 { return -smin(-a, -b, k); }
fn ellipseDistance(dx: f32, dz: f32, a: f32, b: f32) -> f32 {
	let k0 = length(vec2<f32>(dx / a, dz / b));
	let k1 = length(vec2<f32>(dx / (a * a), dz / (b * b)));
	if (k1 < 1e-9) { return -min(a, b); }
	return k0 * (k0 - 1.0) / k1;
}
fn ellipsoidDistance(d: vec3<f32>, r: vec3<f32>) -> f32 {
	let k0 = length(d / r);
	let k1 = length(d / (r * r));
	if (k1 < 1e-9) { return -min(r.x, min(r.y, r.z)); }
	return k0 * (k0 - 1.0) / k1;
}
fn roundCone(p: vec3<f32>, a: vec3<f32>, b: vec3<f32>, ra: f32, rb: f32) -> f32 {
	let ab = b - a;
	let t = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
	return length(a + ab * t - p) - (ra + (rb - ra) * t);
}

@compute @workgroup_size(${WORKGROUP})
fn evaluate(@builtin(global_invocation_id) id: vec3<u32>) {
	let nx = grid.size.x;
	let ny = grid.size.y;
	let nz = grid.size.z;
	let index = id.x + id.y * 65535u * ${WORKGROUP}u;
	if (index >= nx * ny * nz) { return; }
	let i = index % nx;
	let j = (index / nx) % ny;
	let k = index / (nx * ny);
	let step = grid.origin.w;
	let x = grid.origin.x + f32(i) * step;
	let y = grid.origin.y + f32(j) * step;
	let z = grid.origin.z + f32(k) * step;
	let o = j * ROW;
	let rho = length(vec2<f32>(x, z));
	var u = atan2(x, z) / TAU;
	u = (u - floor(u)) * f32(ANGLES);
	let k0 = u32(floor(u)) % ANGLES;
	let k1 = (k0 + 1u) % ANGLES;
	let f = u - floor(u);
	let R = rows[o + k0] * (1.0 - f) + rows[o + k1] * f;
	let slope = (rows[o + k1] - rows[o + k0]) / (TAU / f32(ANGLES)) / max(R, 1e-3);
	var d = smax((rho - R) / sqrt(1.0 + slope * slope), rows[o + 72u], 0.03);
	if (rows[o + 73u] > 0.5) { d = smin(d, ellipseDistance(x, z - rows[o + 76u], rows[o + 74u], rows[o + 75u]), 0.02); }
	let p = vec3<f32>(x, y, z);
	for (var s = 0; s < 2; s = s + 1) {
		let side = select(-1.0, 1.0, s == 0);
		let mirror = vec3<f32>(side, 1.0, 1.0);
		if (rows[o + 88u] > 0.5) {
			d = smin(d, roundCone(p, shapes[0].xyz * mirror, shapes[1].xyz * mirror, shapes[0].w, shapes[1].w), 0.045);
		}
		if (rows[o + 89u] > 0.5) {
			d = smin(d, ellipsoidDistance(p - shapes[2].xyz * mirror, shapes[3].xyz), 0.06);
		}
		if (rows[o + 82u] > 0.5) {
			let da = smax(ellipseDistance(x - side * rows[o + 85u], z, rows[o + 83u], rows[o + 84u]), rows[o + 86u], 0.04);
			d = smin(d, da, rows[o + 87u]);
		}
		if (rows[o + 77u] > 0.5) {
			d = min(d, smax(ellipseDistance(x - side * shapes[3].w, z - rows[o + 80u], rows[o + 78u], rows[o + 79u]), rows[o + 81u], 0.03));
		}
	}
	if (rows[o + 90u] > -0.03) { d = smax(d, rows[o + 90u], 0.012); }
	out[index] = d;
}
`;

/**
 * Поле тела на видеокарте: тот же расчёт, что bodyField (field.ts), но все
 * два миллиона узлов сразу. Результат читается обратно и кладётся в кэш
 * модели - дальше раскладка, сетка манекена и отрисовка ткани берут его
 * через bodyField без пересчёта.
 */
export async function computeBodyFieldGpu(device: GPUDevice, model: BodyModel): Promise<BodyField> {
	const { grid, rows, shapes, angles } = fieldGpuInputs(model);
	if (angles !== 72) throw new Error('field shader expects 72 angles');
	const count = grid.nx * grid.ny * grid.nz;
	const gridData = new ArrayBuffer(32);
	new Float32Array(gridData, 0, 4).set([grid.x0, grid.y0, grid.z0, grid.step]);
	new Uint32Array(gridData, 16, 4).set([grid.nx, grid.ny, grid.nz, 0]);
	const gridBuffer = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
	device.queue.writeBuffer(gridBuffer, 0, gridData);
	const rowBuffer = device.createBuffer({ size: rows.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
	device.queue.writeBuffer(rowBuffer, 0, rows);
	const shapeBuffer = device.createBuffer({ size: shapes.byteLength, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
	device.queue.writeBuffer(shapeBuffer, 0, shapes);
	const outBuffer = device.createBuffer({ size: count * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
	const readBuffer = device.createBuffer({ size: count * 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
	const module = device.createShaderModule({ code: FIELD_SHADER });
	const compiled = await module.getCompilationInfo();
	const shaderError = compiled.messages.find((m) => m.type === 'error');
	if (shaderError) throw new Error(`field shader: ${shaderError.message} at ${shaderError.lineNum}:${shaderError.linePos}`);
	const pipeline = device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'evaluate' } });
	const bindGroup = device.createBindGroup({
		layout: pipeline.getBindGroupLayout(0),
		entries: [
			{ binding: 0, resource: { buffer: gridBuffer } },
			{ binding: 1, resource: { buffer: rowBuffer } },
			{ binding: 2, resource: { buffer: shapeBuffer } },
			{ binding: 3, resource: { buffer: outBuffer } }
		]
	});
	const groups = Math.ceil(count / WORKGROUP);
	const encoder = device.createCommandEncoder();
	const pass = encoder.beginComputePass();
	pass.setPipeline(pipeline);
	pass.setBindGroup(0, bindGroup);
	pass.dispatchWorkgroups(Math.min(groups, 65535), Math.ceil(groups / 65535));
	pass.end();
	encoder.copyBufferToBuffer(outBuffer, 0, readBuffer, 0, count * 4);
	device.queue.submit([encoder.finish()]);
	await readBuffer.mapAsync(GPUMapMode.READ);
	const data = new Float32Array(readBuffer.getMappedRange().slice(0));
	readBuffer.unmap();
	for (const buffer of [gridBuffer, rowBuffer, shapeBuffer, outBuffer, readBuffer]) buffer.destroy();
	const field = { ...grid, data };
	storeBodyField(model, field);
	return field;
}
