# OTR Bot · The Trading Foundation

Discord automation for Dontradez, managed by OTR Services.

## Packages and access

| Role | Access |
| --- | --- |
| Community Member | Free Community after accepting the rules |
| Foundation Member | Shared paid Foundation rooms; derived from an active tier role |
| Essential | Foundation + basic video course; $50 one-time |
| Premium | Essential content + advanced Don/Bubba videos and paid discussions; $100 |
| Personal Guide | Premium content + one-month live classroom, Q&A and daily selected trade reviews; $150 |

Premium/Personal Guide billing frequency, upgrade discount amount, refund policy, course dates, and post-course access are not yet defined. No automatic one-month expiry is imposed before those terms are agreed. The course videos are to be uploaded by staff to both Discord and Whop.

Whop is not connected yet. When configuring it, map each product to its matching Essential, Premium, or Personal Guide role. The bot derives/removes Foundation Member from those roles, including startup reconciliation. Do not independently map Whop to Foundation Member. No checkout buttons are published until the actual product links are provided. XP/rank roles do not grant paid access.

## Migration

Role aliases preserve existing Essential, Advanced→Premium, Private→Personal Guide and Member→Community Member IDs. Old Live role holders are moved to Premium before the obsolete role is removed. Existing channels are moved/renamed in place to preserve their history. Getting Started is removed after permission verification. No new wipe cutoff is used.

The rules card is edited in place and keeps its acceptance reactions. Welcome, package comparison and FAQ are banner-first Components V2 cards; repeated startup edits them rather than posting duplicates. Welcome links directly to Rules. Only member-activity receives future join/leave events. Lesson and official information channels are staff-posting only; Live Classroom is listen-only for students, with questions in classroom chat.

## Run and verify

Keep `DISCORD_TOKEN` in Railway. Configure `DISCORD_GUILD_ID` and `ENABLE_SERVER_SYNC` as before. `npm ci`, `npm run check`, and `npm test` validate the code, access combinations, cards, membership and activity behavior. Startup verifies live channel permissions and fetches each branded message after publishing it. `/sync` uses the same guarded migration and refreshes cards.

## FAQ research

The initial FAQ uses original answers based on the approved offering. Question topics (beginner experience, included access, cost and class scheduling) were informed by [618ers' public community FAQ](https://whop.com/618/618ers/) reviewed September 9, 2026. No competitor policies, trading outcomes, course content or pricing were copied.

## Private support tickets

The read-only Support channel contains a branded Open a Ticket button. Clicking it opens a private reason form. Submission creates a private text channel under Support Tickets and returns an ephemeral link. Access is explicitly limited to the requesting member, Dontradez, Admin, Moderator and OTR Bot; unrelated paid/community roles are not granted visibility. As with all Discord channels, the server owner and roles with Administrator retain Discord's administrative access.

One open ticket per member is enforced with a request lock and channel-topic metadata, so active tickets survive bot restarts. Reasons are posted only after validating the new channel's exact permission overwrites and are not logged. Staff use `/ticket-controls` inside a ticket to see an ephemeral Close Ticket button visible only to them. No close button appears on the shared member message, including existing tickets. Closing does not delete its conversation; the member retains read-only access and can open a new ticket afterward. Template sync leaves individual ticket channels alone.
