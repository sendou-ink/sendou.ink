import * as React from "react";
import { useLatestRef } from "~/hooks/useLatestRef";
import type {
	MainWeaponId,
	SpecialWeaponId,
	StageId,
	SubWeaponId,
} from "~/modules/in-game-lists/types";
import {
	dayMonthYearToLocalDate,
	localDateToDayMonthYear,
} from "~/utils/dates";
import type { AnySyncSchema, DayMonthYear } from "~/utils/schema";
import { formRegistry } from "./fields";
import { ArrayFormField } from "./fields/ArrayFormField";
import { BadgesFormField } from "./fields/BadgesFormField";
import { DatetimeFormField } from "./fields/DatetimeFormField";
import { DualSelectFormField } from "./fields/DualSelectFormField";
import { FieldsetFormField } from "./fields/FieldsetFormField";
import { ImageFormField } from "./fields/ImageFormField";
import { InGameNameFormField } from "./fields/InGameNameFormField";
import { InputFormField } from "./fields/InputFormField";
import {
	CheckboxGroupFormField,
	RadioGroupFormField,
} from "./fields/InputGroupFormField";
import { MapPoolFormField } from "./fields/MapPoolFormField";
import { SelectFormField } from "./fields/SelectFormField";
import { StageSelectFormField } from "./fields/StageSelectFormField";
import { SubSpecialSelectFormField } from "./fields/SubSpecialSelectFormField";
import { SwitchFormField } from "./fields/SwitchFormField";
import { TeamSearchFormField } from "./fields/TeamSearchFormField";
import { TextareaFormField } from "./fields/TextareaFormField";
import { TimeRangeFormField } from "./fields/TimeRangeFormField";
import { TournamentSearchFormField } from "./fields/TournamentSearchFormField";
import { UserSearchFormField } from "./fields/UserSearchFormField";
import {
	WeaponPoolFormField,
	type WeaponPoolItem,
} from "./fields/WeaponPoolFormField";
import { WeaponSelectFormField } from "./fields/WeaponSelectFormField";
import type { ImageFieldValue } from "./image-field";
import { EMPTY_FORM_STORE, useOptionalFormFieldContext } from "./SendouForm";
import type {
	ArrayItemRenderContext,
	BadgeOption,
	CustomFieldRenderProps,
	FormField as FormFieldType,
	FormFieldItemsWithImage,
	MapPoolFieldOptions,
	SelectOption,
	TeamSearchFieldOptions,
	TournamentSearchFieldOptions,
	TrophyOption,
	UserSearchFieldOptions,
} from "./types";
import {
	fieldsetDefaults,
	getNestedSchema,
	getNestedValue,
	validateField,
} from "./utils";

// keeps the trophies field's WebGL renderer out of every form-rendering page's eager bundle
const TrophiesFormField = React.lazy(() =>
	import("./fields/TrophiesFormField").then((module) => ({
		default: module.TrophiesFormField,
	})),
);

export type { CustomFieldRenderProps };

const EMPTY_ITEM_VALUES: Record<string, unknown> = {};

interface FormFieldProps {
	name: string;
	label?: string;
	/** Extra element rendered next to the label, e.g. an `<InfoPopover />` explaining the field's syntax. Only `text-field` supports it. */
	labelPopover?: React.ReactNode;
	disabled?: boolean;
	/** Focuses the field on mount. Only `text-field` and `text-area` support it. */
	autoFocus?: boolean;
	/** Marks the field required when only a cross-field refine enforces it, e.g. for one variant of the form. Only fields with a `required` setting support it. */
	required?: boolean;
	maxCount?: number;
	field?: AnySyncSchema;
	children?:
		| ((props: CustomFieldRenderProps) => React.ReactNode)
		| ((props: ArrayItemRenderContext) => React.ReactNode);
	options?: unknown;
	/** For `array` fields: hide the remove button for items where this returns false. */
	canRemoveItem?: (itemValue: unknown, index: number) => boolean;
	/** Runs after the value is stored, for side effects on other fields; to change what is stored use the schema's options. */
	onValueChange?: (newValue: unknown) => void;
}

/** Field types that render `children`. Any other type would silently discard it. */
const FIELD_TYPES_WITH_RENDER_PROP = ["custom", "array"];

export function FormField(props: FormFieldProps) {
	const { name, label, disabled, required, field, children, onValueChange } =
		props;
	const context = useOptionalFormFieldContext();
	const isDisabled = disabled ?? context?.readOnly ?? false;

	const fieldSchema = resolveFieldSchema(field, context?.schema, name);
	const formField = resolveFormField(fieldSchema, name, label, required);

	const isNestedPath = name.includes(".") || name.includes("[");
	const store = context?.store ?? EMPTY_FORM_STORE;

	const getValue = () =>
		isNestedPath ? getNestedValue(store.values, name) : store.values[name];
	const storedValue = React.useSyncExternalStore(
		store.subscribe,
		getValue,
		getValue,
	);
	const value = storedValue ?? formField.initialValue;

	const getClientError = () => store.clientErrors[name];
	const clientError = React.useSyncExternalStore(
		store.subscribe,
		getClientError,
		getClientError,
	);

	const serverError =
		context?.serverErrors[name as keyof typeof context.serverErrors];
	const hasSubmitted = context?.hasSubmitted ?? false;

	const runValidation = (val: unknown) => {
		if (!context?.schema) return;
		const validationError = validateField(context.schema, name, val);
		context.setClientError(name, validationError);
	};

	// after the first submit array appends don't revalidate (a fresh empty item shouldn't error at once),
	// so blur is where such an item's error surfaces
	const handleBlur = (latestValue?: unknown) => {
		if (!context) return;
		if (hasSubmitted) {
			context.revalidateAll(context.store.values);
			return;
		}
		runValidation(latestValue ?? value);
	};

	// a ref so an inline `onValueChange` doesn't destabilize `handleChange`, which fields rely on to skip re-renders
	const onValueChangeRef = useLatestRef(onValueChange);

	const handleChange = React.useCallback(
		(newValue: unknown) => {
			if (!context) return;
			const previousValues = context.store.values;
			context.setValue(name, newValue);
			context.clearServerError(name);
			if (
				context.hasSubmitted &&
				!isArrayAppend(previousValues, name, newValue)
			) {
				context.revalidateAll(context.store.values);
			}
			context.onFieldChange?.(name, newValue);
			onValueChangeRef.current?.(newValue);
		},
		[context, name, onValueChangeRef],
	);

	const displayedError = serverError ?? clientError;

	if (
		typeof children === "function" &&
		!FIELD_TYPES_WITH_RENDER_PROP.includes(formField.type)
	) {
		throw new Error(
			`Field "${name}" is of type "${formField.type}" which renders itself, so its render function child would never run. Remove the child or change the field to customField().`,
		);
	}

	return renderFormField({
		props,
		formField,
		commonProps: { name, error: displayedError, onBlur: handleBlur },
		value,
		isDisabled,
		handleChange,
	});
}

interface RenderFormFieldArgs {
	props: FormFieldProps;
	formField: FormFieldType;
	commonProps: {
		name: string;
		error: string | undefined;
		onBlur: (latestValue?: unknown) => void;
	};
	value: unknown;
	isDisabled: boolean;
	handleChange: (newValue: unknown) => void;
}

function renderFormField(args: RenderFormFieldArgs) {
	const { props, formField, commonProps, value, isDisabled, handleChange } =
		args;
	const {
		name,
		labelPopover,
		disabled,
		autoFocus,
		maxCount,
		children,
		options,
	} = props;

	switch (formField.type) {
		case "text-field":
			return (
				<InputFormField
					{...commonProps}
					{...formField}
					disabled={isDisabled}
					autoFocus={autoFocus}
					labelPopover={labelPopover}
					value={value as string}
					onChange={handleChange}
				/>
			);
		case "in-game-name":
			return (
				<InGameNameFormField
					{...commonProps}
					{...formField}
					disabled={isDisabled}
					value={value as string}
					onChange={handleChange}
				/>
			);
		case "switch":
			return (
				<SwitchFormField
					{...commonProps}
					{...formField}
					isDisabled={isDisabled}
					checked={value as boolean}
					onChange={handleChange}
				/>
			);
		case "text-area":
			return (
				<TextareaFormField
					{...commonProps}
					{...formField}
					disabled={isDisabled}
					autoFocus={autoFocus}
					value={value as string}
					onChange={handleChange}
				/>
			);
		case "select":
			return (
				<SelectFormField
					{...commonProps}
					{...formField}
					disabled={isDisabled}
					value={value as string | null}
					onChange={handleChange}
				/>
			);
		case "select-dynamic": {
			if (!options) {
				throw new Error("Dynamic select form field requires options prop");
			}
			const selectOptions = options as SelectOption[];
			return (
				<SelectFormField
					{...commonProps}
					{...formField}
					disabled={isDisabled}
					items={selectOptions.map((opt) => ({
						value: opt.value,
						label: opt.label,
						description: opt.description,
					}))}
					value={value as string | null}
					onChange={handleChange}
				/>
			);
		}
		case "dual-select":
			return (
				<DualSelectFormField
					{...commonProps}
					{...formField}
					disabled={isDisabled}
					value={value as [string | null, string | null]}
					onChange={handleChange}
				/>
			);
		case "radio-group":
			return (
				<RadioGroupFormField
					{...commonProps}
					{...formField}
					disabled={isDisabled}
					value={value as string}
					onChange={handleChange}
				/>
			);
		case "radio-group-dynamic": {
			if (!options) {
				throw new Error("Dynamic radio group form field requires options prop");
			}
			const radioItems = options as FormFieldItemsWithImage<string>;
			return (
				<RadioGroupFormField
					{...commonProps}
					{...formField}
					disabled={isDisabled}
					items={radioItems}
					value={value as string}
					onChange={handleChange}
				/>
			);
		}
		case "checkbox-group":
			return (
				<CheckboxGroupFormField
					{...commonProps}
					{...formField}
					disabled={isDisabled}
					value={value as string[]}
					onChange={handleChange}
				/>
			);
		case "checkbox-group-dynamic": {
			if (!options) {
				throw new Error(
					"Dynamic checkbox group form field requires options prop",
				);
			}
			const checkboxItems = options as FormFieldItemsWithImage<string>;
			return (
				<CheckboxGroupFormField
					{...commonProps}
					{...formField}
					disabled={isDisabled}
					items={checkboxItems}
					value={value as string[]}
					onChange={handleChange}
				/>
			);
		}
		case "datetime":
			return (
				<DatetimeFormField
					{...commonProps}
					{...formField}
					disabled={isDisabled}
					value={value as Date | undefined}
					onChange={handleChange}
				/>
			);
		case "date":
			return (
				<DatetimeFormField
					{...commonProps}
					{...formField}
					disabled={isDisabled}
					granularity="day"
					value={
						value ? dayMonthYearToLocalDate(value as DayMonthYear) : undefined
					}
					onChange={(date) =>
						handleChange(date ? localDateToDayMonthYear(date) : undefined)
					}
				/>
			);
		case "time-range":
			return (
				<TimeRangeFormField
					{...commonProps}
					{...formField}
					disabled={isDisabled}
					value={value as { start: string; end: string } | null}
					onChange={handleChange}
				/>
			);
		case "weapon-pool":
			return (
				<WeaponPoolFormField
					{...commonProps}
					{...formField}
					disabled={isDisabled}
					value={value as WeaponPoolItem[]}
					onChange={handleChange}
				/>
			);
		case "image":
			return (
				<ImageFormField
					{...commonProps}
					{...formField}
					disabled={isDisabled}
					value={value as ImageFieldValue}
					onChange={handleChange}
				/>
			);
		case "custom":
			if (!children) {
				throw new Error("Custom form field requires children render function");
			}
			return (
				<CustomField
					render={
						children as (props: CustomFieldRenderProps) => React.ReactNode
					}
					name={name}
					error={commonProps.error}
					value={value}
					onChange={handleChange}
					disabled={isDisabled}
				/>
			);
		case "hidden":
			return null;
		case "array":
			return renderArrayFormField({ ...args, formField });
		case "fieldset":
			return (
				<FieldsetFormField
					{...commonProps}
					{...formField}
					disabled={disabled}
				/>
			);
		case "user-search": {
			const userOptions = options as UserSearchFieldOptions | undefined;
			return (
				<UserSearchFormField
					{...commonProps}
					{...formField}
					disabled={isDisabled}
					value={value as number | null}
					onChange={handleChange}
					onUserSelected={userOptions?.onUserSelected}
				/>
			);
		}
		case "tournament-search": {
			const tournamentOptions = options as
				TournamentSearchFieldOptions | undefined;
			return (
				<TournamentSearchFormField
					{...commonProps}
					{...formField}
					disabled={isDisabled}
					value={value as number | null}
					onChange={handleChange}
					pastOnly={tournamentOptions?.pastOnly}
					onTournamentSelected={tournamentOptions?.onTournamentSelected}
				/>
			);
		}
		case "team-search": {
			const teamOptions = options as TeamSearchFieldOptions | undefined;
			return (
				<TeamSearchFormField
					{...commonProps}
					{...formField}
					disabled={isDisabled}
					onChange={handleChange}
					onTeamSelected={teamOptions?.onTeamSelected}
					initialTeam={teamOptions?.initialTeam}
				/>
			);
		}
		case "badges":
			if (!options) {
				throw new Error("Badges form field requires options prop");
			}
			return (
				<BadgesFormField
					{...commonProps}
					{...formField}
					disabled={isDisabled}
					value={value as number[]}
					onChange={handleChange}
					options={options as BadgeOption[]}
					{...(maxCount !== undefined ? { maxCount } : {})}
				/>
			);
		case "trophies":
			if (!options) {
				throw new Error("Trophies form field requires options prop");
			}
			return (
				<React.Suspense>
					<TrophiesFormField
						{...commonProps}
						{...formField}
						value={value as number[]}
						onChange={handleChange}
						options={options as TrophyOption[]}
						{...(maxCount !== undefined ? { maxCount } : {})}
					/>
				</React.Suspense>
			);
		case "stage-select":
			return (
				<StageSelectFormField
					{...commonProps}
					{...formField}
					disabled={isDisabled}
					value={value as StageId | null}
					onChange={handleChange}
				/>
			);
		case "map-pool":
			return (
				<MapPoolFormField
					{...commonProps}
					{...formField}
					{...(options as MapPoolFieldOptions | undefined)}
					disabled={isDisabled}
					value={value as string}
					onChange={handleChange}
				/>
			);
		case "weapon-select":
			return (
				<WeaponSelectFormField
					{...commonProps}
					{...formField}
					disabled={isDisabled}
					value={value as MainWeaponId | null}
					onChange={handleChange}
				/>
			);
		case "sub-weapon-select":
		case "special-weapon-select":
			return (
				<SubSpecialSelectFormField
					{...commonProps}
					{...formField}
					weaponType={
						formField.type === "sub-weapon-select" ? "SUB" : "SPECIAL"
					}
					disabled={isDisabled}
					value={value as SubWeaponId | SpecialWeaponId | null}
					onChange={handleChange}
				/>
			);
		default:
			return (
				<div>
					Unsupported form field type: {(formField as FormFieldType).type}
				</div>
			);
	}
}

function renderArrayFormField({
	props,
	formField,
	commonProps,
	value,
	isDisabled,
	handleChange,
}: RenderFormFieldArgs & {
	formField: Extract<FormFieldType, { type: "array" }>;
}) {
	const { name, disabled, children, canRemoveItem } = props;
	const innerFieldMeta = formRegistry.get(formField.field);
	const isObjectArray = innerFieldMeta?.type === "fieldset";
	const hasCustomRender = typeof children === "function";
	const itemInitialValue =
		isObjectArray && innerFieldMeta
			? fieldsetDefaults(innerFieldMeta)
			: innerFieldMeta?.initialValue;

	return (
		<ArrayFormField
			{...commonProps}
			{...formField}
			disabled={isDisabled}
			value={value as unknown[]}
			onChange={handleChange}
			isObjectArray={isObjectArray}
			itemInitialValue={itemInitialValue}
			canRemoveItem={canRemoveItem}
			renderItem={(idx, itemName) => {
				if (hasCustomRender && isObjectArray) {
					const arrayValue = value as Record<string, unknown>[];

					return (
						<ArrayItemCustomRender
							arrayName={name}
							index={idx}
							itemName={itemName}
							itemValues={arrayValue[idx] ?? EMPTY_ITEM_VALUES}
							canRemove={arrayValue.length > (formField.min ?? 0)}
							onArrayChange={handleChange}
							renderChildren={
								children as (props: ArrayItemRenderContext) => React.ReactNode
							}
						/>
					);
				}

				return (
					<FormField
						key={idx}
						name={itemName}
						field={formField.field}
						disabled={disabled}
					/>
				);
			}}
		/>
	);
}

interface ArrayItemCustomRenderProps {
	arrayName: string;
	index: number;
	itemName: string;
	itemValues: Record<string, unknown>;
	canRemove: boolean;
	onArrayChange: (value: unknown[]) => void;
	renderChildren: (props: ArrayItemRenderContext) => React.ReactNode;
}

/**
 * Memoized so an edit re-renders only the item whose slice changed. Anything the render reads outside its
 * own item must go through `useFormValue`; callbacks read the array via the store so a skipped render never acts on stale values.
 */
// eslint-disable-next-line @typescript-eslint/no-shadow -- memo() takes a function expression; the function expression is named for devtools, it is the same component
const ArrayItemCustomRender = React.memo(function ArrayItemCustomRender({
	arrayName,
	index,
	itemName,
	itemValues,
	canRemove,
	onArrayChange,
	renderChildren,
}: ArrayItemCustomRenderProps) {
	const context = useOptionalFormFieldContext();

	const setItemField = (fieldName: string, fieldValue: unknown) => {
		context?.setValueFromPrev(arrayName, (prev) => {
			const currentArray = (prev ?? []) as Record<string, unknown>[];
			const newArray = [...currentArray];
			newArray[index] = {
				...currentArray[index],
				[fieldName]: fieldValue,
			};
			return newArray;
		});
	};

	const remove = () => {
		if (!context) return;
		const currentArray = (getNestedValue(context.store.values, arrayName) ??
			[]) as unknown[];
		onArrayChange(currentArray.filter((_, i) => i !== index));
	};

	return (
		<>
			{renderChildren({
				index,
				itemName,
				values: itemValues,
				setItemField,
				canRemove,
				remove,
			})}
		</>
	);
});

function isArrayAppend(
	values: Record<string, unknown>,
	name: string,
	newValue: unknown,
): boolean {
	if (!Array.isArray(newValue)) return false;
	const isNestedPath = name.includes(".") || name.includes("[");
	const prevValue = isNestedPath ? getNestedValue(values, name) : values[name];
	return Array.isArray(prevValue) && newValue.length > prevValue.length;
}

function CustomField({
	render,
	...props
}: CustomFieldRenderProps & {
	render: (props: CustomFieldRenderProps) => React.ReactNode;
}) {
	return render(props);
}

function resolveFieldSchema(
	field: FormFieldProps["field"],
	schema:
		| NonNullable<ReturnType<typeof useOptionalFormFieldContext>>["schema"]
		| undefined,
	name: string,
) {
	if (field) return field;
	if (!schema) {
		throw new Error(
			"FormField requires either a 'field' prop or to be used within a FormProvider",
		);
	}

	const result = name.includes(".")
		? getNestedSchema(schema, name)
		: schema.entries[name];

	if (!result) {
		throw new Error(
			`Field schema not found for name: ${name}. Does the schema have a corresponding key?`,
		);
	}
	return result;
}

function resolveFormField(
	fieldSchema: AnySyncSchema,
	name: string,
	label: FormFieldProps["label"],
	required: FormFieldProps["required"],
) {
	const result = formRegistry.get(fieldSchema);

	if (!result) {
		throw new Error(`Form field metadata not found for name: ${name}`);
	}

	return {
		...result,
		...(label ? { label } : {}),
		...(typeof required === "boolean" && "required" in result
			? { required }
			: {}),
	} as FormFieldType;
}
