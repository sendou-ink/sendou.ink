import clsx from "clsx";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { type FetcherWithComponents, Link, useFetcher } from "react-router";
import { SendouDialog } from "~/components/elements/Dialog";
import { ModeImage, StageImage } from "~/components/Image";
import { InfoPopover } from "~/components/InfoPopover";
import { Input } from "~/components/Input";
import { MinusIcon } from "~/components/icons/Minus";
import { PlusIcon } from "~/components/icons/Plus";
import { RefreshArrowsIcon } from "~/components/icons/RefreshArrows";
import { Label } from "~/components/Label";
import { SubmitButton } from "~/components/SubmitButton";
import type { TournamentRoundMaps } from "~/db/tables";
import {
	useTournament,
	useTournamentPreparedMaps,
} from "~/features/tournament/routes/to.$id";
import { TOURNAMENT } from "~/features/tournament/tournament-constants";
import * as PickBan from "~/features/tournament-bracket/core/PickBan";
import type { TournamentManagerDataSet } from "~/modules/brackets-manager/types";
import { modesShort } from "~/modules/in-game-lists/modes";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { nullFilledArray } from "~/utils/arrays";
import { databaseTimestampToDate } from "~/utils/dates";
import invariant from "~/utils/invariant";
import { assertUnreachable } from "~/utils/types";
import { calendarEditPage } from "~/utils/urls";
import { SendouButton } from "../../../components/elements/Button";
import { ChevronUpDownIcon } from "../../../components/icons/ChevronUpDown";
import { LinkIcon } from "../../../components/icons/Link";
import { PickIcon } from "../../../components/icons/Pick";
import { UnlinkIcon } from "../../../components/icons/Unlink";
import { logger } from "../../../utils/logger";
import type { Bracket } from "../core/Bracket";
import * as PreparedMaps from "../core/PreparedMaps";
import { getRounds } from "../core/rounds";
import type { Tournament } from "../core/Tournament";
import {
	type BracketMapCounts,
	generateTournamentRoundMaplist,
	type TournamentRoundMapList,
} from "../core/toMapList";
import styles from "./BracketMapListDialog.module.css";

export function BracketMapListDialog({
	close,
	bracket,
	bracketIdx,
	isPreparing,
}: {
	close: () => void;
	bracket: Bracket;
	bracketIdx: number;
	isPreparing?: boolean;
}) {
	const { t } = useTranslation(["common"]);
	const fetcher = useFetcher();
	const tournament = useTournament();
	const untrimmedPreparedMaps = useBracketPreparedMaps(bracketIdx);

	useCloseModalOnSubmit(fetcher, close);

	const bracketTeamsCount = bracket.participantTournamentTeamIds.length;

	const preparedMaps =
		!isPreparing &&
		(bracket.type === "single_elimination" ||
			bracket.type === "double_elimination")
			? // we are about to start bracket, "trim" prepared map for actual
				PreparedMaps.trimPreparedEliminationMaps({
					preparedMaps: untrimmedPreparedMaps,
					teamCount: bracketTeamsCount,
					bracket,
				})
			: untrimmedPreparedMaps;

	const [eliminationTeamCount, setEliminationTeamCount] = React.useState<
		number | null
	>(() => {
		if (preparedMaps?.eliminationTeamCount) {
			return preparedMaps.eliminationTeamCount;
		}

		if (isPreparing) {
			return null;
		}

		return PreparedMaps.eliminationTeamCountOptions(bracketTeamsCount)[0].max;
	});
	const [thirdPlaceMatchLinked, setThirdPlaceMatchLinked] = React.useState(
		() => {
			if (
				!tournament.bracketManagerSettings(
					bracket.settings,
					bracket.type,
					eliminationTeamCount ?? 2,
				).consolationFinal
			) {
				return true; // default to true if not applicable or elimination team count not yet set (initial state)
			}

			if (!preparedMaps?.maps) {
				return true;
			}

			// if maps were set before infer default from whether finals and third place match have different maps or not

			const finalsMaps = preparedMaps.maps
				.filter((map) => map.groupId === 0)
				.sort((a, b) => b.roundId - a.roundId)[0];
			const thirdPlaceMaps = preparedMaps.maps.find((map) => map.groupId === 1);

			if (!finalsMaps?.list || !thirdPlaceMaps?.list) {
				logger.error(
					"Expected both finals and third place match maps to be defined",
				);
				return true;
			}

			return (
				finalsMaps.count === thirdPlaceMaps.count &&
				finalsMaps.pickBan === thirdPlaceMaps.pickBan &&
				finalsMaps.list.every(
					(map, i) =>
						map.mode === thirdPlaceMaps.list![i].mode &&
						map.stageId === thirdPlaceMaps.list![i].stageId,
				)
			);
		},
	);
	const [patterns, setPatterns] = React.useState(new Map<number, string>());

	const bracketData = isPreparing
		? teamCountAdjustedBracketData({
				bracket,
				teamCount: eliminationTeamCount ?? 2,
			})
		: bracket.data;
	const rounds = bracketData.round;
	const defaultRoundBestOfs = bracket.defaultRoundBestOfs(bracketData);

	const [countType, setCountType] = React.useState<TournamentRoundMaps["type"]>(
		preparedMaps?.maps[0].type ?? "BEST_OF",
	);

	const [maps, setMaps] = React.useState(() => {
		if (preparedMaps) {
			return new Map(preparedMaps.maps.map((map) => [map.roundId, map]));
		}

		return generateTournamentRoundMaplist({
			mapCounts: defaultRoundBestOfs,
			roundsWithPickBan: new Set(),
			pool: tournament.ctx.toSetMapPool,
			rounds,
			type: bracket.type,
			pickBanStyle: null,
			patterns,
			countType,
		});
	});
	const [pickBanStyle, setPickBanStyle] = React.useState(
		Array.from(maps.values()).find((round) => round.pickBan)?.pickBan ??
			"COUNTERPICK",
	);
	const [hoveredMap, setHoveredMap] = React.useState<string | null>(null);

	const roundsWithPickBan = new Set(
		Array.from(maps.entries())
			.filter(([, round]) => round.pickBan)
			.map(([roundId]) => roundId),
	);

	const mapCounts = inferMapCounts({
		bracket,
		data: bracketData,
		tournamentRoundMapList: maps,
	});

	const roundsWithNames = React.useMemo(() => {
		if (bracket.type === "round_robin" || bracket.type === "swiss") {
			return Array.from(maps.keys()).map((roundId, i) => {
				return {
					id: roundId,
					name: `Round ${i + 1}`,
				};
			});
		}

		if (bracket.type === "double_elimination") {
			const winners = getRounds({ type: "winners", bracketData });
			const losers = getRounds({ type: "losers", bracketData });

			return [...winners, ...losers];
		}

		if (bracket.type === "single_elimination") {
			const rounds = getRounds({ type: "single", bracketData });

			const hasThirdPlaceMatch = rounds.some((round) => round.group_id === 1);

			if (!thirdPlaceMatchLinked || !hasThirdPlaceMatch) return rounds;

			return rounds
				.filter((round) => round.group_id !== 1)
				.map((round) =>
					round.name === "Finals"
						? {
								...round,
								name: TOURNAMENT.ROUND_NAMES.FINALS_THIRD_PLACE_MATCH_UNIFIED,
							}
						: round,
				);
		}

		if (bracket.type === "double_elimination_groups") {
			return Array.from(maps.keys()).map((roundId, i) => {
				return {
					id: roundId,
					name: `Round ${i + 1}`,
				};
			});
		}

		assertUnreachable(bracket.type);
	}, [bracketData, maps, bracket.type, thirdPlaceMatchLinked]);

	const mapCountsWithGlobalCount = (newCount: number) => {
		const newMap = new Map(defaultRoundBestOfs);

		for (const [groupId, value] of newMap.entries()) {
			const newGroupMap: typeof value = new Map(value);
			for (const [roundNumber, roundValue] of value.entries()) {
				newGroupMap.set(roundNumber, { ...roundValue, count: newCount });
			}

			newMap.set(groupId, newGroupMap);
		}

		return newMap;
	};

	const mapCountsWithGlobalPickBanStyle = (
		newPickBanStyle: TournamentRoundMaps["pickBan"],
	): Set<number> => {
		if (!newPickBanStyle) {
			return new Set();
		}

		const newRoundsWithPickBan = new Set(roundsWithPickBan);

		for (const round of roundsWithNames) {
			newRoundsWithPickBan.add(round.id);
		}

		return newRoundsWithPickBan;
	};

	const validateNoDecreasingCount = () => {
		for (const groupCounts of mapCounts.values()) {
			let roundPreviousValue = 0;
			for (const [, roundValue] of Array.from(groupCounts.entries()).sort(
				// sort by round number
				(a, b) => a[0] - b[0],
			)) {
				if (roundPreviousValue > roundValue.count) {
					return false;
				}

				roundPreviousValue = roundValue.count;
			}
		}

		// check grands have at least as many maps as winners final (different groups)
		if (bracket.type === "double_elimination") {
			const grandsCounts = Array.from(mapCounts.get(2)?.values() ?? []);
			const winnersCounts = Array.from(mapCounts.get(0)?.values() ?? []);
			const maxWinnersCount = Math.max(...winnersCounts.map((c) => c.count));

			if (grandsCounts.some(({ count }) => count < maxWinnersCount)) {
				return false;
			}
		}

		return true;
	};

	const lacksToSetMapPool =
		tournament.ctx.toSetMapPool.length === 0 &&
		tournament.ctx.mapPickingStyle === "TO";

	const globalSelections =
		bracket.type === "round_robin" || bracket.type === "swiss";

	const needsToPickEliminationTeamCount =
		(bracket.type === "single_elimination" ||
			bracket.type === "double_elimination") &&
		!eliminationTeamCount;

	return (
		<SendouDialog
			heading={`Maplist selection (${bracket.name})`}
			isOpen
			onClose={close}
			isFullScreen
		>
			<fetcher.Form method="post" className={styles.container}>
				<input type="hidden" name="bracketIdx" value={bracketIdx} />
				<input
					type="hidden"
					name="thirdPlaceMatchLinked"
					value={thirdPlaceMatchLinked ? "on" : "off"}
				/>
				<input
					type="hidden"
					name="maps"
					value={JSON.stringify(
						Array.from(maps.entries()).map(([key, value]) => ({
							...value,
							roundId: key,
							groupId: rounds.find((r) => r.id === key)?.group_id,
							type: countType,
						})),
					)}
				/>
				{isPreparing &&
				(bracket.type === "single_elimination" ||
					bracket.type === "double_elimination") ? (
					<input
						type="hidden"
						name="eliminationTeamCount"
						value={eliminationTeamCount ?? -1}
					/>
				) : null}
				<div>
					{preparedMaps ? (
						<div
							className="text-xs text-center text-lighter"
							suppressHydrationWarning
						>
							Prepared by{" "}
							{authorIdToUsername(tournament, preparedMaps.authorId)} @{" "}
							{databaseTimestampToDate(preparedMaps.createdAt).toLocaleString()}
						</div>
					) : null}
				</div>
				{lacksToSetMapPool ? (
					<div>
						You need to select map pool in the{" "}
						<Link to={calendarEditPage(tournament.ctx.eventId)}>
							tournament settings
						</Link>{" "}
						before bracket can be started
					</div>
				) : (
					<>
						<div className="stack horizontal items-center justify-between">
							<div className="stack horizontal lg flex-wrap">
								{isPreparing &&
								(bracket.type === "single_elimination" ||
									bracket.type === "double_elimination") ? (
									<EliminationTeamCountSelect
										count={eliminationTeamCount}
										realCount={bracketTeamsCount}
										setCount={(newCount) => {
											if (!newCount) {
												setEliminationTeamCount(null);
												return;
											}

											const newBracketData = teamCountAdjustedBracketData({
												bracket,
												teamCount: newCount,
											});

											setMaps(
												generateTournamentRoundMaplist({
													mapCounts:
														bracket.defaultRoundBestOfs(newBracketData),
													pool: tournament.ctx.toSetMapPool,
													rounds: newBracketData.round,
													type: bracket.type,
													roundsWithPickBan,
													pickBanStyle,
													patterns,
													countType,
												}),
											);
											setEliminationTeamCount(newCount);
										}}
									/>
								) : null}
								{!needsToPickEliminationTeamCount ? (
									<PickBanSelect
										pickBanStyle={pickBanStyle}
										isOneModeOnly={tournament.modesIncluded.length === 1}
										onPickBanStyleChange={(newPickBanStyle) => {
											let newRoundsWithPickBan = roundsWithPickBan;
											if (globalSelections) {
												newRoundsWithPickBan =
													mapCountsWithGlobalPickBanStyle(newPickBanStyle);
											}

											setPickBanStyle(newPickBanStyle);

											const noPickBanSetBeforeOrAfter =
												!roundsWithPickBan.size && !newRoundsWithPickBan.size;
											const switchedFromCounterpickToAnother =
												(pickBanStyle === "COUNTERPICK" &&
													newPickBanStyle === "COUNTERPICK_MODE_REPEAT_OK") ||
												(pickBanStyle === "COUNTERPICK_MODE_REPEAT_OK" &&
													newPickBanStyle === "COUNTERPICK");
											const shouldSkipRegenerateMaps =
												noPickBanSetBeforeOrAfter ||
												switchedFromCounterpickToAnother;

											if (!shouldSkipRegenerateMaps) {
												setMaps(
													generateTournamentRoundMaplist({
														mapCounts,
														pool: tournament.ctx.toSetMapPool,
														rounds,
														type: bracket.type,
														roundsWithPickBan: newRoundsWithPickBan,
														pickBanStyle: newPickBanStyle,
														patterns,
														countType,
													}),
												);
											}
										}}
									/>
								) : null}
								{globalSelections ? (
									<GlobalCountTypeSelect
										defaultValue={countType}
										onSetCountType={setCountType}
									/>
								) : null}
								{tournament.ctx.mapPickingStyle === "TO" &&
								tournament.modesIncluded.length > 1 &&
								!needsToPickEliminationTeamCount ? (
									<PatternInputs
										patterns={patterns}
										mapCounts={mapCounts}
										onPatternsChange={setPatterns}
									/>
								) : null}
							</div>
							{tournament.ctx.toSetMapPool.length > 0 &&
							!needsToPickEliminationTeamCount ? (
								<SendouButton
									size="small"
									icon={<RefreshArrowsIcon />}
									variant="outlined"
									onPress={() =>
										setMaps(
											generateTournamentRoundMaplist({
												mapCounts,
												pool: tournament.ctx.toSetMapPool,
												rounds,
												type: bracket.type,
												roundsWithPickBan,
												pickBanStyle,
												patterns,
												countType,
											}),
										)
									}
								>
									Reroll all maps
								</SendouButton>
							) : null}
						</div>
						{needsToPickEliminationTeamCount ? (
							<div className="text-center text-lg font-bold my-24">
								Pick the expected teams count above to prepare maps
								<div className="text-lighter text-sm">
									Tip: if uncertain, overestimate the team count. <br /> The
									system can remove unnecessary rounds, but if you choose too
									few, you'll need to repick all the maps.
								</div>
							</div>
						) : (
							<>
								<div className={styles.roundsGrid}>
									{roundsWithNames.map((round) => {
										const roundMaps = maps.get(round.id);
										invariant(roundMaps, "Expected maps to be defined");

										const showUnlinkButton =
											bracket.type === "single_elimination" &&
											thirdPlaceMatchLinked === true &&
											round.name ===
												TOURNAMENT.ROUND_NAMES.FINALS_THIRD_PLACE_MATCH_UNIFIED;
										const showLinkButton =
											bracket.type === "single_elimination" &&
											thirdPlaceMatchLinked === false &&
											round.name === TOURNAMENT.ROUND_NAMES.THIRD_PLACE_MATCH;

										return (
											<RoundMapList
												key={round.id}
												name={round.name}
												maps={roundMaps}
												onHoverMap={setHoveredMap}
												unlink={
													showUnlinkButton
														? () => setThirdPlaceMatchLinked(false)
														: undefined
												}
												link={
													showLinkButton
														? () => setThirdPlaceMatchLinked(true)
														: undefined
												}
												hoveredMap={hoveredMap}
												onCountChange={(newCount) => {
													if (globalSelections) {
														const newMapCounts =
															mapCountsWithGlobalCount(newCount);
														setMaps(
															generateTournamentRoundMaplist({
																mapCounts: newMapCounts,
																pool: tournament.ctx.toSetMapPool,
																rounds,
																type: bracket.type,
																roundsWithPickBan,
																pickBanStyle,
																patterns,
																countType,
															}),
														);
														return;
													}

													const newMapCounts = new Map(mapCounts);
													const bracketRound = rounds.find(
														(r) => r.id === round.id,
													);
													invariant(
														bracketRound,
														"Expected round to be defined",
													);

													const groupInfo = newMapCounts.get(
														bracketRound.group_id,
													);
													invariant(
														groupInfo,
														"Expected group info to be defined",
													);
													const oldMapInfo = newMapCounts
														.get(bracketRound.group_id)
														?.get(bracketRound.number);
													invariant(
														oldMapInfo,
														"Expected map info to be defined",
													);

													groupInfo.set(bracketRound.number, {
														...oldMapInfo,
														count: newCount,
													});

													const newMap = generateTournamentRoundMaplist({
														mapCounts: newMapCounts,
														pool: tournament.ctx.toSetMapPool,
														rounds,
														type: bracket.type,
														roundsWithPickBan,
														pickBanStyle,
														patterns,
														countType,
													}).get(round.id);

													setMaps(new Map(maps).set(round.id, newMap!));
												}}
												onPickBanChange={(hasPickBan) => {
													if (globalSelections) {
														const newRoundsWithPickBan = hasPickBan
															? mapCountsWithGlobalPickBanStyle(pickBanStyle)
															: new Set<number>();

														setMaps(
															generateTournamentRoundMaplist({
																mapCounts,
																pool: tournament.ctx.toSetMapPool,
																rounds,
																type: bracket.type,
																roundsWithPickBan: newRoundsWithPickBan,
																pickBanStyle,
																patterns,
																countType,
															}),
														);
														return;
													}

													const newRoundsWithPickBan = new Set(
														roundsWithPickBan,
													);
													if (hasPickBan) {
														newRoundsWithPickBan.add(round.id);
													} else {
														newRoundsWithPickBan.delete(round.id);
													}

													const newMap = generateTournamentRoundMaplist({
														mapCounts,
														pool: tournament.ctx.toSetMapPool,
														rounds,
														type: bracket.type,
														roundsWithPickBan: newRoundsWithPickBan,
														pickBanStyle,
														patterns,
														countType,
													}).get(round.id);

													setMaps(new Map(maps).set(round.id, newMap!));
												}}
												onRoundMapListChange={(newRoundMaps) => {
													const newMaps = new Map(maps);
													newMaps.set(round.id, newRoundMaps);
													setMaps(newMaps);
												}}
											/>
										);
									})}
								</div>
								{!validateNoDecreasingCount() ? (
									<div className="text-warning text-center">
										Invalid selection: tournament progression decreases in map
										count
									</div>
								) : (
									<SubmitButton
										testId="confirm-finalize-bracket-button"
										_action={isPreparing ? "PREPARE_MAPS" : "START_BRACKET"}
										className="mx-auto mt-4"
									>
										{isPreparing
											? t("common:actions.save")
											: "Start the bracket"}
									</SubmitButton>
								)}
							</>
						)}
					</>
				)}
			</fetcher.Form>
		</SendouDialog>
	);
}

function useCloseModalOnSubmit(
	fetcher: FetcherWithComponents<unknown>,
	close: () => void,
) {
	React.useEffect(() => {
		if (fetcher.state !== "loading") return;

		close();
	}, [fetcher.state, close]);
}

function inferMapCounts({
	bracket,
	data,
	tournamentRoundMapList,
}: {
	bracket: Bracket;
	data: TournamentManagerDataSet;
	tournamentRoundMapList: TournamentRoundMapList;
}) {
	const result: BracketMapCounts = new Map();

	for (const [groupId, value] of bracket.defaultRoundBestOfs(data).entries()) {
		for (const roundNumber of value.keys()) {
			const roundId = data.round.find(
				(round) => round.group_id === groupId && round.number === roundNumber,
			)?.id;
			invariant(typeof roundId === "number", "Expected roundId to be defined");

			const count = tournamentRoundMapList.get(roundId)?.count;

			// skip rounds in RR and Swiss that don't have maps (only one group has maps)
			if (typeof count !== "number") {
				continue;
			}

			result.set(
				groupId,
				new Map(result.get(groupId)).set(roundNumber, {
					count,
					// currently "best of" / "play all" is defined per bracket but in future it might be per round
					// that's why there is this hardcoded default value for now
					type: "BEST_OF",
				}),
			);
		}
	}

	invariant(result.size > 0, "Expected result to be defined");

	return result;
}

function useBracketPreparedMaps(bracketIdx: number) {
	const prepared = useTournamentPreparedMaps();
	const tournament = useTournament();

	return PreparedMaps.resolvePreparedForTheBracket({
		bracketIdx,
		preparedByBracket: prepared,
		tournament,
	});
}

function authorIdToUsername(tournament: Tournament, authorId: number) {
	if (tournament.ctx.author.id === authorId) {
		return tournament.ctx.author.username;
	}

	return (
		tournament.ctx.staff.find((staff) => staff.id === authorId)?.username ??
		tournament.ctx.organization?.members.find(
			(member) => member.userId === authorId,
		)?.username ??
		"???"
	);
}

function teamCountAdjustedBracketData({
	bracket,
	teamCount,
}: {
	bracket: Bracket;
	teamCount: number;
}) {
	switch (bracket.type) {
		case "swiss":
			// always has the same amount of rounds even if 0 participants
			return bracket.data;
		case "round_robin":
			// ensure a full bracket (no bye round) gets generated even if registration is underway
			return bracket.generateMatchesData(
				nullFilledArray(
					bracket.settings?.teamsPerGroup ??
						TOURNAMENT.RR_DEFAULT_TEAM_COUNT_PER_GROUP,
				).map((_, i) => i + 1),
			);
		case "double_elimination_groups":
			// ensure a full bracket gets generated even if registration is underway
			return bracket.generateMatchesData(
				nullFilledArray(
					bracket.settings?.teamsPerGroup ??
						TOURNAMENT.DE_GROUPS_DEFAULT_TEAM_COUNT_PER_GROUP,
				).map((_, i) => i + 1),
			);
		case "single_elimination":
		case "double_elimination":
			return bracket.generateMatchesData(
				nullFilledArray(teamCount).map((_, i) => i + 1),
			);
	}
}

function EliminationTeamCountSelect({
	count,
	realCount,
	setCount,
}: {
	count: number | null;
	realCount: number;
	setCount: (count: number | null) => void;
}) {
	return (
		<div>
			<Label htmlFor="elimination-team-count">Expected teams</Label>
			<select
				id="elimination-team-count"
				onChange={(e) =>
					setCount(e.target.value === "" ? null : Number(e.target.value))
				}
				defaultValue={count ?? ""}
			>
				<option value="">Select count</option>
				{PreparedMaps.eliminationTeamCountOptions(realCount).map(
					(teamCountRange) => {
						const label =
							teamCountRange.min === teamCountRange.max
								? teamCountRange.min
								: `${teamCountRange.min}-${teamCountRange.max}`;

						return (
							<option key={teamCountRange.max} value={teamCountRange.max}>
								{label}
							</option>
						);
					},
				)}
			</select>
		</div>
	);
}

function GlobalCountTypeSelect({
	defaultValue,
	onSetCountType,
}: {
	defaultValue: TournamentRoundMaps["type"];
	onSetCountType: (type: TournamentRoundMaps["type"]) => void;
}) {
	return (
		<div>
			<Label htmlFor="count-type">Count type</Label>
			<select
				id="count-type"
				onChange={(e) =>
					onSetCountType(e.target.value as TournamentRoundMaps["type"])
				}
				defaultValue={defaultValue}
			>
				<option value="BEST_OF">Best of</option>
				<option value="PLAY_ALL">Play all</option>
			</select>
		</div>
	);
}

function PickBanSelect({
	pickBanStyle,
	isOneModeOnly,
	onPickBanStyleChange,
}: {
	pickBanStyle: NonNullable<TournamentRoundMaps["pickBan"]>;
	isOneModeOnly: boolean;
	onPickBanStyleChange: (
		pickBanStyle: NonNullable<TournamentRoundMaps["pickBan"]>,
	) => void;
}) {
	const pickBanSelectText: Record<PickBan.Type, string> = {
		COUNTERPICK: "Counterpick",
		COUNTERPICK_MODE_REPEAT_OK: "Counterpick (mode repeat allowed)",
		BAN_2: "Ban 2",
	};

	// selection doesn't make sense for one mode only tournaments as you have to repeat the mode
	const availableTypes = PickBan.types.filter(
		(type) => !isOneModeOnly || type !== "COUNTERPICK_MODE_REPEAT_OK",
	);

	return (
		<div>
			<div className="stack horizontal xs items-center">
				<PickIcon className="w-4" />
				<Label htmlFor="pick-ban-style">Pick/ban style</Label>
			</div>
			<select
				className={styles.pickBanSelect}
				id="pick-ban-style"
				value={pickBanStyle}
				onChange={(e) =>
					onPickBanStyleChange(
						e.target.value as NonNullable<TournamentRoundMaps["pickBan"]>,
					)
				}
			>
				{availableTypes.map((type) => (
					<option key={type} value={type}>
						{pickBanSelectText[type]}
					</option>
				))}
			</select>
		</div>
	);
}

const serializedMapMode = (
	map: NonNullable<TournamentRoundMaps["list"]>[number],
) => `${map.mode}-${map.stageId}`;

function RoundMapList({
	name,
	maps,
	onHoverMap,
	onCountChange,
	onPickBanChange,
	onRoundMapListChange,
	unlink,
	link,
	hoveredMap,
}: {
	name: string;
	maps: Omit<TournamentRoundMaps, "type">;
	onHoverMap: (map: string | null) => void;
	onCountChange: (count: number) => void;
	onPickBanChange: (hasPickBan: boolean) => void;
	onRoundMapListChange: (maps: Omit<TournamentRoundMaps, "type">) => void;
	unlink?: () => void;
	link?: () => void;
	hoveredMap: string | null;
}) {
	const tournament = useTournament();

	const minCount = TOURNAMENT.AVAILABLE_BEST_OF[0];
	const maxCount = TOURNAMENT.AVAILABLE_BEST_OF.at(-1)!;

	return (
		<div>
			<h3>{name}</h3>
			<div className={styles.roundControls}>
				<button
					type="button"
					className={styles.roundButton}
					onClick={() => onCountChange(Math.max(minCount, maps.count - 2))}
					disabled={maps.count <= minCount}
				>
					<MinusIcon />
				</button>
				<div className={clsx(styles.roundButton, styles.roundButtonNumber)}>
					{maps.count}
				</div>
				<button
					type="button"
					className={styles.roundButton}
					onClick={() => onCountChange(Math.min(maxCount, maps.count + 2))}
					disabled={maps.count >= maxCount}
					data-testid="increase-map-count-button"
				>
					<PlusIcon />
				</button>
				<div className={styles.roundControlsDivider} />
				<button
					type="button"
					className={clsx(styles.roundButton, {
						[styles.roundButtonActive]: maps.pickBan,
					})}
					onClick={() => onPickBanChange(!maps.pickBan)}
					title="Toggle counterpick/ban"
				>
					<PickIcon />
				</button>
				{unlink ? (
					<button
						type="button"
						className={styles.roundButton}
						onClick={unlink}
						title="Enter finals and 3rd place match separately"
						data-testid="unlink-finals-3rd-place-match-button"
					>
						<UnlinkIcon />
					</button>
				) : null}
				{link ? (
					<button
						type="button"
						className={styles.roundButton}
						onClick={link}
						title="Link finals and 3rd place match to use the same maps"
						data-testid="link-finals-3rd-place-match-button"
					>
						<LinkIcon />
					</button>
				) : null}
			</div>
			<ol className="pl-0">
				{nullFilledArray(
					maps.pickBan === "BAN_2" ? maps.count + 2 : maps.count,
				).map((_, i) => {
					const map = maps.list?.[i];

					if (map) {
						return (
							<MapListRow
								key={i}
								map={map}
								number={i + 1}
								onHoverMap={onHoverMap}
								hoveredMap={hoveredMap}
								onMapChange={(map) => {
									onRoundMapListChange({
										...maps,
										list: maps.list?.map((m, j) => (i === j ? map : m)),
									});
								}}
							/>
						);
					}

					const isTeamsPick = !maps.list && i === 0;
					const isLast =
						i === (maps.pickBan === "BAN_2" ? maps.count + 2 : maps.count) - 1;

					return (
						<MysteryRow
							key={i}
							number={i + 1}
							isCounterpicks={!isTeamsPick && maps.pickBan === "COUNTERPICK"}
							isTiebreaker={
								tournament.ctx.mapPickingStyle === "AUTO_ALL" && isLast
							}
						/>
					);
				})}
			</ol>
		</div>
	);
}

function MapListRow({
	map,
	number,
	onHoverMap,
	hoveredMap,
	onMapChange,
}: {
	map: NonNullable<TournamentRoundMaps["list"]>[number];
	number: number;
	onHoverMap: (map: string | null) => void;
	hoveredMap: string | null;
	onMapChange: (map: NonNullable<TournamentRoundMaps["list"]>[number]) => void;
}) {
	const { t } = useTranslation(["game-misc"]);
	const tournament = useTournament();

	return (
		<li
			className={clsx(styles.mapListRow, {
				"text-theme-secondary underline": serializedMapMode(map) === hoveredMap,
			})}
			onMouseEnter={() => onHoverMap(serializedMapMode(map))}
		>
			<div className={styles.mapSelectContainer}>
				<span className="text-sm text-lighter font-semi-bold">{number}.</span>
				<ModeImage mode={map.mode} size={24} />
				<StageImage stageId={map.stageId} height={24} className="rounded-sm" />
				{t(`game-misc:STAGE_${map.stageId}`)}
				<select
					className={styles.mapSelect}
					value={serializedMapMode(map)}
					onChange={(e) => {
						const [mode, stageId] = e.target.value.split("-");
						onMapChange({
							mode: mode as ModeShort,
							stageId: Number(stageId) as StageId,
						});
					}}
				>
					{modesShort.map((mode) => {
						const mapsForMode = tournament.ctx.toSetMapPool.filter(
							(m) => m.mode === mode,
						);

						if (mapsForMode.length === 0) return null;

						return (
							<optgroup key={mode} label={t(`game-misc:MODE_LONG_${mode}`)}>
								{mapsForMode.map((m) => (
									<option
										key={serializedMapMode(m)}
										value={serializedMapMode(m)}
									>
										{t(`game-misc:MODE_SHORT_${mode}`)}{" "}
										{t(`game-misc:STAGE_${m.stageId}`)}
									</option>
								))}
							</optgroup>
						);
					})}
				</select>
				<ChevronUpDownIcon className={styles.mapSelectIcon} />
			</div>
		</li>
	);
}

function MysteryRow({
	number,
	isCounterpicks,
	isTiebreaker,
}: {
	number: number;
	isCounterpicks: boolean;
	isTiebreaker: boolean;
}) {
	return (
		<li className={styles.mapListRow}>
			<div
				className={clsx("stack horizontal items-center xs text-lighter", {
					"text-info": isCounterpicks,
				})}
			>
				<span className="text-lg">{number}.</span>
				{isCounterpicks
					? "Counterpick"
					: isTiebreaker
						? "Tiebreaker"
						: "Team's pick"}
			</div>
		</li>
	);
}

function PatternInputs({
	patterns,
	mapCounts,
	onPatternsChange,
}: {
	patterns: Map<number, string>;
	mapCounts: BracketMapCounts;
	onPatternsChange: (patterns: Map<number, string>) => void;
}) {
	const uniqueCounts = new Set<number>();
	for (const groupCounts of mapCounts.values()) {
		for (const { count } of groupCounts.values()) {
			uniqueCounts.add(count);
		}
	}

	const sortedCounts = Array.from(uniqueCounts).sort((a, b) => a - b);

	return (
		<div>
			<div className="stack horizontal xs items-center">
				<Label>Mode patterns</Label>
				<InfoPopover tiny className={styles.infoPopover}>
					<div>Control the mode selection with a pattern. Examples:</div>
					<div className={styles.patternExample}>
						<code className={styles.patternCode}>*SZ*</code>
						<span className={styles.patternExplanation}>Any, SZ, any mode</span>
					</div>
					<div className={styles.patternExample}>
						<code className={styles.patternCode}>SZ*RM</code>
						<span className={styles.patternExplanation}>SZ, any, RM</span>
					</div>
					<div className={styles.patternExample}>
						<code className={styles.patternCode}>[TC]</code>
						<span className={styles.patternExplanation}>Must include TC</span>
					</div>
					<div className={styles.patternExample}>
						<code className={styles.patternCode}>[RM!]</code>
						<span className={styles.patternExplanation}>
							RM in guaranteed spots
						</span>
					</div>
					<div className={styles.patternExample}>
						<code className={styles.patternCode}>[TC]*SZ*</code>
						<span className={styles.patternExplanation}>
							TC once + every 2nd is SZ
						</span>
					</div>
				</InfoPopover>
			</div>
			<div className="stack horizontal xs">
				{sortedCounts.map((count) => (
					<Input
						key={count}
						className={styles.patternInput}
						leftAddon={`Bo${count}`}
						value={patterns.get(count) ?? ""}
						placeholder="[TC]*SZ*"
						onChange={(e) => {
							const newPatterns = new Map(patterns);
							if (e.target.value) {
								newPatterns.set(count, e.target.value);
							} else {
								newPatterns.delete(count);
							}
							onPatternsChange(newPatterns);
						}}
					/>
				))}
			</div>
		</div>
	);
}
