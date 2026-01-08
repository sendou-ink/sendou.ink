// Form system exports

export { type CustomFieldRenderProps, FormField } from "./FormField";
// Field builders
export {
	array,
	checkboxGroup,
	customJsonField,
	datetimeOptional,
	datetimeRequired,
	dualSelectOptional,
	formRegistry,
	idConstant,
	idConstantOptional,
	imageOptional,
	mapPool,
	multiSelectOptional,
	radioGroup,
	select,
	selectOptional,
	stringConstant,
	stringConstantOptional,
	textAreaOptional,
	textAreaRequired,
	textFieldOptional,
	textFieldRequired,
	toggle,
	weaponPool,
} from "./fields";
export { ArrayFormField } from "./fields/ArrayFormField";
export { DatetimeFormField } from "./fields/DatetimeFormField";
export { DualSelectFormField } from "./fields/DualSelectFormField";
export { ImageFormField } from "./fields/ImageFormField";
// Standalone field components
export { InputFormField } from "./fields/InputFormField";
export {
	CheckboxGroupFormField,
	RadioGroupFormField,
} from "./fields/InputGroupFormField";
export { MapPoolFormField } from "./fields/MapPoolFormField";
export { MultiSelectFormField } from "./fields/MultiSelectFormField";
export { SelectFormField } from "./fields/SelectFormField";
export { SwitchFormField } from "./fields/SwitchFormField";
export { TextareaFormField } from "./fields/TextareaFormField";
export { WeaponPoolFormField } from "./fields/WeaponPoolFormField";
export type { FormContextValue, FormRenderProps } from "./SendouForm";
export {
	SendouForm,
	useFormFieldContext,
	useOptionalFormFieldContext,
} from "./SendouForm";
// Types
export type {
	ArrayItemRenderContext,
	FormField as FormFieldType,
	FormFieldArray,
	FormFieldDatetime,
	FormFieldDualSelect,
	FormFieldInputGroup,
	FormFieldItems,
	FormFieldItemsWithImage,
	FormFieldProps,
	FormFieldSelect,
} from "./types";
// Utilities
export { ariaAttributes } from "./utils";
