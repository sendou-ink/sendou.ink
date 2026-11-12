// Shell pieces root.tsx renders, replaced by nothing for the stand-in shell, see plugin.ts
import type * as React from "react";

function Passthrough({ children }: { children: React.ReactNode }) {
	return children;
}

function Nothing() {
	return null;
}

export const ChatProvider = Passthrough;
export const NotificationsProvider = Passthrough;
export const GlobalStatusProvider = Passthrough;
export const LayoutDataProvider = Passthrough;

export const VoiceCallHost = Nothing;
export const TranslationPreview = Nothing;
export const FusePageInit = Nothing;
export const SimulatedStickyFooterAd = Nothing;

export function useAdsShown() {
	return false;
}
