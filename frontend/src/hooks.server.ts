import { redirect, type Handle } from '@sveltejs/kit';

/**
 * Приложение работает только после входа: данные ателье принадлежат его
 * сотрудникам. Здесь проверяется лишь наличие cookie сессии, чтобы не
 * показывать пустой интерфейс; действительность сессии проверяет сервер
 * API при каждом запросе, и при 401 страница сама уходит на вход.
 */
const PUBLIC = ['/login'];

export const handle: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;
	const open = PUBLIC.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
	if (!open && !event.cookies.get('shityo_session')) {
		const next = encodeURIComponent(path + event.url.search);
		redirect(303, `/login?next=${next}`);
	}
	return resolve(event);
};
