import { ArrowLeft } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import { LinkButton } from "~/components/elements/Button";
import { useTournament } from "~/features/tournament/routes/to.$id";
import type { TournamentDataTeam } from "~/features/tournament-bracket/core/Tournament.server";
import { FormField } from "~/form/FormField";
import { SendouForm, useFormFieldContext } from "~/form/SendouForm";
import type {
	ArrayItemRenderContext,
	SelectOption,
	TeamSearchFieldOptions,
} from "~/form/types";
import { tournamentAdminPage } from "~/utils/urls";
import {
	type AdminRegistrationFormValues,
	adminRegistrationFormSchema,
} from "../tournament-admin-registration-schemas";

export { action } from "../actions/to.$id.admin.registration.server";

type RosterMemberValue = {
	userId?: number;
	inGameName?: string | null;
};

export default function TournamentAdminRegistrationPage() {
	const { t } = useTranslation(["common"]);
	const tournament = useTournament();
	const { tid } = useParams();

	const team =
		typeof tid === "string" ? tournament.teamById(Number(tid)) : undefined;

	const adminPage = tournamentAdminPage(tournament.ctx.id);

	const owner = team?.members.find((member) => member.role === "OWNER");

	const defaultValues: Partial<AdminRegistrationFormValues> | undefined = team
		? {
				tournamentTeamId: team.id,
				linkedTeam: Boolean(team.team),
				pickUpName: team.team ? null : team.name,
				logo:
					!team.team &&
					team.pickupAvatarUrl &&
					typeof team.avatarImgId === "number"
						? {
								type: "EXISTING",
								imgId: team.avatarImgId,
								url: team.pickupAvatarUrl,
							}
						: null,
				teamId: team.team?.id ?? null,
				ownerId: owner ? String(owner.userId) : "",
				members: team.members.map((member) => ({
					userId: member.userId,
					inGameName: member.inGameName ?? null,
				})),
			}
		: undefined;

	return (
		<div className="stack md">
			<LinkButton
				to={adminPage}
				variant="outlined"
				size="small"
				icon={<ArrowLeft />}
				className="mr-auto"
			>
				{t("common:actions.back")}
			</LinkButton>
			<SendouForm
				schema={adminRegistrationFormSchema}
				title={team ? "Edit registration" : "Add new team"}
				defaultValues={defaultValues}
			>
				<RegistrationFields team={team} />
			</SendouForm>
		</div>
	);
}

function RegistrationFields({ team }: { team?: TournamentDataTeam }) {
	const { t } = useTranslation(["forms"]);
	const tournament = useTournament();
	const { values, setValue } = useFormFieldContext();

	const [usernames, setUsernames] = React.useState<Record<number, string>>(
		() => {
			const initial: Record<number, string> = {};
			for (const member of team?.members ?? []) {
				initial[member.userId] = member.username;
			}
			return initial;
		},
	);

	const linkedTeam = Boolean(values.linkedTeam);
	const members = (values.members as RosterMemberValue[]) ?? [];
	const requireInGameNames = tournament.ctx.settings.requireInGameNames;

	const ownerOptions: SelectOption[] = members
		.filter(
			(member): member is { userId: number } =>
				typeof member.userId === "number",
		)
		.map((member, i) => ({
			value: String(member.userId),
			label: usernames[member.userId] ?? `${t("forms:labels.player")} ${i + 1}`,
		}));

	return (
		<>
			<FormField name="linkedTeam" />
			{linkedTeam ? (
				<FormField
					name="teamId"
					options={
						{
							initialTeam: team?.team
								? {
										id: team.team.id,
										name: team.name,
										avatarUrl: team.team.logoUrl,
									}
								: undefined,
							onTeamSelected: (selected) => {
								if (!selected) return;
								setUsernames((prev) => {
									const next = { ...prev };
									for (const member of selected.members) {
										next[member.id] = member.username;
									}
									return next;
								});
								setValue(
									"members",
									selected.members.map((member) => ({
										userId: member.id,
										inGameName: null,
									})),
								);
								setValue("ownerId", String(selected.members[0]?.id ?? ""));
							},
						} satisfies TeamSearchFieldOptions
					}
				/>
			) : (
				<>
					<FormField name="pickUpName" />
					<FormField name="logo" />
				</>
			)}
			<FormField name="members">
				{({ itemName }: ArrayItemRenderContext) => (
					<div className="stack sm">
						<FormField name={`${itemName}.userId`} />
						{requireInGameNames ? (
							<FormField name={`${itemName}.inGameName`} />
						) : null}
					</div>
				)}
			</FormField>
			<FormField name="ownerId" options={ownerOptions} />
		</>
	);
}
