/** Клиенты и история мерок: хранилище в localStorage.
 *
 * Каждый клиент - это человек (или манекен), к которому привязаны
 * записи мерок с датами. Записи не перезаписываются: новая съёмка
 * добавляет ещё одну строку истории. Удаление клиента удаляет
 * все его записи.
 */

export interface Client {
	id: string;
	name: string;
	notes: string;
	createdAt: string;
}

export interface MeasurementSnapshot {
	id: string;
	clientId: string;
	label: string;
	createdAt: string;
	values: Record<string, number>;
}

export interface ClientState {
	clients: Client[];
	snapshots: MeasurementSnapshot[];
}

const KEY = 'shityo.clients.v1';
const LEGACY_KEY = 'shityo.client-measurements.v1';
const MAX_NAME_LENGTH = 120;
const MAX_LABEL_LENGTH = 60;
const MAX_NOTES_LENGTH = 500;

function id(): string {
	return crypto.randomUUID();
}

function isString(value: unknown): value is string {
	return typeof value === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function validValues(value: unknown): value is Record<string, number> {
	if (!isRecord(value)) return false;
	return Object.values(value).every(isFiniteNumber);
}

function validClient(raw: unknown): Client | null {
	if (!isRecord(raw)) return null;
	const { id, name, notes, createdAt } = raw;
	if (
		!isString(id) ||
		!/^[a-f0-9-]{36}$/i.test(id) ||
		!isString(name) ||
		!name.trim() ||
		name.length > MAX_NAME_LENGTH ||
		!isString(createdAt) ||
		!Number.isFinite(Date.parse(createdAt))
	) {
		return null;
	}
	return {
		id,
		name: name.trim(),
		notes: isString(notes) ? notes.slice(0, MAX_NOTES_LENGTH) : '',
		createdAt,
	};
}

function validSnapshot(raw: unknown): MeasurementSnapshot | null {
	if (!isRecord(raw)) return null;
	const { id, clientId, label, createdAt, values } = raw;
	if (
		!isString(id) ||
		!/^[a-f0-9-]{36}$/i.test(id) ||
		!isString(clientId) ||
		!/^[a-f0-9-]{36}$/i.test(clientId) ||
		!isString(label) ||
		!isString(createdAt) ||
		!Number.isFinite(Date.parse(createdAt)) ||
		!validValues(values)
	) {
		return null;
	}
	return { id, clientId, label: label.slice(0, MAX_LABEL_LENGTH), createdAt, values };
}

function migrateLegacy(state: ClientState): ClientState {
	try {
		const raw = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? '[]');
		if (!Array.isArray(raw) || raw.length === 0) return state;
		const migrated: Client[] = [];
		const newSnapshots: MeasurementSnapshot[] = [];
		for (const item of raw) {
			if (!isRecord(item) || !isString(item.name) || !validValues(item.values)) continue;
			const client: Client = {
				id: id(),
				name: item.name.trim().slice(0, MAX_NAME_LENGTH),
				notes: '',
				createdAt: new Date().toISOString(),
			};
			const snapshot: MeasurementSnapshot = {
				id: crypto.randomUUID(),
				clientId: client.id,
				label: new Date().toLocaleDateString(),
				createdAt: client.createdAt,
				values: { ...item.values },
			};
			migrated.push(client);
			newSnapshots.push(snapshot);
		}
		if (migrated.length === 0) return state;
		localStorage.removeItem(LEGACY_KEY);
		return {
			clients: [...state.clients, ...migrated],
			snapshots: [...state.snapshots, ...newSnapshots],
		};
	} catch {
		return state;
	}
}

export function loadState(): ClientState {
	const empty: ClientState = { clients: [], snapshots: [] };
	try {
		const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
		if (!isRecord(raw)) return migrateLegacy(empty);
		const clients = Array.isArray(raw.clients)
			? raw.clients.map(validClient).filter((c): c is Client => c !== null)
			: [];
		const snapshots = Array.isArray(raw.snapshots)
			? raw.snapshots.map(validSnapshot).filter((s): s is MeasurementSnapshot => s !== null)
			: [];
		return migrateLegacy({ clients, snapshots });
	} catch {
		return empty;
	}
}

function persist(state: ClientState): void {
	localStorage.setItem(KEY, JSON.stringify(state));
}

function withState<T>(fn: (state: ClientState) => [ClientState, T]): T {
	const state = loadState();
	const [next, result] = fn(state);
	persist(next);
	return result;
}

export function listClients(): Client[] {
	return loadState().clients.slice().sort((a, b) => a.name.localeCompare(b.name));
}

export function getClient(clientId: string): Client | undefined {
	return loadState().clients.find((c) => c.id === clientId);
}

export function createClient(name: string, notes = ''): Client {
	const trimmed = name.trim();
	if (!trimmed || trimmed.length > MAX_NAME_LENGTH) {
		throw new Error('clients.invalidName');
	}
	return withState((state) => {
		const client: Client = {
			id: id(),
			name: trimmed,
			notes: notes.trim().slice(0, MAX_NOTES_LENGTH),
			createdAt: new Date().toISOString(),
		};
		return [{ ...state, clients: [...state.clients, client] }, client];
	});
}

export function updateClient(clientId: string, patch: { name?: string; notes?: string }): Client {
	return withState((state) => {
		const index = state.clients.findIndex((c) => c.id === clientId);
		if (index === -1) throw new Error('clients.notFound');
		const current = state.clients[index];
		const name = patch.name?.trim() ?? current.name;
		if (!name || name.length > MAX_NAME_LENGTH) throw new Error('clients.invalidName');
		const client: Client = {
			...current,
			name,
			notes: patch.notes !== undefined ? patch.notes.trim().slice(0, MAX_NOTES_LENGTH) : current.notes,
		};
		const clients = state.clients.slice();
		clients[index] = client;
		return [{ ...state, clients }, client];
	});
}

export function deleteClient(clientId: string): void {
	withState((state) => {
		if (!state.clients.some((c) => c.id === clientId)) return [state, undefined];
		return [
			{
				...state,
				clients: state.clients.filter((c) => c.id !== clientId),
				snapshots: state.snapshots.filter((s) => s.clientId !== clientId),
			},
			undefined,
		];
	});
}

export function listSnapshots(clientId: string): MeasurementSnapshot[] {
	return loadState()
		.snapshots.filter((s) => s.clientId === clientId)
		.slice()
		.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function createSnapshot(
	clientId: string,
	label: string,
	values: Record<string, number>
): MeasurementSnapshot {
	if (!getClient(clientId)) throw new Error('clients.notFound');
	if (!validValues(values)) throw new Error('clients.invalidValues');
	return withState((state) => {
		const snapshot: MeasurementSnapshot = {
			id: id(),
			clientId,
			label: label.trim().slice(0, MAX_LABEL_LENGTH) || new Date().toLocaleDateString(),
			createdAt: new Date().toISOString(),
			values: { ...values },
		};
		return [{ ...state, snapshots: [...state.snapshots, snapshot] }, snapshot];
	});
}

export function deleteSnapshot(clientId: string, snapshotId: string): void {
	withState((state) => {
		const exists = state.snapshots.some(
			(s) => s.clientId === clientId && s.id === snapshotId
		);
		if (!exists) return [state, undefined];
		return [
			{
				...state,
				snapshots: state.snapshots.filter(
					(s) => !(s.clientId === clientId && s.id === snapshotId)
				),
			},
			undefined,
		];
	});
}

export function snapshotValues(snapshot: MeasurementSnapshot | undefined): Record<string, number> {
	return snapshot ? { ...snapshot.values } : {};
}
