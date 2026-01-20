import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { FormField } from "~/form/FormField";
import type { WeaponPoolItem } from "~/form/fields/WeaponPoolFormField";
import { SendouForm } from "~/form/SendouForm";
import type {
	MainWeaponId,
	ModeShort,
	StageId,
} from "~/modules/in-game-lists/types";
import { vodFormBaseSchema } from "../vods-schemas";

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

interface MatchDefaults {
	startsAt?: string;
	mode?: ModeShort;
	stageId?: StageId;
	weapon?: MainWeaponId;
	weaponsTeamOne?: WeaponPoolItem[];
	weaponsTeamTwo?: WeaponPoolItem[];
}

function createDefaultMatch(overrides?: MatchDefaults) {
	return {
		startsAt: overrides?.startsAt ?? "0:00",
		mode: overrides?.mode ?? ("SZ" as ModeShort),
		stageId: overrides?.stageId ?? (1 as StageId),
		weapon: overrides?.weapon,
		weaponsTeamOne: overrides?.weaponsTeamOne ?? ([] as WeaponPoolItem[]),
		weaponsTeamTwo: overrides?.weaponsTeamTwo ?? ([] as WeaponPoolItem[]),
	};
}

function createDefaultValues(overrides?: {
	matches?: MatchDefaults[];
	[key: string]: unknown;
}) {
	const matches = overrides?.matches
		? overrides.matches.map((m) => createDefaultMatch(m))
		: [createDefaultMatch()];

	return {
		youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
		title: "Test VOD",
		date: new Date(),
		type: "TOURNAMENT" as const,
		pov: { type: "USER" as const },
		...overrides,
		matches,
	};
}

function renderForm(options?: {
	defaultValues?: { matches?: MatchDefaults[]; [key: string]: unknown };
}) {
	const router = createMemoryRouter(
		[
			{
				path: "/",
				element: (
					<SendouForm
						title="Test VOD Form"
						schema={vodFormBaseSchema}
						defaultValues={createDefaultValues(options?.defaultValues)}
					>
						{({ names }) => (
							<>
								{Object.keys(names)
									.filter((name) => name !== "pov")
									.map((name) => (
										<FormField key={name} name={name} />
									))}
							</>
						)}
					</SendouForm>
				),
			},
		],
		{ initialEntries: ["/"] },
	);

	return render(<RouterProvider router={router} />);
}

describe("VodForm", () => {
	beforeEach(() => {
		mockFetcherData = undefined;
	});

	describe("timestamp format validation", () => {
		test("accepts MM:SS format", async () => {
			const screen = await renderForm({
				defaultValues: {
					matches: [createDefaultMatch({ startsAt: "10:22" })],
				},
			});

			await screen.getByRole("button", { name: "Submit" }).click();

			const timestampError = screen.container.querySelector(
				'[id*="startsAt-error"]',
			);
			expect(timestampError?.textContent).toBeFalsy();
		});

		test("accepts HH:MM:SS format", async () => {
			const screen = await renderForm({
				defaultValues: {
					matches: [createDefaultMatch({ startsAt: "1:10:22" })],
				},
			});

			await screen.getByRole("button", { name: "Submit" }).click();

			const timestampError = screen.container.querySelector(
				'[id*="startsAt-error"]',
			);
			expect(timestampError?.textContent).toBeFalsy();
		});

		test("rejects invalid timestamp format", async () => {
			const screen = await renderForm({
				defaultValues: {
					matches: [createDefaultMatch({ startsAt: "invalid" })],
				},
			});

			await screen.getByRole("button", { name: "Submit" }).click();

			const timestampError = screen.container.querySelector(
				'[id="matches[0].startsAt-error"]',
			);
			expect(timestampError?.textContent).toBe(
				"Invalid time format. Use HH:MM:SS or MM:SS",
			);
		});

		test("rejects timestamp with only seconds", async () => {
			const screen = await renderForm({
				defaultValues: {
					matches: [createDefaultMatch({ startsAt: "22" })],
				},
			});

			await screen.getByRole("button", { name: "Submit" }).click();

			const timestampError = screen.container.querySelector(
				'[id="matches[0].startsAt-error"]',
			);
			expect(timestampError?.textContent).toBe(
				"Invalid time format. Use HH:MM:SS or MM:SS",
			);
		});
	});

	describe("array operations", () => {
		test("can add multiple matches", async () => {
			const screen = await renderForm();

			const addButton = screen.getByRole("button", { name: "Add" });
			await userEvent.click(addButton.element());

			const fieldsets = screen.container.querySelectorAll("fieldset");
			expect(fieldsets.length).toBe(2);
		});

		test("can remove matches when more than 1", async () => {
			const screen = await renderForm({
				defaultValues: {
					matches: [
						createDefaultMatch({ startsAt: "0:00" }),
						createDefaultMatch({ startsAt: "5:00", mode: "TC" }),
					],
				},
			});

			let fieldsets = screen.container.querySelectorAll("fieldset");
			expect(fieldsets.length).toBe(2);

			const removeButtons = screen.container.querySelectorAll(
				'button[aria-label="Remove item"]',
			);
			await userEvent.click(removeButtons[0]);

			fieldsets = screen.container.querySelectorAll("fieldset");
			expect(fieldsets.length).toBe(1);
		});

		test("cannot add more than 50 matches", async () => {
			const fiftyMatches = Array.from({ length: 50 }, () =>
				createDefaultMatch(),
			);

			const screen = await renderForm({
				defaultValues: { matches: fiftyMatches },
			});

			const addButton = screen.getByRole("button", { name: "Add" });
			await expect.element(addButton).toBeDisabled();
		});
	});
});
