import { describe, expect, test, vi } from "bun:test";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { CustomPickBanFlow } from "~/db/tables-json";
import { CustomFlowBuilder } from "./CustomFlowBuilder";

const defaultProps: ComponentProps<typeof CustomFlowBuilder> = {
	value: null,
	onChange: vi.fn(),
};

function renderComponent(
	props: Partial<ComponentProps<typeof CustomFlowBuilder>> = {},
) {
	const router = createMemoryRouter(
		[
			{
				path: "/",
				element: <CustomFlowBuilder {...defaultProps} {...props} />,
			},
		],
		{ initialEntries: ["/"] },
	);

	return render(<RouterProvider router={router} />);
}

describe("CustomFlowBuilder", () => {
	describe("initial rendering", () => {
		test("renders all who-side palette chips", async () => {
			renderComponent();

			expect(screen.getByText("Team Alpha")).toBeVisible();
			expect(screen.getByText("Team Bravo")).toBeVisible();
			expect(screen.getByText("Higher Seed")).toBeVisible();
			expect(screen.getByText("Lower Seed")).toBeVisible();
			expect(screen.getByText("Winner")).toBeVisible();
			expect(screen.getByText("Loser")).toBeVisible();
		});

		test("renders all action palette chips", async () => {
			renderComponent();

			expect(screen.getByText("Random legal map")).toBeVisible();
			expect(screen.getByText("Pick (map)")).toBeVisible();
			expect(screen.getByText("Ban (map)")).toBeVisible();
			expect(screen.getByText("Pick (mode)")).toBeVisible();
			expect(screen.getByText("Ban (mode)")).toBeVisible();
		});

		test("renders section tab headers", async () => {
			renderComponent();

			expect(screen.getByText("Before set")).toBeVisible();
			expect(screen.getByText("After map")).toBeVisible();
		});

		test("renders Add step button", async () => {
			renderComponent();

			expect(screen.getByRole("button", { name: "Add step" })).toBeVisible();
		});

		test("renders empty step placeholders for active section", async () => {
			const { container } = renderComponent();

			const whoPlaceholders = container.querySelectorAll(
				'[class*="dropZoneWho"]',
			);
			const actionPlaceholders = container.querySelectorAll(
				'[class*="dropZoneAction"]',
			);

			expect(whoPlaceholders.length).toBe(1);
			expect(actionPlaceholders.length).toBe(1);
		});

		test("does not call onChange on mount", async () => {
			const onChange = vi.fn();
			renderComponent({ onChange });

			expect(onChange).not.toHaveBeenCalled();
		});
	});

	describe("add step", () => {
		test("clicking Add step adds a new step row", async () => {
			const { container } = renderComponent();

			await userEvent.click(screen.getByRole("button", { name: "Add step" }));

			const stepRows = container.querySelectorAll('[class*="stepRow"]');
			expect(stepRows.length).toBe(2);
		});

		test("adding step calls onChange with null", async () => {
			const onChange = vi.fn();
			renderComponent({ onChange });

			await userEvent.click(screen.getByRole("button", { name: "Add step" }));

			expect(onChange).toHaveBeenCalledWith(null);
		});
	});

	describe("remove step", () => {
		test("remove button is hidden when section has only one step", async () => {
			const { container } = renderComponent();

			const removeButtons = container.querySelectorAll(
				'[class*="removeButton"]',
			);

			for (const btn of removeButtons) {
				expect(btn.className).toContain("removeButtonHidden");
			}
		});

		test("clicking remove reduces step count back to one", async () => {
			const { container } = renderComponent();

			await userEvent.click(screen.getByRole("button", { name: "Add step" }));

			let stepRows = container.querySelectorAll('[class*="stepRow"]');
			expect(stepRows.length).toBe(2);

			await userEvent.click(screen.getAllByLabelText("Remove step")[0]);

			stepRows = container.querySelectorAll('[class*="stepRow"]');
			expect(stepRows.length).toBe(1);
		});

		test("remove button becomes hidden after removing down to one step", async () => {
			const { container } = renderComponent();

			await userEvent.click(screen.getByRole("button", { name: "Add step" }));

			await userEvent.click(screen.getAllByLabelText("Remove step")[0]);

			const removeButtons = container.querySelectorAll(
				'[aria-label="Remove step"]',
			);
			for (const btn of removeButtons) {
				expect(btn.className).toContain("removeButtonHidden");
			}
		});
	});

	describe("pre-populated value", () => {
		test("renders filled drop zones from value prop", async () => {
			const value: CustomPickBanFlow = {
				preSet: [
					{ action: "BAN", side: "HIGHER_SEED" },
					{ action: "PICK", side: "LOWER_SEED" },
				],
				postGame: [{ action: "PICK", side: "WINNER" }],
			};

			const { container } = renderComponent({ value });

			const filledDropZones = container.querySelectorAll(
				'[class*="dropZoneFilled"]',
			);
			const filledTexts = Array.from(filledDropZones).map(
				(el) => el.textContent,
			);

			expect(filledTexts).toContain("Higher Seed");
			expect(filledTexts).toContain("Ban (map)");
			expect(filledTexts).toContain("Lower Seed");
			expect(filledTexts).toContain("Pick (map)");
		});

		test("ROLL steps do not render who drop zone", async () => {
			const value: CustomPickBanFlow = {
				preSet: [{ action: "ROLL" }],
				postGame: [{ action: "PICK", side: "ALPHA" }],
			};

			const { container } = renderComponent({ value });

			const filledDropZones = container.querySelectorAll(
				'[class*="dropZoneFilled"]',
			);
			const filledTexts = Array.from(filledDropZones).map(
				(el) => el.textContent,
			);
			expect(filledTexts).toContain("Random legal map");

			const whoDropZones = container.querySelectorAll('[class*="dropZoneWho"]');
			expect(whoDropZones.length).toBe(0);
		});

		test("does not call onChange on mount with complete value", async () => {
			const onChange = vi.fn();
			const value: CustomPickBanFlow = {
				preSet: [{ action: "PICK", side: "HIGHER_SEED" }],
				postGame: [{ action: "PICK", side: "WINNER" }],
			};

			renderComponent({ value, onChange });

			expect(onChange).not.toHaveBeenCalled();
		});
	});

	describe("validation errors", () => {
		test("shows missing action error for empty steps", async () => {
			renderComponent();

			expect(screen.getByText("Every step must have an action")).toBeVisible();
		});

		test("shows no validation errors for complete valid flow", async () => {
			const value: CustomPickBanFlow = {
				preSet: [{ action: "PICK", side: "HIGHER_SEED" }],
				postGame: [{ action: "PICK", side: "WINNER" }],
			};

			const { container } = renderComponent({ value });

			const errors = container.querySelectorAll('[class*="validationError"]');
			expect(errors.length).toBe(0);
		});

		test("shows last step must be pick or roll error", async () => {
			const value: CustomPickBanFlow = {
				preSet: [{ action: "BAN", side: "HIGHER_SEED" }],
				postGame: [{ action: "PICK", side: "WINNER" }],
			};

			renderComponent({ value });

			expect(
				screen.getByText(
					"Last step must be Pick or Roll (to determine the map)",
				),
			).toBeVisible();
		});

		test("shows too many map picks error", async () => {
			const value: CustomPickBanFlow = {
				preSet: [
					{ action: "PICK", side: "HIGHER_SEED" },
					{ action: "PICK", side: "LOWER_SEED" },
				],
				postGame: [{ action: "PICK", side: "WINNER" }],
			};

			renderComponent({ value });

			expect(
				screen.getByText("At most one Pick or Roll per section"),
			).toBeVisible();
		});
	});
});
