import { useTranslation } from "react-i18next";
import { SendouDialog } from "~/components/elements/Dialog";
import type { Tables } from "~/db/tables";
import { SendouForm } from "~/form/SendouForm";
import { userCardNotePage } from "~/utils/urls";
import { userCardNoteSaveSchema } from "../user-card-schemas";

type PrivateNote = Pick<Tables["PrivateUserNote"], "text" | "sentiment">;

/**
 * Posts to the `/user-card/:id/note` resource route and closes on success. Saving empty text with
 * a neutral sentiment deletes the note (handled by the route).
 */
export function AddPrivateNoteDialog({
	userId,
	username,
	note,
	onClose,
}: {
	userId: number;
	username: string;
	note: PrivateNote | null;
	onClose: () => void;
}) {
	const { t } = useTranslation(["q", "common"]);

	return (
		<SendouDialog
			heading={t("q:privateNote.header", { name: username })}
			onClose={onClose}
		>
			<SendouForm
				schema={userCardNoteSaveSchema}
				action={userCardNotePage(userId)}
				defaultValues={{
					comment: note?.text ?? "",
					sentiment: note?.sentiment ?? "NEUTRAL",
				}}
				submitButtonText={t("common:actions.save")}
				onSuccess={onClose}
			>
				{({ FormField }) => (
					<>
						<FormField name="comment" />
						<FormField name="sentiment" />
					</>
				)}
			</SendouForm>
		</SendouDialog>
	);
}
