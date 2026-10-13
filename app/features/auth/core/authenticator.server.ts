import { Authenticator } from "remix-auth";
import { type DiscordProfile, DiscordStrategy } from "./DiscordStrategy.server";

export const SESSION_KEY = "user";
export const IMPERSONATED_SESSION_KEY = "impersonated_user";

export const authenticator = new Authenticator<DiscordProfile>();

authenticator.use(DiscordStrategy(), "discord");
