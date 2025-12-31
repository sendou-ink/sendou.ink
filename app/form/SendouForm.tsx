import * as React from "react";
import { useTranslation } from "react-i18next";
import { type FetcherWithComponents, Form, useActionData } from "react-router";
import type { z } from "zod";
import { SubmitButton } from "~/components/SubmitButton";
import { formRegistry } from "./fields";
import type { FormField } from "./types";
import { formDataToObject, validateField } from "./utils";

export interface FormContextValue<T extends z.ZodRawShape = z.ZodRawShape> {
	schema: z.ZodObject<T>;
	defaultValues?: Partial<z.infer<z.ZodObject<T>>> | null;
	serverErrors: Partial<Record<keyof z.infer<z.ZodObject<T>>, string>>;
	clientErrors: Partial<Record<string, string>>;
	hasSubmitted: boolean;
	setClientError: (name: string, error: string | undefined) => void;
	onFieldChange?: () => void;
}

const FormContext = React.createContext<FormContextValue | null>(null);

type FormKeys<T extends z.ZodRawShape> = {
	[K in keyof T]: K;
};

export interface FormRenderProps<T extends z.ZodRawShape> {
	keys: FormKeys<T>;
}

interface SendouFormProps<T extends z.ZodRawShape> {
	children: React.ReactNode | ((props: FormRenderProps<T>) => React.ReactNode);
	schema: z.ZodObject<T>;
	defaultValues?: Partial<z.infer<z.ZodObject<T>>> | null;
	submitButtonText?: React.ReactNode;
	action?: string;
	method?: "post" | "get";
	className?: string;
	_action?: string;
	submitButtonTestId?: string;
	state?: FetcherWithComponents<unknown>["state"];
	autoSubmit?: boolean;
}

export function SendouForm<T extends z.ZodRawShape>({
	children,
	schema,
	defaultValues,
	submitButtonText,
	action,
	method = "post",
	className = "stack md",
	_action,
	submitButtonTestId,
	state,
	autoSubmit,
}: SendouFormProps<T>) {
	const { t } = useTranslation(["forms"]);
	const actionData = useActionData<{ fieldErrors?: Record<string, string> }>();
	const [hasSubmitted, setHasSubmitted] = React.useState(false);
	const [clientErrors, setClientErrors] = React.useState<
		Partial<Record<string, string>>
	>({});
	const [visibleServerErrors, setVisibleServerErrors] = React.useState<
		Partial<Record<string, string>>
	>({});

	const latestActionData = React.useRef(actionData);
	if (actionData !== latestActionData.current) {
		latestActionData.current = actionData;
		setVisibleServerErrors(actionData?.fieldErrors ?? {});
	}

	const serverErrors = visibleServerErrors as Partial<
		Record<keyof z.infer<z.ZodObject<T>>, string>
	>;

	const formRef = React.useRef<HTMLFormElement>(null);

	const setClientError = (name: string, error: string | undefined) => {
		setClientErrors((prev) => {
			if (error === undefined) {
				const next = { ...prev };
				delete next[name];
				return next;
			}
			return { ...prev, [name]: error };
		});
	};

	const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
		setHasSubmitted(true);
		setVisibleServerErrors({});

		if (!formRef.current) return;

		const formData = new FormData(formRef.current);
		const data = formDataToObject(formData);

		const newErrors: Record<string, string> = {};
		for (const key of Object.keys(schema.shape)) {
			const error = validateField(schema, key, data[key]);
			if (error) {
				newErrors[key] = error;
			}
		}

		if (Object.keys(newErrors).length > 0) {
			e.preventDefault();
			setClientErrors(newErrors);
		}
	};

	const onFieldChange = autoSubmit
		? () => {
				setTimeout(() => {
					formRef.current?.requestSubmit();
				}, 0);
			}
		: undefined;

	const value: FormContextValue<T> = {
		schema,
		defaultValues,
		serverErrors,
		clientErrors,
		hasSubmitted,
		setClientError,
		onFieldChange,
	};

	const keys = Object.fromEntries(
		Object.keys(schema.shape).map((key) => [key, key]),
	) as FormKeys<T>;

	const resolvedChildren =
		typeof children === "function" ? children({ keys }) : children;

	// xxx: probably we can have them in the form submission directly
	const constantFields = Object.entries(schema.shape)
		.map(([key, fieldSchema]) => {
			// @ts-expect-error Type instantiation is excessively deep and possibly infinite
			const formField = formRegistry.get(fieldSchema) as FormField | undefined;
			if (
				formField?.type === "string-constant" ||
				formField?.type === "id-constant"
			) {
				return { key, value: formField.value };
			}
			return null;
		})
		.filter(Boolean) as Array<{ key: string; value: string | number | null }>;

	return (
		<FormContext.Provider value={value as FormContextValue}>
			<Form
				ref={formRef}
				method={method}
				action={action}
				className={className}
				onSubmit={handleSubmit}
			>
				{constantFields.map((field) => (
					<input
						key={field.key}
						type="hidden"
						name={field.key}
						value={String(field.value ?? "")}
					/>
				))}
				{resolvedChildren}
				{autoSubmit ? null : (
					<div className="mt-4 stack mx-auto justify-center">
						<SubmitButton
							_action={_action}
							testId={submitButtonTestId}
							state={state}
						>
							{submitButtonText ?? t("submit")}
						</SubmitButton>
					</div>
				)}
			</Form>
		</FormContext.Provider>
	);
}

export function useFormFieldContext() {
	const context = React.useContext(FormContext);
	if (!context) {
		throw new Error("useFormFieldContext must be used within a FormProvider");
	}
	return context;
}

export function useOptionalFormFieldContext() {
	return React.useContext(FormContext);
}
