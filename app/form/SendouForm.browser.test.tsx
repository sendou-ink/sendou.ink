import type { ComponentProps } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { z } from "zod";
import labelStyles from "~/components/Label.module.css";
import { FormField } from "./FormField";
import {
	array,
	checkboxGroup,
	fieldset,
	radioGroup,
	select,
	selectOptional,
	textAreaOptional,
	textAreaRequired,
	textFieldOptional,
	textFieldRequired,
	timeRangeOptional,
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

		test("displays value counter showing current/max characters", async () => {
			const schema = z.object({
				bio: textAreaOptional({ label: "labels.bio", maxLength: 100 }),
			});

			const screen = await renderForm(schema);

			await expect.element(screen.getByText("0/100")).toBeVisible();
		});

		test("value counter updates as user types", async () => {
			const schema = z.object({
				bio: textAreaOptional({ label: "labels.bio", maxLength: 100 }),
			});

			const screen = await renderForm(schema);
			const textarea = screen.getByLabelText("Bio");

			await expect.element(screen.getByText("0/100")).toBeVisible();

			await userEvent.type(textarea.element(), "Hello");

			await expect.element(screen.getByText("5/100")).toBeVisible();
		});

		test("value counter shows warning style near max length", async () => {
			const schema = z.object({
				bio: textAreaOptional({ label: "labels.bio", maxLength: 10 }),
			});

			const screen = await renderForm(schema, {
				defaultValues: { bio: "123456789" },
			});

			const counter = screen.container.querySelector(`.${labelStyles.value}`);
			expect(counter?.classList.contains(labelStyles.valueWarning)).toBe(true);
		});

		test("value counter shows error style when over max length", async () => {
			const schema = z.object({
				bio: textAreaOptional({ label: "labels.bio", maxLength: 5 }),
			});

			const screen = await renderForm(schema, {
				defaultValues: { bio: "123456" },
			});

			const counter = screen.container.querySelector(`.${labelStyles.value}`);
			expect(counter?.classList.contains(labelStyles.valueError)).toBe(true);
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
					minLength: 1,
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

	describe("time range field", () => {
		test("renders two time inputs", async () => {
			const schema = z.object({
				times: timeRangeOptional({}),
			});
			const screen = await renderForm(schema);

			const timeInputs =
				screen.container.querySelectorAll('input[type="time"]');
			expect(timeInputs.length).toBe(2);
		});

		test("initializes with default value", async () => {
			const schema = z.object({
				times: timeRangeOptional({}),
			});

			const screen = await renderForm(schema, {
				defaultValues: { times: { start: "09:00", end: "17:00" } },
			});

			const timeInputs =
				screen.container.querySelectorAll('input[type="time"]');
			expect((timeInputs[0] as HTMLInputElement).value).toBe("09:00");
			expect((timeInputs[1] as HTMLInputElement).value).toBe("17:00");
		});

		test("updating time input changes value", async () => {
			const schema = z.object({
				times: timeRangeOptional({}),
			});

			const screen = await renderForm(schema);

			const timeInputs =
				screen.container.querySelectorAll('input[type="time"]');
			const startInput = timeInputs[0] as HTMLInputElement;

			await userEvent.fill(startInput, "10:30");

			expect(startInput.value).toBe("10:30");
		});
	});

	describe("onApply callback", () => {
		test("calls onApply with form values instead of fetcher.submit", async () => {
			const onApply = vi.fn();
			const schema = z.object({
				name: textFieldRequired({ label: "labels.name", maxLength: 100 }),
			});

			const router = createMemoryRouter(
				[
					{
						path: "/",
						element: (
							<SendouForm
								schema={schema}
								defaultValues={{ name: "Test Value" }}
								onApply={onApply}
							>
								{({ names }) => <FormField name={names.name} />}
							</SendouForm>
						),
					},
				],
				{ initialEntries: ["/"] },
			);

			const screen = await render(<RouterProvider router={router} />);
			await screen.getByRole("button", { name: "Submit" }).click();

			expect(onApply).toHaveBeenCalledWith({ name: "Test Value" });
		});

		test("does not call onApply when validation fails", async () => {
			const onApply = vi.fn();
			const schema = z.object({
				name: textFieldRequired({ label: "labels.name", maxLength: 100 }),
			});

			const router = createMemoryRouter(
				[
					{
						path: "/",
						element: (
							<SendouForm schema={schema} onApply={onApply}>
								{({ names }) => <FormField name={names.name} />}
							</SendouForm>
						),
					},
				],
				{ initialEntries: ["/"] },
			);

			const screen = await render(<RouterProvider router={router} />);
			await screen.getByRole("button", { name: "Submit" }).click();

			expect(onApply).not.toHaveBeenCalled();
			await expect
				.element(screen.getByText("This field is required"))
				.toBeVisible();
		});
	});

	describe("fieldset field", () => {
		test("renders fieldset with legend", async () => {
			const schema = z.object({
				member: fieldset({
					label: "labels.member",
					fields: z.object({
						name: textFieldRequired({ label: "labels.name", maxLength: 100 }),
					}),
				}),
			});

			const screen = await renderForm(schema);

			await expect.element(screen.getByText("Member")).toBeVisible();
		});

		test("renders nested fields inside fieldset", async () => {
			const schema = z.object({
				member: fieldset({
					label: "labels.member",
					fields: z.object({
						name: textFieldRequired({ label: "labels.name", maxLength: 100 }),
						bio: textAreaOptional({ label: "labels.bio", maxLength: 500 }),
					}),
				}),
			});

			const screen = await renderForm(schema);

			await expect.element(screen.getByLabelText("Name")).toBeVisible();
			await expect.element(screen.getByLabelText("Bio")).toBeVisible();
		});

		test("typing in nested field updates value", async () => {
			const schema = z.object({
				member: fieldset({
					label: "labels.member",
					fields: z.object({
						name: textFieldRequired({ label: "labels.name", maxLength: 100 }),
					}),
				}),
			});

			const screen = await renderForm(schema);
			const input = screen.getByLabelText("Name");

			await userEvent.type(input.element(), "Test Name");

			await expect.element(input).toHaveValue("Test Name");
		});

		test("initializes nested fields with default values", async () => {
			const schema = z.object({
				member: fieldset({
					label: "labels.member",
					fields: z.object({
						name: textFieldRequired({ label: "labels.name", maxLength: 100 }),
					}),
				}),
			});

			const screen = await renderForm(schema, {
				defaultValues: { member: { name: "Default Name" } },
			});

			await expect
				.element(screen.getByLabelText("Name"))
				.toHaveValue("Default Name");
		});
	});

	describe("array field with primitive items", () => {
		test("renders add button", async () => {
			const schema = z.object({
				urls: array({
					label: "labels.urls",
					min: 0,
					max: 5,
					field: textFieldRequired({ maxLength: 100 }),
				}),
			});

			const screen = await renderForm(schema);

			await expect
				.element(screen.getByRole("button", { name: "Add" }))
				.toBeVisible();
		});

		test("clicking add creates new item", async () => {
			const schema = z.object({
				urls: array({
					label: "labels.urls",
					min: 0,
					max: 5,
					field: textFieldRequired({ maxLength: 100 }),
				}),
			});

			const screen = await renderForm(schema);

			await screen.getByRole("button", { name: "Add" }).click();

			const inputs = screen.container.querySelectorAll('input[type="text"]');
			expect(inputs.length).toBe(1);
		});

		test("renders remove button for each item when above minimum", async () => {
			const schema = z.object({
				urls: array({
					label: "labels.urls",
					min: 0,
					max: 5,
					field: textFieldRequired({ maxLength: 100 }),
				}),
			});

			const screen = await renderForm(schema, {
				defaultValues: { urls: ["http://example.com"] },
			});

			const removeButtons = screen.container.querySelectorAll(
				'button[aria-label="Remove item"]',
			);
			expect(removeButtons.length).toBe(1);
		});

		test("clicking remove deletes item", async () => {
			const schema = z.object({
				urls: array({
					label: "labels.urls",
					min: 0,
					max: 5,
					field: textFieldRequired({ maxLength: 100 }),
				}),
			});

			const screen = await renderForm(schema, {
				defaultValues: { urls: ["http://example.com", "http://test.com"] },
			});

			let inputs = screen.container.querySelectorAll('input[type="text"]');
			expect(inputs.length).toBe(2);

			const removeButtons = screen.container.querySelectorAll(
				'button[aria-label="Remove item"]',
			);
			await userEvent.click(removeButtons[0]);

			inputs = screen.container.querySelectorAll('input[type="text"]');
			expect(inputs.length).toBe(1);
		});

		test("disables add button when max items reached", async () => {
			const schema = z.object({
				urls: array({
					label: "labels.urls",
					min: 0,
					max: 2,
					field: textFieldRequired({ maxLength: 100 }),
				}),
			});

			const screen = await renderForm(schema, {
				defaultValues: { urls: ["http://a.com", "http://b.com"] },
			});

			const addButton = screen.getByRole("button", { name: "Add" });
			await expect.element(addButton).toBeDisabled();
		});
	});

	describe("array field with fieldset items", () => {
		test("renders array items as fieldsets", async () => {
			const schema = z.object({
				members: array({
					label: "labels.members",
					min: 0,
					max: 10,
					field: fieldset({
						fields: z.object({
							name: textFieldRequired({ label: "labels.name", maxLength: 100 }),
						}),
					}),
				}),
			});

			const screen = await renderForm(schema, {
				defaultValues: { members: [{ name: "Alice" }] },
			});

			await expect.element(screen.getByText("#1")).toBeVisible();
			await expect.element(screen.getByLabelText("Name")).toHaveValue("Alice");
		});

		test("add button creates new fieldset item", async () => {
			const schema = z.object({
				members: array({
					label: "labels.members",
					min: 0,
					max: 10,
					field: fieldset({
						fields: z.object({
							name: textFieldRequired({ label: "labels.name", maxLength: 100 }),
						}),
					}),
				}),
			});

			const screen = await renderForm(schema);

			await screen.getByRole("button", { name: "Add" }).click();

			await expect.element(screen.getByText("#1")).toBeVisible();
		});

		test("remove button removes fieldset item", async () => {
			const schema = z.object({
				members: array({
					label: "labels.members",
					min: 0,
					max: 10,
					field: fieldset({
						fields: z.object({
							name: textFieldRequired({ label: "labels.name", maxLength: 100 }),
						}),
					}),
				}),
			});

			const screen = await renderForm(schema, {
				defaultValues: { members: [{ name: "Alice" }, { name: "Bob" }] },
			});

			const removeButtons = screen.container.querySelectorAll(
				'button[aria-label="Remove item"]',
			);
			expect(removeButtons.length).toBe(2);

			await userEvent.click(removeButtons[0]);

			const inputs = screen.container.querySelectorAll('input[type="text"]');
			expect(inputs.length).toBe(1);
			expect((inputs[0] as HTMLInputElement).value).toBe("Bob");
		});

		test("typing in nested fieldset field updates value", async () => {
			const schema = z.object({
				members: array({
					label: "labels.members",
					min: 0,
					max: 10,
					field: fieldset({
						fields: z.object({
							name: textFieldRequired({ label: "labels.name", maxLength: 100 }),
						}),
					}),
				}),
			});

			const screen = await renderForm(schema, {
				defaultValues: { members: [{ name: "" }] },
			});

			const input = screen.getByLabelText("Name");
			await userEvent.type(input.element(), "New Name");

			await expect.element(input).toHaveValue("New Name");
		});

		test("shows error on specific nested field within array item", async () => {
			const schema = z.object({
				series: array({
					label: "labels.orgSeries",
					min: 1,
					max: 10,
					field: fieldset({
						fields: z.object({
							name: textFieldRequired({ label: "labels.name", maxLength: 100 }),
							description: textAreaOptional({
								label: "labels.description",
								maxLength: 500,
							}),
						}),
					}),
				}),
			});

			const screen = await renderForm(schema, {
				defaultValues: { series: [{ name: "", description: "some text" }] },
			});

			await screen.getByRole("button", { name: "Submit" }).click();

			const nameInput = screen.getByLabelText("Name");
			await expect.element(nameInput).toHaveAttribute("aria-invalid", "true");
		});

		test("shows 'This field is required' for empty required field in array fieldset", async () => {
			const schema = z.object({
				series: array({
					label: "labels.orgSeries",
					min: 1,
					max: 10,
					field: fieldset({
						fields: z.object({
							name: textFieldRequired({ label: "labels.name", maxLength: 100 }),
						}),
					}),
				}),
			});

			const screen = await renderForm(schema, {
				defaultValues: { series: [{ name: "" }] },
			});

			await screen.getByRole("button", { name: "Submit" }).click();

			await expect
				.element(screen.getByText("This field is required"))
				.toBeVisible();
		});

		test("setItemField batches multiple field updates correctly", async () => {
			const schema = z.object({
				members: array({
					label: "labels.members",
					min: 1,
					max: 10,
					field: fieldset({
						fields: z.object({
							name: textFieldOptional({ label: "labels.name", maxLength: 100 }),
							bio: textFieldOptional({ label: "labels.bio", maxLength: 100 }),
						}),
					}),
				}),
			});

			const screen = await renderForm(schema, {
				defaultValues: { members: [{ name: "", bio: "" }] },
			});

			const inputA = screen.getByLabelText("Name");
			const inputB = screen.getByLabelText("Bio");

			await userEvent.type(inputA.element(), "Value A");
			await userEvent.type(inputB.element(), "Value B");

			await expect.element(inputA).toHaveValue("Value A");
			await expect.element(inputB).toHaveValue("Value B");
		});
	});
});
