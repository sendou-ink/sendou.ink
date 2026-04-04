import { useState } from "react";
import { Outlet } from "react-router";
import { SendouButton } from "~/components/elements/Button";
import { SendouSwitch } from "~/components/elements/Switch";
import { Input } from "~/components/Input";
import { Label } from "~/components/Label";
import { Main } from "~/components/Main";
import type { Tables } from "~/db/tables";
import type { Bracket as BracketType } from "~/features/tournament-bracket/core/Bracket";
import { getTournamentManager } from "~/features/tournament-bracket/core/brackets-manager";
import * as Swiss from "~/features/tournament-bracket/core/Swiss";
import { fillWithNullTillPowerOfTwo } from "~/features/tournament-bracket/tournament-bracket-utils";
import type { TournamentManagerDataSet } from "~/modules/brackets-manager/types";
import styles from "../bracket-test.module.css";

type FormatType = Tables["TournamentStage"]["type"];

const FORMAT_OPTIONS: { value: FormatType; label: string }[] = [
	{ value: "single_elimination", label: "Single Elim" },
	{ value: "double_elimination", label: "Double Elim" },
	{ value: "round_robin", label: "Round Robin" },
	{ value: "swiss", label: "Swiss" },
];

export default function BracketTestLayout() {
	const [format, setFormat] = useState<FormatType>("double_elimination");
	const [teamCount, setTeamCount] = useState(8);
	const [bracketExpanded, setBracketExpanded] = useState(true);
	const [completedRounds, setCompletedRounds] = useState(0);
	const [completedWbRounds, setCompletedWbRounds] = useState(0);
	const [completedLbRounds, setCompletedLbRounds] = useState(0);

	const clampedTeamCount = Math.max(2, teamCount);
	const teams = generateTeams(clampedTeamCount);
	const teamIds = teams.map((t) => t.id);

	const data = generateBracketData(format, teamIds);
	const isDoubleElim = format === "double_elimination";
	const { totalRounds, wbRounds, lbRounds } = countRounds(data, isDoubleElim);

	if (isDoubleElim) {
		simulateCompletedRoundsByGroup(data, completedWbRounds, completedLbRounds);
	} else {
		simulateCompletedRounds(data, Math.min(completedRounds, totalRounds));
	}

	const mockTournament = {
		ctx: {
			id: 1,
			name: "Bracket Test",
			isFinalized: 0,
			castedMatchesInfo: null,
			teams,
			settings: {
				bracketProgression: [
					{
						name: "Test Bracket",
						type: format,
						requiresCheckIn: false,
						settings: {},
					},
				],
			},
			bracketProgressionOverrides: [],
			participatedUsers: teamIds,
		},
		brackets: [] as unknown[],
		teamById: (id: number) => teams.find((t) => t.id === id) ?? null,
		teamMemberOfByUser: () => null,
		isOrganizer: () => false,
		tournamentTeamLogoSrc: () => null,
		streamingParticipantIds: [] as number[],
		streams: [] as unknown[],
		isLeagueDivision: false,
	};

	const mockBracket = {
		id: 1,
		idx: 0,
		preview: false,
		data,
		type: format,
		name: "Test Bracket",
		canBeStarted: false,
		tournament: mockTournament,
		settings: format === "swiss" ? { roundCount: 5 } : null,
		sources: undefined,
		seeding: undefined,
		createdAt: null,
		requiresCheckIn: false,
		startTime: null,
		simulatedMatch: () => undefined,
		currentStandings: () => [],
		participantTournamentTeamIds: teamIds,
		everyMatchOver: false,
		isUnderground: false,
	} as unknown as BracketType;

	mockTournament.brackets = [mockBracket];

	return (
		<Main bigger>
			<h1 className="text-lg">Bracket Test</h1>
			<div className={styles.settings}>
				<div className={styles.settingGroup}>
					<Label>Format</Label>
					<div className="stack horizontal sm">
						{FORMAT_OPTIONS.map((opt) => (
							<SendouButton
								key={opt.value}
								variant={format === opt.value ? undefined : "outlined"}
								size="small"
								onPress={() => setFormat(opt.value)}
							>
								{opt.label}
							</SendouButton>
						))}
					</div>
				</div>
				<div className={styles.settingGroup}>
					<Label htmlFor="team-count">Teams</Label>
					<Input
						id="team-count"
						type="number"
						min={2}
						max={128}
						value={String(teamCount)}
						onChange={(e) => setTeamCount(Number(e.target.value))}
						className={styles.teamCountInput}
					/>
				</div>
				{isDoubleElim ? (
					<>
						<div className={styles.settingGroup}>
							<Label htmlFor="completed-wb">Completed WB rounds</Label>
							<Input
								id="completed-wb"
								type="number"
								min={0}
								max={wbRounds}
								value={String(Math.min(completedWbRounds, wbRounds))}
								onChange={(e) => setCompletedWbRounds(Number(e.target.value))}
								className={styles.teamCountInput}
							/>
						</div>
						<div className={styles.settingGroup}>
							<Label htmlFor="completed-lb">Completed LB rounds</Label>
							<Input
								id="completed-lb"
								type="number"
								min={0}
								max={lbRounds}
								value={String(Math.min(completedLbRounds, lbRounds))}
								onChange={(e) => setCompletedLbRounds(Number(e.target.value))}
								className={styles.teamCountInput}
							/>
						</div>
					</>
				) : (
					<div className={styles.settingGroup}>
						<Label htmlFor="completed-rounds">Completed rounds</Label>
						<Input
							id="completed-rounds"
							type="number"
							min={0}
							max={totalRounds}
							value={String(Math.min(completedRounds, totalRounds))}
							onChange={(e) => setCompletedRounds(Number(e.target.value))}
							className={styles.teamCountInput}
						/>
					</div>
				)}
				<div className={styles.settingGroup}>
					<SendouSwitch
						id="expanded"
						isSelected={bracketExpanded}
						onChange={setBracketExpanded}
					>
						Expanded
					</SendouSwitch>
				</div>
			</div>
			<Outlet
				context={{
					tournament: mockTournament,
					bracketExpanded,
					setBracketExpanded,
					hasChildTournaments: false,
					preparedMaps: null,
					bracket: mockBracket,
				}}
			/>
		</Main>
	);
}

function generateTeams(count: number) {
	return Array.from({ length: count }, (_, i) => ({
		id: i + 1,
		name: `Team ${i + 1}`,
		seed: i + 1,
		members: [{ userId: i + 1, username: `Player${i + 1}` }],
		droppedOut: 0,
	}));
}

function countRounds(data: TournamentManagerDataSet, isDoubleElim: boolean) {
	const totalRounds = Math.max(...data.round.map((r) => r.number));

	if (!isDoubleElim) return { totalRounds, wbRounds: 0, lbRounds: 0 };

	const wbGroupId = data.group.find((g) => g.number === 1)?.id;
	const lbGroupId = data.group.find((g) => g.number === 2)?.id;

	const wbRounds = data.round.filter((r) => r.group_id === wbGroupId).length;
	const lbRounds = data.round.filter((r) => r.group_id === lbGroupId).length;

	return { totalRounds, wbRounds, lbRounds };
}

function simulateCompletedRoundsByGroup(
	data: TournamentManagerDataSet,
	wbCompleted: number,
	lbCompleted: number,
) {
	const wbGroupId = data.group.find((g) => g.number === 1)?.id;
	const lbGroupId = data.group.find((g) => g.number === 2)?.id;

	const completedRoundIds = new Set<number>();
	for (const round of data.round) {
		if (round.group_id === wbGroupId && round.number <= wbCompleted) {
			completedRoundIds.add(round.id);
		}
		if (round.group_id === lbGroupId && round.number <= lbCompleted) {
			completedRoundIds.add(round.id);
		}
	}

	markMatchesCompleted(data, completedRoundIds);
}

function simulateCompletedRounds(
	data: TournamentManagerDataSet,
	completedRounds: number,
) {
	if (completedRounds <= 0) return;

	const roundsByNumber = new Map<number, number[]>();
	for (const round of data.round) {
		const existing = roundsByNumber.get(round.number) ?? [];
		existing.push(round.id);
		roundsByNumber.set(round.number, existing);
	}

	const completedRoundIds = new Set<number>();
	for (let n = 1; n <= completedRounds; n++) {
		for (const id of roundsByNumber.get(n) ?? []) {
			completedRoundIds.add(id);
		}
	}

	markMatchesCompleted(data, completedRoundIds);
}

function markMatchesCompleted(
	data: TournamentManagerDataSet,
	completedRoundIds: Set<number>,
) {
	for (const match of data.match) {
		if (!completedRoundIds.has(match.round_id)) continue;
		// skip BYE matches (opponent slot is null entirely)
		if (match.opponent1 === null || match.opponent2 === null) continue;

		match.opponent1 = { ...match.opponent1, score: 2, result: "win" };
		match.opponent2 = { ...match.opponent2, score: 0, result: "loss" };
		match.status = 4;
	}
}

function generateBracketData(
	format: FormatType,
	teamIds: number[],
): TournamentManagerDataSet {
	if (format === "swiss") {
		return Swiss.create({
			tournamentId: 1,
			name: "Test Bracket",
			seeding: teamIds,
			settings: {
				swiss: { groupCount: 1, roundCount: 5 },
			},
		});
	}

	const manager = getTournamentManager();
	const seeding =
		format === "round_robin" ? teamIds : fillWithNullTillPowerOfTwo(teamIds);

	const settings =
		format === "single_elimination"
			? { consolationFinal: false }
			: format === "double_elimination"
				? { grandFinal: "double" as const }
				: {
						groupCount: Math.ceil(teamIds.length / 4),
						seedOrdering: ["groups.seed_optimized" as const],
					};

	manager.create({
		tournamentId: 1,
		name: "Test Bracket",
		type: format,
		seeding,
		settings,
	});

	return manager.get.tournamentData(1);
}
