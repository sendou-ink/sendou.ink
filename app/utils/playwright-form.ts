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
	checkItems: (name: keyof Inferred<T>, itemValues: string[]) => Promise<void>;
	select: (name: SelectableKeys<T>, optionText: string) => Promise<void>;
	selectWeapons: (
		name: keyof Inferred<T>,
		weaponNames: string[],
	) => Promise<void>;
	submit: () => Promise<void>;
	getLabel: <K extends keyof Inferred<T>>(name: K) => string;
	getItemLabel: (name: keyof Inferred<T>, itemValue: string) => string;
};

export function createFormHelpers<T extends z.ZodRawShape>(
	page: Page,
	schema: z.ZodObject<T>,
	options?: { submitTestId?: string },
): FormFieldHelpers<T> {
	const submitTestId = options?.submitTestId ?? "submit-button";
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

	const getItemLabel = (name: string, itemValue: string): string => {
		const metadata = getFieldMetadata(name);
		if (!metadata || !("items" in metadata) || !Array.isArray(metadata.items)) {
			throw new Error(`No items found for field: ${name}`);
		}
		const item = metadata.items.find(
			(i: { value: string }) => i.value === itemValue,
		);
		if (!item || typeof item.label !== "string") {
			throw new Error(`No item found with value: ${itemValue}`);
		}
		return resolveTranslation(item.label);
	};

	return {
		getLabel(name) {
			return getLabel(String(name));
		},

		getItemLabel(name, itemValue) {
			return getItemLabel(String(name), itemValue);
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

		async checkItems(name, itemValues) {
			const metadata = getFieldMetadata(String(name));
			if (
				!metadata ||
				!("items" in metadata) ||
				!Array.isArray(metadata.items)
			) {
				throw new Error(`No items found for field: ${String(name)}`);
			}

			for (const item of metadata.items as Array<{
				value: string;
				label: string;
			}>) {
				const itemLabelText = resolveTranslation(item.label);
				const locator = page.getByLabel(itemLabelText);
				const isChecked = await locator.isChecked();
				const shouldBeChecked = itemValues.includes(item.value);

				if (shouldBeChecked && !isChecked) {
					await locator.click();
				} else if (!shouldBeChecked && isChecked) {
					await locator.click();
				}
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

		async selectWeapons(_name, weaponNames) {
			for (const weaponName of weaponNames) {
				await page.getByTestId("weapon-select").click();
				await page.getByPlaceholder("Search weapons...").fill(weaponName);
				await page
					.getByRole("listbox", { name: "Suggestions" })
					.getByTestId(`weapon-select-option-${weaponName}`)
					.click();
			}
		},

		async submit() {
			await page.getByTestId(submitTestId).click();
		},
	};
}
