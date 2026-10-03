# Configuring Discord Authentication

## ⚠️ You probably don't need this ⚠️

When run in dev mode, Sendou provides the option to "impersonate" an account in 
the developer menu. You can use this to authenticate without configuring Discord
auth.

If you need to test or debug Discord authentication, here's how to proceed:

## Configuring Discord authentication

1. Log into the [Discord developer portal](https://discord.com/developers/applications).
1. Create a new application for your sendou development setup.
1. Navigate to the ***Oauth*** settings.
1. Add a ***redirect*** for `http://localhost:5173/auth/callback`. If your dev 
   server is running elsewhere, make sure the hostname and port match.
1. Copy the ***Client ID*** into the `.env`.
1. Reset the ***Client secret***, and copy the new value into your `.env`. Note
   that it won't be shown again, so make sure to grab it.
1. If your dev server is running, it should have automatically reloaded. If not,
   restart it.
