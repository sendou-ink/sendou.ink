<script lang="ts">
import { Config } from "#lib/config.ts";
import { PWA_SPLASH_SCREENS } from "./pwa-splash-screens.ts";

const APP_ICON_URL = `${Config.staticAssetsUrl}/img/app-icon.png`;
const splashScreenUrl = (fileName: string) =>
	`${Config.staticAssetsUrl}/img/splash-screens/${fileName}`;
</script>

<svelte:head>
	<link rel="manifest" href="/app.webmanifest" />
	<link rel="apple-touch-icon" href={APP_ICON_URL} />
	{#each PWA_SPLASH_SCREENS as { media, fileName } (fileName)}
		<link
			rel="apple-touch-startup-image"
			{media}
			href={splashScreenUrl(fileName)}
		/>
	{/each}
</svelte:head>
