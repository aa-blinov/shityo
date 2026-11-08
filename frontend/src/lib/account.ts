/** Локальный профиль мастера: без регистрации и сервера.
 *
 * Это не учётная запись: имя и организация нужны только для подписи
 * резервных копий и порядка в интерфейсе. Данные живут в этом браузере.
 */

export interface AccountProfile {
	version: 1;
	name: string;
	organization: string;
	city: string;
	notes: string;
	updatedAt: string;
}

const STORAGE_KEY = 'shityo.account.v1';
const MAX_TEXT = 200;

export function defaultAccount(): AccountProfile {
	return {
		version: 1,
		name: '',
		organization: '',
		city: '',
		notes: '',
		updatedAt: new Date().toISOString()
	};
}

function text(value: unknown): string {
	return typeof value === 'string' ? value.trim().slice(0, MAX_TEXT) : '';
}

export function loadAccount(): AccountProfile {
	try {
		const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
		if (!raw || typeof raw !== 'object') return defaultAccount();
		const value = raw as Partial<AccountProfile>;
		return {
			version: 1,
			name: text(value.name),
			organization: text(value.organization),
			city: text(value.city),
			notes: text(value.notes),
			updatedAt:
				typeof value.updatedAt === 'string' && Number.isFinite(Date.parse(value.updatedAt))
					? value.updatedAt
					: new Date().toISOString()
		};
	} catch {
		return defaultAccount();
	}
}

export function saveAccount(profile: AccountProfile): AccountProfile {
	const next: AccountProfile = {
		version: 1,
		name: text(profile.name),
		organization: text(profile.organization),
		city: text(profile.city),
		notes: text(profile.notes),
		updatedAt: new Date().toISOString()
	};
	localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
	return next;
}

export function accountStats(): { designs: number; clients: number; custom: number } {
	let designs = 0;
	try {
		const raw = JSON.parse(localStorage.getItem('shityo.design-projects.v1') ?? '[]');
		designs = Array.isArray(raw) ? raw.length : 0;
	} catch {
		designs = 0;
	}
	let clients = 0;
	try {
		const raw = JSON.parse(localStorage.getItem('shityo.clients.v1') ?? 'null');
		clients = Array.isArray(raw?.clients) ? raw.clients.length : 0;
	} catch {
		clients = 0;
	}
	let custom = 0;
	try {
		const raw = JSON.parse(localStorage.getItem('shityo.custom-projects.v1') ?? '[]');
		custom = Array.isArray(raw) ? raw.length : 0;
	} catch {
		custom = 0;
	}
	return { designs, clients, custom };
}

export function exportAll(): void {
	// Повреждённое хранилище не выгружается как пустое: иначе мастер будет
	// уверен, что у него есть копия, а в ней ничего нет.
	const read = (key: string, fallback: unknown) => {
		const raw = localStorage.getItem(key);
		if (raw === null) return fallback;
		return JSON.parse(raw);
	};
	const payload = {
		exportedAt: new Date().toISOString(),
		account: loadAccount(),
		designProjects: read('shityo.design-projects.v1', []),
		designVersions: read('shityo.design-versions.v1', {}),
		clients: read('shityo.clients.v1', { clients: [], snapshots: [] }),
		customProjects: read('shityo.custom-projects.v1', [])
	};
	const url = URL.createObjectURL(
		new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
	);
	const link = document.createElement('a');
	link.href = url;
	link.download = 'shityo-account.json';
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
