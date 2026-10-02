# Setting up for development on Sendou

## Prerequisites

* A GitHub account.
* A system with NodeJS installed. It is worthwhile using a version manager such
  as [Mise](https://mise.jdx.dev/) to ensure you are developing with the right
  Node version.
* `git` installed.
* `pnpm` installed.
* A Discord developer account.

## Initial setup

1. `git clone` the project.
1. Open the cloned directory in your editor of choice.
1. `pnpm ci` to install dependencies.

## Starting it up

Just run `pnpm dev`, and it'll sort it all out for you. Splendid!

This will give you a minimal instance on `localhost`. Notably, authentication 
will not be enabled. To set up authentication, proceed onwards.

## Configuring authentication through Discord

1. `cp .env.example .env`.
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
