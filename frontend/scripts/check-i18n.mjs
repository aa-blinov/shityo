/**
 * Проверка словарей локализации.
 *
 * Главный риск i18n - ключ, который есть в одном словаре и отсутствует в
 * другом: интерфейс молча показывает сырой ключ или пустую строку.
 *
 * Проверка идёт по трём осям:
 *   - набор ключей в русском и английском словарях совпадает;
 *   - каждый код замечания валидатора есть в обоих словарях;
 *   - плейсхолдеры в переводе совпадают с шаблоном из бэкенда.
 *
 * Run: node scripts/check-i18n.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { ru } from '../src/lib/i18n/ru.ts';
import { en } from '../src/lib/i18n/en.ts';

const here = dirname(fileURLToPath(import.meta.url));
const ISSUES_PY = resolve(here, '../../backend/app/core/issues.py');

const problems = [];

const ruKeys = Object.keys(ru);
const enKeys = Object.keys(en);

for (const key of ruKeys) {
	if (!(key in en)) problems.push(`ключ «${key}» есть по-русски, но нет по-английски`);
}
for (const key of enKeys) {
	if (!(key in ru)) problems.push(`ключ «${key}» есть по-английски, но нет по-русски`);
}
for (const [locale, dict] of [
	['ru', ru],
	['en', en]
]) {
	for (const [key, value] of Object.entries(dict)) {
		if (typeof value !== 'string' || value.trim() === '') {
			problems.push(`${locale}: «${key}» - пустая строка`);
		}
	}
}

// Коды замечаний валидатора и их шаблоны: источник - бэкенд. Читаем
// только словарь MESSAGES, иначе в разбор попадают другие словари модуля.
// Шаблон может быть собран из нескольких строковых литералов и стоять под
// скобками, поэтому литералы берём подряд.
const issuesSource = readFileSync(ISSUES_PY, 'utf-8');
const block = issuesSource.slice(issuesSource.indexOf('MESSAGES: dict[str, str] = {'));
const templates = new Map();
for (const match of block.matchAll(/"([a-z_.]+)":\s*\(?\s*((?:\s*"[^"]*")+)/g)) {
	const [, code, literals] = match;
	const template = [...literals.matchAll(/"([^"]*)"/g)].map((m) => m[1]).join('');
	templates.set(code, template);
}

for (const [code, template] of templates) {
	for (const locale of ['ru', 'en']) {
		const dict = locale === 'ru' ? ru : en;
		const key = `issue.${code}`;
		if (!(key in dict)) {
			problems.push(`${locale}: нет перевода замечания «${code}»`);
			continue;
		}
		const expected = [...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
		const actual = [...dict[key].matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
		if (expected.join(',') !== actual.join(',')) {
			problems.push(
				`${locale}: в «${key}» плейсхолдеры [${actual}] вместо [${expected}]`
			);
		}
	}
}

// Коды, которые есть в словаре, но неизвестны бэкенду. Клиентские коды
// живут в своём пространстве и бэкенду не соответствуют.
const CLIENT_CODES = new Set(['app.request_failed']);

for (const key of ruKeys) {
	if (!key.startsWith('issue.')) continue;
	const code = key.slice('issue.'.length);
	if (CLIENT_CODES.has(code)) continue;
	if (!templates.has(code)) problems.push(`в словаре есть перевод несуществующего кода «${code}»`);
}

if (problems.length > 0) {
	console.error(`Проблем в словарях: ${problems.length}`);
	for (const problem of problems) console.error(`  - ${problem}`);
	process.exit(1);
}

console.log(`Словари совпадают: ${ruKeys.length} ключей, кодов замечаний: ${templates.size}`);
