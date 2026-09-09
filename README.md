# OTR Bot · The Trading Foundation

Discord + Whop automation for Dontradez, managed by OTR Services.

## Packages and access

| Role | Access |
| --- | --- |
| Community Member | Free Community after accepting the rules |
| Foundation Member | Shared paid Foundation rooms; derived from an active tier role |
| Essential | Foundation + basic video course; $50 one-time |
| Premium | Essential content + advanced Don/Bubba videos and paid discussions; $100 |
| Personal Guide | Premium content + one-month live classroom, Q&A and daily selected trade reviews; $150 |

Premium/Personal Guide billing frequency, upgrade discount amount, refund policy, course dates, and post-course access are not yet defined. No automatic one-month expiry is imposed before those terms are agreed. Purchases should remain closed until those commercial terms are finalized. Course videos are uploaded by staff to both Discord and Whop.

## Whop integration

Whop is connected in production. Railway stores the company API key, company ID, webhook secret, and explicit product IDs for Essential, Premium, and Personal Guide. The bot discovers all three products at startup and maps them to their matching Discord tier roles.

Whop webhooks are accepted at `/api/webhooks/whop`, signature-verified, company-validated, persisted in Postgres before acknowledgement, and processed idempotently. Membership state is also reconciled at startup and every 15 minutes so missed webhook deliveries self-heal. The bot resolves a member's linked Discord account through Whop, applies exactly one paid tier role based on the highest active tier, then derives/removes `🎟️ Foundation Member` from that paid role. XP/rank roles never grant paid access.

The staff-only `💳・whop-activity` channel records verified Whop membership activity without exposing API secrets. `/whop-status` reports integration health, discovered products, persistence counts, and the latest reconciliation result; `/whop-sync` forces a fresh reconciliation for administrators.

A Whop owner/admin account is not itself treated as a customer membership, so an empty membership list is expected until a real customer/test membership exists. Members must have Discord connected to their Whop account and be present in The Trading Foundation server before the custom bot can apply Discord roles.

## Migration

Role aliases preserve existing Essential, Advanced→Premium, Private→Personal Guide and Member→Community Member IDs. Old Live role holders are moved to Premium before the obsolete role is removed. Existing channels are moved/renamed in place to preserve their history. Getting Started is removed after permission verification. No new wipe cutoff is used.

The rules card is edited in place and keeps its acceptance reactions. Welcome, package comparison and FAQ are banner-first Components V2 cards; repeated startup edits them rather than posting duplicates. Welcome links directly to Rules. Only member-activity receives future join/leave events. Lesson and official information channels are staff-posting only; Live Classroom is listen-only for students, with questions in classroom chat.

## Run and verify

Production runs from `main` on Railway with one bot replica and Postgres attached through `DATABASE_URL`. Keep `DISCORD_TOKEN`, `DISCORD_GUILD_ID`, `ENABLE_SERVER_SYNC`, the Whop credentials/product IDs, and `DATABASE_URL` in Railway.

`npm ci`, `npm run check`, and `npm test` validate the code, access combinations, cards, membership and activity behavior. Startup verifies live channel permissions and fetches each branded message after publishing it. `/sync` uses the same guarded migration and refreshes cards.

The bot exposes `GET /health` for Railway and operational checks. The health response reports bot readiness plus whether the Whop company ID and webhook secret are configured, without returning secrets.

## FAQ research

The initial FAQ uses original answers based on the approved offering. Question topics (beginner experience, included access, cost and class scheduling) were informed by [618ers' public community FAQ](https://whop.com/618/618ers/) reviewed September 9, 2026. No competitor policies, trading outcomes, course content or pricing were copied.

## Private support tickets

The read-only Support channel contains a branded Open a Ticket button. Clicking it opens a private reason form. Submission creates a private text channel under Support Tickets and returns an ephemeral link. Access is explicitly limited to the requesting member, Dontradez, Admin, Moderator and OTR Bot; unrelated paid/community roles are not granted visibility. As with all Discord channels, the server owner and roles with Administrator retain Discord's administrative access.

One open ticket per member is enforced with a request lock and channel-topic metadata, so active tickets survive bot restarts. Reasons are posted only after validating the new channel's exact permission overwrites and are not logged. Staff use `/ticket-controls` inside a ticket to see an ephemeral Close Ticket button visible only to them. No close button appears on the shared member message, including existing tickets. Closing does not delete its conversation; the member retains read-only access and can open a new ticket afterward. Template sync leaves individual ticket channels alone.

## Activity engine and onboarding

Postgres is active in production via `DATABASE_URL`. Tables are created idempotently at startup. XP awards use a transaction, a per-member row lock and unique event keys. This is durable storage, not a guarantee of indefinite retention: database backups and retention still need an operational policy.

Message XP: 15 XP per eligible message, 60-second cooldown, minimum 15 normalized characters and three distinct words. Repeated normalized messages earn nothing for ten minutes. Bots, webhooks, support tickets and staff/system areas do not earn XP. Duplicate-content hashes are stored; message text and voice audio are not stored.

Voice XP: 5 XP per 60 eligible seconds, with at least two verified human participants. AFK and self/server-deafened users are excluded; muted listeners can participate. 30-second checkpoints cap each interval at 90 seconds and discard offline time. A crash may lose the final uncommitted interval. Run only one bot replica for voice tracking.

Level L requires 100 × L² combined XP. Rank levels: New Trader 0, Student 5, Developing Trader 10, Disciplined Trader 20, Foundation Trader 30, Veteran 40, Elite 50. Rank roles never grant paid access. `/rank` renders a navy/gold PNG with avatar, progress and server rank. `/leaderboard` supports combined, text and voice views. Departed members retain their stored activity but are excluded from leaderboards.

Arrivals get a branded card in Welcome and departures go to member-activity. Existing members are reconciled at startup; verified members receive their appropriate starting/progression role. Verification dates and current membership tiers are persisted. Whop membership automation uses the same production Postgres database and runs independently from XP/rank access.
