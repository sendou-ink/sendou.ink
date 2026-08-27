import * as React from "react";
import { useTranslation } from "react-i18next";
import { type MetaFunction, useLoaderData } from "react-router";
import { SendouButton } from "~/components/elements/Button";
import { UserSearch } from "~/components/elements/UserSearch";
import { FormMessage } from "~/components/FormMessage";
import { Label } from "~/components/Label";
import { Main } from "~/components/Main";
import type { CustomFieldRenderProps } from "~/form/FormField";
import { useTranslatedTexts } from "~/form/fields/FormFieldWrapper";
import { SendouForm } from "~/form/SendouForm";
import type { ArrayItemRenderContext } from "~/form/types";
import { errorMessageId } from "~/form/utils";
import type { SerializeFrom } from "~/utils/remix";
import { metaTags, ogPageImage } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import type { Unpacked } from "~/utils/types";
import { action } from "../actions/calendar.$id.report-winners.server";
import { CALENDAR_EVENT_RESULT } from "../calendar-constants";
import {
	EMPTY_REPORTED_PLAYER,
	type ReportedPlayer,
	reportWinnersFormSchema,
} from "../calendar-report-winners-schemas";
import { loader } from "../loaders/calendar.$id.report-winners.server";

export { action, loader };

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "Report winners",
		image: ogPageImage("calendar"),
		location: args.location,
	});
};

export const handle: SendouRouteHandle = {
	i18n: "calendar",
};

export default function ReportWinnersPage() {
	const { t } = useTranslation(["calendar"]);
	const data = useLoaderData<typeof loader>();

	return (
		<Main halfWidth>
			<SendouForm
				schema={reportWinnersFormSchema}
				title={t("calendar:forms.reportResultsHeader", {
					eventName: data.name,
				})}
				defaultValues={{
					participantCount: data.participantCount ?? undefined,
					teams: data.winners.map((team) => ({
						teamName: team.teamName,
						placement: team.placement,
						players: team.players.map(playerToFormValue),
					})),
				}}
			>
				{({ FormField }) => (
					<>
						<FormField name="participantCount" />
						<FormMessage type="info">
							{t("calendar:forms.reportResultsInfo")}
						</FormMessage>
						<FormField name="teams">
							{({ itemName }: ArrayItemRenderContext) => (
								<div className="stack md">
									<FormField name={`${itemName}.teamName`} />
									<FormField name={`${itemName}.placement`} />
									<FormField name={`${itemName}.players`}>
										{(props: CustomFieldRenderProps) => (
											<PlayersFormField {...props} />
										)}
									</FormField>
								</div>
							)}
						</FormField>
					</>
				)}
			</SendouForm>
		</Main>
	);
}

type LoadedPlayer = Unpacked<
	Unpacked<SerializeFrom<typeof loader>["winners"]>["players"]
>;

function playerToFormValue(player: LoadedPlayer): ReportedPlayer {
	return typeof player.id === "number"
		? { type: "USER", id: player.id }
		: { type: "NAME", name: player.name };
}

function PlayersFormField({
	name,
	value,
	onChange,
	error,
}: CustomFieldRenderProps) {
	const { t } = useTranslation(["calendar"]);
	const { translatedError } = useTranslatedTexts({ error });
	const players = value as Array<ReportedPlayer>;

	const handlePlayerChange = (index: number, newPlayer: ReportedPlayer) => {
		onChange(players.map((player, i) => (i === index ? newPlayer : player)));
	};

	return (
		<div className="stack md">
			{players.map((player, i) => (
				<PlayerInput
					key={i}
					index={i}
					player={player}
					onPlayerChange={handlePlayerChange}
				/>
			))}
			{translatedError ? (
				<FormMessage type="error" id={errorMessageId(name)}>
					{translatedError}
				</FormMessage>
			) : null}
			<div className="stack horizontal sm mt-2">
				<SendouButton
					size="small"
					variant="outlined"
					onPress={() => onChange([...players, EMPTY_REPORTED_PLAYER])}
					isDisabled={
						players.length === CALENDAR_EVENT_RESULT.MAX_PLAYERS_LENGTH
					}
				>
					{t("calendar:forms.team.player.add")}
				</SendouButton>
				<SendouButton
					size="small"
					variant="destructive"
					onPress={() => onChange(players.slice(0, -1))}
					isDisabled={players.length === 1}
				>
					{t("calendar:forms.team.player.remove")}
				</SendouButton>
			</div>
		</div>
	);
}

function PlayerInput({
	index,
	player,
	onPlayerChange,
}: {
	index: number;
	player: ReportedPlayer;
	onPlayerChange: (index: number, newPlayer: ReportedPlayer) => void;
}) {
	const { t } = useTranslation(["calendar"]);
	const id = React.useId();

	const asPlainInput = player.type === "NAME";
	const label = t("calendar:forms.team.player.header", { number: index + 1 });

	return (
		<div className="stack horizontal sm items-end">
			<div className="w-full">
				{player.type === "NAME" ? (
					<>
						<Label htmlFor={id}>{label}</Label>
						<input
							id={id}
							value={player.name ?? ""}
							onChange={(e) =>
								onPlayerChange(index, { type: "NAME", name: e.target.value })
							}
							maxLength={CALENDAR_EVENT_RESULT.MAX_PLAYER_NAME_LENGTH}
						/>
					</>
				) : (
					<UserSearch
						label={label}
						initialUserId={player.id ?? undefined}
						onChange={(user) =>
							onPlayerChange(index, { type: "USER", id: user?.id ?? null })
						}
					/>
				)}
			</div>
			<SendouButton
				size="small"
				variant="minimal"
				onPress={() =>
					onPlayerChange(
						index,
						asPlainInput ? EMPTY_REPORTED_PLAYER : { type: "NAME", name: "" },
					)
				}
			>
				{asPlainInput
					? t("calendar:forms.team.player.addAsUser")
					: t("calendar:forms.team.player.addAsText")}
			</SendouButton>
		</div>
	);
}
