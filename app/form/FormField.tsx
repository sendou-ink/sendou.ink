import * as React from "react";
import type { MainWeaponId, StageId } from "~/modules/in-game-lists/types";
import type { AnySyncSchema } from "~/utils/schema";
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
import { SelectFormField } from "./fields/SelectFormField";
import { StageSelectFormField } from "./fields/StageSelectFormField";
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
	FormFieldItemsWithImage,
	FormField as FormFieldType,
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

// lazy loaded so the trophies field's WebGL renderer stays out of the eager
// bundle of every page rendering a form
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
	maxCount?: number;
	field?: AnySyncSchema;
	children?:
		| ((props: CustomFieldRenderProps) => React.ReactNode)
		| ((props: ArrayItemRenderContext) => React.ReactNode);
	/** Field-specific options */
	options?: unknown;
	/** For `array` fields: hide the remove button for items where this returns false. */
	canRemoveItem?: (itemValue: unknown, index: number) => boolean;
	/**
	 * Runs after the new value has been stored. For side effects on other fields;
	 * to change what gets stored use the field schema's own options instead.
	 */
	onValueChange?: (newValue: unknown) => void;
}

/** Field types that render `children`. Any other type would silently discard it. */
const FIELD_TYPES_WITH_RENDER_PROP = ["custom", "array"];

export function FormField({
	name,
	label,
	labelPopover,
	disabled,
	autoFocus,
	maxCount,
	field,
	children,
	options,
	canRemoveItem,
	onValueChange,
}: FormFieldProps) {
	const context = useOptionalFormFieldContext();
	const isDisabled = disabled ?? context?.readOnly ?? false;

	const fieldSchema = React.useMemo(() => {
		if (field) return field;
		if (!context?.schema) {
			throw new Error(
				"FormField requires either a 'field' prop or to be used within a FormProvider",
			);
		}

		const objectSchema = context.schema;
		const result = name.includes(".")
			? getNestedSchema(objectSchema, name)
			: objectSchema.entries[name];

		if (!result) {
			throw new Error(
				`Field schema not found for name: ${name}. Does the schema have a corresponding key?`,
			);
		}
		return result;
	}, [field, context?.schema, name]);

	const formField = React.useMemo(() => {
		const result = formRegistry.get(fieldSchema) as FormFieldType | undefined;

		if (!result) {
			throw new Error(`Form field metadata not found for name: ${name}`);
		}

		const fieldWithLabel = label ? { ...result, label } : result;
		return fieldWithLabel as FormFieldType;
	}, [fieldSchema, name, label]);

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

	// After the first submit, changes revalidate the whole form — except array
	// appends, which stay silent so a freshly added empty item doesn't error
	// immediately. Blur is the moment the user leaves such an item, so
	// revalidating here surfaces its error without waiting for the next submit.
	const handleBlur = (latestValue?: unknown) => {
		if (!context) return;
		if (hasSubmitted) {
			context.revalidateAll(context.store.values);
			return;
		}
		runValidation(latestValue ?? value);
	};

	// Read through a ref so an inline `onValueChange` does not destabilize
	// `handleChange`, which fields rely on to skip re-rendering.
	const latestOnValueChange = React.useRef(onValueChange);
	latestOnValueChange.current = onValueChange;

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
			latestOnValueChange.current?.(newValue);
		},
		[context, name],
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

	const commonProps = { name, error: displayedError, onBlur: handleBlur };

	if (formField.type === "text-field") {
		return (
			<InputFormField
				{...commonProps}
				{...formField}
				disabled={isDisabled}
				autoFocus={autoFocus}
				labelPopover={labelPopover}
				value={value as string}
				onChange={handleChange as (v: string) => void}
			/>
		);
	}

	if (formField.type === "in-game-name") {
		return (
			<InGameNameFormField
				{...commonProps}
				{...formField}
				disabled={isDisabled}
				value={value as string}
				onChange={handleChange as (v: string) => void}
			/>
		);
	}

	if (formField.type === "switch") {
		return (
			<SwitchFormField
				{...commonProps}
				{...formField}
				isDisabled={isDisabled}
				checked={value as boolean}
				onChange={handleChange as (v: boolean) => void}
			/>
		);
	}

	if (formField.type === "text-area") {
		return (
			<TextareaFormField
				{...commonProps}
				{...formField}
				disabled={isDisabled}
				autoFocus={autoFocus}
				value={value as string}
				onChange={handleChange as (v: string) => void}
			/>
		);
	}

	if (formField.type === "select") {
		return (
			<SelectFormField
				{...commonProps}
				{...formField}
				disabled={isDisabled}
				value={value as string | null}
				onChange={handleChange as (v: string | null) => void}
			/>
		);
	}

	if (formField.type === "select-dynamic") {
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
				}))}
				value={value as string | null}
				onChange={handleChange as (v: string | null) => void}
			/>
		);
	}

	if (formField.type === "dual-select") {
		return (
			<DualSelectFormField
				{...commonProps}
				{...formField}
				disabled={isDisabled}
				value={value as [string | null, string | null]}
				onChange={handleChange as (v: [string | null, string | null]) => void}
			/>
		);
	}

	if (formField.type === "radio-group") {
		return (
			<RadioGroupFormField
				{...commonProps}
				{...formField}
				disabled={isDisabled}
				value={value as string}
				onChange={handleChange as (v: string) => void}
			/>
		);
	}

	if (formField.type === "radio-group-dynamic") {
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
				onChange={handleChange as (v: string) => void}
			/>
		);
	}

	if (formField.type === "checkbox-group") {
		return (
			<CheckboxGroupFormField
				{...commonProps}
				{...formField}
				disabled={isDisabled}
				value={value as string[]}
				onChange={handleChange as (v: string[]) => void}
			/>
		);
	}

	if (formField.type === "checkbox-group-dynamic") {
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
				onChange={handleChange as (v: string[]) => void}
			/>
		);
	}

	if (formField.type === "datetime" || formField.type === "date") {
		return (
			<DatetimeFormField
				{...commonProps}
				{...formField}
				disabled={isDisabled}
				granularity={formField.type === "date" ? "day" : "minute"}
				value={value as Date | undefined}
				onChange={handleChange as (v: Date | undefined) => void}
			/>
		);
	}

	if (formField.type === "time-range") {
		return (
			<TimeRangeFormField
				{...commonProps}
				{...formField}
				disabled={isDisabled}
				value={value as { start: string; end: string } | null}
				onChange={
					handleChange as (v: { start: string; end: string } | null) => void
				}
			/>
		);
	}

	if (formField.type === "weapon-pool") {
		return (
			<WeaponPoolFormField
				{...commonProps}
				{...formField}
				disabled={isDisabled}
				value={value as WeaponPoolItem[]}
				onChange={handleChange as (v: WeaponPoolItem[]) => void}
			/>
		);
	}

	if (formField.type === "image") {
		return (
			<ImageFormField
				{...commonProps}
				{...formField}
				disabled={isDisabled}
				value={value as ImageFieldValue}
				onChange={handleChange as (v: ImageFieldValue) => void}
			/>
		);
	}

	if (formField.type === "custom") {
		if (!children) {
			throw new Error("Custom form field requires children render function");
		}
		return (
			<>
				{(children as (props: CustomFieldRenderProps) => React.ReactNode)({
					name,
					error: displayedError,
					value,
					onChange: handleChange,
					disabled: isDisabled,
				})}
			</>
		);
	}

	if (formField.type === "hidden") {
		return null;
	}

	if (formField.type === "array") {
		const innerFieldMeta = formRegistry.get(formField.field) as
			| FormFieldType
			| undefined;
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
				onChange={handleChange as (v: unknown[]) => void}
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
								onArrayChange={handleChange as (v: unknown[]) => void}
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

	if (formField.type === "fieldset") {
		return (
			<FieldsetFormField {...commonProps} {...formField} disabled={disabled} />
		);
	}

	if (formField.type === "user-search") {
		const userOptions = options as UserSearchFieldOptions | undefined;
		return (
			<UserSearchFormField
				{...commonProps}
				{...formField}
				disabled={isDisabled}
				value={value as number | null}
				onChange={handleChange as (v: number | null) => void}
				onUserSelected={userOptions?.onUserSelected}
			/>
		);
	}

	if (formField.type === "tournament-search") {
		const tournamentOptions = options as
			| TournamentSearchFieldOptions
			| undefined;
		return (
			<TournamentSearchFormField
				{...commonProps}
				{...formField}
				disabled={isDisabled}
				value={value as number | null}
				onChange={handleChange as (v: number | null) => void}
				pastOnly={tournamentOptions?.pastOnly}
				onTournamentSelected={tournamentOptions?.onTournamentSelected}
			/>
		);
	}

	if (formField.type === "team-search") {
		const teamOptions = options as TeamSearchFieldOptions | undefined;
		return (
			<TeamSearchFormField
				{...commonProps}
				{...formField}
				disabled={isDisabled}
				onChange={handleChange as (v: number | null) => void}
				onTeamSelected={teamOptions?.onTeamSelected}
				initialTeam={teamOptions?.initialTeam}
			/>
		);
	}

	if (formField.type === "badges") {
		if (!options) {
			throw new Error("Badges form field requires options prop");
		}
		return (
			<BadgesFormField
				{...commonProps}
				{...formField}
				disabled={isDisabled}
				value={value as number[]}
				onChange={handleChange as (v: number[]) => void}
				options={options as BadgeOption[]}
				{...(maxCount !== undefined ? { maxCount } : {})}
			/>
		);
	}

	if (formField.type === "trophies") {
		if (!options) {
			throw new Error("Trophies form field requires options prop");
		}
		return (
			<React.Suspense>
				<TrophiesFormField
					{...commonProps}
					{...formField}
					value={value as number[]}
					onChange={handleChange as (v: number[]) => void}
					options={options as TrophyOption[]}
					{...(maxCount !== undefined ? { maxCount } : {})}
				/>
			</React.Suspense>
		);
	}

	if (formField.type === "stage-select") {
		return (
			<StageSelectFormField
				{...commonProps}
				{...formField}
				disabled={isDisabled}
				value={value as StageId | null}
				onChange={handleChange as (v: StageId) => void}
			/>
		);
	}

	if (formField.type === "weapon-select") {
		return (
			<WeaponSelectFormField
				{...commonProps}
				{...formField}
				disabled={isDisabled}
				value={value as MainWeaponId | null}
				onChange={handleChange as (v: MainWeaponId | null) => void}
			/>
		);
	}

	return (
		<div>Unsupported form field type: {(formField as FormFieldType).type}</div>
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
 * One custom-rendered array item, memoized so that a form edit re-renders only
 * the item whose slice of the array changed — the array field itself re-renders
 * on every write to the array. For this to hold, anything the item render reads
 * from the form outside its own item must be subscribed to via `useFormValue`.
 * The callbacks read the current array through the store instead of closing
 * over it so a skipped re-render can never make them act on stale values.
 */
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
