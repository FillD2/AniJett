# AniJett — Anime Streaming Platform

## Project Overview
Full-stack anime streaming SPA with Node.js + Express backend and PostgreSQL database.
Frontend: pure HTML/CSS/JS (no framework). Backend: REST API v2.

## Architecture

### Frontend
- `index.html` — single-page application entry point
- `css/style.css` — main stylesheet
- `js/api.js` — API client (JWT auth, auto-refresh, all endpoint wrappers via window.API)
- `js/script.js` — frontend logic; fully connected to backend API (no hardcoded data)
- `sw.js` — Service Worker (cache v6)
- Footer pages: `police.html`, `cookies.html`, `data.html`, `copyright.html`, `donations.html`, `terms.html`, `about.html`, `team.html`, `volunteers.html`, `faq.html`, `plans.html`, `cooperation.html`

### Backend (`server/`)
- `server/index.js` — Express app (port 5000); serves API + static SPA
- `server/db/index.js` — PostgreSQL connection pool (pg)
- `server/db/schema.sql` — Full DB schema (run once on fresh setup)
- `server/db/migrate_v2.sql` — v2 migration (reactions, replies, push subscriptions)
- `server/middleware/auth.js` — JWT (authRequired / authOptional / adminOnly / strictAdmin)
- `server/utils/push.js` — Web Push helper: sendNotification(), processMentions()
- `server/routes/auth.js` — register, login, refresh, logout, /me
- `server/routes/anime.js` — CRUD + search/filter/pagination
- `server/routes/bookmarks.js` — user watchlists
- `server/routes/comments.js` — threaded comments + reactions + @mentions
- `server/routes/ratings.js` — 1-10 scores with auto avg recalc
- `server/routes/notifications.js` — in-app notifications
- `server/routes/subscriptions.js` — anime subscriptions
- `server/routes/users.js` — profiles + stats
- `server/routes/push.js` — browser push subscription management
- `server/routes/admin.js` — anime auto-import from Jikan (MyAnimeList) API

## Database (PostgreSQL — Replit built-in)
Tables: `users`, `refresh_tokens`, `anime`, `bookmarks`, `comments`, `comment_reactions`,
        `ratings`, `notifications`, `subscriptions`, `push_subscriptions`

## API Reference

### Auth — `/api/auth`
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /register | — | Register (username, email, password) |
| POST | /login | — | Login (login, password) → access+refresh tokens |
| POST | /refresh | — | Rotate refresh token |
| POST | /logout | — | Invalidate refresh token |
| GET | /me | ✓ | Current user info + stats |

### Anime — `/api/anime`
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | / | opt | List with pagination, search, status/type/genre/year/sort filters |
| GET | /:id | opt | Detail + recent comments + user bookmark/rating |
| POST | / | admin | Create anime |
| PUT | /:id | admin | Update anime |
| DELETE | /:id | admin | Delete anime |

### Bookmarks — `/api/bookmarks`
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | / | ✓ | User's bookmarks (?status=watching) |
| GET | /stats | ✓ | Count per status |
| POST | / | ✓ | Add/update (anime_id, status, episodes_watched) |
| DELETE | /:animeId | ✓ | Remove |

### Comments — `/api/comments` (v2: threaded + reactions + @mentions)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /:animeId | opt | Paginated comments with nested replies + reactions |
| POST | /:animeId | ✓ | Post comment (supports parent_id for replies; @mention parsing) |
| PUT | /:id | ✓ | Edit own comment |
| DELETE | /:id | ✓ | Soft-delete (own or admin any) |
| POST | /:id/react | ✓ | React: fire/horror/poop/heart/laugh/sad. One per user; same = toggle off; different = switch |

### Ratings — `/api/ratings`
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | / | ✓ | Set/update score (1-10), recalculates anime avg |
| GET | /:animeId | opt | Avg + distribution + user's score |
| DELETE | /:animeId | ✓ | Remove rating |

### Notifications — `/api/notifications`
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | / | ✓ | List (?unread=true) + unread_count |
| PUT | /:id/read | ✓ | Mark as read |
| PUT | /read-all | ✓ | Mark all read |
| DELETE | /:id | ✓ | Delete one |
| DELETE | / | ✓ | Clear all |

### Subscriptions — `/api/subscriptions`
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | / | ✓ | User's anime subscriptions |
| POST | / | ✓ | Subscribe (anime_id) |
| DELETE | /:animeId | ✓ | Unsubscribe |
| GET | /check/:animeId | ✓ | Is subscribed? |

### Users — `/api/users`
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /me | ✓ | Own profile + full stats |
| PUT | /me | ✓ | Update username/bio/avatar/password |
| GET | /:id | — | Public profile + favorites |

### Push Notifications — `/api/push`
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /vapid-public-key | — | Get VAPID public key for browser subscription |
| POST | /subscribe | ✓ | Save browser push subscription |
| DELETE | /unsubscribe | ✓ | Remove push subscription |

### Admin — `/api/admin` (admin role required)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /stats | admin | Total counts for all entities |
| GET | /anime/search?q= | admin | Search Jikan API (preview, no import) |
| POST | /anime/import/search | admin | Import by search query {q, limit} |
| POST | /anime/import/top | admin | Import top anime by score {page, limit} |
| POST | /anime/import/seasonal | admin | Import seasonal {year, season, limit} |

## Auth Flow
- JWT access token (15 min) + refresh token (7 days, stored in DB, rotated on use)
- Header: `Authorization: Bearer <accessToken>`
- On 401 `code: TOKEN_EXPIRED` → call POST /api/auth/refresh with refreshToken

## Comment Reactions Logic
- `POST /api/comments/:id/react { reaction: "fire" }`
- One reaction per user per comment (UNIQUE constraint)
- Sending same reaction → toggle off (remove)
- Sending different reaction → switch (old is deleted, new is set)
- Returns `{ action, reactions: { fire: N, ... }, user_reaction }`

## @Mentions & Reply Notifications
- Comment text `@username` → parse → find user → create in-app + push notification
- Replying to a comment → parent author gets reply notification
- Notification types: `system`, `reply`, `mention`

## Push Notifications (Web Push / VAPID)
- VAPID keys stored in VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY env vars
- Browser subscribes via POST /api/push/subscribe
- Auto-sent on: reply to comment, @mention

## Auto-Import from Jikan (MyAnimeList)
- Free, no API key needed. Rate limit: 3 req/s handled automatically
- Import top anime: `POST /api/admin/anime/import/top`
- Import by search: `POST /api/admin/anime/import/search { q: "naruto" }`
- Import seasonal: `POST /api/admin/anime/import/seasonal { year: 2025, season: "fall" }`
- Duplicate protection: ON CONFLICT DO NOTHING

## Environment Variables
- `DATABASE_URL` — PostgreSQL connection string (auto-set by Replit)
- `JWT_SECRET` — JWT signing secret (⚠️ change in production!)
- `JWT_REFRESH_SECRET` — refresh token secret (⚠️ change in production!)
- `VAPID_PUBLIC_KEY` — Web Push public key
- `VAPID_PRIVATE_KEY` — Web Push private key
- `VAPID_SUBJECT` — Email for VAPID (mailto:admin@anijett.ru)
- `PORT` — server port (default 5000)

## Run
```bash
npm start   # node server/index.js
```
