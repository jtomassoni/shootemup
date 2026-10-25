# Hold the Lane

A phone-first browser shooter for short rounds. You stay at the bottom, enemies come down, and the weapon you shoot enough times is the one you get.

Colorado is the first full stop. Clearing it opens Maryland. Pennsylvania, Tucson, Paris, and Amsterdam are on the map, and the last two can be held the way a later paid stop would be. Nothing in this version charges anyone.

## Play

```bash
npm install
npm run dev
```

Open the local URL on a phone on the same Wi-Fi, or deploy it and text the link. Portrait. Drag the lower half of the screen. Arrow keys work for desktop testing.

`npm test` runs the simulation checks, including a bot that has to be able to finish Colorado and Maryland.

## Shared scores

Posted scores are kept per name, per stop, per round format. The first phone to claim a name gets a secret stored on that device. There is no password.

Locally, scores go in `.data/board.json`. On Vercel, set either pair:

- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`
- `KV_REST_API_URL` and `KV_REST_API_TOKEN`

Until one of those is set, a hosted copy keeps the best score on the phone and says so when a post cannot be shared.

## What is intentionally missing

No base, energy timer, daily chore, ad, or currency. Combat resets every round. Level unlocks, the avatar, and scores stay.
