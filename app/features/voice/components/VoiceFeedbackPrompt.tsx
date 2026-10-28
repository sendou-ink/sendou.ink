import clsx from "clsx";
import { Star } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { SendouButton } from "~/components/elements/Button";
import { useUser } from "~/features/auth/core/user";
import { voiceClient } from "../voice-client";
import { VOICE_FEEDBACK_COMMENT_MAX_LENGTH } from "../voice-constants";
import { useVoiceSnapshot } from "../voice-hooks";
import styles from "./VoiceFeedbackPrompt.module.css";

const RATINGS = [1, 2, 3, 4, 5];

/** Asks how the call went, in the chat of the room whose call the user just left. */
export function VoiceFeedbackPrompt({ roomId }: { roomId: number }) {
	const { t } = useTranslation(["common"]);
	const user = useUser();
	const { pendingFeedback } = useVoiceSnapshot();
	const [rating, setRating] = React.useState<number | null>(null);
	const [comment, setComment] = React.useState("");

	if (!user || pendingFeedback?.roomId !== roomId) return null;

	return (
		<div className={styles.feedback}>
			<span className="text-sm font-semi-bold">
				{t("common:chat.voice.feedback.question")}
			</span>
			<div className={styles.stars}>
				{RATINGS.map((value) => (
					<button
						key={value}
						type="button"
						className={clsx(
							styles.star,
							rating !== null && value <= rating && styles.starSelected,
						)}
						aria-label={t("common:chat.voice.feedback.rating", {
							rating: value,
						})}
						aria-pressed={rating === value}
						onClick={() => setRating(value)}
					>
						<Star size={18} />
					</button>
				))}
			</div>
			{rating !== null ? (
				<>
					<textarea
						className={styles.comment}
						value={comment}
						maxLength={VOICE_FEEDBACK_COMMENT_MAX_LENGTH}
						placeholder={t("common:chat.voice.feedback.comment")}
						onChange={(event) => setComment(event.target.value)}
					/>
					<SendouButton
						size="small"
						onClick={() =>
							void voiceClient.submitFeedback({
								rating,
								comment: comment.trim() || null,
							})
						}
					>
						{t("common:actions.submit")}
					</SendouButton>
				</>
			) : null}
			<SendouButton
				size="small"
				variant="minimal"
				onClick={() => voiceClient.dismissFeedback()}
			>
				{t("common:actions.dismiss")}
			</SendouButton>
		</div>
	);
}
