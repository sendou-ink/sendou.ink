<script lang="ts">
	import { SettingsAPI } from '$lib/api/settings';
	import SwitchFormField from '$lib/components/form/SwitchFormField.svelte';
	import { m } from '$lib/paraglide/messages';

	const preferences = $derived(await SettingsAPI.byLoggedInUser()); // xxx: spinner
</script>

<div class="stack lg">
	<!-- xxx: language -->
	<!-- xxx: theme -->
	<!-- xxx: push notifs -->

	<pre>
		{JSON.stringify(preferences, null, 2)}
	</pre>

	<SwitchFormField
		name="disableBuildAbilitySorting"
		label={m.common_settings_UPDATE_DISABLE_BUILD_ABILITY_SORTING_label()}
		bottomText={m.common_settings_UPDATE_DISABLE_BUILD_ABILITY_SORTING_bottomText()}
	/>

	<SwitchFormField
		name="disallowScrimPickupsFromUntrusted"
		label={m.common_settings_DISALLOW_SCRIM_PICKUPS_FROM_UNTRUSTED_label()}
		bottomText={m.common_settings_DISALLOW_SCRIM_PICKUPS_FROM_UNTRUSTED_bottomText()}
	/>

	<!-- xxx: sounds -->
</div>
