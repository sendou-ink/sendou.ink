import { add } from "date-fns";
import { describe, expect, it } from "vitest";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import * as Association from "./Association";

describe("isVisible", () => {
	it("should return true if visibility is null", () => {
		const args: Association.IsVisibleArgs = {
			visibility: null,
			associations: null,
		};
		expect(Association.isVisible(args)).toBe(true);
	});

	it("should return false if not member of the association", () => {
		const args: Association.IsVisibleArgs = {
			visibility: { forAssociation: 1 },
			associations: null,
		};
		expect(Association.isVisible(args)).toBe(false);
	});

	it("should return true if member of the association", () => {
		const args: Association.IsVisibleArgs = {
			visibility: { forAssociation: 1 },
			associations: {
				actual: [{ id: 1 }],
				virtual: [],
			},
		};
		expect(Association.isVisible(args)).toBe(true);
	});

	it("should return true if member of the virtual association", () => {
		const args: Association.IsVisibleArgs = {
			visibility: { forAssociation: "+1" },
			associations: {
				actual: [],
				virtual: ["+1"],
			},
		};
		expect(Association.isVisible(args)).toBe(true);
	});

	it("should return false if not yet visible", () => {
		const visibleAt = add(new Date(), { days: 1 });

		const args: Association.IsVisibleArgs = {
			visibility: {
				forAssociation: "+1",
				notFoundInstructions: [
					{ at: dateToDatabaseTimestamp(visibleAt), forAssociation: 1 },
				],
			},
			associations: {
				actual: [{ id: 1 }],
				virtual: [],
			},
		};
		expect(Association.isVisible(args)).toBe(false);
	});

	it("should return true if has become visible", () => {
		const visibleAt = add(new Date(), { days: 1 });

		const args: Association.IsVisibleArgs = {
			visibility: {
				forAssociation: "+1",
				notFoundInstructions: [
					{ at: dateToDatabaseTimestamp(visibleAt), forAssociation: 1 },
				],
			},
			time: add(new Date(), { days: 2 }),
			associations: {
				actual: [{ id: 1 }],
				virtual: [],
			},
		};
		expect(Association.isVisible(args)).toBe(true);
	});

	it("should return true if has become public", () => {
		const visibleAt = add(new Date(), { days: 1 });

		const args: Association.IsVisibleArgs = {
			visibility: {
				forAssociation: "+1",
				notFoundInstructions: [
					{ at: dateToDatabaseTimestamp(visibleAt), forAssociation: null },
				],
			},
			time: add(new Date(), { days: 2 }),
			associations: {
				actual: [],
				virtual: [],
			},
		};
		expect(Association.isVisible(args)).toBe(true);
	});

	it("should return true if viewer is a friend of the content owner", () => {
		const args: Association.IsVisibleArgs = {
			visibility: { forAssociation: "FRIENDS" },
			associations: {
				actual: [],
				virtual: [],
				friendIds: [42],
			},
			contentOwnerUserId: 42,
		};
		expect(Association.isVisible(args)).toBe(true);
	});

	it("should return false if viewer is not a friend of the content owner", () => {
		const args: Association.IsVisibleArgs = {
			visibility: { forAssociation: "FRIENDS" },
			associations: {
				actual: [],
				virtual: [],
				friendIds: [99],
			},
			contentOwnerUserId: 42,
		};
		expect(Association.isVisible(args)).toBe(false);
	});

	it("should return false for FRIENDS visibility when not logged in", () => {
		const args: Association.IsVisibleArgs = {
			visibility: { forAssociation: "FRIENDS" },
			associations: null,
		};
		expect(Association.isVisible(args)).toBe(false);
	});

	it("should return true when FRIENDS visibility becomes public via notFoundInstructions", () => {
		const visibleAt = add(new Date(), { days: 1 });

		const args: Association.IsVisibleArgs = {
			visibility: {
				forAssociation: "FRIENDS",
				notFoundInstructions: [
					{ at: dateToDatabaseTimestamp(visibleAt), forAssociation: null },
				],
			},
			time: add(new Date(), { days: 2 }),
			associations: {
				actual: [],
				virtual: [],
				friendIds: [],
			},
		};
		expect(Association.isVisible(args)).toBe(true);
	});

	it("should return true if has become public (no associations)", () => {
		const visibleAt = add(new Date(), { days: 1 });

		const args: Association.IsVisibleArgs = {
			visibility: {
				forAssociation: "+1",
				notFoundInstructions: [
					{ at: dateToDatabaseTimestamp(visibleAt), forAssociation: null },
				],
			},
			time: add(new Date(), { days: 2 }),
			associations: null,
		};
		expect(Association.isVisible(args)).toBe(true);
	});
});
