<script lang="ts">
	import Main from '$lib/components/layout/Main.svelte';
	import TabPanel from '$lib/components/tabs/TabPanel.svelte';
	import Tabs from '$lib/components/tabs/Tabs.svelte';
	import Settings2 from '@lucide/svelte/icons/settings-2';
	import Accessibility from '@lucide/svelte/icons/accessibility';
	import UserStar from '@lucide/svelte/icons/user-star';
	import Contact from '@lucide/svelte/icons/contact';
	import { m } from '$lib/paraglide/messages';
	import PreferencesTab from './PreferencesTab.svelte';
	import MatchProfileTab from './MatchProfileTab.svelte';
	import TrustedUsersTab from './TrustedUsersTab.svelte';
	import AccessibilityTab from './AccessibilityTab.svelte';
	import { SearchParamState } from '$lib/runes/search-param-state.svelte';
	import z from 'zod';
	import OpenGraphMeta from '$lib/components/OpenGraphMeta.svelte';

	const tab = new SearchParamState({
		defaultValue: 'preferences',
		schema: z.enum(['preferences', 'match-profile', 'trusted-users', 'accessibility']),
		key: 'tab'
	});
</script>

<OpenGraphMeta title="Settings" />

<Main>
	<Tabs
		bind:value={() => tab.state, (value) => tab.update(value)}
		triggers={[
			{ label: m.common_settings_tabs_preferences(), value: 'preferences', icon: Settings2 },
			{ label: m.common_settings_tabs_matchProfile(), value: 'match-profile', icon: Contact },
			{ label: m.common_settings_tabs_trustedUsers(), value: 'trusted-users', icon: UserStar },
			{ label: m.common_settings_tabs_accessibility(), value: 'accessibility', icon: Accessibility }
		]}
		orientation="vertical"
	>
		<TabPanel value="preferences">
			<PreferencesTab />
		</TabPanel>
		<TabPanel value="match-profile">
			<MatchProfileTab />
		</TabPanel>
		<TabPanel value="trusted-users">
			<TrustedUsersTab />
		</TabPanel>
		<TabPanel value="accessibility">
			<AccessibilityTab />
		</TabPanel>
	</Tabs>
</Main>
