/**
 * Физика ткани на своём XPBD-солвере.
 *
 * Ключевые решения, проверенные замерами:
 *
 * 1. **Своё солвер, а не Rapier.** Мягкие тела Rapier решают FEM, где шаг
 *    стоит 87 мс на тысяче с лишним частиц: дорого не решение, а
 *    столкновения частиц с коллайдерами. XPBD на той же сетке даёт шаг за
 *    единицы миллисекунд. Подход взят из open-source студии seamer-studio
 *    (MIT, Ahmad Jalil).
 *
 * 2. **Всё изделие - одна сетка.** Детали не отдельные тела, а части общей
 *    сетки: вершины шва сшиты общей частицей. Иначе швы расходятся.
 *
 * 3. **Фиксированный шаг.** Скорость ткани не зависит от частоты кадров.
 *
 * Единицы - метры, как и у тела.
 */
import type { BodyModel } from './body';
import { DEFAULT_OPTIONS, stepCloth, type ClothEdge, type ClothNode, type ClothPin, type ClothTether } from './xpbd';
export type { ClothTether } from './xpbd';
import { FABRICS, type Fabric } from './fabrics';

export interface ClothPiece {
	id: string;
	/** Вершины сетки в плоскости детали, см. - по ним строится триангуляция. */
	verts: { x: number; y: number }[];
	/** Треугольники сетки: индексы вершин по три. */
	tris: number[];
	/** Мировые координаты вершин, м. - деталь уже развёрнута по телу. */
	world: number[];
}

export interface SeamPair {
	/** Индексы вершин первой детали (в её собственной нумерации). */
	a: number[];
	/** Индексы вершин второй детали. */
	b: number[];
}

export interface ClothSim {
	/** Позиции частиц изделия, м. */
	positions(): Float32Array;
	/** Индекс первой частицы каждой детали в общем массиве. */
	pieceOffsets(): Map<string, number>;
	/** Сколько частиц приходится на каждую вершину детали (швы общие). */
	partVertexMap(): Map<string, Int32Array>;
	/** Surface faces after stitching: internal coincident faces are removed. */
	partTriangles(): Map<string, number[]>;
	/** Шаг симуляции. */
	step(dt: number): void;
	/**
	 * Дождаться позиций после поставленных шагов. На процессоре они готовы
	 * сразу; на видеокарте шаги идут в очереди, а позиции читаются обратно.
	 */
	sync(): Promise<void>;
	/** Где считается ткань. */
	backend: 'cpu' | 'gpu';
	/** Освободить ресурсы. */
	dispose(): void;
}

/** Частицы, рёбра и закрепления изделия: общее для солвера на процессоре и на видеокарте. */
export interface ClothSystem {
	nodes: ClothNode[];
	edges: ClothEdge[];
	seamPins: ClothPin[];
	options: typeof DEFAULT_OPTIONS;
	/** собранная форма: ткань не уходит от неё дальше предела */
	reference: { x: number; y: number; z: number }[];
	displacementLimits: Float32Array;
	pieceOffsets: Map<string, number>;
	partVertexMap: Map<string, Int32Array>;
	partTriangles: Map<string, number[]>;
	/**
	 * Длинные привязки (long-range attachments): частица не дальше от
	 * ближайшей точки крепления, чем путь до неё по ткани (+3 %). Так
	 * ткань не проседает под весом, пока натяжение идёт по рёбрам.
	 */
	tethers: ClothTether[];
}


/** Ближайшая по ткани точка крепления каждой частицы (Дейкстра по рёбрам). */
function buildTethers(nodes: ClothNode[], edges: ClothEdge[], stretchEdges: number, anchors: number[]): ClothTether[] {
	const adjacency: { to: number; length: number }[][] = nodes.map(() => []);
	for (let i = 0; i < stretchEdges; i++) {
		const e = edges[i];
		adjacency[e.a].push({ to: e.b, length: e.rest });
		adjacency[e.b].push({ to: e.a, length: e.rest });
	}
	const distance = new Float64Array(nodes.length).fill(Infinity);
	const source = new Int32Array(nodes.length).fill(-1);
	const heap: [number, number][] = [];
	const push = (d: number, n: number) => {
		heap.push([d, n]);
		let i = heap.length - 1;
		while (i > 0) {
			const parent = (i - 1) >> 1;
			if (heap[parent][0] <= heap[i][0]) break;
			[heap[parent], heap[i]] = [heap[i], heap[parent]];
			i = parent;
		}
	};
	const pop = (): [number, number] => {
		const top = heap[0];
		const last = heap.pop()!;
		if (heap.length) {
			heap[0] = last;
			let i = 0;
			for (;;) {
				const l = 2 * i + 1;
				const r = l + 1;
				let m = i;
				if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
				if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
				if (m === i) break;
				[heap[m], heap[i]] = [heap[i], heap[m]];
				i = m;
			}
		}
		return top;
	};
	for (const a of anchors) {
		distance[a] = 0;
		source[a] = a;
		push(0, a);
	}
	while (heap.length) {
		const [d, n] = pop();
		if (d > distance[n]) continue;
		for (const { to, length } of adjacency[n]) {
			const next = d + length;
			if (next < distance[to]) {
				distance[to] = next;
				source[to] = source[n];
				push(next, to);
			}
		}
	}
	const tethers: ClothTether[] = [];
	nodes.forEach((node, i) => {
		if (node.invMass === 0 || source[i] < 0 || !Number.isFinite(distance[i])) return;
		tethers.push({ node: i, anchor: source[i], length: distance[i] * 1.06 });
	});
	return tethers;
}

/**
 * Собрать систему частиц изделия.
 *
 * `pieces` - детали с сетками и размещением; `seams` - пары деталей и
 * индексы вершин шва; `pins` - вершины, закреплённые на теле.
 */
export function buildClothSystem(
	pieces: ClothPiece[],
	seams: { a: string; b: string; pair: SeamPair }[],
	pins: { piece: string; vertex: number; position: [number, number, number] }[],
	fabric: Fabric = FABRICS.woven
): ClothSystem {
	const nodes: ClothNode[] = [];
	const edges: ClothEdge[] = [];
	const pieceOffsets = new Map<string, number>();
	const partVertexMap = new Map<string, Int32Array>();

	/** Ключ вершины: деталь + индекс. */
	const nodeOf = new Map<string, number>();

	const addNode = (pieceId: string, vertex: number): number => {
		const key = `${pieceId}:${vertex}`;
		const existing = nodeOf.get(key);
		if (existing !== undefined) return existing;
		const piece = pieces.find((p) => p.id === pieceId);
		const index = nodes.length;
		const p = piece
			? { x: piece.world[vertex * 3], y: piece.world[vertex * 3 + 1], z: piece.world[vertex * 3 + 2] }
			: { x: 0, y: 0, z: 0 };
		nodes.push({ p, prev: { ...p }, invMass: 1 });
		nodeOf.set(key, index);
		return index;
	};

	for (const piece of pieces) {
		pieceOffsets.set(piece.id, nodes.length);
		const map = new Int32Array(piece.verts.length);
		for (let v = 0; v < piece.verts.length; v++) map[v] = addNode(piece.id, v);
		partVertexMap.set(piece.id, map);
	}

	// Швы: вершины разных деталей становятся одной частицей. Объединение
	// транзитивное: плечевой шов соединяет перед и спинку, а рукав пришит к
	// обоим - если сливать парами, кольцо рукава разрывается в плечевой точке.
	const parent = new Int32Array(nodes.length);
	for (let i = 0; i < nodes.length; i++) parent[i] = i;
	const root = (i: number): number => {
		let r = i;
		while (parent[r] !== r) r = parent[r];
		let c = i;
		while (parent[c] !== c) {
			const next = parent[c];
			parent[c] = r;
			c = next;
		}
		return r;
	};
	const unite = (a: number, b: number): void => {
		const ra = root(a);
		const rb = root(b);
		if (ra === rb) return;
		// Частица, к которой стягиваем, остаётся на месте.
		parent[rb] = ra;
		nodes[rb].p = { ...nodes[ra].p };
		nodes[rb].prev = { ...nodes[ra].prev };
	};
	for (const seam of seams) {
		const a = partVertexMap.get(seam.a);
		const b = partVertexMap.get(seam.b);
		if (!a || !b) continue;
		const count = Math.min(seam.pair.a.length, seam.pair.b.length);
		for (let i = 0; i < count; i++) {
			const ia = seam.pair.a[i];
			const ib = seam.pair.b[i];
			if (ia === undefined || ib === undefined) continue;
			const nodeA = a[ia];
			const nodeB = b[ib];
			if (nodeA === undefined || nodeB === undefined) continue;
			unite(nodeA, nodeB);
		}
	}
	// После объединений номера частиц уточняются: у каждой детали своя.
	for (const [pieceId, map] of partVertexMap) {
		for (let v = 0; v < map.length; v++) map[v] = root(map[v]);
		void pieceId;
	}

	// Merged particles no longer belong to the mesh and must not free-fall.
	for (let i = 0; i < nodes.length; i++) if (root(i) !== i) nodes[i].invMass = 0;

	const seamPins: ClothPin[] = [];

	// Закреплённые точки: плечи держат ткань.
	for (const pin of pins) {
		const map = partVertexMap.get(pin.piece);
		if (!map) continue;
		const node = map[pin.vertex];
		if (node === undefined) continue;
		nodes[node].invMass = 0;
        nodes[node].p = {x:pin.position[0], y:pin.position[1], z:pin.position[2]};
        nodes[node].prev = {...nodes[node].p};
		seamPins.push({ node, position: { x: pin.position[0], y: pin.position[1], z: pin.position[2] } });
	}

    // Sewing can make two tiny ear triangles coincide on a seam. They
    // become internal faces, so remove both rather than render z-fighting
    // sheets and impose a second set of constraints on the same edge.
    const faceCounts = new Map<string, number>();
    const faceKey = (map: Int32Array, tri: number[]) => tri.map(v=>map[v]).sort((a,b)=>a-b).join(':');
    for (const piece of pieces) {
        const map = partVertexMap.get(piece.id)!;
        for (let i=0;i<piece.tris.length;i+=3) {
            const key=faceKey(map,piece.tris.slice(i,i+3));
            faceCounts.set(key,(faceCounts.get(key)??0)+1);
        }
    }
    const partTriangles = new Map<string, number[]>();
    for (const piece of pieces) {
        const map=partVertexMap.get(piece.id)!;
        const tris:number[]=[];
        for(let i=0;i<piece.tris.length;i+=3) {
            const tri=piece.tris.slice(i,i+3);
            if(new Set(tri.map(v=>map[v])).size===3 && faceCounts.get(faceKey(map,tri))===1) tris.push(...tri);
        }
        partTriangles.set(piece.id,tris);
    }

	// Рёбра сетки: ткань держится треугольниками.
    const edgeKeys = new Set<string>();
    const stretchSet = new Set<number>();
	for (const piece of pieces) {
		const map = partVertexMap.get(piece.id);
		if (!map) continue;
		const tris=partTriangles.get(piece.id)!;
		for (let t = 0; t < tris.length; t += 3) {
			const a = tris[t];
			const b = tris[t + 1];
			const c = tris[t + 2];
			for (const [u, v] of [[a, b], [b, c], [c, a]]) {
				const before = edges.length;
				addEdge(nodes, edges, map[u], map[v], edgeKeys, stretchCompliance(fabric, piece.verts[u], piece.verts[v]));
				if (edges.length > before) stretchSet.add(edges.length - 1);
			}
		}
		// Изгиб: связь между вершинами двух треугольников против общего
		// ребра. Она сопротивляется складке; податливость - жёсткость ткани
		// на изгиб (плотная держит форму, трикотаж мнётся).
		const opposite = new Map<string, number>();
		for (let t = 0; t < tris.length; t += 3) {
			const tri = [tris[t], tris[t + 1], tris[t + 2]];
			for (let k = 0; k < 3; k++) {
				const u = tri[k];
				const v = tri[(k + 1) % 3];
				const w = tri[(k + 2) % 3];
				const key = `${Math.min(u, v)}:${Math.max(u, v)}`;
				const other = opposite.get(key);
				if (other === undefined) opposite.set(key, w);
				else addEdge(nodes, edges, map[w], map[other], edgeKeys, fabric.bend);
			}
		}
	}

	// Свойства полотна: растяжение, затухание и провисание от собранной формы.
	const options = { ...DEFAULT_OPTIONS, stretchLimit: fabric.stretchLimit, damping: fabric.damping };
    const reference = nodes.map(node => ({ ...node.p }));
    const displacementLimits=new Float32Array(nodes.length).fill(fabric.drape);
    for(const piece of pieces) if(/^(front|back)-/.test(piece.id)) {
        for(const node of partVertexMap.get(piece.id)!) displacementLimits[node]=0.002;
    }
	// Рёбра растяжения - в начало списка: по ним ищутся пути до точек крепления.
	const ordered = [...edges.filter((_, i) => stretchSet.has(i)), ...edges.filter((_, i) => !stretchSet.has(i))];
	edges.splice(0, edges.length, ...ordered);
	const tethers = buildTethers(nodes, edges, stretchSet.size, seamPins.map((p) => p.node));
	return { nodes, edges, seamPins, options, reference, displacementLimits, pieceOffsets, partVertexMap, partTriangles, tethers };
}

/**
 * Построить симуляцию изделия на процессоре.
 *
 * `model` - фигура, о которую опирается ткань. На видеокарте то же самое
 * считает gpu.ts (createGpuSimulation).
 */
export async function createSimulation(
	pieces: ClothPiece[],
	seams: { a: string; b: string; pair: SeamPair }[],
	pins: { piece: string; vertex: number; position: [number, number, number] }[],
	model: BodyModel,
	fabric: Fabric = FABRICS.woven
): Promise<ClothSim> {
	const { nodes, edges, seamPins, options, reference, displacementLimits, pieceOffsets, partVertexMap, partTriangles } =
		buildClothSystem(pieces, seams, pins, fabric);
	return {
		positions() {
			const array = new Float32Array(nodes.length * 3);
			for (let i = 0; i < nodes.length; i++) {
				array[i * 3] = nodes[i].p.x;
				array[i * 3 + 1] = nodes[i].p.y;
				array[i * 3 + 2] = nodes[i].p.z;
			}
			return array;
		},
		pieceOffsets() {
			return new Map(pieceOffsets);
		},
        partTriangles() { return new Map(partTriangles); },
		partVertexMap() {
			return new Map(partVertexMap);
		},
		step(dt: number) {
			stepCloth(nodes, edges, seamPins, model, { ...options, dt });
            // This is a geometric preview: keep the assembled surface near its
            // reference pose instead of letting an unconstrained membrane fold
            // through itself (the solver does not model cloth self-collision).
            for (let i = 0; i < nodes.length; i++) {
                const node = nodes[i];
                if (node.invMass === 0) continue;
                const rest = reference[i];
                const dx=node.p.x-rest.x,dy=node.p.y-rest.y,dz=node.p.z-rest.z;
                const distance=Math.hypot(dx,dy,dz);
                const limit=displacementLimits[i];
                if(distance>limit) {
                    const scale=limit/distance;
                    node.p={x:rest.x+dx*scale,y:rest.y+dy*scale,z:rest.z+dz*scale};
                    node.prev={...node.p};
                }
            }
		},
		async sync() {},
		backend: 'cpu',
		dispose() {
			// Своё солвер - освобождать нечего.
		}
	};
}

/**
 * Податливость ребра по его направлению на лекале.
 *
 * Долевая нить детали идёт по вертикали раскладки (ось y): ребро вдоль неё
 * тянется как основа, поперёк - как уток, под углом - смесь по sin².
 */
function stretchCompliance(
	fabric: Fabric,
	a: { x: number; y: number } | undefined,
	b: { x: number; y: number } | undefined
): number {
	if (!a || !b) return fabric.compliance;
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const length = Math.hypot(dx, dy);
	if (length < 1e-9) return fabric.compliance;
	const across = (dx / length) ** 2;
	return fabric.compliance * (1 - across) + fabric.weftCompliance * across;
}

/** Добавить ребро с длиной покоя из текущих позиций. */
function addEdge(
	nodes: ClothNode[],
	edges: ClothEdge[],
	a: number,
	b: number,
    seen: Set<string>,
	compliance = 1e-7
): void {
	if (a === undefined || b === undefined || a === b) return;
    const key = `${Math.min(a,b)}:${Math.max(a,b)}`;
    if (seen.has(key)) return;
    seen.add(key);
	const na = nodes[a];
	const nb = nodes[b];
	const rest = Math.hypot(nb.p.x - na.p.x, nb.p.y - na.p.y, nb.p.z - na.p.z);
	if (rest < 1e-9) return;
	edges.push({ a, b, rest, compliance });
}
