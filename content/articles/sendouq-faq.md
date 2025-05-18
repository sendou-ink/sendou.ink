---
title: SendouQ FAQ
date: 2023-09-28
author: Joy
---

Update 5th February 2024: Check the new [SendouQ info page](https://sendou.ink/q/info).

## What is SendouQ?

SendouQ is a third-party matchmaking service for Splatoon 3, offering a more competitive alternative to the in-game matchmaking. Matches are conducted in a first-to-4 format, with maps and modes selected by the players. The service is free and open to all players.

## How do I use SendouQ?

Begin by logging in to [sendou.ink](https://sendou.ink) and setting up your profile. Access SendouQ via [https://sendou.ink/q](https://sendou.ink/q). Upon entry, select your placement; if unsure, pick lower—the system will adjust your placement based on performance. Specify your game mode preference and map selection. Once set, join the queue. For more details, view the [feature showcase](https://www.youtube.com/watch?v=XIRNcTFDYzA).

## Why can't I see my rank?

Ranks are assigned after completing 7 sets.

## Why can't I see my rank history?

To view your rank history, two conditions must be met:

1. You have completed a minimum of 7 sets.
2. These sets were played across 3 separate days, according to server time.

## Both teams misreported the score. What do I do?

A score is accepted if reported identically by both teams. Verify the score before submission to avoid this issue. If you suspect a reported score is fraudulent, please raise the issue in the #helpdesk channel on the [sendou.ink Discord server](https://discord.gg/sendou), and be ready to provide screenshots as evidence.

## The opposing team canceled the match after several games were played. What happened?

Matches can only be canceled if both teams agree to it. If the match was cancelled, someone from your team accepted the cancel request thus legitimizing the match cancellation.

## Why do I have more SP than my opponent but I have a lower rank?

Rank updates aren't real-time. Allow a few minutes for the server to update, then check your (or their) rank again.

## I haven't played in a few days but my rank dropped. What happened?

SendouQ does not implement rank decay, however, ranks are determined by percentile. In this scenario, it's likely other players surpassed your SP, nudging you to a lower rank.

## I won a set but didn't gain any SP. Why?

SP adjustments are influenced by the relative team SP. High-SP teams gain fewer points defeating lower-SP teams, reflecting the expected outcome. To earn more SP, compete against similarly or higher-SP teams.

## I won a set but lost SP. Why?

SendouQ employs [openskill.js](https://github.com/philihp/openskill.js) for SP calculations. Though widely utilized and accurate, its behavior may occasionally seem counterintuitive. In rare instances, you might lose SP on a win or gain SP on a loss, albeit with small changes. You can reduce how often this can happen by competing against similarly ranked teams. For an elementary understanding, refer to the [openskill.py documentation](https://openskill.me/en/stable/manual.html). For deeper insight, the [whitepaper](https://www.csie.ntu.edu.tw/~cjlin/papers/online_ranking/online_journal.pdf) is available, though it requires a strong grasp of Bayesian statistics, equivalent to upper-undergraduate level math.

## What if the FAQ doesn't answer my question?

Join the [sendou.ink Discord server](https://discord.gg/sendou) and ask in the #helpdesk channel.
