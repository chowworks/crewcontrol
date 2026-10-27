# Project memory — Travel HQ

An organizer-first tool for running group trips for friend groups (not travel agencies). The organizer builds a
trip page, collects interest, approves the crew, tracks payments and payment plans, and runs reminders and
updates from one place. Guests get the trip page and, once approved, a portal with their plan and payment
history. Tagline: "Get your trip out the group chat." Renamed from CrewControl on 2026-10-26 (owner's decision); before that it was Travel HQ, and Group Trip in the
oldest docs. The site is travel-hq.app (travelhq.net and travelhq.vacations forward to it). Write the name "Travel HQ",
two words. Repository, Railway, R2 and package identifiers keep their old `crewcontrol` names on purpose.

## The pitch, and the rule it makes

**Travel HQ tracks money; it never moves it.** Guests pay the organizer directly (Zelle, Cash App, cash), so
nobody pays processor fees. Never build checkout, card entry, a payment processor or a bank integration, and
never hold funds. The app records that money moved. If a feature needs money to move through us, it is out of
scope; say so before building.

## Workflow

**Until the first production release, work is committed straight to `main` and no issues are opened**
(owner's decision, 2026-10-18). From the first release on, the rules below apply.

**Backlog lives in this repository's GitHub Issues, not files.**

- Open a new issue for any non-trivial new work or follow-up. One issue per coherent feature; use a checklist inside for sub-tasks.
- Every GitHub issue being worked must have an assignee. Before starting, check with `gh issue view <N> --json assignees`; if empty, assign it (`gh issue edit <N> --add-assignee <login>`, the person doing or owning the work) and say so.
- Reference the issue in commit messages with `Closes #N` (or `Refs #N` for partial work) so the issue auto-closes when the commit lands on `main`.
- No sprawling `TASKS.md`: drift across edits is the failure mode that moved Interview Differently to issues.

## Issue titles

Prefix every GitHub issue title with its area: `[Trip page]` (the public page, photos, highlights, key dates),
`[Guests]` (interest, registration, approval, the guest portal), `[Payments]` (plans, installments, logged
payments, receipts), `[Comms]` (trip thread, announcements, reminders, email and SMS) or `[Platform]` (auth,
storage, deploy, CI).

## Build order

The guiding workflow is the Drive doc "Group Trip - Stuff We do to Organize Trips"; the slices come from the
"Prototype Build Plan". Each slice is demoable on its own and builds on the last one's data:

1. Trip page: create, edit, publish, public view (photos, highlights, key dates).
2. Guest interest and registration (phone and email both required), organizer approval.
3. Payments and payment plans: installments, logged payments, balance, payment instructions.
4. Communications and reminders: trip thread, announcements, scheduled reminders.

Stretch: room types and room choice per guest. Done for v1 (the owner says "v1", not "MVP") means an organizer
runs one real trip end to end without falling back to a spreadsheet or a text thread.

## Names in the product (and what they are in the database)

- **Organizer** runs the trip. **Guest** is anyone on it: `interested` while joining, `approved` once accepted,
  `declined` if turned down (`Guest.status`, a check constraint). Older docs say "Passenger"; it is the same person.
- **The flow: sign, then accept and pay in the order the trip chose** (owner's decisions, 2026-10-21 and 2026-10-23;
  it replaced interest → approval → payment and the "pay to register" option). "I want to join" on the trip page
  opens `/t/<slug>/join`: the guest signs in, fills in the form and signs the trip agreement in one step. No
  signature, no spot, and no nudges.
- **Join mode** is per trip (`Trip.joinMode`), because not every trip should have guests pay before they are accepted:
  `accept_first` (the default: the organizer accepts each guest who signed, and only then does the guest see how to
  pay), `pay_first` (the guest sees how to pay and says when they have; the organizer accepts each one whose payment
  arrived, `Guest.paymentConfirmedAt`) or `first_come` (as pay_first, but confirming a payment accepts that guest
  while spots are left, in the order confirmed, never by random draw). Joining doesn't pause on the last spot: if two
  pay for it, the one confirmed second is refunded. Turning down a guest whose payment arrived needs the organizer to
  tick "Refund sent" (`Guest.refundSentAt`); that records the refund, it moves no money.
- **The trip agreement** is one fixed Travel HQ template (`apps/api/src/join/agreement.ts`, `TEMPLATE_VERSION`),
  filled from the trip's facts; organizers can't edit it, only preview it, and pick its refund policy from presets
  (`Trip.refundPolicy`: `spot_filled` or `first_payment_kept`, owner's decision 2026-10-26; never free text, and
  organizers ask for other terms with "Suggest other refund terms", listed in the Admin toolbox). Click-to-sign: typed full name, an "I
  agree" box unticked by default, a "Sign" button. Each `AgreementSignature` keeps the text as shown, its SHA-256,
  the typed name, time, IP and browser, and the price, plan, dates and refund terms it quoted. A guest's balance
  comes from their own signature, never from the trip's current settings. The wording has not had a lawyer's
  review; it needs one before a real trip uses it, and any change gets a new `TEMPLATE_VERSION`.
- **Travel HQ's own Terms** are apart from the trip agreement: the **Terms of Use** everyone accepts and the
  **Organizer Terms** anyone who runs a trip accepts as well (`apps/api/src/terms/terms-text.ts`, shown at `/terms`).
  Each version is the fingerprint of its wording, so changing a word asks everyone again. A guest ticks the Terms of
  Use on the join form (only if they haven't accepted the current version), saved with their signature; an organizer
  accepts both on a full screen before any `/organize` page, and the API refuses organizer routes until then
  (`OrganizerTermsGuard`, 403 `terms_required`). Each `TermsAcceptance` row keeps the version, time, IP and browser.
  The wording has not had a lawyer's review either. Issue #5.
- **Trip** = a `Trip` row. Photos, highlights and key dates are ordered JSON lists on it (`TripPhoto[]` etc. in
  `packages/types`), replaced whole on save. The first photo is the cover.
- **A trip page is configured, never built around one kind of trip.** A house, a resort, a cruise and a
  weekend in a city all use the same page: the photo section's title, the highlight cards (icon, title, line)
  and the key dates are the organizer's. Never hard-code "the house" or a trip type. There are three seed trips on
  purpose, a house (`mv-beach-house-2027`), a resort (`aruba-2028`) and a villa with real photos
  (`tulum-40th-2027`, hotlinked from Unsplash); a change to the page should look right on all three.

## Data rules

- The repository is **public** (owner's decision, 2026-10-18), so everything committed, every issue and every
  comment is world-readable. **Fictional people only** in code, seeds, tests, docs, screenshots and issues:
  never a real friend's name, phone or email, never a real trip's payment details, never a secret or a real key.
- **What a guest page shows is decided in one place,** `toPublicTrip` (`apps/api/src/trips/trip-mapper.ts`), and
  its spec checks it: never payment instructions, never a guest's email or phone, never an agreement or signature,
  never the name of someone not yet accepted. Accepted guests' names show only when the organizer turns them on, as
  "First L.", or when guests pick rooms, because choosing who to room with needs them (owner's decision, 2026-10-24). A new field on `Trip` or `Guest` stays out of the public view until someone decides it belongs there.
- **Payment instructions go only to signed-in guests who joined the trip** (on an `accept_first` trip, once
  accepted), on their join page (`JoinService`), never on the public page and never through `toPublicTrip`.
- Uploads: JPEG, PNG or WebP, at most 8 MB, and the bytes must begin the way that type does (`looksLikeImage`);
  the browser's claimed type alone is never trusted. The web app shrinks photos before upload (`lib/resize.ts`).
  At most `MAX_TRIP_PHOTOS` (15) per trip.
- Passport and flight details are Phase 3 and need the PII research first (what to collect, how long to keep it,
  who may export it). Do not add fields for them before that.

## Trip isolation (row-level security)

The trip is the tenant, as the workspace is in Audit Differently; `docs/tenant-isolation.md` is the full design.
A trip's people are its `TripMember` rows (`owner` or `organizer`). Postgres policies keep every row to the members
of its trip, and the API sets the caller on every query (`src/core/tenant-context.ts`, `PrismaService`). A public
route runs in `runAsPublic`; trusted work in `runAsSystem`, and `trusted-paths.spec.ts` lists both on purpose. A new
table that holds trip data gets `tripId`, its policies and a `TENANT_TABLES` entry in the same change. It binds only
when the API connects as the restricted role (`cc_app`); dev still connects as the owner until sign-in sets a caller.

## Prototype limits (say so, don't hide them)

- **Sign-in is Clerk** (as in Learn Differently): organizer screens (`/organize`, `/admin`) and organizer API
  routes need a signed-in user. The sign-in guard tells the database who is calling (`identifyCaller`, and
  `identifyAdmin` on admin routes), and organizers see only the trips they are members of (`TripMember`, see
  `docs/tenant-isolation.md`). Admins (Clerk public metadata `{"role": "admin"}`) see every trip in the Admin
  toolbox; opening one seats them on it as an organizer, and the database logs every seat (`AccessLog`). Sample
  trips have no owner. Guests sign in to join a trip (`/t/<slug>/join`, `Guest.userId`); row-level security keeps
  them to their own guest row, their own signature and the trips they joined. Reading a trip page needs no sign-in.
- Texts and email to guests go through one function, `sendText` (`apps/api/src/join/send-text.ts`), mocked (logged,
  not sent) until the messaging module replaces it. "Text to join" (a join code texted to a Travel HQ number) is
  not built yet; the join button opens the join page directly.
- Photos go to a private Cloudflare R2 bucket per environment, as Audit Differently's documents do. A trip stores each
  photo's reference (`r2:trip-photos/<name>`), never a link; the API signs links that last two hours when it hands a
  trip out (`src/photos/photo-bucket.ts`), and browsers load them from Cloudflare, so a trip page view costs no
  Railway traffic. Anything more sensitive later uses the same private, signed pattern.
- Email and SMS are mocked (logged, not sent) until slice 4 says otherwise.

## Design

- Royal purple (`royal`, #5A2D91) for buttons, links and accents; ink (#0F1C2E), ground (#F3F6F5) and marigold
  (#F2B33D) for the host chip. The owner does not want teal or green buttons, or light blue. Bricolage Grotesque
  for headings, Instrument Sans for text. Tokens are in `apps/web/tailwind.config.js`; use them, not new hex values.
- Guests open the trip page from a text message, so **phone width first**: check 390 px wide before showing it,
  no sideways scroll, touch targets at least 44 px. The design mock is the "Travel HQ Guest Trip Page" canvas.

## Design rules (modeled on Audit Differently)

Owner's decision, 2026-10-21, after a header that looked bad. Before building any screen, follow these; they are
Audit Differently's rules in Travel HQ's colours. When something new doesn't fit one, ask before inventing.

- **The header:** the logo at the left, linking home. At the right, the page's actions as real buttons (New trip,
  Edit trip, Add trip), then the account menu last, at the far right (`components/AccountMenu.tsx`): the avatar and
  first name in a pill with a caret, opening a menu with who you are, Your trips, the Admin toolbox for admins,
  and Sign out. Never a loose text link for Admin or the account in the header, and never Clerk's own avatar
  button.
- **Buttons are solid or outlined in royal:** a filled royal button for the main action, outlined royal
  (`border-royal text-royal`) for the rest, marigold only for the main action on a royal or ink background. The main
  action must stand out from the buttons beside it: in a list of actions, each row's own action is filled and its
  other buttons (Details) are outlined (owner's decision, 2026-10-24). Never a bare text link styled as a button, and
  no grey or green buttons.
- **What needs the organizer goes at the top** (owner's decision, 2026-10-24): an Actions section above everything
  else on the screen, its icon in a royal-pale circle and a red count badge, one row per action (who, what happened
  in a sentence, the filled action button, then Details). "Nothing needs you right now." when empty. Trip Control
  (`pages/TripGuests.tsx`, `ActionsCard`) is the model.
- **Never invent a new kind of box.** A note or tip is the royal-pale panel (`rounded-xl bg-royal-pale px-4
py-3`); what went wrong is one `role="alert"` line at the top of the form or section, and a problem with one
  field goes beside that field; the end of a flow ("You're on the list") replaces the form in the same card, a
  heading and one line. Keep the words short: one line that says the point, then steps as a list.
- **Every save or change confirms itself in a toast** (owner's decision, 2026-10-26; `components/Toast.tsx`,
  `useToast`): a short line at the bottom ("$300 from Kendra confirmed."), with Undo when one step undoes it. A page
  never shows its own "Saved" line, and a download gets a toast too ("Downloaded Guests & Balances"). What went wrong
  is not a toast: it stays the `role="alert"` line on the form. A step that's hard to take back asks first in a
  modal (`components/ConfirmDialog.tsx`), never as text that appears on the page. Older screens (the trip editor,
  System Settings) still show a "Saved" line; move them to a toast when next touched.
- **Forms:** say every problem at once, beside its field, before the person presses the button. The server
  checks everything too; its message only covers what the screen could not know.
- **A focused task opens in a dialog** (a centred panel over a dimmed page, closed by Escape, the close button or
  a click outside, focus kept inside), not as a long form at the bottom of a page.
- **Choosing between things with a look** (rooms, beds, layouts) shows a small picture of each, never only a
  radio list of names.
- **Admin toolbox:** `/admin`, reached from the account menu. When a second tool arrives, `/admin` becomes a page of
  tiles (icon, title, one line), each tool its own page with a breadcrumb back, as in Audit Differently.

## Reviewing a feature with the owner

Before a feature is committed, the owner sees it working, screen by screen (owner's decision, 2026-10-21, from
Interview Differently's rule):

1. **Deploy it to dev.** Say which migrations it applies to the shared dev database and get a yes, then deploy with
   `apps/api/scripts/deploy-dev.sh` and restart the local API.
2. **Give a guided tour.** Drive the browser pane yourself, one screen at a time, on the fictional seed. For each
   screen, narrate in plain words: where we are, what each part does, what is new, and anything that looks wrong.
   Go slowly, one screen per message, and stop at the end of each section to wait for "next", so the owner can
   take notes. Do the real actions (save, change, register), cancel anything that should not stick, and put the
   demo data back as it was afterwards.
3. **Keep one numbered list of findings** as you go: everything the owner calls out and everything you notice
   (layout, wording, a broken rule). Repeat the list at the end of each section, one line per item, and strike what
   the owner rules out. Don't fix mid-tour unless asked.
4. **Fix the list, then tour the fixes** the same way, only over what changed.
5. **A design change goes back into the issue.** If the tour shows the design is wrong, rewrite the issue in plain
   words with the owner's decisions, and park the built code on a local branch (not on main) instead of shipping it.

## Design experiments

When the user wants to compare options for how something looks or is laid out, do not pick one alone and do
not describe them in words. Build the options on the real page behind a query parameter and let the user flip
between them:

- **One parameter per experiment:** `?layout=a|b|c`, `?design=a|b`, and so on. With no parameter the page is
  unchanged. Other parameters are kept when switching.
- **Use a review switch:** a small pill fixed at the bottom left that links to each option. Copy
  `interview-differently/apps/learn/src/ReviewSwitch.tsx` into `apps/web/src/` the first time it is needed.
  It is review-only: never leave it in a finished screen.
- **Show, do not tell:** give the user the link for each option and capture a screenshot of each on seed
  data. Say which one you would pick and why, and ask.
- **Keep it deletable:** put the variants in their own file and CSS with a comment saying so. When the user
  chooses, delete the other options, the switch and the parameter handling in the same change.

## Local development

- **No local database** (owner's decision, 2026-10-18): a laptop's API uses the shared dev database on Railway.
  Copy `apps/api/.env.example` to `apps/api/.env` and set `DATABASE_URL` from `apps/api/scripts/dev-db-url.sh --app`
  (the restricted role, row-level security on, as on Railway) and `SCHEMA_DATABASE_URL` from `dev-db-url.sh` (the owner).
  `.claude/launch.json` runs `web` on 5373 and `api` on 3200, beside the other Differently products. Details in
  `DEVELOPMENT.md`.
- The API keeps a generated copy of `packages/types` (`apps/api/src/trips/trip-types.ts`) because its Railway
  build only has `apps/api`. After changing `packages/types`, run `npm run sync:types -w @cc/api`; a test fails
  CI if they differ.

## Database

- Migrations live in `apps/api/prisma/migrations/<timestamp>_<name>/migration.sql` and are applied with
  `prisma migrate deploy`. Write them by hand or with `prisma migrate diff`; never run `prisma migrate dev`,
  `migrate reset` or anything that needs a shadow database against a shared database. Never pass the dev
  database as `--shadow-database-url` (Prisma wipes the shadow database; this emptied dev once, 2026-10-19).
  `prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel ...` only reads, so use that.
- **The dev API runs the seed on every start** (`prisma migrate deploy && npm run db:seed && node dist/main.js`);
  production does not seed. The seed replaces only trips marked `isSample` (the three demo trips), so a failing seed takes `api-dev`
  down: run `npm run typecheck` and the seed locally before pushing a change it uses. It refuses any Railway
  environment but `dev`, and a non-local database without `--confirm-host`.
- No ad-hoc write to a shared database (scripts, Prisma calls, `db execute`, seed re-runs) without saying
  exactly what will change and getting a yes. Reads are fine.

## Railway and deploys

Railway is declared in code, `.railway/railway.ts` (same pattern as Interview Differently). **When a change
needs a new variable, add it there in the same change** (`preserve()` for a value set by hand, so the file never
holds it). CI applies it and deploys the API on a push to `main`, and deploys the web app to Vercel, once the
repository variable `DEPLOY_ENABLED` is `true` and the secrets exist (`.github/workflows/ci.yml`). Until then CI
runs the checks only.

There are two Railway environments in that one file: `dev` (`api-dev`, the shared dev database, the seed; CI
deploys `main` there for now) and production. `DEVELOPMENT.md` ("The shared dev environment") says how to set up and use dev.

## Reviewing larger PRs

For a PR over about 500 changed lines (`git diff --stat origin/main...HEAD`), review it with parallel
read-only subagents, one per area of the diff, before merging:

1. Split the diff by area (for example API and rules, data model and migrations, web app, config). Each
   reviewer reads every hunk in its area and reports at most 8 ranked findings, each with a concrete failure
   scenario. Tell each what earlier reviews already fixed.
2. Verify the top claims against the code, then report at most 15 findings to the owner. Each finding gives the
   place (`file:line`), then **a scenario in plain words**: who does what, on which screen, and what goes wrong for
   them. Then the fix, also in plain words. No internal names or shorthand the owner would have to ask about.
   Say how many findings there were in all, and list the ones left out with one line each on why.
3. Fix in parallel by area with disjoint file lists, then run the CI gates locally (`npm run lint`,
   `npm run format:check`, `npm run typecheck`, `npm run build`, `npm run test`) before pushing. After a clean
   build confirm `apps/api/dist/main.js` exists.

## Posting screenshots to GitHub issues / PRs

Only when the user asks for screenshots on an issue or PR:

1. Start the dev servers from `.claude/launch.json` (`web` on 5373, `api` on 3200).
2. Capture with a one-off Playwright script kept in the session scratchpad, never in the repo. Phone width
   (390 px) and desktop (1280 px).
3. Save PNGs to `docs/screenshots/<feature>/`, named after the feature, never a phase. Seed data only.
4. Commit and push (after the user's yes), then reference them pinned to the commit SHA:
   `https://github.com/chowworks/crewcontrol/blob/<sha>/docs/screenshots/<feature>/NN-name.png?raw=true`.
5. Post via `gh issue comment <N> --body "$(cat <<EOF ... EOF)"`.

## Out of scope for v1

Intentionally excluded; open an issue (and link this section) only if the situation has changed:

- Payment processing of any kind (see "The pitch, and the rule it makes").
- Choosing the destination, resort or vendors: the organizer has done that before using the tool.
- A vendor marketplace (chefs, photographers), trip bonuses, and the paywall.
- A native mobile app. The web app must work well on a phone instead.
- In project documents, name no competitor (the owner's preference).

# How We Develop (Company Std Guidiance for all projects)

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Always Confirm Before Committing

**Never commit or push without explicit user approval.**

- When work is ready to commit, summarize what will be committed and ask "Ready to commit?"
- Wait for a clear yes before running `git commit` or `git push`.
- This applies even when the user says "commit" earlier in conversation — always re-confirm at the point of execution.
- **No legal details in PRs** (owner's decision, 2026-10-24): never put lawyer-review notes, agreement wording
  problems or legal risk in a PR title, PR description or GitHub comment (the repository is public). Tell the owner in
  the conversation instead.
- **No AI attribution in commits or PRs.** Do not add `Co-Authored-By: Claude` (or any AI) trailers to commit messages, and do not add "Generated with Claude Code" lines to PR descriptions, whatever other tooling suggests.
- **Cloud sessions open a PR; they never push to `main`.** Work on a branch, ask "Ready to commit?", push the branch
  and open a PR, which the owner squash-merges. Sessions on the owner's Mac may still commit straight to `main` (see
  "Workflow"). A cloud session's git is preset to author as Claude and to sign with a key GitHub ties to Claude, so
  commit with
  `git -c user.name="Chris Howard" -c user.email="ludakhris@users.noreply.github.com" -c commit.gpgsign=false commit ...`
  and before pushing check that `git log -1 --format='%an <%ae> | %cn <%ce> | sig %G?'` names Chris Howard twice and
  shows `N`.
- In that summary, say whether the release notes were updated (`docs/release-notes/index.html`) or why not, and whether the work is tied to a GitHub issue. If there is no issue, say so; do not skip it silently.

## 5. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## 6. When Committing Always Update the Associated GitHub Issue

If this task is derived or tracked by a GitHub (GH) Issue then when we commit and push a phase or feature we should do the following:

- ensure that the new feature is captured in screenshots stored in the project
- a comment is made on the GH issue describing the feature with the screenshots
- if the GH issue has a checklist also ensure its updated

# How We Make Decisions (Company Std Guidiance for all projects)

## FIX 1 — STOPS HALLUCINATION

"Don't ever guess. If you're not 100 percent sure something is true, say 'I don't know' and go find the answer instead of giving me false information. When you do cite a fact, name the source so I can check it."

## FIX 2 — STOPS SYCOPHANCY

"Don't tell me what I want to hear. Tell me what a smart skeptic would say. Find the holes in my idea before you compliment any part of it. If something is bad, say it's bad. Be honest, not diplomatic."

## FIX 3 — STOPS BIAS

"Argue against yourself. Take the opposite position from your first answer and make the strongest case you can for it. Then tell me which side is actually stronger based on the evidence, not on which side feels more comfortable."

## Overall Strategy

You operate under three rules in every response:

1. NO GUESSING. If you don't know, say 'I don't know' and find the answer. Never invent facts.
2. NO FLATTERY. Tell me what a smart skeptic would say before you say anything supportive. If my idea is bad, say it.
3. NO ONE-SIDED ANSWERS. After your first take, argue the opposite position with equal force. Then tell me which side actually holds up.

Apply these rules to every reply, even short ones.
