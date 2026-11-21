import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { typicalPlan } from "../tests/fixtures";
import * as PlanAutosave from "./PlanAutosave";
import * as PlanCommands from "./PlanCommands";
import type { PlanDocument } from "./PlanDocument";
import * as PlanEditor from "./PlanEditor";

describe("PlanAutosave.start", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	const setup = () => {
		const editor = PlanEditor.create(typicalPlan());
		const saved: PlanDocument[] = [];
		const autosave = PlanAutosave.start({
			editor,
			save: (document) => saved.push(document),
		});

		return { editor, saved, autosave };
	};

	test("saves the plan once a moment after a burst of changes", () => {
		const { editor, saved } = setup();

		for (const status of ["dead", "sharking", "jumping"] as const) {
			editor.apply(PlanCommands.setStatus(editor.getDocument(), 0, status));
			vi.advanceTimersByTime(100);
		}
		expect(saved).toEqual([]);

		vi.advanceTimersByTime(1_000);
		expect(saved).toEqual([editor.getDocument()]);
		expect(saved[0].slots[0]?.status).toBe("jumping");
	});

	test("saves nothing without a change", () => {
		const { saved, autosave } = setup();

		vi.advanceTimersByTime(1_000);
		autosave.flush();

		expect(saved).toEqual([]);
	});

	test("flush saves a pending change right away, once", () => {
		const { editor, saved, autosave } = setup();

		editor.apply(PlanCommands.setStatus(editor.getDocument(), 0, "dead"));
		autosave.flush();
		vi.advanceTimersByTime(1_000);

		expect(saved).toEqual([editor.getDocument()]);
	});

	test("stop saves what is pending and then follows the editor no more", () => {
		const { editor, saved, autosave } = setup();

		editor.apply(PlanCommands.setStatus(editor.getDocument(), 0, "dead"));
		autosave.stop();
		editor.apply(PlanCommands.setStatus(editor.getDocument(), 1, "dead"));
		vi.advanceTimersByTime(1_000);

		expect(saved).toHaveLength(1);
		expect(saved[0].slots[1]?.status).toBe("normal");
	});
});
