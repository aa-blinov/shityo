/**
 * Вошедший сотрудник и его ателье.
 *
 * Сервер знает сессию по cookie; здесь лежит её отражение для интерфейса:
 * имя в шапке, роль (владелец видит управление сотрудниками), ателье.
 */
import { call } from './api';

export type Role = 'owner' | 'master';

export interface User {
	id: string;
	name: string;
	email: string;
	role: Role;
	active: boolean;
}

export interface Atelier {
	id: string;
	name: string;
	city: string;
	notes: string;
}

export interface Me {
	user: User;
	atelier: Atelier;
}

class Session {
	me = $state<Me | null>(null);
	loaded = $state(false);

	get isOwner(): boolean {
		return this.me?.user.role === 'owner';
	}

	async load(): Promise<Me | null> {
		try {
			this.me = await call<Me>('GET', '/auth/me');
		} catch {
			this.me = null;
		}
		this.loaded = true;
		return this.me;
	}

	async login(email: string, password: string): Promise<Me> {
		this.me = await call<Me>('POST', '/auth/login', { email, password });
		this.loaded = true;
		return this.me;
	}

	async register(body: { atelier: string; name: string; email: string; password: string }): Promise<Me> {
		this.me = await call<Me>('POST', '/auth/register', body);
		this.loaded = true;
		return this.me;
	}

	async logout(): Promise<void> {
		try {
			await call('POST', '/auth/logout');
		} finally {
			this.me = null;
		}
	}
}

export const session = new Session();
