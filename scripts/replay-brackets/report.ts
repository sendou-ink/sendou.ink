import { logger } from "~/utils/logger";
import type { Finding, TournamentReplay } from "./tournament-replay";
import { TRIAGE, VERDICT_TITLES } from "./triage";

const EXAMPLE_COUNT = 8;

/** Findings grouped by class with tournament and finding counts, per stage type, and example tournament ids. */
export function printReport(
	replays: TournamentReplay[],
	options: { everyFinding?: boolean; listClass?: string } = {},
) {
	const lines: string[] = [];
	const errored = replays.filter((replay) => replay.error);
	const clean = replays.filter(
		(replay) => !replay.error && replay.findings.length === 0,
	);

	lines.push(
		`${replays.length} tournaments, ${sum(replays.map((replay) => replay.stageCount))} stages, ${sum(replays.map((replay) => replay.matchCount))} matches`,
		`${clean.length} without findings, ${errored.length} failed to replay`,
		"",
	);

	const byClass = new Map<
		string,
		{ findings: Finding[]; tournamentIds: Set<number> }
	>();
	for (const replay of replays) {
		for (const finding of replay.findings) {
			const group = byClass.get(finding.class) ?? {
				findings: [],
				tournamentIds: new Set<number>(),
			};
			byClass.set(finding.class, group);
			group.findings.push(finding);
			group.tournamentIds.add(replay.tournamentId);
		}
	}

	const verdictOf = (findingClass: string) =>
		TRIAGE[findingClass]?.verdict ?? "untriaged";
	const verdicts = Object.keys(VERDICT_TITLES) as Array<
		keyof typeof VERDICT_TITLES
	>;
	const sorted = [...byClass.entries()].sort(
		(a, b) =>
			verdicts.indexOf(verdictOf(a[0])) - verdicts.indexOf(verdictOf(b[0])) ||
			b[1].tournamentIds.size - a[1].tournamentIds.size,
	);
	let currentVerdict: string | undefined;
	for (const [findingClass, group] of sorted) {
		if (verdictOf(findingClass) !== currentVerdict) {
			currentVerdict = verdictOf(findingClass);
			lines.push(`== ${VERDICT_TITLES[verdictOf(findingClass)]} ==`);
		}

		const byStageType = new Map<string, number>();
		for (const finding of group.findings) {
			const type = finding.stageType ?? "tournament";
			byStageType.set(type, (byStageType.get(type) ?? 0) + 1);
		}
		const tournamentIds = [...group.tournamentIds];

		lines.push(
			`${findingClass}: ${tournamentIds.length} tournaments, ${group.findings.length} findings (${[...byStageType.entries()].map(([type, count]) => `${type} ${count}`).join(", ")})`,
			`  tournaments: ${(options.listClass === findingClass ? tournamentIds : tournamentIds.slice(-EXAMPLE_COUNT)).join(", ")}`,
			`  e.g. ${group.findings.at(-1)?.detail}`,
			...(TRIAGE[findingClass] ? [`  why: ${TRIAGE[findingClass].why}`] : []),
		);
	}

	const notes = new Map<string, number>();
	for (const replay of replays) {
		for (const [noteClass, count] of Object.entries(replay.notes)) {
			notes.set(noteClass, (notes.get(noteClass) ?? 0) + count);
		}
	}
	if (notes.size > 0) {
		lines.push("", "Notes (legitimate history, not mismatches):");
		for (const [noteClass, count] of notes) {
			lines.push(`  ${noteClass}: ${count}`);
		}
	}

	if (errored.length > 0) {
		lines.push("", "Failed to replay:");
		for (const replay of errored.slice(0, 20)) {
			lines.push(`  ${replay.tournamentId}: ${replay.error}`);
		}
	}

	if (options.everyFinding) {
		lines.push("", "Findings:");
		for (const replay of replays) {
			for (const finding of replay.findings) {
				lines.push(
					`  [${finding.class}] stage ${finding.stageId ?? "-"} (${finding.stageType ?? "-"}) match ${finding.matchId ?? "-"}: ${finding.detail}`,
				);
			}
		}
	}

	logger.info(`\n${lines.join("\n")}`);
}

function sum(values: number[]) {
	return values.reduce((total, value) => total + value, 0);
}
