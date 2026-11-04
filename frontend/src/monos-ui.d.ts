/**
 * Типы компонентов кита.
 *
 * Кит поставляет исходники на JavaScript, поэтому TypeScript не видит его
 * API. Объявляем здесь то, чем пользуемся: компоненты, их пропы и
 * события. Набор проверен по `docs/components.md` кита.
 */
declare module '@monos/ui' {
	import type { SvelteComponent } from 'svelte';

	/** Нативное событие change: кит пробрасывает его как есть. */
	export type ChangeEvent = Event & { currentTarget: HTMLInputElement };

	export interface ButtonProps {
		variant?: 'primary' | 'secondary' | 'text' | 'quiet' | 'danger';
		size?: 'sm' | 'md' | 'lg';
		type?: 'button' | 'submit' | 'reset';
		disabled?: boolean;
		loading?: boolean;
		full?: boolean;
		class?: string;
		[key: string]: unknown;
	}

	export interface CardProps {
		as?: string;
		padding?: 'none' | 'sm' | 'md' | 'lg';
		interactive?: boolean;
		selected?: boolean;
		bare?: boolean;
		class?: string;
		[key: string]: unknown;
	}

	export interface TextFieldProps {
		value?: string;
		onchange?: (event: Event & { currentTarget: HTMLInputElement }) => void;
		label?: string;
		hint?: string;
		error?: string;
		id?: string;
		name?: string;
		type?: string;
		placeholder?: string;
		size?: 'sm' | 'md' | 'lg';
		variant?: 'underline' | 'boxed';
		disabled?: boolean;
		required?: boolean;
		class?: string;
		[key: string]: unknown;
	}

	export interface SearchFieldProps {
		value?: string;
		label?: string;
		placeholder?: string;
		clearLabel?: string;
		size?: 'sm' | 'md' | 'lg';
		disabled?: boolean;
		clearable?: boolean;
		clearOnEscape?: boolean;
		class?: string;
		[key: string]: unknown;
	}

	export interface SelectOption {
		value: string;
		label?: string;
		disabled?: boolean;
	}

	export interface SelectFieldProps {
		value?: string;
		onchange?: (event: Event & { currentTarget: HTMLSelectElement }) => void;
		label?: string;
		hint?: string;
		error?: string;
		id?: string;
		name?: string;
		options?: SelectOption[];
		placeholder?: string;
		size?: 'sm' | 'md' | 'lg';
		variant?: 'underline' | 'boxed';
		disabled?: boolean;
		required?: boolean;
		class?: string;
		[key: string]: unknown;
	}

	export interface CheckboxProps {
		checked?: boolean;
		onchange?: (event: Event & { currentTarget: HTMLInputElement }) => void;
		indeterminate?: boolean;
		disabled?: boolean;
		id?: string;
		ariaLabel?: string;
		class?: string;
		[key: string]: unknown;
	}

	export interface BadgeProps {
		tone?: 'neutral' | 'accent' | 'danger' | 'warning' | 'success';
		dot?: boolean;
		class?: string;
		[key: string]: unknown;
	}

	export interface NoticeProps {
		tone?: 'info' | 'success' | 'warning' | 'danger' | 'neutral';
		title?: string;
		dismissible?: boolean;
		dismissLabel?: string;
		class?: string;
		[key: string]: unknown;
	}

	export interface IconButtonProps {
		label: string;
		tooltipText?: string;
		variant?: 'outline' | 'ghost';
		size?: 'sm' | 'md' | 'lg';
		type?: 'button' | 'submit' | 'reset';
		disabled?: boolean;
		pressed?: boolean;
		bare?: boolean;
		class?: string;
		[key: string]: unknown;
	}

	export const Button: typeof SvelteComponent<ButtonProps, { click: CustomEvent }>;
	export const Card: typeof SvelteComponent<CardProps>;
	export const TextField: typeof SvelteComponent<TextFieldProps, { change: CustomEvent; input: CustomEvent }>;
	export const SearchField: typeof SvelteComponent<SearchFieldProps, { clear: CustomEvent; input: CustomEvent }>;
	export const SelectField: typeof SvelteComponent<SelectFieldProps, { change: CustomEvent }>;
	export const Checkbox: typeof SvelteComponent<CheckboxProps, { change: ChangeEvent }>;
	export const Badge: typeof SvelteComponent<BadgeProps>;
	export const Notice: typeof SvelteComponent<NoticeProps>;
	export const IconButton: typeof SvelteComponent<IconButtonProps, { click: CustomEvent }>;
	export const Spinner: typeof SvelteComponent<{ size?: string; label?: string; class?: string }>;
}
