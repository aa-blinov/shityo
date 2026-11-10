/** Данные, которые остались в браузере с тех времён, когда сервера не было.
 *
 * Раньше проекты, клиенты и выкройки жили в localStorage. После входа их
 * предлагают перенести в ателье одним запросом; записи остаются в браузере
 * нетронутыми, а отметка о переносе не даёт предложить его второй раз.
 * Сервер сам проверяет каждую запись и пропускает уже перенесённые.
 */

const KEYS = {
	projects: 'shityo.design-projects.v1',
	versions: 'shityo.design-versions.v1',
	clients: 'shityo.clients.v1',
	legacyClients: 'shityo.client-measurements.v1',
	custom: 'shityo.custom-projects.v1'
} as const;
const MIGRATED_KEY = 'shityo.migrated.v1';

export interface BrowserPayload {
	designProjects: unknown[];
	designVersions: Record<string, unknown[]>;
	clients: { clients: unknown[]; snapshots: unknown[] };
	customProjects: unknown[];
}

function read<T>(key: string, fallback: T): T {
	try {
		const raw = localStorage.getItem(key);
		return raw === null ? fallback : (JSON.parse(raw) as T);
	} catch {
		return fallback;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Самый старый формат: список «имя + мерки» без истории. */
function legacyClients(): { clients: unknown[]; snapshots: unknown[] } {
	const raw = read<unknown>(KEYS.legacyClients, []);
	if (!Array.isArray(raw)) return { clients: [], snapshots: [] };
	const clients: unknown[] = [];
	const snapshots: unknown[] = [];
	for (const item of raw) {
		if (!isRecord(item) || typeof item.name !== 'string' || !isRecord(item.values)) continue;
		const id = crypto.randomUUID();
		const createdAt = new Date().toISOString();
		clients.push({ id, name: item.name, notes: '', createdAt });
		snapshots.push({ id: crypto.randomUUID(), clientId: id, label: '', createdAt, values: item.values });
	}
	return { clients, snapshots };
}

export function browserPayload(): BrowserPayload {
	const state = read<unknown>(KEYS.clients, null);
	const legacy = legacyClients();
	const clients = isRecord(state) && Array.isArray(state.clients) ? state.clients : [];
	const snapshots = isRecord(state) && Array.isArray(state.snapshots) ? state.snapshots : [];
	const projects = read<unknown>(KEYS.projects, []);
	const versions = read<unknown>(KEYS.versions, {});
	const custom = read<unknown>(KEYS.custom, []);
	return {
		designProjects: Array.isArray(projects) ? projects : [],
		designVersions: isRecord(versions) ? (versions as Record<string, unknown[]>) : {},
		clients: { clients: [...clients, ...legacy.clients], snapshots: [...snapshots, ...legacy.snapshots] },
		customProjects: Array.isArray(custom) ? custom : []
	};
}

/** Сколько записей ждёт переноса; ноль - если переносить нечего или уже перенесено. */
export function pendingCounts(): { projects: number; clients: number; custom: number } {
	try {
		if (localStorage.getItem(MIGRATED_KEY)) return { projects: 0, clients: 0, custom: 0 };
	} catch {
		return { projects: 0, clients: 0, custom: 0 };
	}
	const payload = browserPayload();
	return {
		projects: payload.designProjects.length,
		clients: payload.clients.clients.length,
		custom: payload.customProjects.length
	};
}

export function markMigrated(): void {
	try {
		localStorage.setItem(MIGRATED_KEY, new Date().toISOString());
	} catch {
		// Без хранилища предложение просто появится ещё раз; сервер не задвоит данные.
	}
}
