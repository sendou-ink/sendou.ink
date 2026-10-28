/** biome-ignore-all lint/suspicious/noConsole: CLI script output */

// runs e2e specs with tracing on and keeps what the living docs show from the run:
// the pathnames each test visits and the /api/ requests it makes (committed) and a screenshot per page divider and test.step (gitignored),
// see docs/site/src/content/docs/dev/living-docs.mdx

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { unzipSync } from "fflate";
import {
	API_EXAMPLES_FILE,
	type ApiExchange,
	readApiExamples,
} from "./api-examples.ts";
import { ROOT } from "./ast.ts";
import { documentSpec, type TestDoc } from "./e2e.ts";
import { indexPageObjects } from "./page-objects.ts";
import {
	readVisits,
	SCREENSHOTS_DIR,
	screenshotFile,
	testMatches,
	VISITS_FILE,
	type Visits,
} from "./visits.ts";

const REPORT_FILE = "test-results/living-docs-report.json";
const VISITS_ATTACHMENT = "living-docs-visits";
const STEP_ATTACHMENT_PREFIX = "living-docs-step: ";
const API_ATTACHMENT = "living-docs-api";
/** Arrays of an API response are cut to this many items, the example only has to show their shape. */
const MAX_EXAMPLE_ARRAY_ITEMS = 3;
/** The worker servers' origins in API responses (e.g. in image URLs) are shown as the site's. */
const LOCAL_ORIGIN_REGEX = /^http:\/\/localhost:\d+/;

interface ReportedTest {
	spec: string;
	titlePath: string[];
	line: number;
	tracePath: string | null;
	pathnames: string[];
	apiExchanges: Array<Omit<ApiExchange, "test">>;
	/** Screenshot taken as each `test.step` passed, in order. */
	stepShots: Array<{ title: string; image: Uint8Array }>;
}

interface TimedAction {
	line: number;
	startWall: number;
	endWall: number;
	contextId: string | null;
}

interface Frame {
	wall: number;
	contextId: string;
	file: string;
}

function main() {
	const specs = process.argv.slice(2);

	const run = spawnSync(
		"pnpm",
		["exec", "playwright", "test", ...specs, "--reporter=list,json"],
		{
			cwd: ROOT,
			stdio: "inherit",
			env: {
				...process.env,
				LIVING_DOCS_CAPTURE: "true",
				PLAYWRIGHT_JSON_OUTPUT_FILE: path.join(ROOT, REPORT_FILE),
				PLAYWRIGHT_JSON_OUTPUT_NAME: path.join(ROOT, REPORT_FILE),
			},
		},
	);
	if (run.status !== 0) {
		console.warn(
			"Some e2e tests failed, capturing what their traces have anyway",
		);
	}

	const reported = reportedTests(
		JSON.parse(fs.readFileSync(path.join(ROOT, REPORT_FILE), "utf8")),
	);
	const capturedSpecs = new Set(reported.map((test) => test.spec));

	saveVisits(reported, capturedSpecs);
	saveApiExamples(reported, capturedSpecs);
	const screenshotCount = saveScreenshots(reported, capturedSpecs);

	console.log(
		`Captured ${reported.length} tests of ${capturedSpecs.size} specs, ${screenshotCount} screenshots. A running pnpm run dev:docs picks them up, otherwise run it to see them.`,
	);

	if (run.status !== 0) process.exitCode = 1;
}

function saveVisits(reported: ReportedTest[], capturedSpecs: Set<string>) {
	const visits: Visits = Object.fromEntries(
		Object.entries(readVisits()).filter(([spec]) => !capturedSpecs.has(spec)),
	);

	for (const test of reported) {
		if (test.pathnames.length === 0) continue;
		const title = test.titlePath.join(" › ");
		const bySpec = visits[test.spec] ?? {};
		bySpec[title] = [...new Set([...(bySpec[title] ?? []), ...test.pathnames])];
		visits[test.spec] = bySpec;
	}

	const sorted = Object.fromEntries(
		Object.keys(visits)
			.sort(compareStrings)
			.map((spec) => [
				spec,
				Object.fromEntries(
					Object.keys(visits[spec])
						.sort(compareStrings)
						.map((title) => [title, visits[spec][title].sort(compareStrings)]),
				),
			]),
	);

	fs.writeFileSync(
		path.join(ROOT, VISITS_FILE),
		`${JSON.stringify(sorted, null, "\t")}\n`,
	);
}

function saveApiExamples(reported: ReportedTest[], capturedSpecs: Set<string>) {
	const exchanges = [
		...readApiExamples().filter(
			(exchange) => !capturedSpecs.has(exchange.test.spec),
		),
		...reported.flatMap((test) =>
			test.apiExchanges.map((exchange) => ({
				...exchange,
				responseBody: exampleValue(exchange.responseBody),
				test: { spec: test.spec, titlePath: test.titlePath, line: test.line },
			})),
		),
	].sort(
		(a, b) =>
			compareStrings(a.test.spec, b.test.spec) || a.test.line - b.test.line,
	);

	fs.writeFileSync(
		path.join(ROOT, API_EXAMPLES_FILE),
		`${JSON.stringify(exchanges, null, "\t")}\n`,
	);
}

function exampleValue(value: unknown): unknown {
	if (typeof value === "string") {
		return value.replace(LOCAL_ORIGIN_REGEX, "https://sendou.ink");
	}
	if (Array.isArray(value)) {
		return value.slice(0, MAX_EXAMPLE_ARRAY_ITEMS).map(exampleValue);
	}
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value).map(([key, item]) => [key, exampleValue(item)]),
		);
	}

	return value;
}

function saveScreenshots(reported: ReportedTest[], capturedSpecs: Set<string>) {
	const pageObjects = indexPageObjects();
	let count = 0;

	for (const spec of capturedSpecs) {
		const specDir = path.join(
			ROOT,
			SCREENSHOTS_DIR,
			path.basename(spec, ".spec.ts"),
		);
		fs.rmSync(specDir, { recursive: true, force: true });
		fs.mkdirSync(specDir, { recursive: true });

		const tests = documentSpec(spec, pageObjects).groups.flatMap(
			(group) => group.tests,
		);

		for (const result of reported.filter((test) => test.spec === spec)) {
			const test = matchingTest(tests, result);
			if (!test) continue;

			const screenshots = new Map([
				...stepScreenshots(test, result),
				...(result.tracePath
					? dividerScreenshots(test, result.tracePath, path.join(ROOT, spec))
					: []),
			]);
			for (const [line, image] of screenshots) {
				fs.writeFileSync(path.join(ROOT, screenshotFile(spec, line)), image);
				count++;
			}
		}
	}

	return count;
}

function matchingTest(tests: TestDoc[], result: ReportedTest) {
	const sameLine = tests.filter((test) => test.line === result.line);

	return (
		sameLine.find((test) => testMatches(test.titlePath, result.titlePath)) ??
		sameLine[0] ??
		null
	);
}

/** The screenshots attached as the test's `test.step`s passed, by the line of the step. */
function stepScreenshots(test: TestDoc, result: ReportedTest) {
	const unused = [...result.stepShots];
	const screenshots = new Map<number, Uint8Array>();

	for (const chapter of test.chapters) {
		if (!chapter.title) continue;
		const index = unused.findIndex((shot) => shot.title === chapter.title);
		if (index === -1) continue;
		screenshots.set(chapter.line, unused[index].image);
		unused.splice(index, 1);
	}

	return screenshots;
}

/** For each page divider: the last frame of the page before the test moved past the divider's steps. */
function dividerScreenshots(
	test: TestDoc,
	tracePath: string,
	specFile: string,
) {
	const sections = dividerSections(test);
	if (sections.length === 0) return new Map<number, Uint8Array>();

	const zip = unzipSync(fs.readFileSync(tracePath));
	const { actions, frames } = parseTrace(zip, specFile);
	const screenshots = new Map<number, Uint8Array>();

	for (const { start, end } of sections) {
		const inSection = actions.filter(
			(action) => action.line >= start && action.line <= end,
		);
		if (inSection.length === 0) continue;

		const last = inSection.reduce((latest, action) =>
			action.endWall > latest.endWall ? action : latest,
		);
		const nextStart = Math.min(
			...actions
				.filter((action) => action.startWall > last.endWall)
				.map((action) => action.startWall),
		);

		const frame = frames
			.filter(
				(candidate) =>
					(!last.contextId || candidate.contextId === last.contextId) &&
					candidate.wall < nextStart,
			)
			.at(-1);
		const image = frame ? zip[frame.file] : undefined;
		if (image) screenshots.set(start, image);
	}

	return screenshots;
}

/** A divider's section runs until the next divider, or the end of the test. */
function dividerSections(test: TestDoc) {
	const lines = test.chapters
		.flatMap((chapter) => chapter.segments)
		.flatMap((segment) => segment.items)
		.filter((item) => item.kind === "divider")
		.map((divider) => divider.line)
		.sort((a, b) => a - b);

	return lines.map((start, index) => ({
		start,
		end: (lines[index + 1] ?? test.endLine + 1) - 1,
	}));
}

function parseTrace(zip: Record<string, Uint8Array>, specFile: string) {
	const actions: TimedAction[] = [];
	const frames: Frame[] = [];
	const decoder = new TextDecoder();

	for (const name of Object.keys(zip)) {
		const contextId = name.match(/^(\d+)-trace\.trace$/)?.[1];
		const isTestRunner = name === "test.trace";
		if (!contextId && !isTestRunner) continue;

		const events = decoder
			.decode(zip[name])
			.split("\n")
			.filter(Boolean)
			.map((line) => JSON.parse(line));
		const options = events.find((event) => event.type === "context-options");
		const toWall = (monotonic: number) =>
			options.wallTime + (monotonic - options.monotonicTime);

		const stacks = new Map<number, Array<[number, number]>>();
		const stacksFile = contextId ? zip[`${contextId}-trace.stacks`] : undefined;
		const stackFiles: string[] = [];
		if (stacksFile) {
			const parsed = JSON.parse(decoder.decode(stacksFile));
			stackFiles.push(...parsed.files);
			for (const [callNumber, callFrames] of parsed.stacks) {
				stacks.set(
					callNumber,
					callFrames.map((frame: number[]) => [frame[0], frame[1]]),
				);
			}
		}

		const started = new Map<string, { line: number; startWall: number }>();
		for (const event of events) {
			if (event.type === "screencast-frame" && contextId) {
				frames.push({
					wall: toWall(event.timestamp),
					contextId,
					file: event.file,
				});
			} else if (event.type === "before") {
				const line = isTestRunner
					? event.stack?.find(
							(frame: { file: string }) => frame.file === specFile,
						)?.line
					: stacks
							.get(Number(String(event.callId).split("@")[1]))
							?.find(([fileIndex]) => stackFiles[fileIndex] === specFile)?.[1];
				if (line) {
					started.set(event.callId, {
						line,
						startWall: toWall(event.startTime),
					});
				}
			} else if (event.type === "after" && started.has(event.callId)) {
				actions.push({
					...started.get(event.callId)!,
					endWall: toWall(event.endTime),
					contextId: contextId ?? null,
				});
			}
		}
	}

	frames.sort((a, b) => a.wall - b.wall);
	return { actions, frames };
}

function compareStrings(a: string, b: string) {
	return a < b ? -1 : a > b ? 1 : 0;
}

function reportedTests(report: any): ReportedTest[] {
	const tests: ReportedTest[] = [];

	const visit = (suite: any, titlePath: string[], spec: string) => {
		for (const reportedSpec of suite.specs ?? []) {
			const result = reportedSpec.tests?.[0]?.results?.at(-1);
			if (!result) continue;

			const attachments: any[] = result.attachments ?? [];
			const visits = attachments.find(
				(attachment) => attachment.name === VISITS_ATTACHMENT,
			);
			const apiExchanges = attachments.find(
				(attachment) => attachment.name === API_ATTACHMENT,
			);
			tests.push({
				spec,
				titlePath: [...titlePath, reportedSpec.title],
				line: reportedSpec.line,
				tracePath:
					attachments.find((attachment) => attachment.name === "trace")?.path ??
					null,
				pathnames: visits?.body
					? JSON.parse(Buffer.from(visits.body, "base64").toString("utf8"))
					: [],
				apiExchanges: apiExchanges?.body
					? JSON.parse(
							Buffer.from(apiExchanges.body, "base64").toString("utf8"),
						)
					: [],
				stepShots: attachments
					.filter(
						(attachment) =>
							attachment.name.startsWith(STEP_ATTACHMENT_PREFIX) &&
							attachment.body,
					)
					.map((attachment) => ({
						title: attachment.name.slice(STEP_ATTACHMENT_PREFIX.length),
						image: Buffer.from(attachment.body, "base64"),
					})),
			});
		}
		for (const child of suite.suites ?? []) {
			visit(child, [...titlePath, child.title], spec);
		}
	};

	for (const fileSuite of report.suites ?? []) {
		visit(fileSuite, [], `e2e/${fileSuite.file}`);
	}

	return tests;
}

main();
