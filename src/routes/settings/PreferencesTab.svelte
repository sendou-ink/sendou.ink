<script lang="ts">
	import { SettingsAPI } from '$lib/api/settings';
	import SwitchFormField from '$lib/components/form/SwitchFormField.svelte';
	import { m } from '$lib/paraglide/messages';

	const preferences = $derived(await SettingsAPI.byLoggedInUser()); // xxx: spinner

	async function updatePreferences(
		args: Parameters<typeof SettingsAPI.updateBooleanPreferences>[0]
	) {
		await SettingsAPI.updateBooleanPreferences(args).updates(
			SettingsAPI.byLoggedInUser().withOverride((preferences) => ({
				...preferences,
				...args
			}))
		);
	}
</script>

<div class="stack lg">
	<!-- xxx: language -->
	<!-- xxx: theme -->
	<!-- xxx: push notifs -->

	<SwitchFormField
		name="disableBuildAbilitySorting"
		label={m.common_settings_UPDATE_DISABLE_BUILD_ABILITY_SORTING_label()}
		bottomText={m.common_settings_UPDATE_DISABLE_BUILD_ABILITY_SORTING_bottomText()}
		bind:checked={
			() => preferences?.disableBuildAbilitySorting ?? false,
			async (value) => await updatePreferences({ disableBuildAbilitySorting: value })
		}
	/>

	<SwitchFormField
		name="disallowScrimPickupsFromUntrusted"
		label={m.common_settings_DISALLOW_SCRIM_PICKUPS_FROM_UNTRUSTED_label()}
		bottomText={m.common_settings_DISALLOW_SCRIM_PICKUPS_FROM_UNTRUSTED_bottomText()}
		bind:checked={
			() => preferences?.disallowScrimPickupsFromUntrusted ?? false,
			async (value) => await updatePreferences({ disallowScrimPickupsFromUntrusted: value })
		}
	/>

	<!-- xxx: sounds -->
</div>
