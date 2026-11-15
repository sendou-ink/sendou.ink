import type { ComponentProps } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { WeaponGrid } from "./WeaponGrid";

const defaultProps: ComponentProps<typeof WeaponGrid> = {
	selectedWeaponIds: [],
	onWeaponClick: vi.fn(),
	categorization: "category",
	onCategorizationChange: vi.fn(),
	isCollapsed: false,
	onToggleCollapse: vi.fn(),
	actions: null,
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
			const screen = await renderWeaponGrid();

			await expect
				.element(screen.getByText("Hide weapon selector"))
				.toBeVisible();
		});

		test("shows 'Show weapon selector' when collapsed", async () => {
			const screen = await renderWeaponGrid({ isCollapsed: true });

			await expect
				.element(screen.getByText("Show weapon selector"))
				.toBeVisible();
		});

		test("calls onToggleCollapse when toggle button clicked", async () => {
			const onToggleCollapse = vi.fn();
			const screen = await renderWeaponGrid({ onToggleCollapse });

			await screen.getByText("Hide weapon selector").click();

			expect(onToggleCollapse).toHaveBeenCalledTimes(1);
		});

		test("hides weapon grid content when collapsed", async () => {
			const screen = await renderWeaponGrid({ isCollapsed: true });

			await expect
				.element(screen.getByText("Show weapon selector"))
				.toBeVisible();
			const groupByLabel = screen.container.querySelector(
				'[class*="categorizationToggle"]',
			);
			expect(groupByLabel).toBeNull();
		});
	});

	describe("categorization", () => {
		test("shows categorization radio buttons when expanded", async () => {
			const screen = await renderWeaponGrid();

			await expect.element(screen.getByText("Weapon type")).toBeVisible();
			await expect.element(screen.getByText("Sub weapon")).toBeVisible();
			await expect.element(screen.getByText("Special weapon")).toBeVisible();
		});

		test("calls onCategorizationChange when radio button clicked", async () => {
			const onCategorizationChange = vi.fn();
			const screen = await renderWeaponGrid({ onCategorizationChange });

			await screen.getByText("Sub weapon").click();

			expect(onCategorizationChange).toHaveBeenCalledWith("sub");
		});

		test("shows correct radio button as checked", async () => {
			const screen = await renderWeaponGrid({ categorization: "special" });

			const specialRadio = screen.getByRole("radio", {
				name: "Special weapon",
			});
			await expect.element(specialRadio).toBeChecked();
		});
	});

	describe("weapon selection", () => {
		test("calls onWeaponClick when weapon button clicked", async () => {
			const onWeaponClick = vi.fn();
			const screen = await renderWeaponGrid({ onWeaponClick });

			const weaponButtons = screen.container.querySelectorAll("button[title]");
			const firstWeaponButton = weaponButtons[1] as HTMLElement | undefined;
			if (firstWeaponButton) {
				firstWeaponButton.click();
				expect(onWeaponClick).toHaveBeenCalledTimes(1);
			}
		});

		test("disables unselected weapons when max is reached", async () => {
			const screen = await renderWeaponGrid({
				selectedWeaponIds: [0, 10, 20, 30],
			});

			const disabledButtons = screen.container.querySelectorAll(
				"button[title][disabled]",
			);
			expect(disabledButtons.length).toBeGreaterThan(0);
		});

		test("shows selected weapons with selected style", async () => {
			const screen = await renderWeaponGrid({
				selectedWeaponIds: [0],
			});

			const selectedButtons = screen.container.querySelectorAll(
				'[class*="weaponButtonSelected"]',
			);
			expect(selectedButtons.length).toBeGreaterThan(0);
		});
	});

	describe("search", () => {
		test("shows only the weapons matching the search", async () => {
			const screen = await renderWeaponGrid();

			await screen.getByTestId("weapon-search").fill("sploosh");

			await expect
				.element(screen.getByTestId("weapon-button-0"))
				.toBeInTheDocument();
			await expect
				.element(screen.getByTestId("weapon-button-10"))
				.not.toBeInTheDocument();
			await expect
				.element(screen.getByText("Blasters"))
				.not.toBeInTheDocument();
		});

		test("clears the search after picking a weapon", async () => {
			const onWeaponClick = vi.fn();
			const screen = await renderWeaponGrid({ onWeaponClick });
			const search = screen.getByTestId("weapon-search");

			await search.fill("sploosh");
			await screen.getByTestId("weapon-button-0").click();

			expect(onWeaponClick).toHaveBeenCalledWith(0);
			await expect.element(search).toHaveValue("");
			await expect
				.element(screen.getByTestId("weapon-button-10"))
				.toBeInTheDocument();
		});

		test("expands the collapsed grid when typing in the search", async () => {
			const onToggleCollapse = vi.fn();
			const screen = await renderWeaponGrid({
				isCollapsed: true,
				onToggleCollapse,
			});

			await screen.getByTestId("weapon-search").fill("s");

			expect(onToggleCollapse).toHaveBeenCalledTimes(1);
		});

		test("shows no results when nothing matches", async () => {
			const screen = await renderWeaponGrid();

			await screen.getByTestId("weapon-search").fill("xyzzy");

			await expect.element(screen.getByText("No results")).toBeVisible();
		});
	});
});
