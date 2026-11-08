/**
 * Раскладка рабочей области, которую швея настраивает под себя: где панель
 * мерок (слева или справа) и какой ширины боковые панели. Хранится в этом
 * браузере; без хранилища действует до перезагрузки.
 */

const KEY = 'shityo.workspace-layout.v1';
export const PANEL_MIN = 240;
export const PANEL_MAX = 520;
const DEFAULTS = { measures: 320, inspector: 288, swapped: false };

function clamp(value: unknown, fallback: number): number {
	const n = Number(value);
	return Number.isFinite(n) ? Math.min(PANEL_MAX, Math.max(PANEL_MIN, Math.round(n))) : fallback;
}

class WorkspaceLayout {
	/** Ширина панели мерок, px. */
	measures = $state(DEFAULTS.measures);
	/** Ширина панели проверки, px. */
	inspector = $state(DEFAULTS.inspector);
	/** Мерки справа, проверка слева. */
	swapped = $state(DEFAULTS.swapped);

	load() {
		try {
			const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
			if (!raw || typeof raw !== 'object') return;
			this.measures = clamp(raw.measures, DEFAULTS.measures);
			this.inspector = clamp(raw.inspector, DEFAULTS.inspector);
			this.swapped = raw.swapped === true;
		} catch {
			// Повреждённая настройка не мешает работе: остаются значения по умолчанию.
		}
	}

	save() {
		try {
			localStorage.setItem(
				KEY,
				JSON.stringify({ measures: this.measures, inspector: this.inspector, swapped: this.swapped })
			);
		} catch {
			// Без хранилища раскладка живёт до перезагрузки.
		}
	}

	resize(panel: 'measures' | 'inspector', width: number) {
		this[panel] = clamp(width, DEFAULTS[panel]);
		this.save();
	}

	setSwapped(value: boolean) {
		this.swapped = value;
		this.save();
	}

	reset() {
		this.measures = DEFAULTS.measures;
		this.inspector = DEFAULTS.inspector;
		this.swapped = DEFAULTS.swapped;
		this.save();
	}
}

export const workspaceLayout = new WorkspaceLayout();
