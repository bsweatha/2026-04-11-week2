# ThreadHive — MongoDB Schema Design Plan (Hybrid Denormalized)

## Strategy

This plan implements **Approach B: Hybrid Denormalized** — 7 collections with strategic embedding of author/subreddit snapshots in threads and comments for read performance, while keeping votes, notifications, and moderation logs in separate collections.

**Why Hybrid?** A Reddit-like app is overwhelmingly read-heavy. Feed browsing, thread viewing, and comment reading vastly outnumber writes. Embedding snapshots eliminates `$lookup` joins on the hottest query paths.

---

## Core Entities & Relationships

```
User ──1:M──► Thread
User ──1:M──► Comment
User ◄──M:M──► Subreddit  (subscription)
User ◄──M:M──► Subreddit  (moderator)
Subreddit ──1:M──► Thread
Thread ──1:M──► Comment
Comment ──1:M──► Comment   (self-ref: nested replies)
User ──► Vote ──► Thread | Comment  (polymorphic, unique per user+target)
User ◄──1:M── Notification
Subreddit ──1:M──► ModerationLog
```

---

## Query Pattern Analysis

| Query Path                         | Type           | Frequency | Optimization                                    |
|------------------------------------|----------------|-----------|--------------------------------------------------|
| Home feed (subscribed, sorted)     | **Read-heavy** | Very High | Embedded snapshots + `hotScore` compound index   |
| Thread detail + comment tree       | **Read-heavy** | Very High | Materialized path + ancestors array              |
| Cast / change vote                 | **Write-heavy**| High      | Unique compound index + atomic `$inc`            |
| Post / comment creation            | Write          | Moderate  | Standard insert + snapshot embedding             |
| User profile (history + karma)     | **Read-heavy** | Moderate  | Author index + cached karma on User              |
| Search (threads, subreddits, users)| **Read-heavy** | Moderate  | Text indexes on each collection                  |
| Check unread notifications         | Mixed          | Moderate  | Compound index `{ recipient, isRead, createdAt }`|
| Moderation actions                 | Write          | Low       | Append-only audit log                            |

---

## Collection Schemas

### 1. `users`

| Field                  | Type                         | Notes                                   |
|------------------------|------------------------------|-----------------------------------------|
| `_id`                  | ObjectId                     | Auto-generated                          |
| `username`             | String, required, unique     | Display name                            |
| `email`                | String, required, unique     | Login credential                        |
| `password`             | String, required             | bcrypt hashed (pre-save middleware)      |
| `bio`                  | String                       | Profile bio                             |
| `avatar`               | String                       | URL to avatar image                     |
| `postKarma`            | Number, default: 0           | Cached karma from thread votes          |
| `commentKarma`         | Number, default: 0           | Cached karma from comment votes         |
| `subscribedSubreddits` | [ObjectId] ref Subreddit     | Subreddits user is subscribed to        |
| `createdAt`            | Date                         | Mongoose timestamps                     |
| `updatedAt`            | Date                         | Mongoose timestamps                     |

**Indexes:**
- `{ email: 1 }` — unique
- `{ username: 1 }` — unique
- `{ username: "text" }` — search

**Notes:** Password hashing via bcrypt pre-save hook. Karma fields are denormalized caches updated on vote events.

---

### 2. `subreddits`

| Field             | Type                                    | Notes                                |
|-------------------|-----------------------------------------|--------------------------------------|
| `_id`             | ObjectId                                | Auto-generated                       |
| `name`            | String, required, unique                | Community name (e.g., "technology")  |
| `description`     | String                                  | Community description                |
| `creator`         | ObjectId ref User                       | Who created the subreddit            |
| `moderators`      | [ObjectId] ref User                     | Moderator user IDs                   |
| `bannedUsers`     | [ObjectId] ref User                     | Banned user IDs                      |
| `flairConfig`     | [{ name: String, color: String }]       | Available flair categories           |
| `subscriberCount` | Number, default: 0                      | Denormalized subscriber count        |
| `pinnedThreads`   | [ObjectId] ref Thread                   | Pinned post IDs (max ~5)            |
| `createdAt`       | Date                                    | Mongoose timestamps                  |

**Indexes:**
- `{ name: 1 }` — unique
- `{ name: "text", description: "text" }` — search

**Notes:** `subscriberCount` is incremented/decremented atomically when users subscribe/unsubscribe.

---

### 3. `threads`

| Field               | Type                                                           | Notes                                          |
|---------------------|----------------------------------------------------------------|------------------------------------------------|
| `_id`               | ObjectId                                                       | Auto-generated                                 |
| `title`             | String, required                                               | Post title                                     |
| `content`           | String, required                                               | Markdown body                                  |
| `author`            | ObjectId ref User                                              | Canonical author reference                     |
| `authorSnapshot`    | { _id: ObjectId, username: String, avatar: String }            | **Embedded** — avoids `$lookup` on feed        |
| `subreddit`         | ObjectId ref Subreddit                                         | Canonical subreddit reference                  |
| `subredditSnapshot` | { _id: ObjectId, name: String }                                | **Embedded** — avoids `$lookup` on feed        |
| `upvotes`           | Number, default: 0                                             | Denormalized upvote count                      |
| `downvotes`         | Number, default: 0                                             | Denormalized downvote count                    |
| `voteScore`         | Number, default: 0                                             | `upvotes - downvotes`                          |
| `hotScore`          | Number, default: 0                                             | Pre-computed hot ranking score                 |
| `commentCount`      | Number, default: 0                                             | Denormalized comment count                     |
| `flair`             | String                                                         | Selected flair tag                             |
| `isRemoved`         | Boolean, default: false                                        | Soft delete by moderator                       |
| `createdAt`         | Date                                                           | Mongoose timestamps                            |
| `updatedAt`         | Date                                                           | Mongoose timestamps                            |

**Indexes:**
- `{ subreddit: 1, createdAt: -1 }` — "new" sort within a subreddit
- `{ subreddit: 1, voteScore: -1 }` — "top" sort within a subreddit
- `{ subreddit: 1, hotScore: -1 }` — "hot" sort within a subreddit
- `{ author: 1, createdAt: -1 }` — user profile post history
- `{ createdAt: -1 }` — global "new" feed
- `{ title: "text", content: "text" }` — full-text search

**Notes:**
- `authorSnapshot` and `subredditSnapshot` are set at creation time and updated via a background job when a user changes their username/avatar.
- `hotScore` is recalculated on each vote using a time-decay algorithm: `hotScore = voteScore / (hoursAge + 2) ^ gravity` (where gravity ≈ 1.8).
- `voteScore` is maintained via atomic `$inc` on vote cast/change.

---

### 4. `comments`

| Field             | Type                                                    | Notes                                                      |
|-------------------|---------------------------------------------------------|------------------------------------------------------------|
| `_id`             | ObjectId                                                | Auto-generated                                             |
| `content`         | String, required                                        | Comment body (Markdown)                                    |
| `author`          | ObjectId ref User                                       | Canonical author reference                                 |
| `authorSnapshot`  | { _id: ObjectId, username: String, avatar: String }     | **Embedded** — avoids `$lookup` when rendering tree        |
| `thread`          | ObjectId ref Thread                                     | Parent thread                                              |
| `parentComment`   | ObjectId ref Comment \| null                            | `null` = top-level comment                                 |
| `depth`           | Number, default: 0                                      | Nesting level (for display depth limits)                   |
| `path`            | String                                                  | Materialized path: `"rootId/parentId/thisId"`              |
| `ancestors`       | [ObjectId]                                              | All ancestor comment IDs (for subtree queries)             |
| `upvotes`         | Number, default: 0                                      | Denormalized upvote count                                  |
| `downvotes`       | Number, default: 0                                      | Denormalized downvote count                                |
| `voteScore`       | Number, default: 0                                      | `upvotes - downvotes`                                      |
| `isRemoved`       | Boolean, default: false                                 | Soft delete by moderator                                   |
| `createdAt`       | Date                                                    | Mongoose timestamps                                       |
| `updatedAt`       | Date                                                    | Mongoose timestamps                                       |

**Indexes:**
- `{ thread: 1, path: 1 }` — fetch full comment tree sorted by path (preserves hierarchy)
- `{ thread: 1, createdAt: -1 }` — flat chronological sort
- `{ author: 1, createdAt: -1 }` — user profile comment history
- `{ parentComment: 1 }` — direct replies lookup

**Tree query pattern:**
```js
// Fetch entire comment tree for a thread, ordered hierarchically
Comment.find({ thread: threadId }).sort({ path: 1 })

// Fetch all replies under a specific comment
Comment.find({ thread: threadId, path: { $regex: `^${parentPath}/` } })

// Fetch direct children only
Comment.find({ parentComment: commentId })
```

---

### 5. `votes`

| Field        | Type                                       | Notes                                          |
|--------------|--------------------------------------------|-------------------------------------------------|
| `_id`        | ObjectId                                   | Auto-generated                                  |
| `user`       | ObjectId ref User                          | Who voted                                       |
| `targetType` | String, enum: ["Thread", "Comment"]        | Polymorphic discriminator                        |
| `target`     | ObjectId (refPath: targetType)             | Thread or Comment ID                            |
| `value`      | Number, enum: [-1, 1]                      | -1 = downvote, 1 = upvote                       |
| `createdAt`  | Date                                       | Mongoose timestamps                             |

**Indexes:**
- `{ user: 1, target: 1 }` — **unique compound** (prevents duplicate votes)
- `{ target: 1 }` — aggregate votes on a target

**Vote flow:**
```
1. Upsert vote: db.votes.findOneAndUpdate(
     { user, target },
     { $set: { value, targetType } },
     { upsert: true }
   )
2. Atomic update on target:
   - If new vote:     Thread.updateOne({ _id: target }, { $inc: { upvotes: 1, voteScore: 1 } })
   - If vote changed: Thread.updateOne({ _id: target }, { $inc: { upvotes: 1, downvotes: -1, voteScore: 2 } })
   - If vote removed: Thread.updateOne({ _id: target }, { $inc: { upvotes: -1, voteScore: -1 } })
3. Recalculate hotScore on the thread (if target is a thread)
4. Update author's karma (background or post-hook)
```

---

### 6. `notifications`

| Field        | Type                                                        | Notes                            |
|--------------|-------------------------------------------------------------|----------------------------------|
| `_id`        | ObjectId                                                    | Auto-generated                   |
| `recipient`  | ObjectId ref User                                           | Who receives the notification    |
| `type`       | String, enum: ["reply", "mention", "mod_action", "thread_reply"] | Notification category       |
| `message`    | String                                                      | Human-readable display text      |
| `sourceUser` | ObjectId ref User                                           | Who triggered the notification   |
| `thread`     | ObjectId ref Thread                                         | Related thread (optional)        |
| `comment`    | ObjectId ref Comment                                        | Related comment (optional)       |
| `isRead`     | Boolean, default: false                                     | Read/unread state                |
| `createdAt`  | Date                                                        | Mongoose timestamps              |

**Indexes:**
- `{ recipient: 1, isRead: 1, createdAt: -1 }` — unread notifications feed (covers the primary query)

---

### 7. `moderationlogs`

| Field           | Type                                                                                                       | Notes                          |
|-----------------|--------------------------------------------------------------------------------------------------------------|--------------------------------|
| `_id`           | ObjectId                                                                                                     | Auto-generated                 |
| `subreddit`     | ObjectId ref Subreddit                                                                                       | Which community                |
| `moderator`     | ObjectId ref User                                                                                            | Who performed the action       |
| `action`        | String, enum: ["remove_post", "remove_comment", "ban_user", "unban_user", "pin_post", "unpin_post", "appoint_mod", "remove_mod"] | Action type    |
| `targetUser`    | ObjectId ref User                                                                                            | Affected user (optional)       |
| `targetThread`  | ObjectId ref Thread                                                                                          | Affected thread (optional)     |
| `targetComment` | ObjectId ref Comment                                                                                         | Affected comment (optional)    |
| `reason`        | String                                                                                                       | Reason for the action          |
| `createdAt`     | Date                                                                                                         | Mongoose timestamps            |

**Indexes:**
- `{ subreddit: 1, createdAt: -1 }` — mod log feed per subreddit

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Snapshots in threads/comments** | Eliminates `$lookup` on the two highest-frequency read paths (feed + comment tree). Username/avatar changes are rare and handled by background batch update. |
| **Pre-computed `hotScore`** | The "hot" feed is the default view. A compound index on `{ subreddit, hotScore }` turns this into a single covered index scan instead of a runtime sort expression. |
| **Materialized path + ancestors array** on comments | Path enables hierarchical sort (`sort({ path: 1 })`), ancestors enable "all replies under X" queries. Combined approach covers all comment tree access patterns. |
| **Separate `votes` collection** | Embedding votes in threads/comments would hit the 16MB document limit on popular posts. A separate collection with a unique compound index on `{ user, target }` enforces one-vote-per-user atomically. |
| **Karma cached on User** | Computing karma on-the-fly requires aggregating all votes across all of a user's posts/comments — too expensive. Cache on User, update via post-vote hook or periodic job. |
| **Separate `moderationlogs` collection** | Append-only audit trail. Not embedded in Subreddit to avoid unbounded array growth and to keep mod actions queryable independently. |
| **Soft deletes (`isRemoved`)** | Threads/comments removed by mods are flagged rather than deleted, preserving discussion context and enabling undo. |

---

## Trade-offs & Mitigations

| Trade-off | Impact | Mitigation |
|-----------|--------|------------|
| Snapshot staleness on username/avatar change | Threads/comments show old name until updated | Background job: `Thread.updateMany({ "authorSnapshot._id": userId }, { $set: { "authorSnapshot.username": newName } })`. Rate-limit username changes. |
| `hotScore` staleness | Hot ranking slightly behind real-time | Recalculate on every vote (cheap: single `$set`). Optionally run periodic batch recalc for time-decay. |
| Storage overhead from snapshots | ~100-200 bytes per thread/comment for embedded data | Negligible at Reddit-like scale. Savings from eliminated `$lookup` far outweigh storage cost. |
| Write amplification on voting | Vote upsert + counter update + hotScore recalc = 2-3 writes | All are simple atomic operations (`$inc`, `$set`). No document restructuring. |

---

## Implementation Phases

### Phase 1 — Update Existing Models
1. **User model** — add `username`, `bio`, `avatar`, `postKarma`, `commentKarma`, `subscribedSubreddits`; add bcrypt pre-save hook; add indexes
2. **Subreddit model** — add `moderators`, `bannedUsers`, `flairConfig`, `subscriberCount`, `pinnedThreads`; add text index
3. **Thread model** — add `authorSnapshot`, `subredditSnapshot`, `hotScore`, `commentCount`, `flair`, `isRemoved`, `updatedAt`; add all compound + text indexes

### Phase 2 — Create New Models
4. **Comment model** — full schema with tree support (`parentComment`, `depth`, `path`, `ancestors`, `authorSnapshot`)
5. **Vote model** — polymorphic with unique compound index
6. **Notification model** — recipient-centric with read state
7. **ModerationLog model** — append-only audit log

### Phase 3 — Seed Data & Verification
8. Update JSON seed files with new fields (snapshots, subscriptions, flairs)
9. Update `seed.js` to seed all 7 collections with proper relationships
10. Verify indexes created correctly via `db.collection.getIndexes()`
11. Update/extend `test-crud.js` for new models and constraints

---

## Files to Create / Modify

| File | Action | Description |
|------|--------|-------------|
| `models/User.js` | **Modify** | Add new fields, bcrypt hook, indexes |
| `models/Subreddit.js` | **Modify** | Add moderation & flair fields, indexes |
| `models/Thread.js` | **Modify** | Add snapshots, hotScore, indexes |
| `models/Comment.js` | **Create** | New model with tree support |
| `models/Vote.js` | **Create** | New model with unique constraint |
| `models/Notification.js` | **Create** | New model |
| `models/ModerationLog.js` | **Create** | New model |
| `data/users.json` | **Modify** | Add username, bio, avatar, subscriptions |
| `data/subreddits.json` | **Modify** | Add moderators, flairConfig |
| `data/threads.json` | **Modify** | Add snapshots, hotScore, flair |
| `data/comments.json` | **Create** | Seed comments with tree structure |
| `data/votes.json` | **Create** | Seed votes |
| `scripts/seed.js` | **Modify** | Seed all 7 collections |
| `scripts/test-crud.js` | **Modify** | Add tests for new models + constraints |
