import * as React from "react";
import type { z } from "zod";
import type { MainWeaponId, StageId } from "~/modules/in-game-lists/types";
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
import { TrophiesFormField } from "./fields/TrophiesFormField";
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

export type { CustomFieldRenderProps };

const EMPTY_FORM_VALUES: Record<string, unknown> = {};

interface FormFieldProps {
	name: string;
	label?: string;
	disabled?: boolean;
	maxCount?: number;
	field?: z.ZodType;
	children?:
		| ((props: CustomFieldRenderProps) => React.ReactNode)
		| ((props: ArrayItemRenderContext) => React.ReactNode);
	/** Field-specific options */
	options?: unknown;
	/** For `array` fields: hide the remove button for items where this returns false. */
	canRemoveItem?: (itemValue: unknown, index: number) => boolean;
}

export function FormField({
	name,
	label,
	disabled,
	maxCount,
	field,
	children,
	options,
	canRemoveItem,
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

		const zodObject = context.schema;
		const result = name.includes(".")
			? getNestedSchema(zodObject, name)
			: zodObject.shape[name];

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

	// Only object arrays with a custom render receive the whole-form values, so
	// every other field type subscribes to a constant and skips re-rendering
	// when unrelated fields change.
	const needsAllValues =
		formField.type === "array" && typeof children === "function";
	const getAllValues = () =>
		needsAllValues ? store.values : EMPTY_FORM_VALUES;
	const formValues = React.useSyncExternalStore(
		store.subscribe,
		getAllValues,
		getAllValues,
	);

	const serverError =
		context?.serverErrors[name as keyof typeof context.serverErrors];
	const hasSubmitted = context?.hasSubmitted ?? false;

	const runValidation = (val: unknown) => {
		if (!context?.schema) return;
		const validationError = validateField(context.schema, name, val);
		context.setClientError(name, validationError);
	};

	const handleBlur = (latestValue?: unknown) => {
		if (hasSubmitted) return;
		runValidation(latestValue ?? value);
	};

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
		},
		[context, name],
	);

	const displayedError = serverError ?? clientError;

	const commonProps = { name, error: displayedError, onBlur: handleBlur };

	if (formField.type === "text-field") {
		return (
			<InputFormField
				{...commonProps}
				{...formField}
				disabled={isDisabled}
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
				})}
			</>
		);
	}

	if (
		formField.type === "string-constant" ||
		formField.type === "id-constant"
	) {
		return null;
	}

	if (formField.type === "array") {
		// @ts-expect-error Type instantiation is excessively deep with complex schemas
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
				value={value as unknown[]}
				onChange={handleChange as (v: unknown[]) => void}
				isObjectArray={isObjectArray}
				itemInitialValue={itemInitialValue}
				canRemoveItem={canRemoveItem}
				renderItem={(idx, itemName) => {
					if (hasCustomRender && isObjectArray) {
						const arrayValue = value as Record<string, unknown>[];
						const itemValues = arrayValue[idx] ?? {};

						const setItemField = (fieldName: string, fieldValue: unknown) => {
							context?.setValueFromPrev(name, (prev) => {
								const currentArray = (prev ?? []) as Record<string, unknown>[];
								const newArray = [...currentArray];
								newArray[idx] = {
									...currentArray[idx],
									[fieldName]: fieldValue,
								};
								return newArray;
							});
						};

						const remove = () => {
							handleChange(arrayValue.filter((_, i) => i !== idx));
						};

						return (
							children as (props: ArrayItemRenderContext) => React.ReactNode
						)({
							index: idx,
							itemName,
							values: itemValues,
							formValues,
							setItemField,
							canRemove: arrayValue.length > (formField.min ?? 0),
							remove,
						});
					}

					return (
						<FormField key={idx} name={itemName} field={formField.field} />
					);
				}}
			/>
		);
	}

	if (formField.type === "fieldset") {
		return <FieldsetFormField {...commonProps} {...formField} />;
	}

	if (formField.type === "user-search") {
		const userOptions = options as UserSearchFieldOptions | undefined;
		return (
			<UserSearchFormField
				{...commonProps}
				{...formField}
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
				value={value as number | null}
				onChange={handleChange as (v: number | null) => void}
				pastOnly={tournamentOptions?.pastOnly}
			/>
		);
	}

	if (formField.type === "team-search") {
		const teamOptions = options as TeamSearchFieldOptions | undefined;
		return (
			<TeamSearchFormField
				{...commonProps}
				{...formField}
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
			<TrophiesFormField
				{...commonProps}
				{...formField}
				value={value as number[]}
				onChange={handleChange as (v: number[]) => void}
				options={options as TrophyOption[]}
				{...(maxCount !== undefined ? { maxCount } : {})}
			/>
		);
	}

	if (formField.type === "stage-select") {
		return (
			<StageSelectFormField
				{...commonProps}
				{...formField}
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
				value={value as MainWeaponId | null}
				onChange={handleChange as (v: MainWeaponId | null) => void}
			/>
		);
	}

	return (
		<div>Unsupported form field type: {(formField as FormFieldType).type}</div>
	);
}

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
