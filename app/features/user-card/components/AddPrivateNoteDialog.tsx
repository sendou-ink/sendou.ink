import * as React from "react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { SendouDialog } from "~/components/elements/Dialog";
import { FormMessage } from "~/components/FormMessage";
import { Label } from "~/components/Label";
import { SubmitButton } from "~/components/SubmitButton";
import type { Tables } from "~/db/tables";
import { SENDOUQ } from "~/features/sendouq/q-constants";
import { preferenceEmojiUrl, userCardNotePage } from "~/utils/urls";

type PrivateNote = Pick<Tables["PrivateUserNote"], "text" | "sentiment">;

/**
 * Modal for adding/editing the viewer's private note about a user, posting to the
 * `/user-card/:id/note` resource route. Closes once the fetcher settles (save succeeds →
 * automatic revalidation refreshes the card). Clearing the text with a neutral sentiment and saving
 * deletes the note (handled by the route). Rendered wherever a `UserCard` lives.
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
	const fetcher = useFetcher();

	const wasSubmittingRef = React.useRef(false);
	React.useEffect(() => {
		if (fetcher.state !== "idle") {
			wasSubmittingRef.current = true;
		} else if (wasSubmittingRef.current) {
			wasSubmittingRef.current = false;
			if ((fetcher.data as { ok?: boolean } | undefined)?.ok) {
				onClose();
			}
		}
	}, [fetcher.state, fetcher.data, onClose]);

	return (
		<SendouDialog
			heading={t("q:privateNote.header", { name: username })}
			onClose={onClose}
		>
			<fetcher.Form
				method="post"
				action={userCardNotePage(userId)}
				className="stack md"
			>
				<Textarea initialValue={note?.text} />
				<Sentiment initialValue={note?.sentiment} />
				<div className="stack items-center mt-2">
					<SubmitButton _action="SAVE" state={fetcher.state}>
						{t("common:actions.save")}
					</SubmitButton>
				</div>
			</fetcher.Form>
		</SendouDialog>
	);
}

function Sentiment({
	initialValue,
}: {
	initialValue?: Tables["PrivateUserNote"]["sentiment"];
}) {
	const { t } = useTranslation(["q"]);
	const [sentiment, setSentiment] = React.useState<
		Tables["PrivateUserNote"]["sentiment"]
	>(initialValue ?? "NEUTRAL");

	return (
		<div>
			<Label>{t("q:privateNote.sentiment.header")}</Label>
			<input type="hidden" name="sentiment" value={sentiment} />
			<div className="stack xs my-2">
				{(["POSITIVE", "NEUTRAL", "NEGATIVE"] as const).map(
					(sentimentRadio) => {
						return (
							<div
								key={sentimentRadio}
								className="stack horizontal xs items-center"
							>
								<input
									type="radio"
									id={sentimentRadio}
									checked={sentimentRadio === sentiment}
									onChange={() => setSentiment(sentimentRadio)}
								/>
								<label
									htmlFor={sentimentRadio}
									className="mb-0 stack horizontal xs"
								>
									<img
										src={preferenceEmojiUrl(
											sentimentRadio === "POSITIVE"
												? "PREFER"
												: sentimentRadio === "NEGATIVE"
													? "AVOID"
													: undefined,
										)}
										alt=""
										width={18}
									/>
									{t(`q:privateNote.sentiment.${sentimentRadio}`)}
								</label>
							</div>
						);
					},
				)}
			</div>
			<FormMessage type="info">{t("q:privateNote.sentiment.info")}</FormMessage>
		</div>
	);
}

function Textarea({ initialValue }: { initialValue?: string | null }) {
	const { t } = useTranslation(["q"]);
	const [value, setValue] = React.useState(initialValue ?? "");

	return (
		<div className="stack">
			<Label
				htmlFor="comment"
				valueLimits={{
					current: value.length,
					max: SENDOUQ.PRIVATE_USER_NOTE_MAX_LENGTH,
				}}
			>
				{t("q:privateNote.comment.header")}
			</Label>
			<textarea
				id="comment"
				name="comment"
				value={value}
				onChange={(e) => setValue(e.target.value)}
				maxLength={SENDOUQ.PRIVATE_USER_NOTE_MAX_LENGTH}
			/>
		</div>
	);
}
