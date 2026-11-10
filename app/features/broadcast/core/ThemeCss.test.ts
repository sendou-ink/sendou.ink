import { describe, expect, test } from "vitest";
import * as ThemeCss from "./ThemeCss";

const BASE = `/* the info card */
.Game-card {
	top: 28px;
	color: var(--bc-text);

	& + &::before {
		content: "·";
	}
}

.Game-name {
	font-size: 21px;
}

@keyframes bc-enter {
	from {
		opacity: 0;
	}
}
`;

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

describe("ThemeCss.diff", () => {
	test("is empty when nothing changed but the formatting and comments", () => {
		const reformatted = BASE.replace("/* the info card */", "").replaceAll(
			"\t",
			"    ",
		);

		expect(ThemeCss.diff(BASE, reformatted)).toBe("");
	});

	test("keeps only the changed declarations", () => {
		expect(ThemeCss.diff(BASE, BASE.replace("top: 28px", "top: 40px"))).toBe(
			".Game-card {\n\ttop: 40px;\n}",
		);
	});

	test("keeps a changed nested rule nested", () => {
		expect(ThemeCss.diff(BASE, BASE.replace('"·"', '"/"'))).toBe(
			'.Game-card {\n\t& + &::before {\n\t\tcontent: "/";\n\t}\n}',
		);
	});

	test("unsets a removed declaration", () => {
		expect(ThemeCss.diff(BASE, BASE.replace("\tfont-size: 21px;\n", ""))).toBe(
			".Game-name {\n\tfont-size: unset;\n}",
		);
	});

	test("adds new rules", () => {
		expect(ThemeCss.diff(BASE, `${BASE}\n.Game-new { color: red; }`)).toBe(
			".Game-new {\n\tcolor: red;\n}",
		);
	});

	test("keeps changed keyframes whole", () => {
		expect(
			ThemeCss.diff(BASE, BASE.replace("opacity: 0;", "opacity: 0.5;")),
		).toBe("@keyframes bc-enter {\n\tfrom {\n\t\topacity: 0.5;\n\t}\n}");
	});

	test("throws on CSS that doesn't parse", () => {
		expect(() => ThemeCss.diff(BASE, `${BASE}\n.Game-broken {`)).toThrow();
	});
});

describe("ThemeCss.syntaxError", () => {
	test("is null for CSS that parses", () => {
		expect(ThemeCss.syntaxError(BASE)).toBeNull();
	});

	test("tells the line of an unclosed block", () => {
		expect(ThemeCss.syntaxError(".a {\n\ttop: 0;\n")).toEqual({
			line: 1,
			reason: "Unclosed block",
		});
	});
});

describe("ThemeCss.customPropertyDeclarations", () => {
	test("finds each declaration with where its value is", () => {
		const css =
			"/* --commented: 1px; */\n[data-broadcast] {\n\t--a: 28px;\n\t--b: var(--a) ;\n}";

		const declarations = ThemeCss.customPropertyDeclarations(css);

		expect(declarations.map(({ name, value }) => ({ name, value }))).toEqual([
			{ name: "--a", value: "28px" },
			{ name: "--b", value: "var(--a)" },
		]);
		expect(css.slice(declarations[1].start, declarations[1].end)).toBe(
			"var(--a)",
		);
	});
});

describe("ThemeCss.variableReferences", () => {
	test("finds each var() whole, its fallback included", () => {
		const text = "top: calc(var(--a, var(--b)) + var(--c));";

		expect(
			ThemeCss.variableReferences(text).map(({ name, start, end }) => [
				name,
				text.slice(start, end),
			]),
		).toEqual([
			["--a", "var(--a, var(--b))"],
			["--b", "var(--b)"],
			["--c", "var(--c)"],
		]);
	});
});

describe("ThemeCss.compose", () => {
	test("puts the edits in the layer and the custom CSS after them", () => {
		expect(
			ThemeCss.compose({
				edits: [".a {\n\ttop: 0;\n}", ""],
				custom: "[data-part] { color: red; }",
			}),
		).toBe(
			"@layer features {\n\t.a {\n\t\ttop: 0;\n\t}\n}\n\n[data-part] { color: red; }",
		);
	});

	test("is empty without edits or custom CSS", () => {
		expect(ThemeCss.compose({ edits: [""], custom: " " })).toBe("");
	});
});

describe("ThemeCss.merge", () => {
	test("leaves custom CSS without edits as it is", () => {
		const css = "/* mine */\n[data-part='team'] { color: red; }";

		expect(ThemeCss.merge({ bases: { game: BASE }, css })).toEqual({
			stylesheets: { game: BASE },
			custom: css,
		});
	});

	test.each([
		{ why: "changed declaration", edited: BASE.replace("28px", "40px") },
		{ why: "nested rule", edited: BASE.replace('"·"', '"/"') },
		{
			why: "removed declaration",
			edited: BASE.replace("\tfont-size: 21px;\n", ""),
		},
		{
			why: "added declaration",
			edited: BASE.replace("top: 28px;", "top: 28px;\n\tleft: 0 !important;"),
		},
		{
			why: "keyframes",
			edited: BASE.replace("opacity: 0;", "opacity: 0.5;"),
		},
		{
			why: "removed rule",
			edited: BASE.replace(".Game-name {\n\tfont-size: 21px;\n}", ""),
		},
	])("applies the saved edits back to the stylesheet ($why)", ({ edited }) => {
		const edits = ThemeCss.diff(BASE, edited);
		const css = ThemeCss.compose({ edits: [edits], custom: "" });

		const merged = ThemeCss.merge({ bases: { game: BASE }, css });

		expect(merged.custom).toBe("");
		expect(ThemeCss.diff(BASE, merged.stylesheets.game)).toBe(edits);
	});

	test("applies an edit to the stylesheet having the property of a rule split over two", () => {
		const look = ".Game-card {\n\tcolor: red;\n}\n";
		const layout = ".Game-card {\n\ttop: 0;\n}\n";
		const css = ThemeCss.compose({
			edits: [".Game-card {\n\tcolor: blue;\n}"],
			custom: "",
		});

		const merged = ThemeCss.merge({ bases: { look, layout }, css });

		expect(merged.stylesheets).toEqual({
			look: ".Game-card {\n\tcolor: blue;\n}\n",
			layout,
		});
	});

	test("leaves edits of rules no stylesheet has as custom CSS", () => {
		const css = ThemeCss.compose({
			edits: [".Game-card {\n\ttop: 40px;\n}\n\n.Gone-rule {\n\ttop: 0;\n}"],
			custom: "[data-part] { color: red; }",
		});

		const merged = ThemeCss.merge({ bases: { game: BASE }, css });

		expect(ThemeCss.diff(BASE, merged.stylesheets.game)).toBe(
			".Game-card {\n\ttop: 40px;\n}",
		);
		expect(merged.custom).toBe(
			"@layer features {\n\t.Gone-rule {\n\t\ttop: 0;\n\t}\n}\n\n[data-part] { color: red; }",
		);
	});

	test("leaves CSS that doesn't parse as custom CSS", () => {
		const css = "@layer features { .Game-card {";

		expect(ThemeCss.merge({ bases: { game: BASE }, css })).toEqual({
			stylesheets: { game: BASE },
			custom: css,
		});
	});
});
