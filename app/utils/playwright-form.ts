import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import type { z } from "zod";
import { formRegistry } from "~/form/fields";
import type { FormField } from "~/form/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadTranslations(): Record<string, Record<string, string>> {
	const localesPath = path.resolve(__dirname, "../../locales/en");
	return {
		forms: JSON.parse(
			fs.readFileSync(path.join(localesPath, "forms.json"), "utf-8"),
		),
		common: JSON.parse(
			fs.readFileSync(path.join(localesPath, "common.json"), "utf-8"),
		),
	};
}

const translations = loadTranslations();

function resolveTranslation(key: string): string {
	// Handle keys like "common:forms.name" or "team:newTeam.header"
	const [namespace, translationPath] = key.includes(":")
		? key.split(":")
		: ["common", key];
	const nsTranslations = translations[namespace];

	if (!nsTranslations) {
		return key;
	}

	const value = nsTranslations[translationPath as keyof typeof nsTranslations];
	return typeof value === "string" ? value : key;
}

type Inferred<T extends z.ZodRawShape> = z.infer<z.ZodObject<T>>;

type FillableKeys<T extends z.ZodRawShape> = {
	[K in keyof Inferred<T>]-?: string extends Inferred<T>[K] ? K : never;
}[keyof Inferred<T>];

type CheckableKeys<T extends z.ZodRawShape> = {
	[K in keyof Inferred<T>]-?: Inferred<T>[K] extends boolean ? K : never;
}[keyof Inferred<T>];

// xxx: not working
type SelectableKeys<T extends z.ZodRawShape> = {
	[K in keyof Inferred<T>]-?: Inferred<T>[K] extends string ? K : never;
}[keyof Inferred<T>];

type FormFieldHelpers<T extends z.ZodRawShape> = {
	fill: (name: FillableKeys<T>, value: string) => Promise<void>;
	check: (name: CheckableKeys<T>) => Promise<void>;
	uncheck: (name: CheckableKeys<T>) => Promise<void>;
	select: (name: SelectableKeys<T>, optionText: string) => Promise<void>;
	submit: () => Promise<void>;
	getLabel: <K extends keyof Inferred<T>>(name: K) => string;
};

export function createFormHelpers<T extends z.ZodRawShape>(
	page: Page,
	schema: z.ZodObject<T>,
): FormFieldHelpers<T> {
	const getFieldMetadata = (name: string): FormField | undefined => {
		const fieldSchema = schema.shape[name];
		if (!fieldSchema) return undefined;
		return formRegistry.get(fieldSchema) as FormField | undefined;
	};

	const getLabel = (name: string): string => {
		const metadata = getFieldMetadata(name);
		if (!metadata || !("label" in metadata) || !metadata.label) {
			throw new Error(`No label found for field: ${name}`);
		}
		return resolveTranslation(metadata.label);
	};

	const getFormLocator = () => {
		const firstFieldName = Object.keys(schema.shape)[0];
		if (!firstFieldName) {
			throw new Error("Schema has no fields");
		}
		const label = getLabel(firstFieldName);
		return page.getByLabel(label).locator("xpath=ancestor::form");
	};

	return {
		getLabel(name) {
			return getLabel(String(name));
		},

		async fill(name, value) {
			const label = getLabel(String(name));
			await page.getByLabel(label).fill(value);
		},

		async check(name) {
			const label = getLabel(String(name));
			const locator = page.getByLabel(label);
			const isChecked = await locator.isChecked();
			if (!isChecked) {
				await locator.click({ force: true });
			}
		},

		async uncheck(name) {
			const label = getLabel(String(name));
			const locator = page.getByLabel(label);
			const isChecked = await locator.isChecked();
			if (isChecked) {
				await locator.click({ force: true });
			}
		},

		async select(name, optionValue) {
			const label = getLabel(String(name));
			const locator = page.getByLabel(label);
			const tagName = await locator.evaluate((el) => el.tagName.toLowerCase());

			const metadata = getFieldMetadata(String(name));
			let resolvedOptionText = optionValue;
			if (metadata && "items" in metadata && Array.isArray(metadata.items)) {
				const item = metadata.items.find(
					(i: { value: string }) => i.value === optionValue,
				);
				if (item && typeof item.label === "string") {
					resolvedOptionText = resolveTranslation(item.label);
				}
			}

			if (tagName === "select") {
				await locator.selectOption(resolvedOptionText);
			} else {
				await locator.click();
				await page.getByRole("option", { name: resolvedOptionText }).click();
			}
		},

		async submit() {
			await getFormLocator().locator('button[type="submit"]').click();
		},
	};
}
