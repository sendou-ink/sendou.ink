<script lang="ts">
import Main from "#lib/components/Main.svelte";
import MatchPage from "#lib/components/match-page/MatchPage.svelte";
import { chatUi } from "#lib/features/chat/chat-state.svelte.ts";
import { setUserCardContext } from "#lib/features/user-page/user-card-context.ts";
import { getScrim } from "../scrims.remote.ts";
import ScrimMatchBanner from "./ScrimMatchBanner.svelte";
import ScrimMatchHeader from "./ScrimMatchHeader.svelte";
import ScrimMatchTabs from "./ScrimMatchTabs.svelte";

interface Props {
	scrimPostId: number;
}

let { scrimPostId }: Props = $props();

const data = $derived(await getScrim({ scrimPostId }));

setUserCardContext({
	userCards: () => data.userCards,
});

// the layout's chat sidebar auto-opens this scrim's room
$effect(() => {
	const chatRoomId = data.chatRoomId;
	if (chatRoomId === undefined) return;

	chatUi.routeChatRoomId = chatRoomId;
	if (chatUi.openRoomId === null) {
		chatUi.openRoomId = chatRoomId;
	}

	return () => {
		chatUi.routeChatRoomId = null;
		if (chatUi.openRoomId === chatRoomId) {
			chatUi.openRoomId = null;
		}
	};
});
</script>

<Main>
	<MatchPage>
		<ScrimMatchHeader {data} />
		<ScrimMatchBanner {data} />
		<ScrimMatchTabs {data} />
	</MatchPage>
</Main>
