/**
 * Единая навигация: разделы шапки и возврат «туда, откуда пришёл».
 *
 * Лекало открывается из каталога основ, реестра заказов или карточки
 * клиента. Откуда - передаётся параметром `from`, чтобы стрелка назад и
 * подсветка раздела в шапке вели обратно, а не всегда в каталог.
 */

export type Section = 'orders' | 'clients' | 'catalog' | 'guide' | 'account';

export interface Crumb {
	/** Ключ словаря или готовый текст (имя клиента). */
	label: string;
	href?: string;
	/** label - уже готовый текст, переводить не нужно. */
	raw?: boolean;
}

const FROM = /^\/(orders|clients\/[A-Za-z0-9_-]{1,80})$/;

/** Проверенный путь возврата из параметра `from`; чужие адреса отбрасываются. */
export function fromPath(url: URL): string {
	const value = url.searchParams.get('from') ?? '';
	return FROM.test(value) ? value : '';
}

/** Ссылка с параметром возврата. */
export function withFrom(href: string, from: string): string {
	if (!from) return href;
	return `${href}${href.includes('?') ? '&' : '?'}from=${encodeURIComponent(from)}`;
}

/** Id клиента из пути возврата `/clients/<id>`. */
export function clientFrom(from: string): string {
	return from.startsWith('/clients/') ? from.slice('/clients/'.length) : '';
}

/** Раздел шапки, к которому относится страница. */
export function sectionOf(url: URL): Section | null {
	const path = url.pathname;
	if (path.startsWith('/orders')) return 'orders';
	if (path.startsWith('/clients')) return 'clients';
	if (path.startsWith('/guide') || path.startsWith('/icons')) return 'guide';
	if (path.startsWith('/account')) return 'account';
	if (path.startsWith('/pattern')) {
		const from = fromPath(url);
		if (from === '/orders') return 'orders';
		if (from.startsWith('/clients/')) return 'clients';
		return 'catalog';
	}
	if (path === '/') return 'catalog';
	return null;
}

/** Начало крошек лекала: раздел, из которого его открыли. */
export function patternTrail(from: string, clientName = ''): Crumb[] {
	if (from === '/orders') return [{ label: 'app.orders', href: '/orders' }];
	if (from.startsWith('/clients/')) {
		return [
			{ label: 'app.clients', href: '/clients' },
			clientName
				? { label: clientName, href: from, raw: true }
				: { label: 'clientCard.title', href: from }
		];
	}
	return [{ label: 'app.catalog', href: '/' }];
}
