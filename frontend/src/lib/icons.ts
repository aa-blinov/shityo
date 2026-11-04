/**
 * Набор иконок для галереи.
 *
 * Иконки из `lucide-svelte` подключаются поимённо, глубокими импортами: в
 * пакете 2700+ знаков, и импорт через общий индекс тянет в бандл весь
 * набор (4,8 МБ против 60 КБ у выбранных иконок).
 *
 * Список виден в галерее: /icons.
 */
import Languages from 'lucide-svelte/icons/languages';
import Palette from 'lucide-svelte/icons/palette';
import Sun from 'lucide-svelte/icons/sun';
import Search from 'lucide-svelte/icons/search';
import Settings from 'lucide-svelte/icons/settings';
import Info from 'lucide-svelte/icons/info';
import HelpCircle from 'lucide-svelte/icons/help-circle';
import BookOpen from 'lucide-svelte/icons/book-open';
import Sparkles from 'lucide-svelte/icons/sparkles';
import Component from 'lucide-svelte/icons/component';
import Workflow from 'lucide-svelte/icons/workflow';
import Ruler from 'lucide-svelte/icons/ruler';
import PenTool from 'lucide-svelte/icons/pen-tool';
import Spline from 'lucide-svelte/icons/spline';
import Scissors from 'lucide-svelte/icons/scissors';
import Shirt from 'lucide-svelte/icons/shirt';
import Baseline from 'lucide-svelte/icons/baseline';
import Crop from 'lucide-svelte/icons/crop';
import Frame from 'lucide-svelte/icons/frame';
import Lasso from 'lucide-svelte/icons/lasso';
import Pointer from 'lucide-svelte/icons/pointer';
import Crosshair from 'lucide-svelte/icons/crosshair';
import Grid2x2 from 'lucide-svelte/icons/grid-2x2';
import Grid3x3 from 'lucide-svelte/icons/grid-3x3';
import ScanLine from 'lucide-svelte/icons/scan-line';
import Square from 'lucide-svelte/icons/square';
import Box from 'lucide-svelte/icons/box';
import ZoomIn from 'lucide-svelte/icons/zoom-in';
import ZoomOut from 'lucide-svelte/icons/zoom-out';
import Maximize from 'lucide-svelte/icons/maximize';
import Maximize2 from 'lucide-svelte/icons/maximize-2';
import Minimize from 'lucide-svelte/icons/minimize';
import Minimize2 from 'lucide-svelte/icons/minimize-2';
import Eye from 'lucide-svelte/icons/eye';
import EyeOff from 'lucide-svelte/icons/eye-off';
import Move from 'lucide-svelte/icons/move';
import RotateCcw from 'lucide-svelte/icons/rotate-ccw';
import RotateCw from 'lucide-svelte/icons/rotate-cw';
import FlipHorizontal from 'lucide-svelte/icons/flip-horizontal';
import PanelLeft from 'lucide-svelte/icons/panel-left';
import PanelRight from 'lucide-svelte/icons/panel-right';
import Hand from 'lucide-svelte/icons/hand';
import MousePointer2 from 'lucide-svelte/icons/mouse-pointer-2';
import Plus from 'lucide-svelte/icons/plus';
import X from 'lucide-svelte/icons/x';
import Check from 'lucide-svelte/icons/check';
import Copy from 'lucide-svelte/icons/copy';
import Download from 'lucide-svelte/icons/download';
import Upload from 'lucide-svelte/icons/upload';
import Save from 'lucide-svelte/icons/save';
import Undo from 'lucide-svelte/icons/undo';
import Redo from 'lucide-svelte/icons/redo';
import Trash2 from 'lucide-svelte/icons/trash-2';
import Printer from 'lucide-svelte/icons/printer';
import Share2 from 'lucide-svelte/icons/share-2';
import Link2 from 'lucide-svelte/icons/link-2';
import CornerDownRight from 'lucide-svelte/icons/corner-down-right';
import GitBranch from 'lucide-svelte/icons/git-branch';
import GitMerge from 'lucide-svelte/icons/git-merge';
import MoreHorizontal from 'lucide-svelte/icons/more-horizontal';
import Type from 'lucide-svelte/icons/type';
import TextCursorInput from 'lucide-svelte/icons/text-cursor-input';
import AlignLeft from 'lucide-svelte/icons/align-left';
import AlignCenter from 'lucide-svelte/icons/align-center';
import AlignRight from 'lucide-svelte/icons/align-right';
import Table from 'lucide-svelte/icons/table';
import List from 'lucide-svelte/icons/list';
import Columns from 'lucide-svelte/icons/columns';
import Layers from 'lucide-svelte/icons/layers';
import Image from 'lucide-svelte/icons/image';
import FileText from 'lucide-svelte/icons/file-text';
import FileJson from 'lucide-svelte/icons/file-json';
import FileDown from 'lucide-svelte/icons/file-down';
import CircleDot from 'lucide-svelte/icons/circle-dot';
import Pipette from 'lucide-svelte/icons/pipette';
import ArrowUp from 'lucide-svelte/icons/arrow-up';
import ArrowDown from 'lucide-svelte/icons/arrow-down';
import ArrowLeft from 'lucide-svelte/icons/arrow-left';
import ArrowRight from 'lucide-svelte/icons/arrow-right';
import ChevronUp from 'lucide-svelte/icons/chevron-up';
import ChevronDown from 'lucide-svelte/icons/chevron-down';
import ChevronLeft from 'lucide-svelte/icons/chevron-left';
import ChevronRight from 'lucide-svelte/icons/chevron-right';

export interface IconEntry {
	/** имя компонента lucide-svelte */
	name: string;
	/** компонент для отрисовки */
	component: typeof AlignCenter;
}

/**
 * Список иконок галереи: имя и компонент.
 *
 * Порядок задаёт разделы галереи - он же группировка на странице.
 */
export const ICON_GROUPS: { title: string; icons: IconEntry[] }[] = [
	{
		title: 'interface',
		icons: [
			{ name: 'Languages', component: Languages },
			{ name: 'Palette', component: Palette },
			{ name: 'Sun', component: Sun },
			{ name: 'Search', component: Search },
			{ name: 'Settings', component: Settings },
			{ name: 'Info', component: Info },
			{ name: 'HelpCircle', component: HelpCircle },
			{ name: 'BookOpen', component: BookOpen },
			{ name: 'Sparkles', component: Sparkles },
			{ name: 'Component', component: Component },
			{ name: 'Workflow', component: Workflow },
		]
	},

	{
		title: 'pattern',
		icons: [
			{ name: 'Ruler', component: Ruler },
			{ name: 'PenTool', component: PenTool },
			{ name: 'Spline', component: Spline },
			{ name: 'Scissors', component: Scissors },
			{ name: 'Shirt', component: Shirt },
			{ name: 'Baseline', component: Baseline },
			{ name: 'Crop', component: Crop },
			{ name: 'Frame', component: Frame },
			{ name: 'Lasso', component: Lasso },
			{ name: 'Pointer', component: Pointer },
			{ name: 'Crosshair', component: Crosshair },
			{ name: 'Grid2x2', component: Grid2x2 },
			{ name: 'Grid3x3', component: Grid3x3 },
			{ name: 'ScanLine', component: ScanLine },
			{ name: 'Square', component: Square },
			{ name: 'Box', component: Box },
		]
	},

	{
		title: 'view',
		icons: [
			{ name: 'ZoomIn', component: ZoomIn },
			{ name: 'ZoomOut', component: ZoomOut },
			{ name: 'Maximize', component: Maximize },
			{ name: 'Maximize2', component: Maximize2 },
			{ name: 'Minimize', component: Minimize },
			{ name: 'Minimize2', component: Minimize2 },
			{ name: 'Eye', component: Eye },
			{ name: 'EyeOff', component: EyeOff },
			{ name: 'Move', component: Move },
			{ name: 'RotateCcw', component: RotateCcw },
			{ name: 'RotateCw', component: RotateCw },
			{ name: 'FlipHorizontal', component: FlipHorizontal },
			{ name: 'PanelLeft', component: PanelLeft },
			{ name: 'PanelRight', component: PanelRight },
			{ name: 'Hand', component: Hand },
			{ name: 'MousePointer2', component: MousePointer2 },
		]
	},

	{
		title: 'actions',
		icons: [
			{ name: 'Plus', component: Plus },
			{ name: 'X', component: X },
			{ name: 'Check', component: Check },
			{ name: 'Copy', component: Copy },
			{ name: 'Download', component: Download },
			{ name: 'Upload', component: Upload },
			{ name: 'Save', component: Save },
			{ name: 'Undo', component: Undo },
			{ name: 'Redo', component: Redo },
			{ name: 'Trash2', component: Trash2 },
			{ name: 'Printer', component: Printer },
			{ name: 'Share2', component: Share2 },
			{ name: 'Link2', component: Link2 },
			{ name: 'CornerDownRight', component: CornerDownRight },
			{ name: 'GitBranch', component: GitBranch },
			{ name: 'GitMerge', component: GitMerge },
			{ name: 'MoreHorizontal', component: MoreHorizontal },
			{ name: 'Ellipsis', component: MoreHorizontal },
		]
	},

	{
		title: 'data',
		icons: [
			{ name: 'Type', component: Type },
			{ name: 'TextCursorInput', component: TextCursorInput },
			{ name: 'AlignLeft', component: AlignLeft },
			{ name: 'AlignCenter', component: AlignCenter },
			{ name: 'AlignRight', component: AlignRight },
			{ name: 'Table', component: Table },
			{ name: 'List', component: List },
			{ name: 'Columns', component: Columns },
			{ name: 'Layers', component: Layers },
			{ name: 'Image', component: Image },
			{ name: 'FileText', component: FileText },
			{ name: 'FileJson', component: FileJson },
			{ name: 'FileDown', component: FileDown },
			{ name: 'CircleDot', component: CircleDot },
			{ name: 'Pipette', component: Pipette },
		]
	},

	{
		title: 'arrows',
		icons: [
			{ name: 'ArrowUp', component: ArrowUp },
			{ name: 'ArrowDown', component: ArrowDown },
			{ name: 'ArrowLeft', component: ArrowLeft },
			{ name: 'ArrowRight', component: ArrowRight },
			{ name: 'ChevronUp', component: ChevronUp },
			{ name: 'ChevronDown', component: ChevronDown },
			{ name: 'ChevronLeft', component: ChevronLeft },
			{ name: 'ChevronRight', component: ChevronRight },
		]
	}
];

/** Все иконки одним списком - для поиска. */
export const ALL_ICONS: IconEntry[] = ICON_GROUPS.flatMap((group) => group.icons);
