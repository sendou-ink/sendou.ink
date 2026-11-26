import { describe, expect, test } from "vitest";
import * as ThemeCss from "./ThemeCss";

describe("ThemeCss.fromModuleSource", () => {
	test("names the classes after the stylesheet", () => {
		expect(
			ThemeCss.fromModuleSource({
				source: ".infoCard { top: 0; & .name:not(.muted) { color: red; } }",
				stylesheet: "GameScene",
			}),
		).toBe(
			".GameScene-infoCard { top: 0; & .GameScene-name:not(.GameScene-muted) { color: red; } }",
		);
	});

	test("unwraps :global() without renaming what is in it", () => {
		expect(
			ThemeCss.fromModuleSource({
				source:
					"@keyframes :global(bc-enter) { from { opacity: 0.5; } } :global(.x) .y { top: 0; }",
				stylesheet: "Overlay",
			}),
		).toBe(
			"@keyframes bc-enter { from { opacity: 0.5; } } .x .Overlay-y { top: 0; }",
		);
	});
});

describe("ThemeCss.syntaxError", () => {
	test("is null for CSS that parses", () => {
		expect(
			ThemeCss.syntaxError(".a { top: 0; & .b { color: red; } }"),
		).toBeNull();
	});

	test("tells the line of an unclosed block", () => {
		expect(ThemeCss.syntaxError(".a {\n\ttop: 0;\n")).toEqual({
			line: 1,
			reason: "Unclosed block",
		});
	});
});
