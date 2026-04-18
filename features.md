# ThreadHive Feature Plan — MoSCoW Framework

## MUST HAVE — Without these, the platform doesn't function

| # | Feature | User Capability | Complexity | Priority Justification |
|---|---------|----------------|------------|----------------------|
| 1 | **User Authentication** | Sign up, log in/out, persistent sessions via JWT | **Moderate** | No platform works without identity. User model exists but passwords are plaintext — must add bcrypt hashing. |
| 2 | **RESTful API Server (Express)** | Frontend/clients call structured endpoints for all resources | **Moderate** | Data layer exists with zero HTTP surface. Every feature downstream depends on this. |
| 3 | **Thread CRUD** | Create text posts in a subreddit, view detail, edit/delete own posts | **Simple** | CRUD already tested in scripts — wrap in route handlers with auth guards. Posts are the atomic unit of value. |
| 4 | **Subreddit Creation & Subscription** | Create communities, browse a directory, subscribe to receive content in feed | **Moderate** | Subreddit model exists but needs a subscribers array or join collection. Without communities, content has no structure. |
| 5 | **Upvote / Downvote System** | Vote on threads; one vote per user per thread; vote counts update instantly | **Moderate** | Vote fields exist on Thread but there's no per-user tracking to prevent duplicate votes. Voting is the core ranking engine. |
| 6 | **Commenting** | Post comments on threads, view comment feed per thread | **Moderate** | New Comment model needed (content, author, thread, timestamps). Discussion is the second pillar — without comments this is a bulletin board, not a forum. |
| 7 | **User Profiles** | View own/others' profiles — post history, comment history, karma score | **Simple** | Aggregate existing data + add bio/avatar fields to User. Identity and reputation drive participation. |
| 8 | **Home Feed** | See aggregated threads from subscribed subreddits, sorted by hot/new/top | **Moderate** | Aggregation pipeline from subscriptions with sorting. The feed is the primary surface users interact with daily. |

## SHOULD HAVE — Significantly enhance UX but not launch-blockers

| # | Feature | User Capability | Complexity | Priority Justification |
|---|---------|----------------|------------|----------------------|
| 9 | **Nested / Threaded Comments** | Reply to specific comments, creating collapsible discussion trees | **Moderate** | parentComment self-reference in Comment model. Threaded replies are what make Reddit-style discussion powerful vs. flat forums. |
| 10 | **Sorting & Filtering** | Sort any feed by Hot (time-decay + votes), New, Top (by timeframe), Controversial | **Moderate** | Scoring algorithms + query params + indexes. "Hot" algorithm is what differentiates from a chronological feed. |
| 11 | **Search** | Keyword search across threads, subreddits, and users | **Moderate** | MongoDB text indexes or Atlas Search. Essential for discovery as content volume grows. |
| 12 | **Subreddit Moderation Tools** | Appoint moderators, remove posts/comments, ban users, pin posts | **Moderate** | Role system per subreddit + moderation action log. Communities need governance to maintain quality. |
| 13 | **Karma System** | Accumulate post/comment karma; display on profile; karma thresholds unlock capabilities | **Simple** | Computed from vote totals, cached on User. Gamification loop that drives continued participation. |
| 14 | **Rich Text / Markdown Posts** | Compose with bold, italic, links, images, code blocks | **Moderate** | Markdown parser on frontend, HTML sanitization on backend (prevent XSS). Plain text limits expression significantly. |
| 15 | **Notifications** | Receive alerts for replies, mentions, and mod actions; read/unread state | **Moderate** | New Notification model + WebSocket or polling. Closes the engagement loop — users return when someone responds. |
| 16 | **Post Flairs & Tags** | Mods define flair categories; users tag posts; readers filter by flair | **Simple** | Flair field on Thread, flair config array on Subreddit. Improves content organization in high-volume communities. |
