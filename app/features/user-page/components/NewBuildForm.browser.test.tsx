import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { BuildAbilitiesTupleWithUnknown } from "~/modules/in-game-lists/types";
import { NewBuildForm } from "./NewBuildForm";

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

function renderForm(options?: {
	defaultValues?: Record<string, unknown>;
	gearIdToAbilities?: Record<string, BuildAbilitiesTupleWithUnknown[number]>;
	isEditing?: boolean;
}) {
	const router = createMemoryRouter(
		[
			{
				path: "/",
				element: (
					<NewBuildForm
						defaultValues={options?.defaultValues}
						gearIdToAbilities={options?.gearIdToAbilities ?? {}}
						isEditing={options?.isEditing}
					/>
				),
			},
		],
		{ initialEntries: ["/"] },
	);

	return render(<RouterProvider router={router} />);
}

const GEAR_ERROR_MESSAGE = "Fill all gear slots or leave all empty";

describe("NewBuildForm", () => {
	beforeEach(() => {
		mockFetcherData = undefined;
	});

	describe("gear validation - all or none", () => {
		test("shows error when only head gear is provided via default values", async () => {
			const screen = await renderForm({
				defaultValues: {
					weapons: [{ id: 0, isFavorite: false }],
					title: "Test Build",
					head: 1,
					clothes: null,
					shoes: null,
					abilities: [
						["LDE", "ISM", "ISM", "ISM"],
						["NS", "SSU", "SSU", "SSU"],
						["SJ", "SRU", "SRU", "SRU"],
					],
				},
			});

			await screen.getByRole("button", { name: "Submit" }).click();

			await expect.element(screen.getByText(GEAR_ERROR_MESSAGE)).toBeVisible();
		});

		test("shows error when head and clothes selected but not shoes", async () => {
			const screen = await renderForm({
				defaultValues: {
					weapons: [{ id: 0, isFavorite: false }],
					title: "Test Build",
					head: 1,
					clothes: 1,
					shoes: null,
					abilities: [
						["LDE", "ISM", "ISM", "ISM"],
						["NS", "SSU", "SSU", "SSU"],
						["SJ", "SRU", "SRU", "SRU"],
					],
				},
			});

			await screen.getByRole("button", { name: "Submit" }).click();

			await expect.element(screen.getByText(GEAR_ERROR_MESSAGE)).toBeVisible();
		});

		test("no gear error when all three gear pieces are selected", async () => {
			const screen = await renderForm({
				defaultValues: {
					weapons: [{ id: 0, isFavorite: false }],
					title: "Test Build",
					head: 1,
					clothes: 1,
					shoes: 1,
					abilities: [
						["LDE", "ISM", "ISM", "ISM"],
						["NS", "SSU", "SSU", "SSU"],
						["SJ", "SRU", "SRU", "SRU"],
					],
				},
			});

			await screen.getByRole("button", { name: "Submit" }).click();

			const gearError = screen.container.querySelector("#head-error");
			expect(gearError?.textContent?.includes(GEAR_ERROR_MESSAGE)).toBeFalsy();
		});

		test("no gear error when no gear is selected", async () => {
			const screen = await renderForm({
				defaultValues: {
					weapons: [{ id: 0, isFavorite: false }],
					title: "Test Build",
					head: null,
					clothes: null,
					shoes: null,
					abilities: [
						["LDE", "ISM", "ISM", "ISM"],
						["NS", "SSU", "SSU", "SSU"],
						["SJ", "SRU", "SRU", "SRU"],
					],
				},
			});

			await screen.getByRole("button", { name: "Submit" }).click();

			const gearError = screen.container.querySelector("#head-error");
			expect(gearError?.textContent?.includes(GEAR_ERROR_MESSAGE)).toBeFalsy();
		});
	});

	describe("abilities validation", () => {
		test("shows error when abilities contain UNKNOWN values", async () => {
			const screen = await renderForm({
				defaultValues: {
					weapons: [{ id: 0, isFavorite: false }],
					title: "Test Build",
				},
			});

			await screen.getByRole("button", { name: "Submit" }).click();

			const abilitiesError = screen.container.querySelector("#abilities-error");
			expect(abilitiesError?.textContent).toBe("This field is required");
		});

		test("no abilities error when all abilities are set", async () => {
			const screen = await renderForm({
				defaultValues: {
					weapons: [{ id: 0, isFavorite: false }],
					title: "Test Build",
					abilities: [
						["LDE", "ISM", "ISM", "ISM"],
						["NS", "SSU", "SSU", "SSU"],
						["SJ", "SRU", "SRU", "SRU"],
					],
				},
			});

			await screen.getByRole("button", { name: "Submit" }).click();

			const abilitiesError = screen.container.querySelector("#abilities-error");
			expect(abilitiesError?.textContent).toBeFalsy();
		});
	});

	describe("ability prefill from gear", () => {
		test("prefills abilities when selecting gear with known abilities", async () => {
			const screen = await renderForm({
				defaultValues: {
					weapons: [{ id: 0, isFavorite: false }],
					title: "Test Build",
				},
				gearIdToAbilities: {
					HEAD_21000: ["LDE", "ISM", "ISM", "ISM"],
				},
			});

			const getUnknownCount = () =>
				screen.container.querySelectorAll('[data-testid="UNKNOWN-ability"]')
					.length;

			expect(getUnknownCount()).toBe(12);

			const headGearSelect = screen.getByTestId("HEAD-gear-select");
			await userEvent.click(headGearSelect.element());

			const searchInput = screen.getByPlaceholder("Search gear...");
			await userEvent.type(searchInput.element(), "Headlamp Helmet");
			await userEvent.keyboard("{Enter}");

			expect(getUnknownCount()).toBe(8);
		});
	});
});
