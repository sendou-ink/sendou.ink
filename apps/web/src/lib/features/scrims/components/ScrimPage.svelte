<script lang="ts">
import { untrack } from "svelte";
import Main from "#lib/components/Main.svelte";
import MatchPage from "#lib/components/match-page/MatchPage.svelte";
import { chatUi } from "#lib/features/chat/chat-state.svelte.ts";
import { getScrim } from "../scrims.remote.ts";
import ScrimMatchBanner from "./ScrimMatchBanner.svelte";
import ScrimMatchHeader from "./ScrimMatchHeader.svelte";
import ScrimMatchTabs from "./ScrimMatchTabs.svelte";

interface Props {
	scrimPostId: number;
}

let { scrimPostId }: Props = $props();

const data = $derived(await getScrim({ scrimPostId }));

// xxx: need a better, generic solution
// the layout's chat sidebar auto-opens this scrim's room; the chatUi writes
// are untracked so closing the room (openRoomId back to null) doesn't re-run
// this effect and force the room open again in an infinite loop
$effect(() => {
	const chatRoomId = data.chatRoomId;
	if (chatRoomId === undefined) return;

	untrack(() => {
		chatUi.routeChatRoomId = chatRoomId;
		if (chatUi.openRoomId === null) {
			chatUi.openRoomId = chatRoomId;
		}
	});

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
