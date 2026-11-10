/** Даты в реестрах: короткая форма для строк, полная - для подсказки. */
export function shortDate(value: string | null | undefined, locale: string): string {
	if (!value) return '';
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return '';
	const sameYear = parsed.getFullYear() === new Date().getFullYear();
	return new Intl.DateTimeFormat(locale, {
		day: 'numeric',
		month: 'short',
		...(sameYear ? {} : { year: 'numeric' })
	}).format(parsed);
}

export function fullDate(value: string | null | undefined, locale: string): string {
	if (!value) return '';
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return '';
	return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeStyle: 'short' }).format(parsed);
}

/** Поиск без учёта регистра и буквы ё: «Семёнова» находится по «семенова». */
export function matches(query: string, ...fields: (string | undefined | null)[]): boolean {
	const normal = (text: string) => text.toLocaleLowerCase().replaceAll('ё', 'е').trim();
	const needle = normal(query);
	if (!needle) return true;
	return fields.some((field) => !!field && normal(field).includes(needle));
}
