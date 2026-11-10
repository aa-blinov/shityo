import { test as base, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Каждый тест работает в своём новом ателье: регистрация идёт через API до
 * открытия страницы, cookie сессии ложится в контекст браузера. Так тесты не
 * видят данных друг друга, а заодно проверяется разделение ателье.
 */

export interface Atelier {
	email: string;
	password: string;
	name: string;
}

export const PASSWORD = 'проверка-1234';

export async function registerAtelier(request: APIRequestContext, name = 'Ателье проверки'): Promise<Atelier> {
	const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
	const response = await request.post('/api/auth/register', {
		data: { atelier: name, name: 'Мастер проверки', email, password: PASSWORD }
	});
	expect(response.status(), await response.text()).toBe(201);
	return { email, password: PASSWORD, name };
}

export const test = base.extend<{ atelier: Atelier }>({
	atelier: [
		async ({ page }, use) => {
			await use(await registerAtelier(page.request));
		},
		{ auto: true }
	]
});

export { expect };
export type { Page };

/** Данные ателье через API: быстрее, чем через интерфейс, когда сценарий не о вводе. */
export async function apiCreateClient(page: Page, name: string, phone = ''): Promise<{ id: string; name: string }> {
	const response = await page.request.post('/api/clients', { data: { name, phone } });
	expect(response.ok(), await response.text()).toBeTruthy();
	return response.json();
}

export async function apiSnapshot(page: Page, clientId: string, label: string, values: Record<string, number>, createdAt?: string) {
	const response = await page.request.post(`/api/clients/${clientId}/snapshots`, { data: { label, values, createdAt } });
	expect(response.ok(), await response.text()).toBeTruthy();
	return response.json();
}

export async function apiProject(
	page: Page,
	id: string,
	body: { name: string; model: string; clientId?: string; stage?: string; measurements?: Record<string, number> }
) {
	const response = await page.request.put(`/api/projects/${id}`, {
		data: { version: 1, params: {}, overrides: {}, measurements: {}, ...body }
	});
	expect(response.ok(), await response.text()).toBeTruthy();
	return response.json();
}

export async function apiProjects(page: Page): Promise<{ id: string; name: string; model: string; stage: string; measurements: Record<string, number> }[]> {
	const response = await page.request.get('/api/projects');
	expect(response.ok()).toBeTruthy();
	return response.json();
}
