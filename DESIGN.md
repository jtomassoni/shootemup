# Shoot-em-up design brief

Phone-first browser game for Mary and James, then a few friends, with a possible paid release later. This repo is the game. It is its own project, hosted on Vercel, and shared by texting a link.

The first test is whether moving, shooting, and choosing upgrades feels good on a phone. Build one complete playable destination before generating a huge pile of levels.

## Who it is for

- James and Mary play on their phones, often for a minute or two: a morning break, or a gap between calls.
- A few friends may get the same link soon. Leave room for more people later.
- It might be sold later. James and Mary will play, test, and tweak before that. Do not add a store, a paywall, or accounts-with-passwords in the private version. Do build the unlock flow in a way that can later sit behind a purchase.

### People and places

Use these as theme material. Jokes should feel personal, not like a souvenir shop.

- Mary is a nurse. She grew up in Colorado. Her dad lives in Pennsylvania. Her mom lives in Tucson. She loves Paris.
- James is a software engineer. He grew up in Maryland. He loves Amsterdam.
- They love food, trains, and travel.
- Using their real first names does not matter much. Original characters are fine.

## What this game is

A short portrait shooter in the spirit of those mobile-ad games:

- The character stays centered along the bottom, small enough to read and fully on screen.
- Enemies, obstacles, and upgrades come down the screen.
- The character does not slide. A thumb dragged across the lower screen aims the shots.
- A run lasts about 1–3 minutes.
- Upgrades are ridiculous, readable, and worth thinking about.
- Each destination has its own enemies, weapons, and jokes.

Aim: a finger on the lower part of the screen sets where the shots go, so the hand does not cover the character. The character stays centered. Upgrades may add parallel bullets, wider spreads, piercing shots, or splash damage.

## What to leave out

These are the reason the usual downloads get abandoned. Do not add them.

- Base building
- Energy timers
- Daily chores or a reward you are obligated to collect
- Ads
- A currency to grind
- Lives that have to be replenished before you can retry
- Combat power that carries from one round to the next

Cosmetic choices, unlocked destinations, and scores do persist. Only the weapons and firepower from a round reset when that round ends.

## A round

One format: Push. You start with a weak weapon and pick up stronger ones as crates come down, so the waves start readable and get meaner across about ninety seconds of enemies. There is no round clock. A crowded screen from the first second would punish the weapon you have not earned yet. The round ends when those enemies are gone.

No bosses in this version. A round is enemies, obstacles, and upgrades. A special fight can wait until a plain round is already fun.

A beginner should usually be able to finish the round. High scores should take skill. A destination should not be so hard that someone gets stuck on it forever. Replays shuffle enemy waves and upgrade offers. Generated rounds still have to keep upgrades reachable and leave real gaps to dodge.

Roads, railway tracks, canals, desert highways, and mountain passes are all fine settings. The other games they bounced off of were mostly “walk down a road over an ocean.” Theme and weapon decisions are what make a round worth replaying.

### Practice

After repeated losses on a destination, offer an easier practice mode.

- Practice does not post to the competitive leaderboard.
- Practice does not unlock the next destination.
- Ranked play is one tap away again.

### Ending a round

- Lose: show the score, then one-tap retry.
- Win: show the score, then unlock the next destination.
- No extra lives to buy back or wait for.

## Combat

### Health

Three hearts. Draw them as original heart icons with a nostalgic adventure-game feel. Do not copy Zelda art.

Whether a hit should also strip firepower was never settled. Default for the first build: a hit costs a heart and resets the combo, and the current weapon stays. Change that only if playing it feels too safe.

### Upgrades

Use both collecting and competing offers. Competing offers are the main trick: the player should feel the choice.

- Weapon crates drift down. Shoot one enough times before it leaves the screen to equip it.
- Prefer moments where two upgrades compete, so focusing on one means missing the other.
- Show the comparison against the weapon you have now, using the real stats. Examples: “1 → 5 pellets”, “3× volley damage if every pellet hits”, “slower firing”.
- A shotgun-style weapon’s big number is only true if the pellets hit. Say that on the crate.
- Stronger or stranger weapons should be obvious before you commit. A crab mallet can hit much harder than a pistol if the swing is slow, huge, and funny.
- There is no score bonus for skipping an upgrade. Experimenting should stay worth it.
- Detailed stat screens can live outside the round. During a round, show a weapon icon, a short comparison, and how many hits are left to claim it.

### How absurd weapons can get

Start from the place, not from a generic gun rack. Camp pistols, espresso blasts, cog-railway trains, green-chile pots, crab mallets, flying cheesesteaks, miniature runaway trains, and similar ideas all fit. Conventional guns are fine when the fantasy is a gun, as long as a stronger one is obviously stronger.

Every avatar shoots the same way. Nobody is the better character. Weapons are chosen during the round, not assigned by career.

### Score

Reward:

- Kills
- Consecutive kills
- Hearts left at the end

Combo rule: consecutive kills raise a multiplier. Taking damage resets it. Quiet stretches do not reset it. Do not use an accuracy streak. The gun fires on its own, so “don’t miss” would be a bad Guitar Hero.

Tune the combo threshold by playing.

## Destinations

Handcrafted places, with generated levels inside each place: different enemy mixes, obstacles, and upgrade pairs. That is how the game can grow toward a very large number of levels without every level being authored by hand. Changing the art style alone does not count as a new mechanic.

Beat one destination to open the next. Everything is available in normal play only after the previous clear. Leaderboards are separate per destination, so a clear means something.

Suggested order:

1. **Colorado** — first fully playable destination. Mary grew up here. Denver, mountains, weather, local food, trains through the Rockies.
2. **Maryland** — second. James grew up here. Crabs, harbor towns, potholes, the bay.
3. **Pennsylvania** — Mary’s dad lives here. Cheesesteaks, potholes, trains, pierogi, groundhogs.
4. **Tucson** — Mary’s mom lives here. Desert, saguaros, tumbleweeds, monsoon, Sonoran food. This is the Arizona stop.
5. **Paris** — Mary’s city. Metro, cafes, bakeries, pigeons, scooters.
6. **Amsterdam** — James’s city. Canals, bikes, trams, stroopwafels.

Paris and Amsterdam are also the stand-in for a later paid unlock. In this private build, clearing the previous destination opens them, and a playtest switch can open or close that path without anyone paying. The point is to feel the lock, not to charge.

Build Colorado as the excellent complete round. The level system should already understand the other destinations so Maryland can follow without a rewrite. Do not spend the first pass manufacturing thousands of similar levels.

### More worlds later

Original worlds can nod at games they like: a space-marine world, a spy-movie world, a woodland fantasy world. Those are for later, and they have to be original.

Do not use Halo, Goldeneye, Zelda, or other franchise names, characters, music, or art. A commercial release would need a rights review for anything recognizable, so the game should not depend on that.

## Characters

The player picks an avatar before a run. Pre-generate a cast tied to the jobs and themes, including:

- Nurse
- Software engineer
- Racing driver
- Train conductor
- Chef
- Pilot
- And others in that spirit (ranger, crabber, cyclist, barista, and so on)

Same hitbox, same weapons, same stats. Different silhouettes, idle motion, and personality. The choice is cosmetic.

## Three visual styles

Polish all three before calling the first build ready to play. They exist so the two of them can compare looks, and so destinations can wear different coats. They are not an excuse to ship one finish and two filters.

All three share gameplay and hitboxes.

1. **Chunky toy cartoon.** Colorful, rounded, oversized weapons, exaggerated motion. A mallet should visibly wind up and smash.
2. **Pixel art.** Nostalgic arcade sprites with readable silhouettes.
3. **Illustrated cartoon.** Crisp shapes, thick outlines, absurd enemies, comic impact frames.

Style is selected for testing along with the destination. Combining a style with a place adds variety. It does not by itself create a new level.

## Audio

Low impact. Sounds should explain the action, not overwhelm a room or a pair of headphones at work.

- Soft arcade shots
- A distinct cue for claiming an upgrade
- A distinct cue for getting hurt
- Optional music
- A mute button that stays muted

## Leaderboard and gamertag

Scores are shared across phones. This is not a single-device high-score list.

- You can play a round before you have a name.
- The first time a score is ready to post, the game asks for a gamertag or username.
- Remember that name on the device so they do not type it every round.
- No password.
- A name claimed on one phone should not be trivially overwritten by another phone. Give the first claim a secret stored on that device.
- A few friends will use this, so names need to be unique.
- Skipping the post is allowed; the competitive board only shows posted runs.
- Practice runs are never posted.
- Keep the best score per person, per destination.
- Show personal bests even when they are not the top row.

### Daily run

A shared daily seed is available so two people can face the same enemies, obstacles, and upgrades.

- Same gameplay seed and same starting loadout for everyone that day.
- Any avatar is allowed.
- No daily reward, streak prize, or penalty for missing a day.
- Daily scores are ranked separately from free-play scores.

## Phone, link, and preview

- Portrait only. One-handed play is the layout.
- It is a website, not a native app.
- Host it on Vercel. James will text the link to Mary.
- The link needs a real preview image for SMS and iMessage: a composed picture of the game, plus a title and a one-line description. A bare URL with no image is a miss.
- Set Open Graph and Twitter large-card metadata so the image actually shows up in a text.

## Commercial shape

Keep the private game fun to play with no grind. When a paid version exists later, destination locks (starting with the idea tested by Paris and Amsterdam) are the thing to practice. Cosmetic flair can stay freely choosable in this version: outfits, bullet colors, silly hats, and victory animations were the kinds of things discussed, and none of them should change strength.

Do not invent a battle pass to get ready for a store.

## PG-13

Absurd and silly is the target. Mild language is fine. No explicit adult jokes, and no gross-out as the main joke.

## First build

When implementation starts, build this slice:

- Portrait phone layout, finger controls on the lower screen, keyboard as a fallback for desktop testing.
- Automatic fire aimed by the thumb, with the character held in the center. Keyboard arrows aim on desktop.
- Three hearts, combo, score, pause, and mute.
- All three art styles, all actually finished, selectable, same hitboxes.
- Avatar select with the career-and-theme cast.
- Colorado as a complete round: themed enemies, competing weapon offers with honest comparisons, and a hit-to-claim crate.
- The destination map through Amsterdam, with “beat the previous one” unlocking the next, plus a playtest switch for the later locks.
- Maryland at least wired to the same system so a Colorado clear opens a real next place.
- Results screen: score breakdown, one-tap retry, unlock on a win, practice offer after repeated losses.
- Gamertag prompt the first time a score is posted, then a shared leaderboard.
- Daily seed, separate from free play.
- Vercel-ready app, with an SMS preview image.
- Original art, names, and audio only.

Play that. Tune difficulty, combo size, and crate timing. Then add more destinations.

## Decisions still open on purpose

These are for playtesting, not more questions before the first build:

- Which art style should be the default
- The exact number of hits a crate requires
- Combo multiplier curve
- Whether a hit should ever reduce firepower
- The public title of the game
- How loud the music should be when it is on
- Which jokes land once Colorado is actually playing
