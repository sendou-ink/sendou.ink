import { describe, expect, test } from "vitest";
import { typicalPlan } from "../tests/fixtures";
import * as PlanDocument from "./PlanDocument";
import * as PlanEditor from "./PlanEditor";
import * as PlanHotkeys from "./PlanHotkeys";
import * as PlanSelection from "./PlanSelection";
import * as PlanTools from "./PlanTools";

const PLAYER: PlanSelection.Selection = { type: "player", slot: 0 };
const DRAWINGS: PlanSelection.Selection = { type: "drawings", ids: ["a"] };

function keyPress(
	key: string,
	{
		code = `Key${key.toUpperCase()}`,
		...modifiers
	}: Partial<Omit<PlanHotkeys.KeyPress, "key">> = {},
): PlanHotkeys.KeyPress {
	return {
		key,
		code,
		shiftKey: false,
		ctrlKey: false,
		metaKey: false,
		altKey: false,
		...modifiers,
	};
}

function setUp(selected: PlanSelection.Selection = null) {
	const editor = PlanEditor.create(typicalPlan());
	const selection = PlanSelection.create();
	selection.set(selected);
	const tools = PlanTools.create();
	const run = (command: PlanHotkeys.HotkeyCommand) =>
		PlanHotkeys.runOnPlan(command, { editor, selection, tools });

	return { editor, selection, tools, run };
}

describe("PlanHotkeys.match", () => {
	test.each([
		{ why: "Ctrl+Z", press: keyPress("z", { ctrlKey: true }), command: "undo" },
		{ why: "⌘Z", press: keyPress("z", { metaKey: true }), command: "undo" },
		{
			why: "⌘⇧Z typed as a capital",
			press: keyPress("Z", { metaKey: true, shiftKey: true }),
			command: "redo",
		},
		{ why: "Ctrl+Y", press: keyPress("y", { ctrlKey: true }), command: "redo" },
		{ why: "a tool letter", press: keyPress("p"), command: "tool" },
		{
			why: "a digit typed with Shift on AZERTY",
			press: keyPress("&", { code: "Digit1", shiftKey: false }),
			command: "slot",
		},
		{
			why: "a digit of the number pad",
			press: keyPress("8", { code: "Numpad8" }),
			command: "slot",
		},
		{
			why: "Shift+1",
			press: keyPress("!", { code: "Digit1", shiftKey: true }),
			command: "fitView",
		},
		{
			why: "? typed with Shift",
			press: keyPress("?", { code: "Slash", shiftKey: true }),
			command: "cheatSheet",
		},
		{
			why: "+ typed with Shift",
			press: keyPress("+", { code: "Equal", shiftKey: true }),
			command: "bigger",
		},
		{
			why: "a letter on a Cyrillic layout, by its position",
			press: keyPress("з", { code: "KeyP" }),
			command: "tool",
		},
	])("$why runs $command", ({ press, command }) => {
		expect(PlanHotkeys.match(press, null)?.type).toBe(command);
	});

	test.each([
		{ why: "Alt held", press: keyPress("p", { altKey: true }) },
		{
			why: "Ctrl held with a tool letter",
			press: keyPress("p", { ctrlKey: true }),
		},
		{
			why: "Shift held with a tool letter",
			press: keyPress("P", { shiftKey: true }),
		},
		{ why: "a key with no hotkey", press: keyPress("g") },
		{
			why: "a held key that doesn't repeat",
			press: keyPress("p", { repeat: true }),
		},
		{ why: "the pan key", press: keyPress(" ", { code: "Space" }) },
	])("nothing for $why", ({ press }) => {
		expect(PlanHotkeys.match(press, null)).toBeNull();
	});

	test.each([
		{
			why: "[ with AltGr on German Windows",
			press: keyPress("[", { code: "Digit8", ctrlKey: true, altKey: true }),
			command: "sendToBack",
		},
		{
			why: "[ with Option on a German Mac",
			press: keyPress("[", { code: "Digit5", altKey: true }),
			command: "sendToBack",
		},
		{
			why: "] on a US layout",
			press: keyPress("]", { code: "BracketRight" }),
			command: "bringToFront",
		},
	])("$why runs $command with drawings selected", ({ press, command }) => {
		expect(PlanHotkeys.match(press, DRAWINGS)?.type).toBe(command);
	});

	test.each([
		{
			why: "= typed with Shift on a digit key (German)",
			press: keyPress("=", { code: "Digit0", shiftKey: true }),
			command: "bigger",
		},
		{
			why: "Ctrl+- (the browser's zoom)",
			press: keyPress("-", { code: "Minus", ctrlKey: true }),
			command: null,
		},
		{
			why: "⌘+= (the browser's zoom)",
			press: keyPress("=", { code: "Equal", metaKey: true }),
			command: null,
		},
	])("$why runs $command", ({ press, command }) => {
		expect(PlanHotkeys.match(press, null)?.type ?? null).toBe(command);
	});

	test("a held undo repeats", () => {
		expect(
			PlanHotkeys.match(keyPress("z", { ctrlKey: true, repeat: true }), null),
		).toEqual({ type: "undo" });
	});

	test("the number keys pick slots 1–8 in order", () => {
		expect(
			["1", "2", "3", "4", "5", "6", "7", "8"].map((digit) =>
				PlanHotkeys.match(keyPress(digit, { code: `Digit${digit}` }), null),
			),
		).toEqual([0, 1, 2, 3, 4, 5, 6, 7].map((slot) => ({ type: "slot", slot })));
	});

	test.each([
		{ why: "nothing", selected: null, command: null },
		{ why: "a player", selected: PLAYER, command: "removePlayer" },
		{ why: "drawings", selected: DRAWINGS, command: "deleteDrawings" },
	])("Delete with $why selected runs $command", ({ selected, command }) => {
		expect(
			PlanHotkeys.match(keyPress("Delete", { code: "Delete" }), selected)
				?.type ?? null,
		).toBe(command);
	});

	test("state letters only apply with a player selected", () => {
		expect(PlanHotkeys.match(keyPress("d"), null)).toBeNull();
		expect(PlanHotkeys.match(keyPress("d"), PLAYER)).toEqual({
			type: "status",
			status: "dead",
		});
	});

	test("no two hotkeys share keys where both apply", () => {
		const seen = new Map<string, PlanHotkeys.Hotkey["scope"][]>();
		for (const hotkey of PlanHotkeys.HOTKEYS) {
			for (const keys of hotkey.keys) {
				const scopes = seen.get(keys) ?? [];
				expect(
					scopes.filter(
						(scope) =>
							scope === hotkey.scope ||
							scope === "always" ||
							hotkey.scope === "always",
					),
					keys,
				).toEqual([]);
				seen.set(keys, [...scopes, hotkey.scope]);
			}
		}
	});
});

describe("PlanHotkeys.isPanKey", () => {
	test.each([
		{ why: "Space", press: keyPress(" ", { code: "Space" }), isPan: true },
		{
			why: "Space with Shift held",
			press: keyPress(" ", { code: "Space", shiftKey: true }),
			isPan: true,
		},
		{ why: "a letter", press: keyPress("p"), isPan: false },
	])("$why: $isPan", ({ press, isPan }) => {
		expect(PlanHotkeys.isPanKey(press)).toBe(isPan);
	});
});

describe("PlanHotkeys.keycaps", () => {
	test.each([
		{ keys: "Mod+Shift+z", isMac: true, keycaps: ["⌘", "⇧", "Z"] },
		{ keys: "Mod+Shift+z", isMac: false, keycaps: ["Ctrl", "Shift", "Z"] },
		{ keys: "Escape", isMac: false, keycaps: ["Esc"] },
		{ keys: "?", isMac: false, keycaps: ["?"] },
		{ keys: "+", isMac: false, keycaps: ["+"] },
	])("$keys on a Mac: $isMac", ({ keys, isMac, keycaps }) => {
		expect(PlanHotkeys.keycaps(keys, { isMac })).toEqual(keycaps);
	});
});

describe("PlanHotkeys.hint", () => {
	test.each([
		{
			why: "undo on a Mac",
			command: { type: "undo" },
			isMac: true,
			hint: "⌘Z",
		},
		{
			why: "undo elsewhere",
			command: { type: "undo" },
			isMac: false,
			hint: "Ctrl+Z",
		},
		{
			why: "a tool",
			command: { type: "tool", tool: "pen" },
			isMac: false,
			hint: "P",
		},
	] satisfies Array<{
		why: string;
		command: PlanHotkeys.HotkeyCommand;
		isMac: boolean;
		hint: string;
	}>)("$why: $hint", ({ command, isMac, hint }) => {
		expect(PlanHotkeys.hint(command, { isMac })).toBe(hint);
	});
});

describe("PlanHotkeys.runOnPlan", () => {
	test("a status letter toggles the status, back to normal the second time", () => {
		const { editor, run } = setUp(PLAYER);

		run({ type: "status", status: "dead" });
		expect(editor.getDocument().slots[0]?.status).toBe("dead");

		run({ type: "status", status: "dead" });
		expect(editor.getDocument().slots[0]?.status).toBe("normal");
	});

	test("toggles the selected player's radius", () => {
		const { editor, run } = setUp(PLAYER);
		const before = editor.getDocument().slots[0]!.radiusShown;

		run({ type: "toggleRadius" });

		expect(editor.getDocument().slots[0]?.radiusShown).toBe(!before);
	});

	test("removing the player empties the slot and clears the selection", () => {
		const { editor, selection, run } = setUp(PLAYER);

		run({ type: "removePlayer" });

		expect(editor.getDocument().slots[0]).toBeNull();
		expect(selection.get()).toBeNull();
	});

	test("select all takes the select tool and selects every drawing", () => {
		const { editor, selection, tools, run } = setUp();
		tools.set({ tool: "pen" });

		run({ type: "selectAll" });

		expect(tools.get().tool).toBe("select");
		expect(selection.get()).toEqual({
			type: "drawings",
			ids: editor.getDocument().drawings.map((drawing) => drawing.id),
		});
	});

	test("the next colour restyles the selected drawings", () => {
		const { editor, selection, tools, run } = setUp();
		const [first] = editor.getDocument().drawings;
		selection.set({ type: "drawings", ids: [first.id] });
		const colors: readonly string[] = PlanTools.DRAWING_COLORS;
		const next = colors[(colors.indexOf(first.color) + 1) % colors.length];

		run({ type: "nextColor" });

		expect(editor.getDocument().drawings[0].color).toBe(next);
		expect(tools.get().color).toBe(next);
	});

	test("sizes stop at the largest", () => {
		const { tools, run } = setUp();

		run({ type: "bigger" });
		run({ type: "bigger" });

		expect(tools.get().size).toBe(PlanDocument.DRAWING_SIZES.at(-1));
	});

	test("leaves the host's commands to it", () => {
		const { run } = setUp(PLAYER);

		expect(run({ type: "fitView" })).toBe(false);
		expect(run({ type: "switchWeapon" })).toBe(false);
	});
});
