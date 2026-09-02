import type * as React from "react";
import type * as v from "valibot";
import type { TeamSearchResult } from "~/components/elements/TeamSearch";
import type { TournamentSearchItem } from "~/components/elements/TournamentSearch";
import type { UserSearchResult } from "~/components/elements/UserSearch";
import type { AnySyncSchema } from "~/utils/schema";
import type forms from "../../locales/en/forms.json";
import type { ImageFieldDimensions } from "./image-field";

export type FormsTranslationKey = keyof typeof forms;

interface FormFieldBase<T extends string> {
	type: T;
	label?: string;
	bottomText?: string;
	initialValue: unknown;
}

/** A field that never renders a control. Its value is seeded from the schema's `initialValue` or the form's `defaultValues`. */
type FormFieldHidden<T extends string> = Omit<
	FormFieldBase<T>,
	"label" | "bottomText"
>;

interface FormFieldText<T extends string> extends FormFieldBase<T> {
	minLength?: number;
	maxLength: number;
	toLowerCase?: boolean;
	/** Normalizes input before storing, e.g. reducing a pasted full URL to the part the field holds. */
	transformValue?: (value: string) => string;
	leftAddon?: string;
	placeholder?: string;
	required: boolean;
	inputType?: "text" | "number";
	regExp?: {
		pattern: RegExp;
		message: string;
	};
	validate?:
		| "url"
		| {
				func: (value: string) => boolean;
				message: string;
		  };
}

interface FormFieldTextarea<T extends string> extends FormFieldBase<T> {
	maxLength: number;
	required: boolean;
}

interface FormFieldInGameName<T extends string> extends FormFieldBase<T> {
	maxLength: number;
	required: boolean;
}

interface FormFieldItem<V extends string> {
	label: string | number | ((lang: string) => string);
	value: V;
	/** Second line rendered under the label in the dropdown. Any item having one switches the field to the custom select. */
	description?: React.ReactNode;
}

interface FormFieldItemWithImage<V extends string> extends FormFieldItem<V> {
	/** Full image url (including the file extension) shown next to the item's label. */
	imgSrc?: string;
}

export type FormFieldItems<V extends string> = Array<FormFieldItem<V>>;

export type FormFieldItemsWithImage<V extends string> = Array<
	FormFieldItemWithImage<V>
>;

export interface FormFieldSelect<T extends string, V extends string>
	extends FormFieldBase<T> {
	items: FormFieldItems<V>;
	clearable: boolean;
	searchable?: boolean;
}

type FormFieldDualSelectField<T extends string, V extends string> = Omit<
	FormFieldSelect<T, V>,
	"bottomText" | "type" | "clearable"
>;

export interface FormFieldDualSelect<T extends string, V extends string>
	extends Omit<FormFieldBase<T>, "label"> {
	fields: [
		Omit<FormFieldDualSelectField<T, V>, "initialValue">,
		Omit<FormFieldDualSelectField<T, V>, "initialValue">,
	];
	validate?: {
		func: (value: [V | null, V | null]) => boolean;
		message: string;
	};
	clearable: boolean;
}

export interface FormFieldInputGroup<T extends string, V extends string>
	extends FormFieldBase<T> {
	items: FormFieldItemsWithImage<V>;
	minLength?: number;
}

export interface FormFieldDatetime<T extends string> extends FormFieldBase<T> {
	min?: () => Date;
	max?: () => Date;
	required: boolean;
}

interface FormFieldWeaponPool<T extends string> extends FormFieldBase<T> {
	minCount?: number;
	maxCount: number;
	/** Fixes the order to weapon id ASC instead of user-sortable */
	disableSorting?: boolean;
	/** If set, all weapons have isFavorite: false */
	disableFavorites?: boolean;
	allowDuplicates?: boolean;
	/** Treat alt-skin variants of an already-picked weapon as duplicates (e.g. picking Splattershot also disables Hero Shot Replica) */
	disableAltSkinDuplicates?: boolean;
}

interface FormFieldImage<T extends string> extends FormFieldBase<T> {
	dimensions?: ImageFieldDimensions;
	/** Validate uploaded images immediately, bypassing the moderator queue (e.g. trusted org logos). */
	autoValidate?: boolean;
}

export interface FormFieldArray<T extends string, S extends AnySyncSchema>
	extends FormFieldBase<T> {
	min?: number;
	max: number;
	field: S;
	/** When false, the "Add" button is hidden (the array can only be edited/shrunk, not grown). Defaults to true. */
	addable?: boolean;
	/** When true, items (object arrays only) can be reordered via drag-and-drop and the new order is reflected in the value. */
	sortable?: boolean;
}

interface FormFieldTimeRange<T extends string> extends FormFieldBase<T> {
	startLabel?: string;
	endLabel?: string;
}

export interface FormFieldFieldset<T extends string, S extends v.ObjectEntries>
	extends FormFieldBase<T> {
	fields: v.ObjectSchema<S, undefined>;
}

interface FormFieldUserSearch<T extends string> extends FormFieldBase<T> {
	required: boolean;
}

interface FormFieldTournamentSearch<T extends string> extends FormFieldBase<T> {
	required: boolean;
}

interface FormFieldTeamSearch<T extends string> extends FormFieldBase<T> {
	required: boolean;
}

interface FormFieldBadges<T extends string> extends FormFieldBase<T> {
	maxCount?: number;
}

interface FormFieldTrophies<T extends string> extends FormFieldBase<T> {
	maxCount?: number;
}

interface FormFieldSelectDynamic<T extends string> extends FormFieldBase<T> {
	clearable: boolean;
	searchable?: boolean;
}

interface FormFieldInputGroupDynamic<T extends string>
	extends FormFieldBase<T> {
	minLength?: number;
}

interface FormFieldStageSelect<T extends string> extends FormFieldBase<T> {
	required: boolean;
}

interface FormFieldWeaponSelect<T extends string> extends FormFieldBase<T> {
	required: boolean;
}

export type FormField<V extends string = string> =
	| FormFieldBase<"custom">
	| FormFieldText<"text-field">
	| FormFieldInGameName<"in-game-name">
	| FormFieldTextarea<"text-area">
	| FormFieldBase<"switch">
	| FormFieldSelect<"select", V>
	| FormFieldSelectDynamic<"select-dynamic">
	| FormFieldDualSelect<"dual-select", V>
	| FormFieldInputGroup<"radio-group", V>
	| FormFieldInputGroupDynamic<"radio-group-dynamic">
	| FormFieldInputGroup<"checkbox-group", V>
	| FormFieldInputGroupDynamic<"checkbox-group-dynamic">
	| FormFieldDatetime<"datetime">
	| FormFieldDatetime<"date">
	| FormFieldWeaponPool<"weapon-pool">
	| FormFieldImage<"image">
	| FormFieldHidden<"hidden">
	| FormFieldArray<"array", AnySyncSchema>
	| FormFieldTimeRange<"time-range">
	| FormFieldFieldset<"fieldset", v.ObjectEntries>
	| FormFieldUserSearch<"user-search">
	| FormFieldTournamentSearch<"tournament-search">
	| FormFieldTeamSearch<"team-search">
	| FormFieldBadges<"badges">
	| FormFieldTrophies<"trophies">
	| FormFieldStageSelect<"stage-select">
	| FormFieldWeaponSelect<"weapon-select">;

export type FormFieldProps<T extends FormField["type"]> = Omit<
	Extract<FormField, { type: T }>,
	"type" | "initialValue"
> & {
	name: string;
	error?: string;
	onBlur: (latestValue?: unknown) => void;
};

export interface ArrayItemRenderContext<TItem = Record<string, unknown>> {
	index: number;
	itemName: string;
	values: TItem;
	setItemField: <K extends keyof TItem>(field: K, value: TItem[K]) => void;
	canRemove: boolean;
	remove: () => void;
}

export type BadgeOption = {
	id: number;
	displayName: string;
	code: string;
	hue: number | null;
};

export type TrophyOption = {
	id: number;
	name: string;
	model: string;
	tier: number | null;
};

export type SelectOption = {
	value: string;
	label: string;
	/** Second line rendered under the label in the dropdown. Any option having one switches the field to the custom select. */
	description?: React.ReactNode;
};

/** Brand type to encode required options directly in schema types */
export type FieldWithOptions<TOptions> = { _requiredOptions: TOptions };

/** Render props for FormField children */
export type CustomFieldRenderProps<TValue = unknown> = {
	name: string;
	error: string | undefined;
	value: TValue;
	onChange: (value: TValue) => void;
	/** True when the field's `disabled` prop is set or the whole form is `readOnly`. */
	disabled?: boolean;
};

/** Non-generic version for internal use to avoid excessive type instantiation */
type FormFieldChildrenProps = {
	name: string;
	error: string | undefined;
	value: unknown;
	onChange: (value: unknown) => void;
	disabled?: boolean;
};

export type TypedFormFieldProps<
	TSchema extends v.ObjectEntries,
	TName extends keyof TSchema & string,
> = {
	name: TName;
	label?: string;
	disabled?: boolean;
	/** Focuses the field on mount. Only `text-field` and `text-area` support it. */
	autoFocus?: boolean;
	maxCount?: number;
	canRemoveItem?: (itemValue: unknown, index: number) => boolean;
	onValueChange?: (newValue: unknown) => void;
	children?:
		| ((props: FormFieldChildrenProps) => React.ReactNode)
		| ((props: ArrayItemRenderContext) => React.ReactNode);
} & (TSchema[TName] extends FieldWithOptions<infer TOptions>
	? { options: TOptions }
	: { options?: never });

type NestedPath = `${string}.${string}` | `${string}[${string}`;

/** FormField props with a free-form name, for nested paths like `${itemName}.field` */
export type FlexibleFormFieldProps = {
	name: NestedPath;
	label?: string;
	disabled?: boolean;
	/** Focuses the field on mount. Only `text-field` and `text-area` support it. */
	autoFocus?: boolean;
	maxCount?: number;
	canRemoveItem?: (itemValue: unknown, index: number) => boolean;
	onValueChange?: (newValue: unknown) => void;
	children?:
		| ((props: FormFieldChildrenProps) => React.ReactNode)
		| ((props: ArrayItemRenderContext) => React.ReactNode);
	options?: unknown;
};

export type TypedFormFieldComponent<TSchema extends v.ObjectEntries> = {
	<TName extends keyof TSchema & string>(
		props: TypedFormFieldProps<TSchema, TName>,
	): React.ReactNode;
	(props: FlexibleFormFieldProps): React.ReactNode;
};

/**
 * `options` prop config of the `team-search` field. `initialTeam` carries the prefilled team's display
 * data (name, avatar), which the stored value (a plain team id) lacks.
 */
export type TeamSearchFieldOptions = {
	onTeamSelected?: (team: TeamSearchResult | null) => void;
	initialTeam?: { id: number; name: string; avatarUrl?: string | null };
};

/** `options` prop config of the `user-search` field. `onUserSelected` exposes the resolved user; the stored value is only the id. */
export type UserSearchFieldOptions = {
	onUserSelected?: (user: UserSearchResult | null) => void;
};

/** `options` prop config of the `tournament-search` field. */
export type TournamentSearchFieldOptions = {
	/** Restrict results to tournaments that have already started (finished/past). */
	pastOnly?: boolean;
	/** Exposes the resolved tournament on selection — the stored form value is only the tournament id. */
	onTournamentSelected?: (tournament: TournamentSearchItem | null) => void;
};

/** Object schema of a form or fieldset, plain or wrapped in a pipe (e.g. a cross-field `superRefine`). */
export type FormObjectSchema<
	TEntries extends v.ObjectEntries = v.ObjectEntries,
> = AnySyncSchema & { readonly entries: TEntries };
