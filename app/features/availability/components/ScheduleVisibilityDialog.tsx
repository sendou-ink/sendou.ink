import { useTranslation } from "react-i18next";
import { SendouDialog } from "~/components/elements/Dialog";
import { useUser } from "~/features/auth/core/user";
import { FormField } from "~/form/FormField";
import { SendouForm } from "~/form/SendouForm";
import { SCHEDULE_VISIBILITY_FRIENDS_VALUE } from "../availability-constants";
import { saveScheduleVisibilitySchema } from "../availability-schemas";
import type { ScheduleAudienceTeam } from "../availability-types";

/** Picks the friends and teams the user's schedule is shared with. Nothing saved yet means everyone. */
export function ScheduleVisibilityDialog({
	teams,
	close,
}: {
	teams: Array<ScheduleAudienceTeam>;
	close: () => void;
}) {
	const { t } = useTranslation(["schedule"]);
	const user = useUser();
	const saved = user?.preferences.scheduleVisibility;

	const teamValues = teams.map((team) => String(team.id));

	return (
		<SendouDialog
			heading={t("schedule:visibility.dialogTitle")}
			onClose={close}
		>
			<SendouForm
				schema={saveScheduleVisibilitySchema}
				onSuccess={close}
				revalidateRoot
				defaultValues={{
					sharedWith: saved
						? [
								...(saved.friends ? [SCHEDULE_VISIBILITY_FRIENDS_VALUE] : []),
								...teams
									.filter((team) => saved.teamIds.includes(team.id))
									.map((team) => String(team.id)),
							]
						: [SCHEDULE_VISIBILITY_FRIENDS_VALUE, ...teamValues],
				}}
			>
				<FormField
					name="sharedWith"
					options={[
						{
							value: SCHEDULE_VISIBILITY_FRIENDS_VALUE,
							label: () => t("schedule:visibility.allFriends"),
						},
						...teams.map((team) => ({
							value: String(team.id),
							label: () => team.name,
						})),
					]}
				/>
			</SendouForm>
		</SendouDialog>
	);
}
