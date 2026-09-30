import assert from "node:assert/strict";
import { matchKillMessage } from "../../core/detectors/kill/message";
import { test } from "../node-test-compat";

const cases: {
	why: string;
	read: string;
	lang: string;
	name: string | null;
	minScore: number;
}[] = [
	{
		why: "clean English read",
		read: "Splatted nwrm!",
		lang: "USen",
		name: "nwrm",
		minScore: 1,
	},
	{
		why: "a dropped constant glyph still strips the whole word",
		read: "Splatte datkid!",
		lang: "USen",
		name: "datkid",
		minScore: 0.85,
	},
	{
		why: "a bar read for the exclamation mark counts as one",
		read: "Splatted 24Kl",
		lang: "USen",
		name: "24K",
		minScore: 1,
	},
	{
		why: "a name with spaces survives",
		read: "Splatted Now or Never!",
		lang: "USen",
		name: "Now or Never",
		minScore: 1,
	},
	{
		why: "a name-first language keys on the tail",
		read: "nwrm erledigt!",
		lang: "EUde",
		name: "nwrm",
		minScore: 1,
	},
	{
		why: "case and accents fold in the constant text",
		read: "éclaboussé nwrm!",
		lang: "USfr",
		name: "nwrm",
		minScore: 1,
	},
	{
		why: "a missing exclamation mark strips nothing off the name",
		read: "Splatted nwrm",
		lang: "USen",
		name: "nwrm",
		minScore: 0.85,
	},
	{
		why: "the constant text alone leaves no name",
		read: "Splatted !",
		lang: "USen",
		name: null,
		minScore: 1,
	},
];

for (const { why, read, lang, name, minScore } of cases) {
	test(`matchKillMessage: ${why}`, () => {
		const match = matchKillMessage(read);
		assert.ok(match, "no template matched");
		assert.ok(
			match.template.langs.includes(lang),
			`picked ${match.template.langs.join("/")}`,
		);
		assert.equal(match.name, name);
		assert.ok(
			match.score >= minScore,
			`score ${match.score.toFixed(2)} under ${minScore}`,
		);
	});
}

test("matchKillMessage: unrelated text scores low", () => {
	const match = matchKillMessage("Respawn in 01");
	assert.ok(match);
	assert.ok(match.score < 0.5, `score ${match.score.toFixed(2)}`);
});
