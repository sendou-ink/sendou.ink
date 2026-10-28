import { Avatar } from "~/components/Avatar";
import { NoteAvatar } from "~/components/NoteAvatar";
import {
	UserCard,
	useUserCardData,
} from "~/features/user-card/components/UserCard";
import type { CommonUser } from "~/utils/kysely.server";
import styles from "./LobbyPlayer.module.css";

/** A player's avatar and name, opening their user card. */
export function LobbyPlayer({
	user,
}: {
	user: Pick<CommonUser, "id" | "avatar" | "username">;
}) {
	const cardData = useUserCardData(user.id);

	return (
		<UserCard userId={user.id}>
			<span className={styles.player}>
				<NoteAvatar sentiment={cardData?.privateNote?.sentiment} size="xs">
					<Avatar user={user} size="xxs" />
				</NoteAvatar>
				{user.username}
			</span>
		</UserCard>
	);
}
