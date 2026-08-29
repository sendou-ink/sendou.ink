import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import * as v from "valibot";
import { OG_IMAGE_PAGES } from "~/utils/urls";
import { CHANGELOG_FOLDER_PATH } from "../changelog-constants";
import type { ChangelogGraphicEntry } from "../components/ChangelogGraphic";

const RESOLVED_CHANGELOG_DIR = path.resolve(CHANGELOG_FOLDER_PATH);

const BULLET_LINE_PATTERN = /^[-*]\s+/;

const frontmatterSchema = v.object({
	navItem: v.optional(v.picklist(OG_IMAGE_PAGES)),
	type: v.picklist(["feature", "bug"] as const),
});

/**
 * Every changelog entry added between the given commit and HEAD, oldest first.
 *
 * @param since Sha of the commit the previous update was shipped from.
 */
export function entriesSince(since: string): ChangelogGraphicEntry[] {
	const output = execFileSync(
		"git",
		[
			"diff",
			"--name-only",
			"--diff-filter=A",
			`${since}..HEAD`,
			"--",
			CHANGELOG_FOLDER_PATH,
		],
		{ encoding: "utf8" },
	);

	const fileNames = output
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.endsWith(".md"))
		.map((filePath) => path.basename(filePath))
		.sort();

	return fileNames.map(parseEntryFile);
}

/** Every changelog entry ever committed, oldest first. */
export function allEntries(): ChangelogGraphicEntry[] {
	return fs
		.globSync("*.md", { cwd: RESOLVED_CHANGELOG_DIR })
		.sort()
		.map(parseEntryFile);
}

function parseEntryFile(fileName: string): ChangelogGraphicEntry {
	const rawMarkdown = fs.readFileSync(
		path.join(RESOLVED_CHANGELOG_DIR, fileName),
		"utf8",
	);
	const { content, data } = matter(rawMarkdown);

	let frontmatter: v.InferOutput<typeof frontmatterSchema>;
	try {
		frontmatter = v.parse(frontmatterSchema, data);
	} catch (error) {
		throw new Error(
			`Invalid frontmatter in changelog entry "${fileName}": ${
				error instanceof v.ValiError ? error.message : String(error)
			}`,
		);
	}

	const { headline, bullets } = parseBody(content, fileName);

	return { ...frontmatter, headline, bullets };
}

function parseBody(content: string, fileName: string) {
	const lines = content
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0);

	const headlineLines = lines.filter((line) => !BULLET_LINE_PATTERN.test(line));
	const bullets = lines
		.filter((line) => BULLET_LINE_PATTERN.test(line))
		.map((line) => line.replace(BULLET_LINE_PATTERN, ""));

	if (headlineLines.length === 0) {
		throw new Error(`Changelog entry "${fileName}" has no headline`);
	}
	if (headlineLines.length > 1) {
		throw new Error(
			`Changelog entry "${fileName}" has more than one headline paragraph`,
		);
	}

	return {
		headline: headlineLines[0],
		bullets: bullets.length > 0 ? bullets : undefined,
	};
}
