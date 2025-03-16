import { useFetcher } from "@remix-run/react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "~/components/Button";
import { Dialog } from "~/components/Dialog";
import { FormMessage } from "~/components/FormMessage";
import { Label } from "~/components/Label";
import { SubmitButton } from "~/components/SubmitButton";
import { CrossIcon } from "~/components/icons/Cross";
import type { Tables } from "~/db/tables";
import { SENDOUQ } from "~/features/sendouq/q-constants";
import { preferenceEmojiUrl } from "~/utils/urls";
import type { GroupForMatch } from "../QMatchRepository.server";

export function AddPrivateNoteDialog({
	aboutUser,
	close,
}: {
	aboutUser?: Pick<
		GroupForMatch["members"][number],
		"id" | "username" | "privateNote"
	>;
	close: () => void;
}) {
	const { t } = useTranslation(["q", "common"]);
	const fetcher = useFetcher();

	if (!aboutUser) return null;

	return (
		<Dialog isOpen>
			<fetcher.Form method="post" className="stack md">
				<input type="hidden" name="targetId" value={aboutUser.id} />
				<div className="stack horizontal items-center justify-between">
					<h2 className="text-md">
						{t("q:privateNote.header", { name: aboutUser.username })}
					</h2>
					<Button
						variant="minimal-destructive"
						icon={<CrossIcon />}
						onClick={close}
					/>
				</div>
				<Textarea initialValue={aboutUser.privateNote?.text} />
				<Sentiment initialValue={aboutUser.privateNote?.sentiment} />
				<div className="stack items-center mt-2">
					<SubmitButton _action="ADD_PRIVATE_USER_NOTE">
						{t("common:actions.save")}
					</SubmitButton>
				</div>
			</fetcher.Form>
		</Dialog>
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
		<div className="u-edit__bio-container">
			<Label
				htmlFor="text"
				valueLimits={{
					current: value.length,
					max: SENDOUQ.PRIVATE_USER_NOTE_MAX_LENGTH,
				}}
			>
				{t("q:privateNote.comment.header")}
			</Label>
			<textarea
				id="text"
				name="comment"
				value={value}
				onChange={(e) => setValue(e.target.value)}
				maxLength={SENDOUQ.PRIVATE_USER_NOTE_MAX_LENGTH}
			/>
		</div>
	);
}
