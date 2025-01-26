import { Authenticator } from "remix-auth";
import { DiscordStrategy, type LoggedInUser } from "./DiscordStrategy.server";

export const SESSION_KEY = "user";
export const IMPERSONATED_SESSION_KEY = "impersonated_user";

export const authenticator = new Authenticator<LoggedInUser>();

authenticator.use(DiscordStrategy(), "discord");
