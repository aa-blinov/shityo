/**
 * Локализация интерфейса.
 *
 * Словари лежат рядом, ключи - плоские. Строки разложены по смыслу
 * (app, catalog, measures, pieces, export, sizeGrid), чтобы при правке
 * одного экрана не приходилось искать по всему интерфейсу.
 *
 * Язык выбирается один раз при старте и кладётся в localStorage: сервер
 * отдаёт русский по умолчанию, а переключение доступно без перезагрузки.
 *
 * Текущий язык - стор. Компоненты читают перевод как `$t('ключ')`, поэтому
 * смена языка перерисовывает их сама: обычная функция со стором внутри
 * такой связи не создаёт.
 */
import { derived, get, writable } from 'svelte/store';
import { ru } from './ru';
import { en } from './en';

export type Locale = 'ru' | 'en';

/**
 * Словари приводятся к общему виду: русский задаёт набор ключей, английский
 * должен покрывать его целиком, иначе перевод молча пропадёт.
 */
const MESSAGES: Record<Locale, Record<string, string>> = {
	ru: ru as Record<string, string>,
	en: en as Record<string, string>
};

const STORAGE_KEY = 'shityo.locale';

/** Текущий язык. */
export const locale = writable<Locale>('ru');

/**
 * Перевод по ключу для текущего языка.
 *
 * Неизвестный ключ - это ошибка в словаре, а не повод молчать: показываем
 * сам ключ, чтобы его было видно в интерфейсе.
 */
export const t = derived(locale, ($locale) => {
	const dict = MESSAGES[$locale] ?? MESSAGES.ru;
	const fallback = MESSAGES.ru;
	return (key: string, values?: Record<string, string | number>): string => {
		let text = dict[key] ?? fallback[key] ?? key;
		if (values) {
			for (const [name, value] of Object.entries(values)) {
				text = text.replaceAll(`{${name}}`, String(value));
			}
		}
		return text;
	};
});

/** Все словари - для проверки, что ключи совпадают. */
export const dictionaries = MESSAGES;

/** Есть ли ключ в словаре. */
export function hasKey(key: string): boolean {
	return key in (MESSAGES[get(locale)] ?? ru) || key in ru;
}

/** Сменить язык. */
export function setLocale(next: Locale): void {
	locale.set(next);
	if (typeof localStorage !== 'undefined') {
		localStorage.setItem(STORAGE_KEY, next);
	}
	if (typeof document !== 'undefined') {
		document.documentElement.lang = next;
	}
}

/** Прочитать сохранённый язык. */
export function restoreLocale(): Locale {
	if (typeof localStorage === 'undefined') return 'ru';
	const saved = localStorage.getItem(STORAGE_KEY);
	return saved === 'en' ? 'en' : 'ru';
}
