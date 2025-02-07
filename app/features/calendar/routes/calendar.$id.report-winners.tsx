import { redirect } from "@remix-run/node";
import type {
	ActionFunction,
	LoaderFunctionArgs,
	SerializeFrom,
} from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import clsx from "clsx";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { Button } from "~/components/Button";
import { FormErrors } from "~/components/FormErrors";
import { FormMessage } from "~/components/FormMessage";
import { Label } from "~/components/Label";
import { Main } from "~/components/Main";
import { UserSearch } from "~/components/UserSearch";
import { CALENDAR_EVENT_RESULT } from "~/constants";
import { requireUserId } from "~/features/auth/core/user.server";
import * as CalendarRepository from "~/features/calendar/CalendarRepository.server";
import { canReportCalendarEventWinners } from "~/permissions";
import {
	type SendouRouteHandle,
	notFoundIfFalsy,
	safeParseRequestFormData,
	validate,
} from "~/utils/remix.server";
import type { Unpacked } from "~/utils/types";
import { calendarEventPage } from "~/utils/urls";
import { actualNumber, id, safeJSONParse, toArray } from "~/utils/zod";

const playersSchema = z
	.array(
		z.union([
			z.string().min(1).max(CALENDAR_EVENT_RESULT.MAX_PLAYER_NAME_LENGTH),
			z.object({ id }),
		]),
	)
	.nonempty({ message: "forms.errors.emptyTeam" })
	.max(CALENDAR_EVENT_RESULT.MAX_PLAYERS_LENGTH)
	.refine(
		(val) => {
			const userIds = val.flatMap((user) =>
				typeof user === "string" ? [] : user.id,
			);

			return userIds.length === new Set(userIds).size;
		},
		{
			message: "forms.errors.duplicatePlayer",
		},
	);

const reportWinnersActionSchema = z.object({
	participantCount: z.preprocess(
		actualNumber,
		z
			.number()
			.int()
			.positive()
			.max(CALENDAR_EVENT_RESULT.MAX_PARTICIPANTS_COUNT),
	),
	team: z.preprocess(
		toArray,
		z
			.array(
				z.preprocess(
					safeJSONParse,
					z.object({
						teamName: z
							.string()
							.min(1)
							.max(CALENDAR_EVENT_RESULT.MAX_TEAM_NAME_LENGTH),
						placement: z.preprocess(
							actualNumber,
							z
								.number()
								.int()
								.positive()
								.max(CALENDAR_EVENT_RESULT.MAX_TEAM_PLACEMENT),
						),
						players: playersSchema,
					}),
				),
			)
			.refine(
				(val) => val.length === new Set(val.map((team) => team.teamName)).size,
				{ message: "forms.errors.uniqueTeamName" },
			),
	),
});

const reportWinnersParamsSchema = z.object({
	id: z.preprocess(actualNumber, id),
});

export const action: ActionFunction = async ({ request, params }) => {
	const user = await requireUserId(request);
	const parsedParams = reportWinnersParamsSchema.parse(params);
	const parsedInput = await safeParseRequestFormData({
		request,
		schema: reportWinnersActionSchema,
	});

	if (!parsedInput.success) {
		return {
			errors: parsedInput.errors,
		};
	}

	const event = notFoundIfFalsy(
		await CalendarRepository.findById({ id: parsedParams.id }),
	);
	validate(
		canReportCalendarEventWinners({
			user,
			event,
			startTimes: event.startTimes,
		}),
		"Unauthorized",
		401,
	);

	await CalendarRepository.upsertReportedScores({
		eventId: parsedParams.id,
		participantCount: parsedInput.data.participantCount,
		results: parsedInput.data.team.map((t) => ({
			teamName: t.teamName,
			placement: t.placement,
			players: t.players.map((p) => ({
				userId: typeof p === "string" ? null : p.id,
				name: typeof p === "string" ? p : null,
			})),
		})),
	});

	throw redirect(calendarEventPage(parsedParams.id));
};

export const handle: SendouRouteHandle = {
	i18n: "calendar",
};

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
	const parsedParams = reportWinnersParamsSchema.parse(params);
	const user = await requireUserId(request);
	const event = notFoundIfFalsy(
		await CalendarRepository.findById({ id: parsedParams.id }),
	);

	validate(
		canReportCalendarEventWinners({
			user,
			event,
			startTimes: event.startTimes,
		}),
	);

	return {
		name: event.name,
		participantCount: event.participantCount,
		winners: await CalendarRepository.findResultsByEventId(parsedParams.id),
	};
};

export default function ReportWinnersPage() {
	const { t } = useTranslation(["common", "calendar"]);
	const data = useLoaderData<typeof loader>();

	return (
		<Main halfWidth>
			<Form method="post" className="stack md-plus items-start">
				<h1 className="text-lg">
					{t("calendar:forms.reportResultsHeader", { eventName: data.name })}
				</h1>
				<ParticipantsCountInput />
				<FormMessage type="info">
					{t("calendar:forms.reportResultsInfo")}
				</FormMessage>
				<TeamInputs />
				<Button type="submit" className="mt-4">
					{t("common:actions.submit")}
				</Button>
				<FormErrors namespace="calendar" />
			</Form>
		</Main>
	);
}

function ParticipantsCountInput() {
	const { t } = useTranslation("calendar");
	const data = useLoaderData<typeof loader>();

	return (
		<div>
			<Label htmlFor="name" required>
				{t("forms.participantCount")}
			</Label>
			<input
				name="participantCount"
				type="number"
				required
				min={1}
				max={CALENDAR_EVENT_RESULT.MAX_PARTICIPANTS_COUNT}
				defaultValue={data.participantCount ?? undefined}
				className="w-24"
			/>
		</div>
	);
}

function TeamInputs() {
	const { t } = useTranslation("calendar");
	const data = useLoaderData<typeof loader>();
	const [amountOfTeams, setAmountOfTeams] = React.useState(
		Math.max(data.winners.length, 1),
	);

	const handleTeamDelete = () => {
		setAmountOfTeams(amountOfTeams - 1);
	};

	return (
		<>
			<hr className="w-full" />
			{new Array(amountOfTeams + 1).fill(null).map((_, i) => {
				// last team is hidden so we can save its state even if user removes a filled team
				const hidden = i === amountOfTeams;

				return (
					<React.Fragment key={i}>
						<Team
							onRemoveTeam={
								i === amountOfTeams - 1 && amountOfTeams > 1
									? handleTeamDelete
									: undefined
							}
							hidden={hidden}
							initialPlacement={String(i + 1)}
							initialValues={data.winners[i]}
						/>
						{!hidden && <hr className="w-full" />}
					</React.Fragment>
				);
			})}
			<Button
				onClick={() => setAmountOfTeams((amountOfTeams) => amountOfTeams + 1)}
				size="tiny"
			>
				{t("forms.team.add")}
			</Button>
		</>
	);
}

const NEW_PLAYER = { id: 0 } as const;

interface TeamResults {
	teamName: string;
	placement: string;
	players: Array<
		| {
				id: number;
		  }
		| string
	>;
}

function Team({
	onRemoveTeam,
	hidden,
	initialPlacement,
	initialValues,
}: {
	onRemoveTeam?: () => void;
	hidden: boolean;
	initialPlacement: string;
	initialValues?: Unpacked<SerializeFrom<typeof loader>["winners"]>;
}) {
	const { t } = useTranslation("calendar");
	const teamNameId = React.useId();
	const placementId = React.useId();

	const [results, setResults] = React.useState<TeamResults>({
		teamName: initialValues?.teamName ?? "",
		placement: String(initialValues?.placement ?? initialPlacement),
		players: initialValues?.players
			? (initialValues.players.map((player) =>
					player.name ? player.name : player,
				) as TeamResults["players"])
			: [NEW_PLAYER, NEW_PLAYER, NEW_PLAYER, NEW_PLAYER],
	});

	const handleTeamNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setResults({ ...results, teamName: e.target.value });
	};

	const handlePlacementChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setResults({ ...results, placement: e.target.value });
	};

	if (hidden) return null;

	return (
		<div className={clsx("stack md items-start")}>
			<input
				type="hidden"
				name="team"
				value={JSON.stringify({
					...results,
					players: results.players.filter(
						(player) =>
							(typeof player === "string" && player !== "") ||
							(typeof player === "object" && player.id !== 0),
					),
				})}
			/>
			<div className="stack horizontal md flex-wrap">
				<div>
					<Label htmlFor={teamNameId}>{t("forms.team.name")}</Label>
					<input
						id={teamNameId}
						value={results.teamName}
						onChange={handleTeamNameChange}
						required
						maxLength={CALENDAR_EVENT_RESULT.MAX_TEAM_NAME_LENGTH}
					/>
				</div>
				<div>
					<Label htmlFor={placementId}>{t("forms.team.placing")}</Label>
					<input
						id={placementId}
						value={results.placement}
						type="number"
						onChange={handlePlacementChange}
						required
						max={CALENDAR_EVENT_RESULT.MAX_TEAM_PLACEMENT}
						className="w-24"
					/>
				</div>
			</div>
			<Players
				players={results.players}
				setPlayers={(players) => setResults({ ...results, players })}
			/>
			{onRemoveTeam && (
				<Button
					onClick={onRemoveTeam}
					size="tiny"
					variant="minimal-destructive"
					className="mt-4"
				>
					{t("forms.team.remove")}
				</Button>
			)}
		</div>
	);
}

function Players({
	players,
	setPlayers,
}: {
	players: TeamResults["players"];
	setPlayers: (newPlayers: TeamResults["players"]) => void;
}) {
	const { t } = useTranslation("calendar");
	const handleAddPlayer = () => {
		setPlayers([...players, NEW_PLAYER]);
	};

	const handleRemovePlayer = () => {
		setPlayers(players.slice(0, -1));
	};

	const handlePlayerInputTypeChange = (index: number) => {
		const newPlayers = [...players];
		newPlayers[index] = typeof newPlayers[index] === "string" ? NEW_PLAYER : "";
		setPlayers(newPlayers);
	};

	const handleInputChange = (index: number, newValue: string | number) => {
		const newPlayers = [...players];
		newPlayers[index] =
			typeof newValue === "string" ? newValue : { id: newValue };
		setPlayers(newPlayers);
	};

	return (
		<div className="stack md">
			{players.map((player, i) => {
				const formId = `player-${i + 1}`;
				const asPlainInput = typeof player === "string";

				return (
					<div key={i}>
						<div className="stack horizontal md items-center mb-1">
							<label htmlFor={formId} className="mb-0">
								{t("forms.team.player.header", { number: i + 1 })}
							</label>
							<Button
								size="tiny"
								variant="minimal"
								onClick={() => handlePlayerInputTypeChange(i)}
								className="outline-theme"
							>
								{asPlainInput
									? t("forms.team.player.addAsUser")
									: t("forms.team.player.addAsText")}
							</Button>
						</div>
						{asPlainInput ? (
							<input
								id={formId}
								value={player}
								onChange={(e) => handleInputChange(i, e.target.value)}
								max={CALENDAR_EVENT_RESULT.MAX_PLAYER_NAME_LENGTH}
							/>
						) : (
							<UserSearch
								id={formId}
								inputName="team-player"
								initialUserId={player.id}
								onChange={(newUser) => handleInputChange(i, newUser.id)}
							/>
						)}
					</div>
				);
			})}
			<div className="stack horizontal sm mt-2">
				<Button
					size="tiny"
					onClick={handleAddPlayer}
					disabled={players.length === CALENDAR_EVENT_RESULT.MAX_PLAYERS_LENGTH}
					variant="outlined"
				>
					{t("forms.team.player.add")}
				</Button>{" "}
				<Button
					size="tiny"
					variant="destructive"
					onClick={handleRemovePlayer}
					disabled={players.length === 1}
				>
					{t("forms.team.player.remove")}
				</Button>
			</div>
		</div>
	);
}
