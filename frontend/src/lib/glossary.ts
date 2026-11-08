/**
 * Справочник терминов конструирования одежды.
 *
 * Определения взяты из ГОСТ и учебников по методике ЕМКО СЭВ и пересказаны
 * своими словами; у каждой статьи есть источник со ссылкой
 * (docs/research/06-glossary-sources.json). Поле «где в Shityo» описывает
 * наш интерфейс и написано здесь.
 */
import entries from './glossary.json';

export interface GlossaryEntry {
	id: string;
	term: string;
	abbr?: string;
	short: string;
	full: string;
	source: string;
	url: string;
	/** Раздел справочника. */
	section: string;
	/** Как этим пользоваться в Shityo. */
	ui?: string;
}

export const GLOSSARY: GlossaryEntry[] = entries as GlossaryEntry[];

const BY_ID = new Map(GLOSSARY.map((entry) => [entry.id, entry]));

export function glossaryEntry(id: string): GlossaryEntry | undefined {
	return BY_ID.get(id);
}

/** Разделы в порядке работы над изделием. */
export const SECTIONS = ['basics', 'measures', 'ease', 'drawing', 'sleeve', 'check', 'production'] as const;

/** Мерка интерфейса - статья справочника. */
export const MEASURE_TERMS: Record<string, string> = {
	half_bust: 'sg3',
	back_waist_length: 'dts',
	neck_to_waist: 'dts',
	front_waist_length: 'dtp',
	bust_height: 'vg',
	bust_center: 'cg',
	shoulder_length: 'shp',
	shoulder_width: 'shp',
	biceps: 'op',
	crotch_depth: 'vs',
	inseam_length: 'dn',
	armhole_depth: 'glubina_proymy'
};

/** Прибавка посадки - статья справочника. */
export const EASE_TERMS: Record<string, string> = {
	ease_bust: 'pribavka_po_grudi',
	ease_waist: 'pribavka_po_talii',
	ease_hip: 'pribavka_po_bedram'
};
