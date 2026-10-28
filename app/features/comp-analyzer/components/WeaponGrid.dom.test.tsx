import { describe, expect, test, vi } from "bun:test";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { WeaponGrid } from "./WeaponGrid";

const defaultProps: ComponentProps<typeof WeaponGrid> = {
	selectedWeaponIds: [],
	onWeaponClick: vi.fn(),
	categorization: "category",
	onCategorizationChange: vi.fn(),
	isCollapsed: false,
	onToggleCollapse: vi.fn(),
};

function renderWeaponGrid(
	props: Partial<ComponentProps<typeof WeaponGrid>> = {},
) {
	const router = createMemoryRouter(
		[
			{
				path: "/",
				element: <WeaponGrid {...defaultProps} {...props} />,
			},
		],
		{ initialEntries: ["/"] },
	);

	return render(<RouterProvider router={router} />);
}

describe("WeaponGrid", () => {
	describe("collapse toggle", () => {
		test("renders with collapse toggle visible", async () => {
			renderWeaponGrid();

			expect(screen.getByText("Hide weapon selector")).toBeVisible();
		});

		test("shows 'Show weapon selector' when collapsed", async () => {
			renderWeaponGrid({ isCollapsed: true });

			expect(screen.getByText("Show weapon selector")).toBeVisible();
		});

		test("calls onToggleCollapse when toggle button clicked", async () => {
			const onToggleCollapse = vi.fn();
			renderWeaponGrid({ onToggleCollapse });

			await userEvent.click(screen.getByText("Hide weapon selector"));

			expect(onToggleCollapse).toHaveBeenCalledTimes(1);
		});

		test("hides weapon grid content when collapsed", async () => {
			const { container } = renderWeaponGrid({ isCollapsed: true });

			expect(screen.getByText("Show weapon selector")).toBeVisible();
			const groupByLabel = container.querySelector(
				'[class*="categorizationToggle"]',
			);
			expect(groupByLabel).toBeNull();
		});
	});

	describe("categorization", () => {
		test("shows categorization radio buttons when expanded", async () => {
			renderWeaponGrid();

			expect(screen.getByText("Weapon type")).toBeVisible();
			expect(screen.getByText("Sub weapon")).toBeVisible();
			expect(screen.getByText("Special weapon")).toBeVisible();
		});

		test("calls onCategorizationChange when radio button clicked", async () => {
			const onCategorizationChange = vi.fn();
			renderWeaponGrid({ onCategorizationChange });

			await userEvent.click(screen.getByText("Sub weapon"));

			expect(onCategorizationChange).toHaveBeenCalledWith("sub");
		});

		test("shows correct radio button as checked", async () => {
			renderWeaponGrid({ categorization: "special" });

			const specialRadio = screen.getByRole("radio", {
				name: "Special weapon",
			});
			expect(specialRadio).toBeChecked();
		});
	});

	describe("weapon selection", () => {
		test("calls onWeaponClick when weapon button clicked", async () => {
			const onWeaponClick = vi.fn();
			const { container } = renderWeaponGrid({ onWeaponClick });

			const weaponButtons = container.querySelectorAll("button[title]");
			const firstWeaponButton = weaponButtons[1] as HTMLElement | undefined;
			if (firstWeaponButton) {
				firstWeaponButton.click();
				expect(onWeaponClick).toHaveBeenCalledTimes(1);
			}
		});

		test("disables unselected weapons when max is reached", async () => {
			const { container } = renderWeaponGrid({
				selectedWeaponIds: [0, 10, 20, 30],
			});

			const disabledButtons = container.querySelectorAll(
				"button[title][disabled]",
			);
			expect(disabledButtons.length).toBeGreaterThan(0);
		});

		test("shows selected weapons with selected style", async () => {
			const { container } = renderWeaponGrid({
				selectedWeaponIds: [0],
			});

			const selectedButtons = container.querySelectorAll(
				'[class*="weaponButtonSelected"]',
			);
			expect(selectedButtons.length).toBeGreaterThan(0);
		});
	});
});
