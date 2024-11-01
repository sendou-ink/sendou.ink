import {
	DndContext,
	DragOverlay,
	KeyboardSensor,
	PointerSensor,
	closestCenter,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	SortableContext,
	arrayMove,
	sortableKeyboardCoordinates,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type {
	ActionFunction,
	LoaderFunctionArgs,
	SerializeFrom,
} from "@remix-run/node";
import { redirect } from "@remix-run/node";
import {
	Link,
	useFetcher,
	useLoaderData,
	useNavigation,
} from "@remix-run/react";
import clsx from "clsx";
import clone from "just-clone";
import * as React from "react";
import { Alert } from "~/components/Alert";
import { Button } from "~/components/Button";
import { Catcher } from "~/components/Catcher";
import { Draggable } from "~/components/Draggable";
import { Image, TierImage } from "~/components/Image";
import { Label } from "~/components/Label";
import { SubmitButton } from "~/components/SubmitButton";
import { Toggle } from "~/components/Toggle";
import { requireUser } from "~/features/auth/core/user.server";
import { cachedFullUserLeaderboard } from "~/features/leaderboards/core/leaderboards.server";
import { currentOrPreviousSeason } from "~/features/mmr/season";
import {
	type TournamentDataTeam,
	clearTournamentDataCache,
	tournamentFromDB,
} from "~/features/tournament-bracket/core/Tournament.server";
import { useTimeoutState } from "~/hooks/useTimeoutState";
import invariant from "~/utils/invariant";
import { parseRequestPayload, validate } from "~/utils/remix.server";
import {
	navIconUrl,
	tournamentBracketsPage,
	userResultsPage,
} from "~/utils/urls";
import { updateTeamSeeds } from "../queries/updateTeamSeeds.server";
import { seedsActionSchema } from "../tournament-schemas.server";
import { tournamentIdFromParams } from "../tournament-utils";
import { useTournament } from "./to.$id";

export const action: ActionFunction = async ({ request, params }) => {
	const data = await parseRequestPayload({
		request,
		schema: seedsActionSchema,
	});
	const user = await requireUser(request);
	const tournamentId = tournamentIdFromParams(params);
	const tournament = await tournamentFromDB({ tournamentId, user });

	validate(tournament.isOrganizer(user));
	validate(!tournament.hasStarted, "Tournament has started");

	updateTeamSeeds({ tournamentId, teamIds: data.seeds });

	clearTournamentDataCache(tournamentId);

	return null;
};

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
	const user = await requireUser(request);
	const tournamentId = tournamentIdFromParams(params);
	const tournament = await tournamentFromDB({ tournamentId, user });

	if (!tournament.isOrganizer(user) || tournament.hasStarted) {
		throw redirect(tournamentBracketsPage({ tournamentId }));
	}

	const powers = async (season: number) => {
		const leaderboard = await cachedFullUserLeaderboard(season);

		return Object.fromEntries(
			leaderboard.map((entry) => {
				return [entry.id, { power: entry.power, tier: entry.tier }];
			}),
		);
	};

	const currentSeason = currentOrPreviousSeason(new Date())!.nth;

	return {
		powers: {
			current: await powers(currentSeason),
			previous: await powers(currentSeason - 1),
		},
	};
};

export default function TournamentSeedsPage() {
	const data = useLoaderData<typeof loader>();
	const tournament = useTournament();
	const navigation = useNavigation();
	const [teamOrder, setTeamOrder] = React.useState(
		tournament.ctx.teams.map((t) => t.id),
	);
	const [activeTeam, setActiveTeam] = React.useState<TournamentDataTeam | null>(
		null,
	);
	const [usingPreviousSeasonPowers, setUsingPreviousSeasonPowers] =
		React.useState(false);
	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: {
				distance: 8,
			},
		}),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const teamsSorted = tournament.ctx.teams.sort(
		(a, b) => teamOrder.indexOf(a.id) - teamOrder.indexOf(b.id),
	);

	const activePowers = usingPreviousSeasonPowers
		? data.powers.previous
		: data.powers.current;

	const rankTeam = (team: TournamentDataTeam) => {
		const powers = team.members
			.map((m) => activePowers[m.userId]?.power)
			.filter(Boolean);

		if (powers.length === 0) return 0;

		return powers.reduce((acc, cur) => acc + cur, 0) / powers.length;
	};

	return (
		<div className="stack lg">
			<SeedAlert teamOrder={teamOrder} />
			<div className="stack horizontal justify-between">
				<Button
					className="tournament__seeds__order-button"
					variant="minimal"
					size="tiny"
					type="button"
					onClick={() => {
						setTeamOrder(
							clone(tournament.ctx.teams)
								.sort((a, b) => rankTeam(b) - rankTeam(a))
								.map((t) => t.id),
						);
					}}
				>
					Sort automatically
				</Button>
				<div className="stack horizontal sm items-center">
					<Label spaced={false}>Previous season powers</Label>
					<Toggle
						checked={usingPreviousSeasonPowers}
						setChecked={setUsingPreviousSeasonPowers}
					/>
				</div>
			</div>
			<ul>
				<li className="tournament__seeds__teams-list-row">
					<div className="tournament__seeds__teams-container__header">Seed</div>
					<div className="tournament__seeds__teams-container__header">Name</div>
					<div className="tournament__seeds__teams-container__header">
						Players
					</div>
				</li>
				<DndContext
					id="team-seed-sorter"
					sensors={sensors}
					collisionDetection={closestCenter}
					onDragStart={(event) => {
						const newActiveTeam = teamsSorted.find(
							(t) => t.id === event.active.id,
						);
						invariant(newActiveTeam, "newActiveTeam is undefined");
						setActiveTeam(newActiveTeam);
					}}
					onDragEnd={(event) => {
						const { active, over } = event;

						if (!over) return;
						setActiveTeam(null);
						if (active.id !== over.id) {
							setTeamOrder((teamIds) => {
								const oldIndex = teamIds.indexOf(active.id as number);
								const newIndex = teamIds.indexOf(over.id as number);

								return arrayMove(teamIds, oldIndex, newIndex);
							});
						}
					}}
				>
					<SortableContext
						items={teamOrder}
						strategy={verticalListSortingStrategy}
					>
						{teamsSorted.map((team, i) => (
							<Draggable
								key={team.id}
								id={team.id}
								disabled={navigation.state !== "idle"}
								liClassName={clsx(
									"tournament__seeds__teams-list-row",
									"sortable",
									{
										disabled: navigation.state !== "idle",
										invisible: activeTeam?.id === team.id,
									},
								)}
							>
								<RowContents team={team} seed={i + 1} powers={activePowers} />
							</Draggable>
						))}
					</SortableContext>

					<DragOverlay>
						{activeTeam && (
							<li className="tournament__seeds__teams-list-row active">
								<RowContents team={activeTeam} powers={activePowers} />
							</li>
						)}
					</DragOverlay>
				</DndContext>
			</ul>
		</div>
	);
}

function SeedAlert({ teamOrder }: { teamOrder: number[] }) {
	const tournament = useTournament();
	const [teamOrderInDb, setTeamOrderInDb] = React.useState(teamOrder);
	const [showSuccess, setShowSuccess] = useTimeoutState(false);
	const fetcher = useFetcher();

	// TODO: figure out a better way
	// biome-ignore lint/correctness/useExhaustiveDependencies: biome migration
	React.useEffect(() => {
		// TODO: what if error?
		if (fetcher.state !== "loading") return;

		setTeamOrderInDb(teamOrder);
		setShowSuccess(true, { timeout: 3000 });
	}, [fetcher.state]);

	const teamOrderChanged = teamOrder.some((id, i) => id !== teamOrderInDb[i]);

	return (
		<fetcher.Form method="post" className="tournament__seeds__form">
			<input type="hidden" name="tournamentId" value={tournament.ctx.id} />
			<input type="hidden" name="seeds" value={JSON.stringify(teamOrder)} />
			<Alert
				variation={
					teamOrderChanged ? "WARNING" : showSuccess ? "SUCCESS" : "INFO"
				}
				alertClassName="tournament-bracket__start-bracket-alert"
				textClassName="stack horizontal md items-center"
			>
				{teamOrderChanged ? (
					<>You have unchanged changes to seeding</>
				) : showSuccess ? (
					<>Seeds saved successfully!</>
				) : (
					<>Drag teams to adjust their seeding</>
				)}
				{(!showSuccess || teamOrderChanged) && (
					<SubmitButton
						state={fetcher.state}
						disabled={!teamOrderChanged}
						size="tiny"
					>
						Save seeds
					</SubmitButton>
				)}
			</Alert>
		</fetcher.Form>
	);
}

function RowContents({
	team,
	seed,
	powers,
}: {
	team: TournamentDataTeam;
	seed?: number;
	powers: SerializeFrom<typeof loader>["powers"]["current"];
}) {
	return (
		<>
			<div>{seed}</div>
			<div className="tournament__seeds__team-name">
				{team.checkIns.length > 0 ? "✅ " : "❌ "} {team.name}
			</div>
			<div className="stack horizontal sm">
				{team.members.map((member) => {
					const { power, tier } = powers[member.userId] ?? {};
					const lonely =
						(!power && member.plusTier) || (!member.plusTier && power);

					return (
						<div key={member.userId} className="tournament__seeds__team-member">
							<Link
								to={userResultsPage(member, true)}
								target="_blank"
								className="tournament__seeds__team-member__name"
							>
								{member.username}
							</Link>
							{member.plusTier ? (
								<div
									className={clsx("stack horizontal items-center xxs", {
										"add tournament__seeds__lonely-stat": lonely,
									})}
								>
									<Image path={navIconUrl("plus")} alt="" width={16} /> +
									{member.plusTier}
								</div>
							) : (
								<div />
							)}
							{power ? (
								<div
									className={clsx("stack horizontal items-center xxs", {
										"add tournament__seeds__lonely-stat": lonely,
									})}
								>
									<TierImage tier={tier} width={32} /> {power}
								</div>
							) : null}
						</div>
					);
				})}
			</div>
		</>
	);
}

export const ErrorBoundary = Catcher;
