# OTR Bot · The Trading Foundation

OTR-managed Discord automation for **The Trading Foundation**.

## What it does now

- Connects to the Trading Foundation Discord server
- Registers `/health` and `/sync`
- Creates/updates the approved role hierarchy
- Creates/updates the approved category + channel structure
- Applies tier-based channel visibility for Essentials, Live, Advanced, and Private
- Normal sync preserves existing channels and roles
- Owner-authorized rebuild can remove channels created before a fixed cutoff
- Official information channels are read-only for members; live trading voice is listen-only
- Community ranks never unlock paid areas
- Verifies live channel and role permissions after sync
- Keeps the Discord token out of GitHub

## Railway environment variables

Set these in Railway:

```env
DISCORD_TOKEN=your_bot_token_here
DISCORD_GUILD_ID=1423037046498263043
ENABLE_SERVER_SYNC=false
BOT_OWNER_IDS=your_discord_user_id
```

Do **not** commit the real bot token.

## First launch

1. Deploy this repo to Railway.
2. Add `DISCORD_TOKEN` and the other environment variables.
3. Keep `ENABLE_SERVER_SYNC=false` for the first boot.
4. Confirm the bot appears online.
5. Run `/health` in Discord.
6. Set `ENABLE_SERVER_SYNC=true` in Railway and redeploy.
7. Run `/sync` as a Discord administrator.

The sync is idempotent: it checks existing names and updates or creates missing structure instead of blindly duplicating everything.

## Current access ladder

- Public / Community
- Foundation Essentials
- Foundation Live
- Foundation Advanced
- Foundation Private

Higher tiers inherit access to lower-tier areas through Discord permission overwrites.

## Planned modules

- Welcome/greeting automation
- XP + community ranks
- Moderation utilities
- Ticket/support flow
- Whop membership-role integration support
- Course/onboarding messages and pinned content
- Scheduled live-session announcements

## Authorized channel rebuild

`DISCORD_REBUILD_BEFORE` is an optional fixed ISO timestamp, restricted to guild
`1423037046498263043`. With `ENABLE_SERVER_SYNC=true`, startup removes channels
created on or before that timestamp and rebuilds the blueprint. This deletes the
old channels and their message history. Never set the timestamp dynamically.
New channels are newer than the cutoff and survive restarts. Clear the variable
(set to an empty string) after `[sync] VERIFIED COMPLETE` appears in logs.
Normal `/sync` never deletes channels. Channel messages and Whop integration are
not configured by this layout operation. Existing roles and assignments outside
the blueprint are preserved; no paid or staff roles are assigned automatically.

Run `node --test` for the tier/rank permission matrix and interrupted rebuild checks.
