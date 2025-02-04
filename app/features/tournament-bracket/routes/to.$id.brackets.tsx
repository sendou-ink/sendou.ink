import type { ActionFunction } from "@remix-run/node";
import { useRevalidator } from "@remix-run/react";
import clsx from "clsx";
import { sub } from "date-fns";
import * as React from "react";
import { ErrorBoundary } from "react-error-boundary";
import { useTranslation } from "react-i18next";
import { useCopyToClipboard } from "react-use";
import { useEventSource } from "remix-utils/sse/react";
import { Alert } from "~/components/Alert";
import { Button } from "~/components/Button";
import { Divider } from "~/components/Divider";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { Menu } from "~/components/Menu";
import { SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import { CheckmarkIcon } from "~/components/icons/Checkmark";
import { EyeIcon } from "~/components/icons/Eye";
import { EyeSlashIcon } from "~/components/icons/EyeSlash";
import { MapIcon } from "~/components/icons/Map";
import { sql } from "~/db/sql";
import { useUser } from "~/features/auth/core/user";
import { requireUser } from "~/features/auth/core/user.server";
import {
	queryCurrentTeamRating,
	queryCurrentUserRating,
	queryCurrentUserSeedingRating,
	queryTeamPlayerRatingAverage,
} from "~/features/mmr/mmr-utils.server";
import { currentSeason } from "~/features/mmr/season";
import { refreshUserSkills } from "~/features/mmr/tiered.server";
import { TOURNAMENT, tournamentIdFromParams } from "~/features/tournament";
import * as Progression from "~/features/tournament-bracket/core/Progression";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import { createSwissBracketInTransaction } from "~/features/tournament/queries/createSwissBracketInTransaction.server";
import { updateRoundMaps } from "~/features/tournament/queries/updateRoundMaps.server";
import { useIsMounted } from "~/hooks/useIsMounted";
import { useSearchParamState } from "~/hooks/useSearchParamState";
import { useVisibilityChange } from "~/hooks/useVisibilityChange";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";
import { parseRequestPayload, validate } from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import {
	SENDOU_INK_BASE_URL,
	tournamentBracketsSubscribePage,
	tournamentJoinPage,
} from "~/utils/urls";
import { updateTeamSeeds } from "../../tournament/queries/updateTeamSeeds.server";
import {
	useBracketExpanded,
	useTournament,
	useTournamentPreparedMaps,
} from "../../tournament/routes/to.$id";
import { Bracket } from "../components/Bracket";
import { BracketMapListDialog } from "../components/BracketMapListDialog";
import { TournamentTeamActions } from "../components/TournamentTeamActions";
import type { Bracket as BracketType } from "../core/Bracket";
import * as PreparedMaps from "../core/PreparedMaps";
import * as Swiss from "../core/Swiss";
import type { Tournament } from "../core/Tournament";
import {
	clearTournamentDataCache,
	tournamentFromDB,
} from "../core/Tournament.server";
import { getServerTournamentManager } from "../core/brackets-manager/manager.server";
import { roundMapsFromInput } from "../core/mapList.server";
import { tournamentSummary } from "../core/summarizer.server";
import { addSummary } from "../queries/addSummary.server";
import { allMatchResultsByTournamentId } from "../queries/allMatchResultsByTournamentId.server";
import { bracketSchema } from "../tournament-bracket-schemas.server";
import {
	bracketSubscriptionKey,
	fillWithNullTillPowerOfTwo,
} from "../tournament-bracket-utils";

import "../components/Bracket/bracket.css";
import "../tournament-bracket.css";

export const action: ActionFunction = async ({ params, request }) => {
	const user = await requireUser(request);
	const tournamentId = tournamentIdFromParams(params);
	const tournament = await tournamentFromDB({ tournamentId, user });
	const data = await parseRequestPayload({ request, schema: bracketSchema });
	const manager = getServerTournamentManager();

	switch (data._action) {
		case "START_BRACKET": {
			validate(tournament.isOrganizer(user));

			const bracket = tournament.bracketByIdx(data.bracketIdx);
			invariant(bracket, "Bracket not found");

			const seeding = bracket.seeding;
			invariant(seeding, "Seeding not found");

			validate(bracket.canBeStarted, "Bracket is not ready to be started");

			const groupCount = new Set(bracket.data.round.map((r) => r.group_id))
				.size;

			validate(
				bracket.type === "round_robin" || bracket.type === "swiss"
					? bracket.data.round.length / groupCount === data.maps.length
					: bracket.data.round.length === data.maps.length,
				"Invalid map count",
			);

			sql.transaction(() => {
				const stage =
					bracket.type === "swiss"
						? createSwissBracketInTransaction(
								Swiss.create({
									name: bracket.name,
									seeding,
									tournamentId,
									settings: tournament.bracketManagerSettings(
										bracket.settings,
										bracket.type,
										seeding.length,
									),
								}),
							)
						: manager.create({
								tournamentId,
								name: bracket.name,
								type: bracket.type as "round_robin",
								seeding:
									bracket.type === "round_robin"
										? seeding
										: fillWithNullTillPowerOfTwo(seeding),
								settings: tournament.bracketManagerSettings(
									bracket.settings,
									bracket.type,
									seeding.length,
								),
							});

				updateRoundMaps(
					roundMapsFromInput({
						virtualRounds: bracket.data.round,
						roundsFromDB: manager.get.stageData(stage.id).round,
						maps: data.maps,
						bracket,
					}),
				);

				// ensures autoseeding is disabled
				const isAllSeedsPersisted = tournament.ctx.teams.every(
					(team) => typeof team.seed === "number",
				);
				if (!isAllSeedsPersisted) {
					updateTeamSeeds({
						tournamentId: tournament.ctx.id,
						teamIds: tournament.ctx.teams.map((team) => team.id),
					});
				}
			})();

			break;
		}
		case "PREPARE_MAPS": {
			validate(tournament.isOrganizer(user));

			const bracket = tournament.bracketByIdx(data.bracketIdx);
			invariant(bracket, "Bracket not found");

			validate(
				!bracket.canBeStarted,
				"Bracket can already be started, preparing maps no longer possible",
			);
			validate(
				bracket.preview,
				"Bracket has started, preparing maps no longer possible",
			);

			await TournamentRepository.upsertPreparedMaps({
				bracketIdx: data.bracketIdx,
				tournamentId,
				maps: {
					maps: data.maps,
					authorId: user.id,
					eliminationTeamCount: data.eliminationTeamCount ?? undefined,
				},
			});

			break;
		}
		case "ADVANCE_BRACKET": {
			validate(tournament.isOrganizer(user));

			const bracket = tournament.bracketByIdx(data.bracketIdx);
			validate(bracket, "Bracket not found");
			validate(bracket.type === "swiss", "Can't advance non-swiss bracket");

			const matches = Swiss.generateMatchUps({
				bracket,
				groupId: data.groupId,
			});

			await TournamentRepository.insertSwissMatches(matches);

			break;
		}
		case "UNADVANCE_BRACKET": {
			validate(tournament.isOrganizer(user));

			const bracket = tournament.bracketByIdx(data.bracketIdx);
			validate(bracket, "Bracket not found");
			validate(bracket.type === "swiss", "Can't unadvance non-swiss bracket");
			validateNoFollowUpBrackets(tournament);

			await TournamentRepository.deleteSwissMatches({
				groupId: data.groupId,
				roundId: data.roundId,
			});

			break;
		}
		case "FINALIZE_TOURNAMENT": {
			validate(tournament.canFinalize(user), "Can't finalize tournament");

			const _finalStandings = tournament.standings;

			const results = allMatchResultsByTournamentId(tournamentId);
			invariant(results.length > 0, "No results found");

			const season = currentSeason(tournament.ctx.startTime)?.nth;

			const seedingSkillCountsFor = tournament.skillCountsFor;
			const summary = tournamentSummary({
				teams: tournament.ctx.teams,
				finalStandings: _finalStandings,
				results,
				calculateSeasonalStats: tournament.ranked,
				queryCurrentTeamRating: (identifier) =>
					queryCurrentTeamRating({ identifier, season: season! }).rating,
				queryCurrentUserRating: (userId) =>
					queryCurrentUserRating({ userId, season: season! }).rating,
				queryTeamPlayerRatingAverage: (identifier) =>
					queryTeamPlayerRatingAverage({
						identifier,
						season: season!,
					}),
				queryCurrentSeedingRating: (userId) =>
					queryCurrentUserSeedingRating({
						userId,
						type: seedingSkillCountsFor!,
					}),
				seedingSkillCountsFor,
			});

			logger.info(
				`Inserting tournament summary. Tournament id: ${tournamentId}, mapResultDeltas.lenght: ${summary.mapResultDeltas.length}, playerResultDeltas.length ${summary.playerResultDeltas.length}, tournamentResults.length ${summary.tournamentResults.length}, skills.length ${summary.skills.length}, seedingSkills.length ${summary.seedingSkills.length}`,
			);

			addSummary({
				tournamentId,
				summary,
				season,
			});

			if (tournament.ranked) {
				try {
					refreshUserSkills(season!);
				} catch (error) {
					logger.warn("Error refreshing user skills", error);
				}
			}

			break;
		}
		case "BRACKET_CHECK_IN": {
			const bracket = tournament.bracketByIdx(data.bracketIdx);
			invariant(bracket, "Bracket not found");

			const ownTeam = tournament.ownedTeamByUser(user);
			invariant(ownTeam, "User doesn't have owned team");

			validate(bracket.canCheckIn(user));

			await TournamentRepository.checkIn({
				bracketIdx: data.bracketIdx,
				tournamentTeamId: ownTeam.id,
			});
			break;
		}
		case "OVERRIDE_BRACKET_PROGRESSION": {
			validate(tournament.isOrganizer(user));

			const allDestinationBrackets = Progression.destinationsFromBracketIdx(
				data.sourceBracketIdx,
				tournament.ctx.settings.bracketProgression,
			);
			validate(
				data.destinationBracketIdx === -1 ||
					allDestinationBrackets.includes(data.destinationBracketIdx),
				"Invalid destination bracket",
			);
			validate(
				allDestinationBrackets.every(
					(bracketIdx) => tournament.bracketByIdx(bracketIdx)!.preview,
				),
				"Can't override progression if follow-up brackets are started",
			);

			await TournamentRepository.overrideTeamBracketProgression({
				tournamentTeamId: data.tournamentTeamId,
				sourceBracketIdx: data.sourceBracketIdx,
				destinationBracketIdx: data.destinationBracketIdx,
				tournamentId,
			});
			break;
		}
		default: {
			assertUnreachable(data);
		}
	}

	clearTournamentDataCache(tournamentId);

	return null;
};

function validateNoFollowUpBrackets(tournament: Tournament) {
	const followUpBrackets = tournament.brackets.filter((b) =>
		b.sources?.some((source) => source.bracketIdx === 0),
	);

	validate(
		followUpBrackets.every((b) => b.preview),
		"Follow-up brackets are already started",
	);
}

export default function TournamentBracketsPage() {
	const { t } = useTranslation(["tournament"]);
	const visibility = useVisibilityChange();
	const { revalidate } = useRevalidator();
	const user = useUser();
	const tournament = useTournament();
	const isMounted = useIsMounted();

	const defaultBracketIdx = () => {
		if (
			tournament.brackets.length === 1 ||
			tournament.brackets[1].isUnderground ||
			!tournament.brackets[0].everyMatchOver
		) {
			return 0;
		}

		return 1;
	};
	const [bracketIdx, setBracketIdx] = useSearchParamState({
		defaultValue: defaultBracketIdx(),
		name: "idx",
		revive: Number,
	});

	const bracket = React.useMemo(
		() => tournament.bracketByIdxOrDefault(bracketIdx),
		[tournament, bracketIdx],
	);

	React.useEffect(() => {
		if (visibility !== "visible" || tournament.everyBracketOver) return;

		revalidate();
	}, [visibility, revalidate, tournament.everyBracketOver]);

	const showAddSubsButton =
		!tournament.canFinalize(user) &&
		!tournament.everyBracketOver &&
		tournament.hasStarted &&
		tournament.autonomousSubs;

	const showPrepareMapsButton =
		tournament.isOrganizer(user) &&
		!bracket.canBeStarted &&
		bracket.preview &&
		isMounted;

	const waitingForTeamsText = () => {
		if (bracketIdx > 0 || tournament.regularCheckInStartInThePast) {
			return t("tournament:bracket.waiting.checkin", {
				count: TOURNAMENT.ENOUGH_TEAMS_TO_START,
			});
		}

		return t("tournament:bracket.waiting", {
			count: TOURNAMENT.ENOUGH_TEAMS_TO_START,
		});
	};

	const teamsSourceText = () => {
		if (
			tournament.brackets[0].type === "round_robin" &&
			!bracket.isUnderground
		) {
			return `Teams that place in the top ${Math.max(
				...(bracket.sources ?? []).flatMap((s) => s.placements),
			)} of their group will advance to this stage`;
		}

		if (
			tournament.brackets[0].type === "round_robin" &&
			bracket.isUnderground
		) {
			const placements = (
				bracket.sources?.flatMap((s) => s.placements) ?? []
			).sort((a, b) => a - b);

			return `Teams that don't advance to the final stage can play in this bracket (placements: ${placements.join(", ")})`;
		}

		if (
			tournament.brackets[0].type === "double_elimination" &&
			bracket.isUnderground
		) {
			return `Teams that get eliminated in the first ${Math.abs(
				Math.min(...(bracket.sources ?? []).flatMap((s) => s.placements)),
			)} rounds of the losers bracket can play in this bracket`;
		}

		return null;
	};

	const totalTeamsAvailableForTheBracket = () => {
		if (bracket.sources) {
			return (
				(bracket.teamsPendingCheckIn ?? []).length +
				bracket.participantTournamentTeamIds.length
			);
		}

		if (!tournament.isMultiStartingBracket) {
			return tournament.ctx.teams.length;
		}

		return tournament.ctx.teams.filter(
			(team) => (team.startingBracketIdx ?? 0) === bracketIdx,
		).length;
	};

	if (tournament.isLeagueSignup) {
		return null;
	}

	return (
		<div>
			{visibility !== "hidden" && !tournament.everyBracketOver ? (
				<AutoRefresher />
			) : null}
			{tournament.canFinalize(user) ? (
				<div className="tournament-bracket__finalize">
					<FormWithConfirm
						dialogHeading={t("tournament:actions.finalize.confirm")}
						fields={[["_action", "FINALIZE_TOURNAMENT"]]}
						deleteButtonText={t("tournament:actions.finalize.action")}
						submitButtonVariant="outlined"
					>
						<Button variant="minimal" testId="finalize-tournament-button">
							{t("tournament:actions.finalize.question")}
						</Button>
					</FormWithConfirm>
				</div>
			) : null}
			{bracket.preview &&
			bracket.enoughTeams &&
			tournament.isOrganizer(user) &&
			tournament.regularCheckInStartInThePast ? (
				<div className="stack items-center mb-4">
					<div className="stack sm items-center">
						<Alert
							variation="INFO"
							alertClassName="tournament-bracket__start-bracket-alert"
							textClassName="stack horizontal md items-center"
						>
							{bracket.participantTournamentTeamIds.length}/
							{totalTeamsAvailableForTheBracket()} teams checked in
							{bracket.canBeStarted ? (
								<BracketStarter bracket={bracket} bracketIdx={bracketIdx} />
							) : null}
						</Alert>
						{!bracket.canBeStarted ? (
							<div className="tournament-bracket__mini-alert">
								⚠️{" "}
								{bracketIdx === 0 ? (
									<>Tournament start time is in the future</>
								) : bracket.startTime && bracket.startTime > new Date() ? (
									<>Bracket start time is in the future</>
								) : (
									<>Teams pending from the previous bracket</>
								)}{" "}
								(blocks starting)
							</div>
						) : null}
					</div>
				</div>
			) : null}
			<div className="stack horizontal mb-4 sm justify-between items-center">
				<TournamentTeamActions />
				{showAddSubsButton ? (
					// TODO: could also hide this when team is not in any bracket anymore
					<AddSubsPopOver />
				) : null}
			</div>
			<div className="stack md">
				<div className="stack horizontal sm">
					<BracketNav bracketIdx={bracketIdx} setBracketIdx={setBracketIdx} />
					{bracket.type !== "round_robin" && !bracket.preview ? (
						<CompactifyButton />
					) : null}
					{showPrepareMapsButton ? (
						// Error Boundary because preparing maps is optional, so no need to make the whole page inaccessible if it fails
						<ErrorBoundary fallback={null}>
							<MapPreparer bracket={bracket} bracketIdx={bracketIdx} />
						</ErrorBoundary>
					) : null}
				</div>
				{bracket.enoughTeams ? (
					<Bracket bracket={bracket} bracketIdx={bracketIdx} />
				) : null}
			</div>
			{!bracket.enoughTeams ? (
				<div>
					<div className="text-center text-lg font-semi-bold text-lighter mt-6">
						{waitingForTeamsText()}
					</div>
					{bracket.sources ? (
						<div className="text-center text-sm font-semi-bold text-lighter mt-2">
							{teamsSourceText()}
						</div>
					) : null}
					{bracket.requiresCheckIn ? (
						<div className="text-center text-sm font-semi-bold text-lighter mt-2 text-warning">
							Bracket requires check-in{" "}
							{bracket.startTime ? (
								<span suppressHydrationWarning>
									(open{" "}
									{sub(bracket.startTime, { hours: 1 }).toLocaleString(
										"en-US",
										{
											hour: "numeric",
											minute: "numeric",
											weekday: "long",
										},
									)}{" "}
									-{" "}
									{bracket.startTime.toLocaleTimeString("en-US", {
										hour: "numeric",
										minute: "numeric",
									})}
									)
								</span>
							) : null}
						</div>
					) : null}
				</div>
			) : null}
		</div>
	);
}

function AutoRefresher() {
	useAutoRefresh();

	return null;
}

function useAutoRefresh() {
	const { revalidate } = useRevalidator();
	const tournament = useTournament();
	const lastEvent = useEventSource(
		tournamentBracketsSubscribePage(tournament.ctx.id),
		{
			event: bracketSubscriptionKey(tournament.ctx.id),
		},
	);

	React.useEffect(() => {
		if (!lastEvent) return;

		// TODO: maybe later could look into not revalidating unless bracket advanced but do something fancy in the tournament class instead
		revalidate();
	}, [lastEvent, revalidate]);
}

function BracketStarter({
	bracket,
	bracketIdx,
}: {
	bracket: BracketType;
	bracketIdx: number;
}) {
	const [dialogOpen, setDialogOpen] = React.useState(false);
	const isMounted = useIsMounted();

	const close = React.useCallback(() => {
		setDialogOpen(false);
	}, []);

	return (
		<>
			{isMounted ? (
				<BracketMapListDialog
					isOpen={dialogOpen}
					close={close}
					bracket={bracket}
					bracketIdx={bracketIdx}
					key={bracketIdx}
				/>
			) : null}
			<Button
				variant="outlined"
				size="tiny"
				testId="finalize-bracket-button"
				onClick={() => setDialogOpen(true)}
			>
				Start the bracket
			</Button>
		</>
	);
}

function MapPreparer({
	bracket,
	bracketIdx,
}: {
	bracket: BracketType;
	bracketIdx: number;
}) {
	const [dialogOpen, setDialogOpen] = React.useState(false);
	const isMounted = useIsMounted();
	const prepared = useTournamentPreparedMaps();
	const tournament = useTournament();

	const hasPreparedMaps = Boolean(
		PreparedMaps.resolvePreparedForTheBracket({
			bracketIdx,
			preparedByBracket: prepared,
			tournament,
		}),
	);

	const close = React.useCallback(() => {
		setDialogOpen(false);
	}, []);

	return (
		<>
			{isMounted ? (
				<BracketMapListDialog
					isOpen={dialogOpen}
					close={close}
					bracket={bracket}
					bracketIdx={bracketIdx}
					isPreparing
					key={bracketIdx}
				/>
			) : null}
			<div className="stack sm horizontal ml-auto">
				{hasPreparedMaps ? (
					<CheckmarkIcon
						className="fill-success w-6"
						testId="prepared-maps-check-icon"
					/>
				) : null}
				<Button
					size="tiny"
					variant="outlined"
					icon={<MapIcon />}
					onClick={() => setDialogOpen(true)}
					testId="prepare-maps-button"
				>
					Prepare maps
				</Button>
			</div>
		</>
	);
}

function AddSubsPopOver() {
	const { t } = useTranslation(["common", "tournament"]);
	const [, copyToClipboard] = useCopyToClipboard();
	const tournament = useTournament();
	const user = useUser();

	const ownedTeam = tournament.ownedTeamByUser(user);
	if (!ownedTeam) {
		const teamMemberOf = tournament.teamMemberOfByUser(user);
		if (!teamMemberOf) return null;

		return <SubsPopover>Only team captain or a TO can add subs</SubsPopover>;
	}

	const subsAvailableToAdd =
		tournament.maxTeamMemberCount - ownedTeam.members.length;

	const inviteLink = `${SENDOU_INK_BASE_URL}${tournamentJoinPage({
		tournamentId: tournament.ctx.id,
		inviteCode: ownedTeam.inviteCode,
	})}`;

	return (
		<SubsPopover>
			{t("tournament:actions.sub.prompt", { count: subsAvailableToAdd })}
			{subsAvailableToAdd > 0 ? (
				<>
					<Divider className="my-2" />
					<div>{t("tournament:actions.shareLink", { inviteLink })}</div>
					<div className="my-2 flex justify-center">
						<Button
							size="tiny"
							onClick={() => copyToClipboard(inviteLink)}
							variant="minimal"
							className="tiny"
							testId="copy-invite-link-button"
						>
							{t("common:actions.copyToClipboard")}
						</Button>
					</div>
				</>
			) : null}
		</SubsPopover>
	);
}

function SubsPopover({ children }: { children: React.ReactNode }) {
	const { t } = useTranslation(["tournament"]);

	return (
		<SendouPopover
			popoverClassName="text-xs"
			trigger={
				<SendouButton
					className="ml-auto"
					variant="outlined"
					size="small"
					data-testid="add-sub-button"
				>
					{t("tournament:actions.addSub")}
				</SendouButton>
			}
		>
			{children}
		</SendouPopover>
	);
}

function BracketNav({
	bracketIdx,
	setBracketIdx,
}: {
	bracketIdx: number;
	setBracketIdx: (bracketIdx: number) => void;
}) {
	const tournament = useTournament();

	const shouldRender = () => {
		const brackets = tournament.ctx.isFinalized
			? tournament.brackets.filter((b) => !b.preview)
			: tournament.ctx.settings.bracketProgression;

		return brackets.length > 1;
	};

	if (!shouldRender()) return null;

	const visibleBrackets = tournament.ctx.settings.bracketProgression.filter(
		// an underground bracket was never played despite being in the format
		(_, i) =>
			!tournament.ctx.isFinalized ||
			!tournament.bracketByIdxOrDefault(i).preview,
	);

	const bracketNameForButton = (name: string) => name.replace("bracket", "");

	const button = React.forwardRef((props, ref) => (
		<Button
			className="tournament-bracket__bracket-nav__link"
			_ref={ref}
			{...props}
		>
			{bracketNameForButton(tournament.bracketByIdxOrDefault(bracketIdx).name)}
			<span className="tournament-bracket__bracket-nav__chevron">▼</span>
		</Button>
	));

	return (
		<>
			{/** MOBILE */}
			<Menu
				items={visibleBrackets.map((bracket, i) => {
					return {
						id: bracket.name,
						onClick: () => setBracketIdx(i),
						text: bracketNameForButton(bracket.name),
					};
				})}
				button={button}
				className="tournament-bracket__menu"
			/>
			{/** DESKTOP */}
			<div className="tournament-bracket__bracket-nav tournament-bracket__button-row">
				{visibleBrackets.map((bracket, i) => {
					return (
						<Button
							key={bracket.name}
							onClick={() => setBracketIdx(i)}
							className={clsx("tournament-bracket__bracket-nav__link", {
								"tournament-bracket__bracket-nav__link__selected":
									bracketIdx === i,
							})}
						>
							{bracketNameForButton(bracket.name)}
						</Button>
					);
				})}
			</div>
		</>
	);
}

function CompactifyButton() {
	const { bracketExpanded, setBracketExpanded } = useBracketExpanded();

	return (
		<Button
			onClick={() => {
				setBracketExpanded(!bracketExpanded);
			}}
			className="tournament-bracket__compactify-button"
			icon={bracketExpanded ? <EyeSlashIcon /> : <EyeIcon />}
		>
			{bracketExpanded ? "Compactify" : "Show all"}
		</Button>
	);
}
