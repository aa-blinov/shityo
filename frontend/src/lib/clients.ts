/** Клиенты ателье и история их мерок.
 *
 * Клиент - человек (или манекен), к которому привязаны съёмки мерок с датами
 * и заказы. Съёмки не перезаписываются: новая добавляет строку истории.
 * Данные лежат на сервере ателье; удалять клиента может только владелец,
 * его заказы при этом остаются «без клиента».
 */
import { call } from './api';

export interface Client {
	id: string;
	name: string;
	phone: string;
	notes: string;
	createdAt: string;
	updatedAt: string;
	/** Сколько съёмок мерок и когда последняя: для реестра без лишних запросов. */
	snapshots: number;
	lastMeasuredAt: string | null;
}

export interface MeasurementSnapshot {
	id: string;
	clientId: string;
	label: string;
	createdAt: string;
	values: Record<string, number>;
}

const path = (id: string) => `/clients/${encodeURIComponent(id)}`;

export function listClients(): Promise<Client[]> {
	return call<Client[]>('GET', '/clients');
}

export function getClient(clientId: string): Promise<Client> {
	return call<Client>('GET', path(clientId));
}

export function createClient(name: string, notes = '', phone = ''): Promise<Client> {
	const trimmed = name.trim();
	if (!trimmed || trimmed.length > 120) return Promise.reject(new Error('clients.invalidName'));
	return call<Client>('POST', '/clients', { name: trimmed, notes, phone });
}

export function updateClient(
	clientId: string,
	patch: { name?: string; notes?: string; phone?: string }
): Promise<Client> {
	return call<Client>('PATCH', path(clientId), patch);
}

export function deleteClient(clientId: string): Promise<void> {
	return call<void>('DELETE', path(clientId));
}

export function listSnapshots(clientId: string): Promise<MeasurementSnapshot[]> {
	return call<MeasurementSnapshot[]>('GET', `${path(clientId)}/snapshots`);
}

export function createSnapshot(
	clientId: string,
	label: string,
	values: Record<string, number>
): Promise<MeasurementSnapshot> {
	return call<MeasurementSnapshot>('POST', `${path(clientId)}/snapshots`, {
		label: label.trim().slice(0, 60),
		values
	});
}

export function deleteSnapshot(clientId: string, snapshotId: string): Promise<void> {
	return call<void>('DELETE', `${path(clientId)}/snapshots/${encodeURIComponent(snapshotId)}`);
}

export function snapshotValues(snapshot: MeasurementSnapshot | undefined): Record<string, number> {
	return snapshot ? { ...snapshot.values } : {};
}
