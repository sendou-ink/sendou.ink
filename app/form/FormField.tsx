import * as React from "react";
import type { z } from "zod";
import type {
	MapPoolObject,
	ReadonlyMapPoolObject,
} from "~/features/map-list-generator/core/map-pool-serializer/types";
import type { MainWeaponId, StageId } from "~/modules/in-game-lists/types";
import { formRegistry } from "./fields";
import { ArrayFormField } from "./fields/ArrayFormField";
import { BadgesFormField } from "./fields/BadgesFormField";
import { DatetimeFormField } from "./fields/DatetimeFormField";
import { DualSelectFormField } from "./fields/DualSelectFormField";
import { FieldsetFormField } from "./fields/FieldsetFormField";
import { ImageFormField } from "./fields/ImageFormField";
import { InputFormField } from "./fields/InputFormField";
import {
	CheckboxGroupFormField,
	RadioGroupFormField,
} from "./fields/InputGroupFormField";
import { MapPoolFormField } from "./fields/MapPoolFormField";
import { MultiSelectFormField } from "./fields/MultiSelectFormField";
import { SelectFormField } from "./fields/SelectFormField";
import { StageSelectFormField } from "./fields/StageSelectFormField";
import { SwitchFormField } from "./fields/SwitchFormField";
import { TextareaFormField } from "./fields/TextareaFormField";
import { TimeRangeFormField } from "./fields/TimeRangeFormField";
import { UserSearchFormField } from "./fields/UserSearchFormField";
import {
	WeaponPoolFormField,
	type WeaponPoolItem,
} from "./fields/WeaponPoolFormField";
import { WeaponSelectFormField } from "./fields/WeaponSelectFormField";
import { useOptionalFormFieldContext } from "./SendouForm";
import type {
	ArrayItemRenderContext,
	BadgeOption,
	FormField as FormFieldType,
} from "./types";
import {
	getNestedSchema,
	getNestedValue,
	setNestedValue,
	validateField,
} from "./utils";

export type CustomFieldRenderProps = {
	name: string;
	error: string | undefined;
	value: unknown;
	onChange: (value: unknown) => void;
};

interface FormFieldProps {
	name: string;
	label?: string;
	field?: z.ZodType;
	children?:
		| ((props: CustomFieldRenderProps) => React.ReactNode)
		| ((props: ArrayItemRenderContext) => React.ReactNode);
	/** Field-specific options. For badges: BadgeOption[] */
	options?: unknown;
}

export function FormField({
	name,
	label,
	field,
	children,
	options,
}: FormFieldProps) {
	const context = useOptionalFormFieldContext();

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
	const value =
		(isNestedPath
			? getNestedValue(context?.values ?? {}, name)
			: context?.values[name]) ?? formField.initialValue;

	const serverError =
		context?.serverErrors[name as keyof typeof context.serverErrors];
	const clientError = context?.clientErrors[name];
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

	const handleChange = (newValue: unknown) => {
		context?.setValue(name, newValue);
		if (hasSubmitted && context) {
			const updatedValues = isNestedPath
				? setNestedValue(context.values, name, newValue)
				: { ...context.values, [name]: newValue };
			context.revalidateAll(updatedValues);
		}
		context?.onFieldChange?.(name, newValue);
	};

	const displayedError = serverError ?? clientError;

	const commonProps = { name, error: displayedError, onBlur: handleBlur };

	if (formField.type === "text-field") {
		return (
			<InputFormField
				{...commonProps}
				{...formField}
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

	if (formField.type === "multi-select") {
		return (
			<MultiSelectFormField
				{...commonProps}
				{...formField}
				value={value as string[]}
				onChange={handleChange as (v: string[]) => void}
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

	if (formField.type === "datetime") {
		return (
			<DatetimeFormField
				{...commonProps}
				{...formField}
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

	if (formField.type === "map-pool") {
		return (
			<MapPoolFormField
				{...commonProps}
				{...formField}
				value={value as MapPoolObject}
				onChange={handleChange as (v: ReadonlyMapPoolObject) => void}
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

	if (formField.type === "image") {
		return (
			<ImageFormField
				{...commonProps}
				{...formField}
				value={value as File | string | null}
				onChange={handleChange as (v: File | string | null) => void}
			/>
		);
	}

	if (
		formField.type === "string-constant" ||
		formField.type === "id-constant"
	) {
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
				? computeFieldsetInitialValue(innerFieldMeta)
				: innerFieldMeta?.initialValue;

		return (
			<ArrayFormField
				{...commonProps}
				{...formField}
				value={value as unknown[]}
				onChange={handleChange as (v: unknown[]) => void}
				isObjectArray={isObjectArray}
				itemInitialValue={itemInitialValue}
				renderItem={(idx, itemName) => {
					if (hasCustomRender && isObjectArray) {
						const arrayValue = value as Record<string, unknown>[];
						const itemValues = arrayValue[idx] ?? {};

						const setItemField = (fieldName: string, fieldValue: unknown) => {
							const newArray = [...arrayValue];
							newArray[idx] = { ...newArray[idx], [fieldName]: fieldValue };
							handleChange(newArray);
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
							formValues: context?.values ?? {},
							setItemField,
							canRemove: arrayValue.length > formField.min,
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
		return (
			<UserSearchFormField
				{...commonProps}
				{...formField}
				value={value as number | null}
				onChange={handleChange as (v: number | null) => void}
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

function computeFieldsetInitialValue(
	fieldsetMeta: FormFieldType,
): Record<string, unknown> {
	if (fieldsetMeta.type !== "fieldset") return {};

	const shape = fieldsetMeta.fields.shape as Record<string, z.ZodType>;
	const result: Record<string, unknown> = {};

	for (const [key, fieldSchema] of Object.entries(shape)) {
		const fieldMeta = formRegistry.get(fieldSchema) as
			| FormFieldType
			| undefined;
		if (fieldMeta) {
			result[key] = fieldMeta.initialValue;
		}
	}

	return result;
}
