/** Ателье: реквизиты, сотрудники и резервная копия.
 *
 * Реквизиты и сотрудников меняет только владелец; сервер проверяет роль сам,
 * интерфейс лишь не показывает недоступное.
 */
import { call } from './api';
import type { Atelier, Role, User } from './session.svelte';

export function saveAtelier(body: { name: string; city: string; notes: string }): Promise<Atelier> {
	return call<Atelier>('PUT', '/atelier', body);
}

export function listStaff(): Promise<User[]> {
	return call<User[]>('GET', '/staff');
}

export function createStaff(body: { name: string; email: string; password: string; role: Role }): Promise<User> {
	return call<User>('POST', '/staff', body);
}

export function updateStaff(
	id: string,
	patch: { name?: string; role?: Role; active?: boolean; password?: string }
): Promise<User> {
	return call<User>('PATCH', `/staff/${encodeURIComponent(id)}`, patch);
}

export function changePassword(current: string, next: string): Promise<void> {
	return call<void>('PUT', '/auth/password', { current, next });
}

export interface ImportResult {
	clients: number;
	snapshots: number;
	projects: number;
	versions: number;
	custom: number;
	skipped: number;
}

/** Перенос резервной копии или данных браузера. Уже существующие записи не трогаются. */
export function importData(payload: unknown): Promise<ImportResult> {
	return call<ImportResult>('POST', '/import', payload);
}

/** Резервная копия всего ателье: проекты с файлами, клиенты, мерки, выкройки. */
export async function exportAll(): Promise<void> {
	const payload = await call<unknown>('GET', '/export');
	const url = URL.createObjectURL(
		new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
	);
	const link = document.createElement('a');
	link.href = url;
	link.download = 'shityo-atelier.json';
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
