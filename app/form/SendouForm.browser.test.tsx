import type { ComponentProps } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { z } from "zod";
import { FormField } from "./FormField";
import {
	checkboxGroup,
	radioGroup,
	select,
	selectOptional,
	textAreaOptional,
	textAreaRequired,
	textFieldOptional,
	textFieldRequired,
	toggle as toggleField,
} from "./fields";
import { SendouForm } from "./SendouForm";

let mockFetcherData: { fieldErrors?: Record<string, string> } | undefined;

vi.mock("react-router", async () => {
	const actual = await vi.importActual("react-router");
	return {
		...actual,
		useFetcher: () => ({
			get data() {
				return mockFetcherData;
			},
			state: "idle",
			submit: vi.fn(),
		}),
	};
});

function renderForm(
	schema: z.ZodObject<z.ZodRawShape>,
	options?: {
		defaultValues?: Record<string, unknown>;
		title?: string;
		submitButtonText?: string;
		autoSubmit?: boolean;
	},
) {
	const props: ComponentProps<typeof SendouForm<z.ZodRawShape>> = {
		schema,
		defaultValues: options?.defaultValues,
		title: options?.title,
		submitButtonText: options?.submitButtonText,
		autoSubmit: options?.autoSubmit,
		children: ({ names }) => (
			<>
				{Object.keys(names).map((name) => (
					<FormField key={name} name={name} />
				))}
			</>
		),
	};

	const router = createMemoryRouter(
		[
			{
				path: "/",
				element: <SendouForm {...props} />,
			},
		],
		{ initialEntries: ["/"] },
	);

	return render(<RouterProvider router={router} />);
}

describe("SendouForm", () => {
	beforeEach(() => {
		mockFetcherData = undefined;
	});

	describe("basic form rendering", () => {
		test("renders form with title", async () => {
			const schema = z.object({
				name: textFieldRequired({ label: "labels.name", maxLength: 100 }),
			});

			const screen = await renderForm(schema, { title: "Test Form" });

			await expect.element(screen.getByText("Test Form")).toBeVisible();
		});

		test("renders submit button with default text", async () => {
			const schema = z.object({
				name: textFieldRequired({ label: "labels.name", maxLength: 100 }),
			});

			const screen = await renderForm(schema);

			await expect
				.element(screen.getByRole("button", { name: "Submit" }))
				.toBeVisible();
		});

		test("renders submit button with custom text", async () => {
			const schema = z.object({
				name: textFieldRequired({ label: "labels.name", maxLength: 100 }),
			});

			const screen = await renderForm(schema, {
				submitButtonText: "Save Changes",
			});

			await expect
				.element(screen.getByRole("button", { name: "Save Changes" }))
				.toBeVisible();
		});

		test("hides submit button when autoSubmit is true", async () => {
			const schema = z.object({
				name: textFieldRequired({ label: "labels.name", maxLength: 100 }),
			});

			const screen = await renderForm(schema, { autoSubmit: true });

			const submitButton = screen.container.querySelector(
				'button[type="submit"]',
			);
			expect(submitButton).toBeNull();
		});
	});

	describe("text field", () => {
		test("renders with label", async () => {
			const schema = z.object({
				name: textFieldRequired({ label: "labels.name", maxLength: 100 }),
			});

			const screen = await renderForm(schema);

			await expect.element(screen.getByLabelText("Name")).toBeVisible();
		});

		test("typing updates value", async () => {
			const schema = z.object({
				name: textFieldRequired({ label: "labels.name", maxLength: 100 }),
			});

			const screen = await renderForm(schema);
			const input = screen.getByLabelText("Name");

			await userEvent.type(input.element(), "Test Value");

			await expect.element(input).toHaveValue("Test Value");
		});

		test("shows error on blur when required field is empty", async () => {
			const schema = z.object({
				name: textFieldRequired({ label: "labels.name", maxLength: 100 }),
			});

			const screen = await renderForm(schema);
			const input = screen.getByLabelText("Name");

			await userEvent.click(input.element());
			await userEvent.tab();

			await expect
				.element(screen.getByText("This field is required"))
				.toBeVisible();
		});

		test("shows error on submit when required field is empty", async () => {
			const schema = z.object({
				name: textFieldRequired({ label: "labels.name", maxLength: 100 }),
			});

			const screen = await renderForm(schema);

			await screen.getByRole("button", { name: "Submit" }).click();

			await expect
				.element(screen.getByText("This field is required"))
				.toBeVisible();
		});

		test("clears error when valid value is entered after submit", async () => {
			const schema = z.object({
				name: textFieldRequired({ label: "labels.name", maxLength: 100 }),
			});

			const screen = await renderForm(schema);

			await screen.getByRole("button", { name: "Submit" }).click();
			await expect
				.element(screen.getByText("This field is required"))
				.toBeVisible();

			const input = screen.getByLabelText("Name");
			await userEvent.type(input.element(), "Valid Name");

			const errorElement = screen.container.querySelector("#name-error");
			expect(errorElement).toBeNull();
		});

		test("optional text field does not show error when empty", async () => {
			const schema = z.object({
				bio: textFieldOptional({ label: "labels.bio", maxLength: 500 }),
			});

			const screen = await renderForm(schema);

			await screen.getByRole("button", { name: "Submit" }).click();

			const errorElement = screen.container.querySelector('[id$="-error"]');
			expect(errorElement?.textContent).toBeFalsy();
		});

		test("initializes with default value", async () => {
			const schema = z.object({
				name: textFieldRequired({ label: "labels.name", maxLength: 100 }),
			});

			const screen = await renderForm(schema, {
				defaultValues: { name: "Default Name" },
			});

			await expect
				.element(screen.getByLabelText("Name"))
				.toHaveValue("Default Name");
		});
	});

	describe("text area", () => {
		test("renders textarea element", async () => {
			const schema = z.object({
				bio: textAreaOptional({ label: "labels.bio", maxLength: 500 }),
			});

			const screen = await renderForm(schema);

			const textarea = screen.container.querySelector("textarea");
			expect(textarea).not.toBeNull();
		});

		test("typing updates value", async () => {
			const schema = z.object({
				bio: textAreaOptional({ label: "labels.bio", maxLength: 500 }),
			});

			const screen = await renderForm(schema);
			const textarea = screen.getByLabelText("Bio");

			await userEvent.type(textarea.element(), "Test bio content");

			await expect.element(textarea).toHaveValue("Test bio content");
		});

		test("required text area shows error when empty", async () => {
			const schema = z.object({
				bio: textAreaRequired({ label: "labels.bio", maxLength: 500 }),
			});

			const screen = await renderForm(schema);

			await screen.getByRole("button", { name: "Submit" }).click();

			await expect
				.element(screen.getByText("This field is required"))
				.toBeVisible();
		});

		// xxx: what about checking the value counter
	});

	describe("select field", () => {
		test("renders with options from schema", async () => {
			const schema = z.object({
				format: select({
					label: "labels.clockFormat",
					items: [
						{ label: "options.clockFormat.auto", value: "auto" },
						{ label: "options.clockFormat.24h", value: "24h" },
						{ label: "options.clockFormat.12h", value: "12h" },
					],
				}),
			});

			const screen = await renderForm(schema);
			const selectElement = screen.getByLabelText("Clock format");

			await expect.element(selectElement).toBeVisible();

			const options = screen.container.querySelectorAll("option");
			expect(options.length).toBe(3);
		});

		test("selecting option updates value", async () => {
			const schema = z.object({
				format: select({
					label: "labels.clockFormat",
					items: [
						{ label: "options.clockFormat.auto", value: "auto" },
						{ label: "options.clockFormat.24h", value: "24h" },
						{ label: "options.clockFormat.12h", value: "12h" },
					],
				}),
			});

			const screen = await renderForm(schema);
			const selectElement = screen.getByLabelText("Clock format");

			await userEvent.selectOptions(selectElement.element(), "24h");

			await expect.element(selectElement).toHaveValue("24h");
		});

		test("initializes with first option as default", async () => {
			const schema = z.object({
				format: select({
					label: "labels.clockFormat",
					items: [
						{ label: "options.clockFormat.auto", value: "auto" },
						{ label: "options.clockFormat.24h", value: "24h" },
					],
				}),
			});

			const screen = await renderForm(schema);
			const selectElement = screen.getByLabelText("Clock format");

			await expect.element(selectElement).toHaveValue("auto");
		});
	});

	describe("optional select field", () => {
		test("allows empty selection", async () => {
			const schema = z.object({
				format: selectOptional({
					label: "labels.clockFormat",
					items: [
						{ label: "options.clockFormat.auto", value: "auto" },
						{ label: "options.clockFormat.24h", value: "24h" },
					],
				}),
			});

			const screen = await renderForm(schema);

			await screen.getByRole("button", { name: "Submit" }).click();

			const errorElement = screen.container.querySelector('[id$="-error"]');
			expect(errorElement?.textContent).toBeFalsy();
		});
	});

	describe("toggle/switch field", () => {
		test("renders toggle with label", async () => {
			const schema = z.object({
				noScreen: toggleField({ label: "labels.noScreen" }),
			});

			const screen = await renderForm(schema);

			await expect
				.element(screen.getByText("[Accessibility] Avoid Splattercolor Screen"))
				.toBeVisible();
		});

		test("clicking toggles value", async () => {
			const schema = z.object({
				noScreen: toggleField({ label: "labels.noScreen" }),
			});

			const screen = await renderForm(schema);
			const switchElement = screen.getByRole("switch");

			await expect.element(switchElement).not.toBeChecked();

			const label = screen.getByText(
				"[Accessibility] Avoid Splattercolor Screen",
			);
			await userEvent.click(label.element());

			await expect.element(switchElement).toBeChecked();
		});

		test("initializes with default value", async () => {
			const schema = z.object({
				noScreen: toggleField({ label: "labels.noScreen" }),
			});

			const screen = await renderForm(schema, {
				defaultValues: { noScreen: true },
			});

			await expect.element(screen.getByRole("switch")).toBeChecked();
		});
	});

	describe("radio group field", () => {
		test("renders radio options", async () => {
			const schema = z.object({
				vc: radioGroup({
					label: "labels.voiceChat",
					items: [
						{ label: "options.voiceChat.yes", value: "YES" },
						{ label: "options.voiceChat.no", value: "NO" },
						{ label: "options.voiceChat.listenOnly", value: "LISTEN_ONLY" },
					],
				}),
			});

			const screen = await renderForm(schema);

			const radios = screen.container.querySelectorAll('input[type="radio"]');
			expect(radios.length).toBe(3);
		});

		test("clicking option updates value", async () => {
			const schema = z.object({
				vc: radioGroup({
					label: "labels.voiceChat",
					items: [
						{ label: "options.voiceChat.yes", value: "YES" },
						{ label: "options.voiceChat.no", value: "NO" },
					],
				}),
			});

			const screen = await renderForm(schema);
			const noRadio = screen.getByLabelText("No");

			await userEvent.click(noRadio.element());

			await expect.element(noRadio).toBeChecked();
		});

		test("initializes with first option selected", async () => {
			const schema = z.object({
				vc: radioGroup({
					label: "labels.voiceChat",
					items: [
						{ label: "options.voiceChat.yes", value: "YES" },
						{ label: "options.voiceChat.no", value: "NO" },
					],
				}),
			});

			const screen = await renderForm(schema);
			const yesRadio = screen.getByLabelText("Yes");

			await expect.element(yesRadio).toBeChecked();
		});
	});

	describe("checkbox group field", () => {
		test("renders checkbox options", async () => {
			const schema = z.object({
				modes: checkboxGroup({
					label: "labels.buildModes",
					items: [
						{ label: "modes.TW", value: "TW" },
						{ label: "modes.SZ", value: "SZ" },
						{ label: "modes.TC", value: "TC" },
						{ label: "modes.RM", value: "RM" },
						{ label: "modes.CB", value: "CB" },
					],
				}),
			});

			const screen = await renderForm(schema);

			const checkboxes = screen.container.querySelectorAll(
				'input[type="checkbox"]',
			);
			expect(checkboxes.length).toBe(5);
		});

		test("checking options updates array value", async () => {
			const schema = z.object({
				modes: checkboxGroup({
					label: "labels.buildModes",
					items: [
						{ label: "modes.TW", value: "TW" },
						{ label: "modes.SZ", value: "SZ" },
					],
				}),
			});

			const screen = await renderForm(schema);

			const twCheckbox = screen.getByLabelText("Turf War");
			const szCheckbox = screen.getByLabelText("Splat Zones");

			await userEvent.click(twCheckbox.element());
			await userEvent.click(szCheckbox.element());

			await expect.element(twCheckbox).toBeChecked();
			await expect.element(szCheckbox).toBeChecked();
		});

		test("unchecking option removes from array", async () => {
			const schema = z.object({
				modes: checkboxGroup({
					label: "labels.buildModes",
					items: [
						{ label: "modes.TW", value: "TW" },
						{ label: "modes.SZ", value: "SZ" },
					],
				}),
			});

			const screen = await renderForm(schema);

			const twCheckbox = screen.getByLabelText("Turf War");

			await userEvent.click(twCheckbox.element());
			await expect.element(twCheckbox).toBeChecked();

			await userEvent.click(twCheckbox.element());
			await expect.element(twCheckbox).not.toBeChecked();
		});

		test("shows error when minimum selections not met", async () => {
			const schema = z.object({
				modes: checkboxGroup({
					label: "labels.buildModes",
					items: [
						{ label: "modes.TW", value: "TW" },
						{ label: "modes.SZ", value: "SZ" },
					],
				}),
			});

			const screen = await renderForm(schema);

			await screen.getByRole("button", { name: "Submit" }).click();

			await expect
				.element(screen.getByText("This field is required"))
				.toBeVisible();
		});
	});

	describe("validation", () => {
		test("validates multiple fields on submit", async () => {
			const schema = z.object({
				name: textFieldRequired({ label: "labels.name", maxLength: 100 }),
				bio: textAreaRequired({ label: "labels.bio", maxLength: 500 }),
			});

			const screen = await renderForm(schema);

			await screen.getByRole("button", { name: "Submit" }).click();

			const errors = screen.container.querySelectorAll('[id$="-error"]');
			const visibleErrors = Array.from(errors).filter(
				(e) => e.textContent === "This field is required",
			);
			expect(visibleErrors.length).toBe(2);
		});
	});

	describe("default values", () => {
		test("initializes multiple fields with default values", async () => {
			const schema = z.object({
				name: textFieldRequired({ label: "labels.name", maxLength: 100 }),
				bio: textAreaOptional({ label: "labels.bio", maxLength: 500 }),
			});

			const screen = await renderForm(schema, {
				defaultValues: {
					name: "Test Name",
					bio: "Test Bio",
				},
			});

			await expect
				.element(screen.getByLabelText("Name"))
				.toHaveValue("Test Name");
			await expect
				.element(screen.getByLabelText("Bio"))
				.toHaveValue("Test Bio");
		});

		test("falls back to schema initial value when no default provided", async () => {
			const schema = z.object({
				format: select({
					label: "labels.clockFormat",
					items: [
						{ label: "options.clockFormat.auto", value: "auto" },
						{ label: "options.clockFormat.24h", value: "24h" },
					],
				}),
			});

			const screen = await renderForm(schema);

			await expect
				.element(screen.getByLabelText("Clock format"))
				.toHaveValue("auto");
		});
	});

	describe("server error fallback", () => {
		test("shows fallback error when server returns error for field without DOM element", async () => {
			const schema = z.object({
				name: textFieldRequired({ label: "labels.name", maxLength: 100 }),
			});

			mockFetcherData = {
				fieldErrors: { hiddenField: "forms:errors.required" },
			};

			const screen = await renderForm(schema, {
				defaultValues: { name: "Test" },
			});

			await expect
				.element(screen.getByText("This field is required (hiddenField)"))
				.toBeVisible();
		});

		test("does not show fallback error when server error has corresponding DOM element", async () => {
			const schema = z.object({
				name: textFieldRequired({ label: "labels.name", maxLength: 100 }),
			});

			mockFetcherData = {
				fieldErrors: { name: "forms:errors.required" },
			};

			const screen = await renderForm(schema, {
				defaultValues: { name: "Test" },
			});

			const fallbackError = screen.getByTestId("fallback-form-error");
			await expect.element(fallbackError).not.toBeInTheDocument();
		});
	});
});
