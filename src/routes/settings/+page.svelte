<script lang="ts">
	import Main from '$lib/components/layout/Main.svelte';
	import TabPanel from '$lib/components/tabs/TabPanel.svelte';
	import Tabs from '$lib/components/tabs/Tabs.svelte';
	import Settings2 from '@lucide/svelte/icons/settings-2';
	import Accessibility from '@lucide/svelte/icons/accessibility';
	import UserStar from '@lucide/svelte/icons/user-star';
	import Contact from '@lucide/svelte/icons/contact';
	import { m } from '$lib/paraglide/messages';

	let value = $state('preferences');
</script>

<Main>
	<Tabs
		bind:value
		triggers={[
			{ label: 'Preferences', value: 'preferences', icon: Settings2 },
			{ label: 'Match Profile', value: 'match-profile', icon: Contact },
			{ label: 'Trusted users', value: 'trusted-users', icon: UserStar },
			{ label: 'Accessibility', value: 'accessibility', icon: Accessibility }
		]}
		orientation="vertical"
	>
		<TabPanel value="preferences">{m.common_settings_tabs_preferences()}</TabPanel>
		<TabPanel value="match-profile">{m.common_settings_tabs_matchProfile()}</TabPanel>
		<TabPanel value="trusted-users">{m.common_settings_tabs_trustedUsers()}</TabPanel>
		<TabPanel value="accessibility">{m.common_settings_tabs_accessibility()}</TabPanel>
	</Tabs>
</Main>
