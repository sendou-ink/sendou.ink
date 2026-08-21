import { type ComponentProps, Profiler } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import * as v from "valibot";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { FormField } from "./FormField";
import {
	array,
	checkboxGroup,
	fieldset,
	radioGroup,
	select,
	selectDynamic,
	selectOptional,
	textArea,
	textAreaOptional,
	textField,
	textFieldOptional,
	timeRangeOptional,
	toggle as toggleField,
	userSearch,
} from "./fields";
import { SendouForm, useFormFieldContext } from "./SendouForm";
import type { ArrayItemRenderContext, FormObjectSchema } from "./types";

let mockFetcherData: { fieldErrors?: Record<string, string> } | undefined;

/** `fieldset` registers its metadata onto the object it is handed, so anything nested needs a fresh one. */
const singleTextField = () =>
	v.object({
		name: textField({ label: "labels.name", maxLength: 100 }),
	});

const SINGLE_TEXT_FIELD = singleTextField();

const NESTED_FIELDSET = v.object({
	member: fieldset({
		label: "labels.member",
		fields: singleTextField(),
	}),
});

const FIELDSET_ARRAY = v.object({
	members: array({
		label: "labels.members",
		min: 0,
		max: 10,
		field: fieldset({ fields: singleTextField() }),
	}),
});

const TEXT_FIELD_ARRAY = v.object({
	urls: array({
		label: "labels.urls",
		min: 0,
		max: 5,
		field: textField({ maxLength: 100 }),
	}),
});

const TOGGLE = v.object({
	noScreen: toggleField({ label: "labels.noScreen" }),
});

const CHECKBOX_GROUP = v.object({
	modes: checkboxGroup({
		label: "labels.buildModes",
		items: [
			{ label: "modes.TW", value: "TW" },
			{ label: "modes.SZ", value: "SZ" },
		],
		minLength: 1,
	}),
});

const TIME_RANGE = v.object({
	times: timeRangeOptional({}),
});

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
			load: vi.fn(),
		}),
	};
});

function renderForm(
	schema: FormObjectSchema,
	options?: {
		defaultValues?: Record<string, unknown>;
		title?: string;
		submitButtonText?: string;
		mode?: "autoSubmit";
	},
) {
	const props: ComponentProps<typeof SendouForm<v.ObjectEntries>> = {
		schema,
		defaultValues: options?.defaultValues,
		title: options?.title,
		submitButtonText: options?.submitButtonText,
		mode: options?.mode,
		children: (
			<>
				{Object.keys(schema.entries).map((name) => (
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
			const screen = await renderForm(SINGLE_TEXT_FIELD, {
				title: "Test Form",
			});

			await expect.element(screen.getByText("Test Form")).toBeVisible();
		});

		test("renders submit button with default text", async () => {
			const screen = await renderForm(SINGLE_TEXT_FIELD);

			await expect
				.element(screen.getByRole("button", { name: "Submit" }))
				.toBeVisible();
		});

		test("renders submit button with custom text", async () => {
			const screen = await renderForm(SINGLE_TEXT_FIELD, {
				submitButtonText: "Save Changes",
			});

			await expect
				.element(screen.getByRole("button", { name: "Save Changes" }))
				.toBeVisible();
		});

		test("hides submit button in autoSubmit mode", async () => {
			const screen = await renderForm(SINGLE_TEXT_FIELD, {
				mode: "autoSubmit",
			});

			const submitButton = screen.container.querySelector(
				'button[type="submit"]',
			);
			expect(submitButton).toBeNull();
		});
	});

	describe("text field", () => {
		test("renders with label", async () => {
			const screen = await renderForm(SINGLE_TEXT_FIELD);

			await expect.element(screen.getByLabelText("Name")).toBeVisible();
		});

		test("typing updates value", async () => {
			const screen = await renderForm(SINGLE_TEXT_FIELD);
			const input = screen.getByLabelText("Name");

			await userEvent.type(input.element(), "Test Value");

			await expect.element(input).toHaveValue("Test Value");
		});

		test("shows error on blur when required field is empty", async () => {
			const screen = await renderForm(SINGLE_TEXT_FIELD);
			const input = screen.getByLabelText("Name");

			await userEvent.click(input.element());
			await userEvent.tab();

			await expect
				.element(screen.getByText("This field is required"))
				.toBeVisible();
		});

		test("shows error on submit when required field is empty", async () => {
			const screen = await renderForm(SINGLE_TEXT_FIELD);

			await screen.getByRole("button", { name: "Submit" }).click();

			await expect
				.element(screen.getByText("This field is required"))
				.toBeVisible();
		});

		test("clears error when valid value is entered after submit", async () => {
			const screen = await renderForm(SINGLE_TEXT_FIELD);

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
			const schema = v.object({
				bio: textFieldOptional({ label: "labels.bio", maxLength: 500 }),
			});

			const screen = await renderForm(schema);

			await screen.getByRole("button", { name: "Submit" }).click();

			const errorElement = screen.container.querySelector('[id$="-error"]');
			expect(errorElement?.textContent).toBeFalsy();
		});

		test("initializes with default value", async () => {
			const screen = await renderForm(SINGLE_TEXT_FIELD, {
				defaultValues: { name: "Default Name" },
			});

			await expect
				.element(screen.getByLabelText("Name"))
				.toHaveValue("Default Name");
		});
	});

	describe("text area", () => {
		test("renders textarea element", async () => {
			const schema = v.object({
				bio: textAreaOptional({ label: "labels.bio", maxLength: 500 }),
			});

			const screen = await renderForm(schema);

			const textarea = screen.container.querySelector("textarea");
			expect(textarea).not.toBeNull();
		});

		test("displays value counter showing current/max characters", async () => {
			const schema = v.object({
				bio: textAreaOptional({ label: "labels.bio", maxLength: 100 }),
			});

			const screen = await renderForm(schema);

			await expect.element(screen.getByText("0/100")).toBeVisible();
		});

		test("value counter updates as user types", async () => {
			const schema = v.object({
				bio: textAreaOptional({ label: "labels.bio", maxLength: 100 }),
			});

			const screen = await renderForm(schema);
			const textarea = screen.getByLabelText("Bio");

			await expect.element(screen.getByText("0/100")).toBeVisible();

			await userEvent.type(textarea.element(), "Hello");

			await expect.element(screen.getByText("5/100")).toBeVisible();
		});

		test("value counter shows warning style near max length", async () => {
			const schema = v.object({
				bio: textAreaOptional({ label: "labels.bio", maxLength: 10 }),
			});

			const screen = await renderForm(schema, {
				defaultValues: { bio: "123456789" },
			});

			const counter = screen.container.querySelector(
				'[data-testid="label-value-counter"]',
			);
			expect(counter?.getAttribute("data-length-state")).toBe("warning");
		});

		test("value counter shows error style when over max length", async () => {
			const schema = v.object({
				bio: textAreaOptional({ label: "labels.bio", maxLength: 5 }),
			});

			const screen = await renderForm(schema, {
				defaultValues: { bio: "123456" },
			});

			const counter = screen.container.querySelector(
				'[data-testid="label-value-counter"]',
			);
			expect(counter?.getAttribute("data-length-state")).toBe("error");
		});

		test("typing updates value", async () => {
			const schema = v.object({
				bio: textAreaOptional({ label: "labels.bio", maxLength: 500 }),
			});

			const screen = await renderForm(schema);
			const textarea = screen.getByLabelText("Bio");

			await userEvent.type(textarea.element(), "Test bio content");

			await expect.element(textarea).toHaveValue("Test bio content");
		});

		test("required text area shows error when empty", async () => {
			const schema = v.object({
				bio: textArea({ label: "labels.bio", maxLength: 500 }),
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
			const schema = v.object({
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
			const schema = v.object({
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
			const schema = v.object({
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
			const schema = v.object({
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
			const screen = await renderForm(TOGGLE);

			await expect
				.element(screen.getByText("[Accessibility] Avoid Splattercolor Screen"))
				.toBeVisible();
		});

		test("clicking toggles value", async () => {
			const screen = await renderForm(TOGGLE);
			const switchElement = screen.getByRole("switch");

			await expect.element(switchElement).not.toBeChecked();

			const label = screen.getByText(
				"[Accessibility] Avoid Splattercolor Screen",
			);
			await userEvent.click(label.element());

			await expect.element(switchElement).toBeChecked();
		});

		test("initializes with default value", async () => {
			const screen = await renderForm(TOGGLE, {
				defaultValues: { noScreen: true },
			});

			await expect.element(screen.getByRole("switch")).toBeChecked();
		});
	});

	describe("radio group field", () => {
		test("renders radio options", async () => {
			const schema = v.object({
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
			const schema = v.object({
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
			const schema = v.object({
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
			const schema = v.object({
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
			const schema = v.object({
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
			const schema = v.object({
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
			const screen = await renderForm(CHECKBOX_GROUP);

			await screen.getByRole("button", { name: "Submit" }).click();

			await expect
				.element(screen.getByText("This field is required"))
				.toBeVisible();
		});

		test("checking an option that satisfies the minimum shows no error", async () => {
			const screen = await renderForm(CHECKBOX_GROUP);

			await userEvent.click(screen.getByLabelText("Turf War").element());

			expect(
				screen.container.querySelector('[id$="-error"]'),
			).not.toBeInTheDocument();
		});

		test("unchecking below the minimum shows the error without a submit", async () => {
			const screen = await renderForm(CHECKBOX_GROUP);
			const twCheckbox = screen.getByLabelText("Turf War");

			await userEvent.click(twCheckbox.element());
			await userEvent.click(twCheckbox.element());

			await expect
				.element(screen.getByText("This field is required"))
				.toBeVisible();
		});
	});

	describe("validation", () => {
		test("validates multiple fields on submit", async () => {
			const schema = v.object({
				name: textField({ label: "labels.name", maxLength: 100 }),
				bio: textArea({ label: "labels.bio", maxLength: 500 }),
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
			const schema = v.object({
				name: textField({ label: "labels.name", maxLength: 100 }),
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
			const schema = v.object({
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

		test("toggle falls back to schema initial value when no default provided", async () => {
			const schema = v.object({
				noScreen: toggleField({ label: "labels.noScreen", initialValue: true }),
			});

			const screen = await renderForm(schema);

			await expect.element(screen.getByRole("switch")).toBeChecked();
		});

		test("dynamic select falls back to schema initial value when no default provided", async () => {
			const schema = v.object({
				threshold: selectDynamic({
					label: "labels.advanceThreshold",
					initialValue: "4",
				}),
			});

			const router = createMemoryRouter(
				[
					{
						path: "/",
						element: (
							<SendouForm schema={schema}>
								<FormField
									name="threshold"
									options={["3", "4", "5"].map((value) => ({
										value,
										label: value,
									}))}
								/>
							</SendouForm>
						),
					},
				],
				{ initialEntries: ["/"] },
			);

			const screen = await render(<RouterProvider router={router} />);

			await expect
				.element(screen.getByLabelText("Wins needed to advance"))
				.toHaveValue("4");
		});
	});

	describe("server error fallback", () => {
		test("shows fallback error when server returns error for field without DOM element", async () => {
			mockFetcherData = {
				fieldErrors: { hiddenField: "forms:errors.required" },
			};

			const screen = await renderForm(SINGLE_TEXT_FIELD, {
				defaultValues: { name: "Test" },
			});

			await expect
				.element(screen.getByText("This field is required (hiddenField)"))
				.toBeVisible();
		});

		test("does not show fallback error when server error has corresponding DOM element", async () => {
			mockFetcherData = {
				fieldErrors: { name: "forms:errors.required" },
			};

			const screen = await renderForm(SINGLE_TEXT_FIELD, {
				defaultValues: { name: "Test" },
			});

			const fallbackError = screen.getByTestId("fallback-form-error");
			await expect.element(fallbackError).not.toBeInTheDocument();
		});
	});

	describe("time range field", () => {
		test("renders two time inputs", async () => {
			const screen = await renderForm(TIME_RANGE);

			const timeInputs =
				screen.container.querySelectorAll('input[type="time"]');
			expect(timeInputs.length).toBe(2);
		});

		test("initializes with default value", async () => {
			const screen = await renderForm(TIME_RANGE, {
				defaultValues: { times: { start: "09:00", end: "17:00" } },
			});

			const timeInputs =
				screen.container.querySelectorAll('input[type="time"]');
			expect((timeInputs[0] as HTMLInputElement).value).toBe("09:00");
			expect((timeInputs[1] as HTMLInputElement).value).toBe("17:00");
		});

		test("updating time input changes value", async () => {
			const screen = await renderForm(TIME_RANGE);

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

			const router = createMemoryRouter(
				[
					{
						path: "/",
						element: (
							<SendouForm
								schema={SINGLE_TEXT_FIELD}
								defaultValues={{ name: "Test Value" }}
								onApply={onApply}
							>
								<FormField name="name" />
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

			const router = createMemoryRouter(
				[
					{
						path: "/",
						element: (
							<SendouForm schema={SINGLE_TEXT_FIELD} onApply={onApply}>
								<FormField name="name" />
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
			const screen = await renderForm(NESTED_FIELDSET);

			await expect.element(screen.getByText("Member")).toBeVisible();
		});

		test("renders nested fields inside fieldset", async () => {
			const schema = v.object({
				member: fieldset({
					label: "labels.member",
					fields: v.object({
						name: textField({ label: "labels.name", maxLength: 100 }),
						bio: textAreaOptional({ label: "labels.bio", maxLength: 500 }),
					}),
				}),
			});

			const screen = await renderForm(schema);

			await expect.element(screen.getByLabelText("Name")).toBeVisible();
			await expect.element(screen.getByLabelText("Bio")).toBeVisible();
		});

		test("typing in nested field updates value", async () => {
			const screen = await renderForm(NESTED_FIELDSET);
			const input = screen.getByLabelText("Name");

			await userEvent.type(input.element(), "Test Name");

			await expect.element(input).toHaveValue("Test Name");
		});

		test("initializes nested fields with default values", async () => {
			const screen = await renderForm(NESTED_FIELDSET, {
				defaultValues: { member: { name: "Default Name" } },
			});

			await expect
				.element(screen.getByLabelText("Name"))
				.toHaveValue("Default Name");
		});
	});

	describe("array field with primitive items", () => {
		test("renders add button", async () => {
			const screen = await renderForm(TEXT_FIELD_ARRAY);

			await expect
				.element(screen.getByRole("button", { name: "Add" }))
				.toBeVisible();
		});

		test("renders one starter item for an empty array", async () => {
			const screen = await renderForm(TEXT_FIELD_ARRAY);

			const inputs = screen.container.querySelectorAll('input[type="text"]');
			expect(inputs.length).toBe(1);

			const removeButtons = screen.container.querySelectorAll(
				'button[aria-label="Remove item"]',
			);
			expect(removeButtons.length).toBe(0);
		});

		test("clicking add creates new item", async () => {
			const screen = await renderForm(TEXT_FIELD_ARRAY);

			// Adding from the single empty starter row materializes it and appends a
			// new one, so one click goes from 1 visible row to 2.
			await screen.getByRole("button", { name: "Add" }).click();
			expect(
				screen.container.querySelectorAll('input[type="text"]').length,
			).toBe(2);

			await screen.getByRole("button", { name: "Add" }).click();
			expect(
				screen.container.querySelectorAll('input[type="text"]').length,
			).toBe(3);
		});

		test("renders remove button for each item when above minimum", async () => {
			const screen = await renderForm(TEXT_FIELD_ARRAY, {
				defaultValues: { urls: ["http://example.com"] },
			});

			const removeButtons = screen.container.querySelectorAll(
				'button[aria-label="Remove item"]',
			);
			expect(removeButtons.length).toBe(1);
		});

		test("clicking remove deletes item", async () => {
			const screen = await renderForm(TEXT_FIELD_ARRAY, {
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
			const schema = v.object({
				urls: array({
					label: "labels.urls",
					min: 0,
					max: 2,
					field: textField({ maxLength: 100 }),
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
			const screen = await renderForm(FIELDSET_ARRAY, {
				defaultValues: { members: [{ name: "Alice" }] },
			});

			await expect.element(screen.getByText("#1")).toBeVisible();
			await expect.element(screen.getByLabelText("Name")).toHaveValue("Alice");
		});

		test("renders one starter fieldset for an empty array", async () => {
			const screen = await renderForm(FIELDSET_ARRAY);

			await expect.element(screen.getByText("#1")).toBeVisible();

			// The remove button is rendered but hidden (so the header keeps a stable
			// height) since a single starter row can't be removed.
			const removeButtons = screen.container.querySelectorAll(
				'button[aria-label="Remove item"]',
			);
			expect(removeButtons.length).toBe(1);
			expect(removeButtons[0].classList.contains("invisible")).toBe(true);
		});

		test("add button creates new fieldset item", async () => {
			const screen = await renderForm(FIELDSET_ARRAY);

			await screen.getByRole("button", { name: "Add" }).click();
			await screen.getByRole("button", { name: "Add" }).click();

			await expect.element(screen.getByText("#2")).toBeVisible();
		});

		test("remove button removes fieldset item", async () => {
			const screen = await renderForm(FIELDSET_ARRAY, {
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

		test("sortable array renders move buttons and reorders items", async () => {
			const schema = v.object({
				members: array({
					label: "labels.members",
					min: 0,
					max: 10,
					sortable: true,
					field: fieldset({
						fields: singleTextField(),
					}),
				}),
			});

			const screen = await renderForm(schema, {
				defaultValues: { members: [{ name: "Alice" }, { name: "Bob" }] },
			});

			const moveDownButtons = screen.container.querySelectorAll(
				'button[aria-label="Move down"]',
			);
			expect(moveDownButtons.length).toBe(2);

			// the first item can't move up and the last can't move down
			const moveUpButtons = screen.container.querySelectorAll(
				'button[aria-label="Move up"]',
			);
			expect((moveUpButtons[0] as HTMLButtonElement).disabled).toBe(true);
			expect((moveDownButtons[1] as HTMLButtonElement).disabled).toBe(true);

			// move the first item down past the second
			await userEvent.click(moveDownButtons[0]);

			const inputs = screen.container.querySelectorAll('input[type="text"]');
			expect((inputs[0] as HTMLInputElement).value).toBe("Bob");
			expect((inputs[1] as HTMLInputElement).value).toBe("Alice");
		});

		test("non-sortable array renders no move buttons", async () => {
			const screen = await renderForm(FIELDSET_ARRAY, {
				defaultValues: { members: [{ name: "Alice" }, { name: "Bob" }] },
			});

			const moveButtons = screen.container.querySelectorAll(
				'button[aria-label="Move down"], button[aria-label="Move up"]',
			);
			expect(moveButtons.length).toBe(0);
		});

		test("removing an added fieldset row returns to a single non-removable row", async () => {
			// Mirrors the staff form: a select field gives the row a non-empty default
			// (role), so a freshly added row isn't "blank" yet is still pristine.
			const schema = v.object({
				staff: array({
					label: "labels.members",
					min: 0,
					max: 10,
					field: fieldset({
						fields: v.object({
							name: textField({ label: "labels.name", maxLength: 100 }),
							role: select({
								label: "labels.staffRole",
								items: [
									{ value: "ORGANIZER", label: "options.staffRole.ORGANIZER" },
									{ value: "STREAMER", label: "options.staffRole.STREAMER" },
								],
							}),
						}),
					}),
				}),
			});

			const screen = await renderForm(schema);

			const removeButtonEls = () =>
				screen.container.querySelectorAll('button[aria-label="Remove item"]');

			// Single starter row: remove button present but hidden.
			expect(removeButtonEls().length).toBe(1);
			expect(removeButtonEls()[0].classList.contains("invisible")).toBe(true);

			await screen.getByRole("button", { name: "Add" }).click();

			// Two rows now, both with visible remove buttons.
			await expect.element(screen.getByText("#2")).toBeVisible();
			expect(removeButtonEls().length).toBe(2);
			for (const button of removeButtonEls()) {
				expect(button.classList.contains("invisible")).toBe(false);
			}

			// Removing the second row collapses back to the single starter row with a
			// hidden remove button - not a lingering blank row that still shows one.
			await userEvent.click(removeButtonEls()[1]);

			await expect.element(screen.getByText("#1")).toBeVisible();
			expect(screen.container.querySelectorAll("fieldset").length).toBe(1);
			expect(removeButtonEls().length).toBe(1);
			expect(removeButtonEls()[0].classList.contains("invisible")).toBe(true);
		});

		test("typing in nested fieldset field updates value", async () => {
			const screen = await renderForm(FIELDSET_ARRAY, {
				defaultValues: { members: [{ name: "" }] },
			});

			const input = screen.getByLabelText("Name");
			await userEvent.type(input.element(), "New Name");

			await expect.element(input).toHaveValue("New Name");
		});

		test("editing a starter row commits its select default on submit", async () => {
			// Regression: editing one field of the empty-array starter row must seed the
			// item's other fieldset defaults (e.g. a required select's first option),
			// rather than leaving them only displayed as a fallback and failing
			// validation on submit.
			const onApply = vi.fn();
			const schema = v.object({
				staff: array({
					label: "labels.members",
					min: 0,
					max: 10,
					field: fieldset({
						fields: v.object({
							name: textField({ label: "labels.name", maxLength: 100 }),
							role: select({
								label: "labels.staffRole",
								items: [
									{ value: "ORGANIZER", label: "options.staffRole.ORGANIZER" },
									{ value: "STREAMER", label: "options.staffRole.STREAMER" },
								],
							}),
						}),
					}),
				}),
			});

			const router = createMemoryRouter(
				[
					{
						path: "/",
						element: (
							<SendouForm schema={schema} onApply={onApply}>
								<FormField name="staff" />
							</SendouForm>
						),
					},
				],
				{ initialEntries: ["/"] },
			);

			const screen = await render(<RouterProvider router={router} />);

			await userEvent.type(screen.getByLabelText("Name").element(), "Alice");
			await screen.getByRole("button", { name: "Submit" }).click();

			expect(onApply).toHaveBeenCalledWith({
				staff: [{ name: "Alice", role: "ORGANIZER" }],
			});
		});

		test("shows error on specific nested field within array item", async () => {
			const schema = v.object({
				series: array({
					label: "labels.orgSeries",
					min: 1,
					max: 10,
					field: fieldset({
						fields: v.object({
							name: textField({ label: "labels.name", maxLength: 100 }),
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
			const schema = v.object({
				series: array({
					label: "labels.orgSeries",
					min: 1,
					max: 10,
					field: fieldset({
						fields: singleTextField(),
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
			const schema = v.object({
				members: array({
					label: "labels.members",
					min: 1,
					max: 10,
					field: fieldset({
						fields: v.object({
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

	describe("array field with custom-rendered items", () => {
		const memberSchema = () =>
			v.object({
				members: array({
					label: "labels.members",
					min: 0,
					max: 10,
					field: fieldset({
						fields: v.object({
							name: textField({ label: "labels.name", maxLength: 100 }),
							role: select({
								label: "labels.staffRole",
								items: [
									{ value: "ORGANIZER", label: "options.staffRole.ORGANIZER" },
									{ value: "STREAMER", label: "options.staffRole.STREAMER" },
								],
							}),
						}),
					}),
				}),
			});

		function renderCustomArrayForm(options?: {
			defaultValues?: Record<string, unknown>;
			onApply?: (values: Record<string, unknown>) => void;
		}) {
			const router = createMemoryRouter(
				[
					{
						path: "/",
						element: (
							<SendouForm
								schema={memberSchema()}
								defaultValues={options?.defaultValues}
								onApply={options?.onApply}
							>
								<FormField name="members">
									{(ctx: ArrayItemRenderContext) => (
										<div>
											<div data-testid={`member-${ctx.index}`}>
												{ctx.values.name as string} /{" "}
												{ctx.values.role as string}
											</div>
											<button
												type="button"
												onClick={() =>
													ctx.setItemField(
														"name",
														`${ctx.values.name as string} edited`,
													)
												}
											>
												Edit member {ctx.index + 1}
											</button>
											{ctx.canRemove ? (
												<button type="button" onClick={() => ctx.remove()}>
													Remove member {ctx.index + 1}
												</button>
											) : null}
										</div>
									)}
								</FormField>
							</SendouForm>
						),
					},
				],
				{ initialEntries: ["/"] },
			);

			return render(<RouterProvider router={router} />);
		}

		const memberTestIds = (screen: Awaited<ReturnType<typeof render>>) =>
			screen.container.querySelectorAll('[data-testid^="member-"]');

		test("renders each item through the render function with its values", async () => {
			const screen = await renderCustomArrayForm({
				defaultValues: {
					members: [
						{ name: "Alice", role: "ORGANIZER" },
						{ name: "Bob", role: "STREAMER" },
					],
				},
			});

			await expect
				.element(screen.getByTestId("member-0"))
				.toHaveTextContent("Alice / ORGANIZER");
			await expect
				.element(screen.getByTestId("member-1"))
				.toHaveTextContent("Bob / STREAMER");
		});

		test("add button appends a new custom-rendered item", async () => {
			const screen = await renderCustomArrayForm();

			expect(memberTestIds(screen).length).toBe(1);

			await screen.getByRole("button", { name: "Add" }).click();

			await expect
				.element(screen.getByTestId("member-1"))
				.toHaveTextContent("/ ORGANIZER");
			expect(memberTestIds(screen).length).toBe(2);
		});

		test("remove removes exactly the clicked item", async () => {
			const onApply = vi.fn();
			const screen = await renderCustomArrayForm({
				defaultValues: {
					members: [
						{ name: "Alice", role: "ORGANIZER" },
						{ name: "Bob", role: "STREAMER" },
						{ name: "Carol", role: "STREAMER" },
					],
				},
				onApply,
			});

			await screen.getByRole("button", { name: "Remove member 2" }).click();

			expect(memberTestIds(screen).length).toBe(2);
			await expect
				.element(screen.getByTestId("member-0"))
				.toHaveTextContent("Alice / ORGANIZER");
			await expect
				.element(screen.getByTestId("member-1"))
				.toHaveTextContent("Carol / STREAMER");

			await screen.getByRole("button", { name: "Submit" }).click();

			expect(onApply).toHaveBeenCalledWith({
				members: [
					expect.objectContaining({ name: "Alice", role: "ORGANIZER" }),
					expect.objectContaining({ name: "Carol", role: "STREAMER" }),
				],
			});
		});

		test("remove after add acts on the grown array, not a stale one", async () => {
			const screen = await renderCustomArrayForm({
				defaultValues: {
					members: [
						{ name: "Alice", role: "ORGANIZER" },
						{ name: "Bob", role: "STREAMER" },
					],
				},
			});

			await screen.getByRole("button", { name: "Add" }).click();
			await screen.getByRole("button", { name: "Remove member 1" }).click();

			// A stale remove would have filtered the pre-add two-item array and
			// dropped the freshly added row along with Alice.
			expect(memberTestIds(screen).length).toBe(2);
			await expect
				.element(screen.getByTestId("member-0"))
				.toHaveTextContent("Bob / STREAMER");
		});

		test("remove after editing a different item keeps the edit", async () => {
			const onApply = vi.fn();
			const screen = await renderCustomArrayForm({
				defaultValues: {
					members: [
						{ name: "Alice", role: "ORGANIZER" },
						{ name: "Bob", role: "STREAMER" },
						{ name: "Carol", role: "STREAMER" },
					],
				},
				onApply,
			});

			// Editing item 1 does not re-render the memoized item 3, so its remove
			// callback must read the current array instead of a stale closure.
			await screen.getByRole("button", { name: "Edit member 1" }).click();
			await screen.getByRole("button", { name: "Remove member 3" }).click();

			await screen.getByRole("button", { name: "Submit" }).click();

			expect(onApply).toHaveBeenCalledWith({
				members: [
					expect.objectContaining({ name: "Alice edited", role: "ORGANIZER" }),
					expect.objectContaining({ name: "Bob", role: "STREAMER" }),
				],
			});
		});

		test("setItemField updates only the targeted item's field", async () => {
			const onApply = vi.fn();
			const screen = await renderCustomArrayForm({
				defaultValues: {
					members: [
						{ name: "Alice", role: "ORGANIZER" },
						{ name: "Bob", role: "STREAMER" },
					],
				},
				onApply,
			});

			await screen.getByRole("button", { name: "Edit member 2" }).click();

			await expect
				.element(screen.getByTestId("member-1"))
				.toHaveTextContent("Bob edited / STREAMER");
			await expect
				.element(screen.getByTestId("member-0"))
				.toHaveTextContent("Alice / ORGANIZER");

			await screen.getByRole("button", { name: "Submit" }).click();

			expect(onApply).toHaveBeenCalledWith({
				members: [
					expect.objectContaining({ name: "Alice", role: "ORGANIZER" }),
					expect.objectContaining({ name: "Bob edited", role: "STREAMER" }),
				],
			});
		});

		test("itemName renders a nested FormField bound to the item", async () => {
			const onApply = vi.fn();
			const schema = memberSchema();

			const router = createMemoryRouter(
				[
					{
						path: "/",
						element: (
							<SendouForm
								schema={schema}
								defaultValues={{
									members: [{ name: "Alice", role: "ORGANIZER" }],
								}}
								onApply={onApply}
							>
								<FormField name="members">
									{(ctx: ArrayItemRenderContext) => (
										<FormField name={`${ctx.itemName}.name`} />
									)}
								</FormField>
							</SendouForm>
						),
					},
				],
				{ initialEntries: ["/"] },
			);

			const screen = await render(<RouterProvider router={router} />);
			const input = screen.getByLabelText("Name");

			await expect.element(input).toHaveValue("Alice");

			await userEvent.type(input.element(), " Smith");
			await screen.getByRole("button", { name: "Submit" }).click();

			expect(onApply).toHaveBeenCalledWith({
				members: [
					expect.objectContaining({ name: "Alice Smith", role: "ORGANIZER" }),
				],
			});
		});
	});

	describe("array field item removal preserves remaining items", () => {
		test("removing a middle member preserves userSearch values of members below", async () => {
			let latestValues: Record<string, unknown> = {};

			function ValueCapture() {
				const ctx = useFormFieldContext();
				latestValues = ctx.values;
				return null;
			}

			const schema = v.object({
				members: array({
					label: "labels.members",
					max: 10,
					field: fieldset({
						fields: v.object({
							userId: userSearch({ label: "labels.user" }),
							role: select({
								label: "labels.orgMemberRole",
								items: [
									{ label: "options.orgRole.ADMIN", value: "ADMIN" },
									{ label: "options.orgRole.MEMBER", value: "MEMBER" },
								],
							}),
						}),
					}),
				}),
			});

			const defaultValues = {
				members: [
					{ userId: 10, role: "ADMIN" as const },
					{ userId: 20, role: "MEMBER" as const },
					{ userId: 30, role: "MEMBER" as const },
					{ userId: 40, role: "MEMBER" as const },
					{ userId: 50, role: "MEMBER" as const },
				],
			};

			const router = createMemoryRouter(
				[
					{
						path: "/",
						element: (
							<SendouForm schema={schema} defaultValues={defaultValues}>
								<FormField name="members" />
								<ValueCapture />
							</SendouForm>
						),
					},
				],
				{ initialEntries: ["/"] },
			);

			const screen = await render(<RouterProvider router={router} />);

			// Verify initial state - 5 members rendered
			const removeButtons = screen.container.querySelectorAll(
				'button[aria-label="Remove item"]',
			);
			expect(removeButtons.length).toBe(5);

			// Remove the 3rd member (index 2, userId: 30)
			await userEvent.click(removeButtons[2]);

			// Wait for React effects to settle
			await new Promise((resolve) => setTimeout(resolve, 200));

			const members = latestValues.members as Array<{
				userId: number | null;
				role: string;
			}>;
			expect(members).toHaveLength(4);
			expect(members[0].userId).toBe(10);
			expect(members[1].userId).toBe(20);
			// Bug: UserSearch cleanup effect clears userId for shifted items
			expect(members[2].userId).toBe(40);
			expect(members[3].userId).toBe(50);
		});
	});

	describe("render isolation", () => {
		test("typing in one field does not re-render sibling fields", async () => {
			const schema = v.object({
				name: textField({ label: "labels.name", maxLength: 100 }),
				bio: textFieldOptional({ label: "labels.bio", maxLength: 100 }),
			});

			const profilerRenders: Record<string, number> = {};
			const onRender = (id: string) => {
				profilerRenders[id] = (profilerRenders[id] ?? 0) + 1;
			};

			const form = (
				<SendouForm schema={schema} defaultValues={{}}>
					{({ FormField: TypedFormField }) => (
						<>
							<Profiler id="name" onRender={onRender}>
								<TypedFormField name="name" />
							</Profiler>
							<Profiler id="bio" onRender={onRender}>
								<TypedFormField name="bio" />
							</Profiler>
						</>
					)}
				</SendouForm>
			);

			const router = createMemoryRouter([{ path: "/", element: form }], {
				initialEntries: ["/"],
			});
			const screen = await render(<RouterProvider router={router} />);

			const baselineName = profilerRenders.name ?? 0;
			const baselineBio = profilerRenders.bio ?? 0;
			await userEvent.type(screen.getByLabelText("Name").element(), "hello");

			const nameRenders = (profilerRenders.name ?? 0) - baselineName;
			const bioRenders = (profilerRenders.bio ?? 0) - baselineBio;

			expect(nameRenders).toBeGreaterThanOrEqual(5);
			expect(bioRenders).toBe(0);
		});
	});
});
