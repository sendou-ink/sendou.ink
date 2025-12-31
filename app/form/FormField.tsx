import * as React from "react";
import type { z } from "zod";
import type {
	MapPoolObject,
	ReadonlyMapPoolObject,
} from "~/features/map-list-generator/core/map-pool-serializer/types";
import { formRegistry } from "./fields";
import { ArrayFormField } from "./fields/ArrayFormField";
import { DatetimeFormField } from "./fields/DatetimeFormField";
import { DualSelectFormField } from "./fields/DualSelectFormField";
import { ImageFormField } from "./fields/ImageFormField";
import { InputFormField } from "./fields/InputFormField";
import {
	CheckboxGroupFormField,
	RadioGroupFormField,
} from "./fields/InputGroupFormField";
import { MapPoolFormField } from "./fields/MapPoolFormField";
import { MultiSelectFormField } from "./fields/MultiSelectFormField";
import { SelectFormField } from "./fields/SelectFormField";
import { SwitchFormField } from "./fields/SwitchFormField";
import { TextareaFormField } from "./fields/TextareaFormField";
import { WeaponPoolFormField } from "./fields/WeaponPoolFormField";
import { useOptionalFormFieldContext } from "./SendouForm";
import type { FormField as FormFieldType } from "./types";
import { resolveDefaultValue, validateField } from "./utils";

interface FormFieldProps {
	name: string;
	label?: string;
	field?: z.ZodType;
	children?: (props: {
		name: string;
		error: string | undefined;
		value: unknown;
		onChange: (value: unknown) => void;
	}) => React.ReactNode;
}

export function FormField({ name, label, field, children }: FormFieldProps) {
	const context = useOptionalFormFieldContext();

	const fieldSchema = React.useMemo(() => {
		if (field) return field;
		if (!context?.schema) {
			throw new Error(
				"FormField requires either a 'field' prop or to be used within a FormProvider",
			);
		}

		const zodObject = context.schema;
		const result = zodObject.shape[name];

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

	const defaultValue = resolveDefaultValue({
		name,
		defaultValues: context?.defaultValues as Record<string, unknown> | null,
	});

	const [value, setValue] = React.useState<unknown>(
		defaultValue ?? formField.initialValue,
	);

	const serverError =
		context?.serverErrors[name as keyof typeof context.serverErrors];
	const clientError = context?.clientErrors[name];
	const hasSubmitted = context?.hasSubmitted ?? false;

	const runValidation = (val: unknown) => {
		if (!context?.schema) return;
		const validationError = validateField(context.schema, name, val);
		context.setClientError(name, validationError);
	};

	const handleBlur = () => {
		if (hasSubmitted) return;
		runValidation(value);
	};

	const handleChange = (newValue: unknown) => {
		setValue(newValue);
		if (hasSubmitted) {
			runValidation(newValue);
		}
		context?.onFieldChange?.();
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

	if (formField.type === "weapon-pool") {
		return (
			<WeaponPoolFormField
				{...commonProps}
				{...formField}
				value={value as Array<{ id: number; isFavorite: boolean }>}
				onChange={
					handleChange as (
						v: Array<{ id: number; isFavorite: boolean }>,
					) => void
				}
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
				{children({
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
		return (
			<input type="hidden" name={name} value={String(formField.value ?? "")} />
		);
	}

	if (formField.type === "array") {
		return (
			<ArrayFormField
				{...commonProps}
				{...formField}
				value={value as unknown[]}
				onChange={handleChange as (v: unknown[]) => void}
				renderItem={(idx, itemName) => (
					<FormField key={idx} name={itemName} field={formField.field} />
				)}
			/>
		);
	}

	return (
		<div>Unsupported form field type: {(formField as FormFieldType).type}</div>
	);
}
