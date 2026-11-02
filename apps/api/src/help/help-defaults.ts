import { createHash } from 'node:crypto'
import type { HelpEntry } from '../trips/trip-types'

/**
 * Travel HQ's default answers behind the Help button on organizer pages (issue #66). The admin can change, hide or add
 * to them on the Admin toolbox's Help page (HelpEntry rows); these stay the starting point.
 *
 * Keep them true (CLAUDE.md, "Organizer help"): a change to what organizers see or do updates the answer it affects in
 * the same change. Changing an answer the admin has edited flags it on the Help page for the admin to look again.
 * Keys never change: an admin's edit is kept by key. The answers are plain text; a blank line starts a paragraph.
 */
export const HELP_DEFAULTS: readonly HelpEntry[] = [
  {
    key: 'next-steps',
    topic: 'start',
    question: 'What are the next steps after I make my trip?',
    answer: `1. Finish the six editor steps and publish the trip.
2. Share the link from the purple row at the top of Trip Control, or share the trip flyer Travel HQ makes for you (Flyer, in the same row).
3. Guests sign the trip agreement. Depending on how you set sign-ups, you accept them and then they pay, or they pay and then you accept them.
4. Confirm payments from your Actions as they come in. Reminders go out on your payment plan.
5. Post announcements to everyone who's going.`,
    pages: ['editor:basics', 'control'],
  },
  {
    key: 'booking',
    topic: 'start',
    question: 'Does Travel HQ book the house or resort?',
    answer: `No. You book the place and pay for it yourself, and the crew pays you directly by Zelle, Cash App or cash. Travel HQ never touches the money: you collect it and you make every payment.

Travel HQ handles the bookkeeping: sign-ups and the trip agreement, who has paid and who still owes, payment reminders, and updates to everyone who's going. To keep track of what the trip costs you, list each cost under "What the trip costs" in the editor's Pricing step (Add a cost). Trip Financials on Trip Control compares it with what's coming in (Costs vs collecting).`,
    pages: ['editor:basics', 'editor:pricing'],
  },
  {
    key: 'yahoo-email',
    topic: 'signups',
    question: 'What if a guest only has a Yahoo email?',
    answer: `Guests sign in with a Google or Microsoft account, not with an email and password. Someone who only uses Yahoo can sign in with any Google or Microsoft account they already have (Gmail, Outlook, Hotmail), or make one with their Yahoo address at Google or Microsoft first, then come back and tap "I want to join".

The sign-in account is only for signing in: on the join form they can change their trip email to their Yahoo address, and trip emails go there. One catch: forwarded payment receipts are matched by the email they sign in with, so they forward from that one.`,
    pages: ['editor:signups'],
  },
  {
    key: 'organizer-going',
    topic: 'signups',
    question: 'If I’m going on the trip too, how does that work?',
    answer: `Just say you're going and you hold a spot on the trip. In the editor, answer "Yes, I'm in" under Max trip attendees, or tap "I'm going too" in Manage Guests on Trip Control.

You show up on the guest list tagged Organizer. You don't sign anything, and your own part of the cost counts as paid on your row, so you don't track your own payments in the app.`,
    pages: ['editor:signups', 'editor:pricing', 'control'],
  },
  {
    key: 'whos-going-hidden',
    topic: 'tripPage',
    question: 'Can I keep “Who’s going” hidden?',
    answer: `Yes. It's hidden unless you turn on "Show accepted guests' names" in the editor's Sign-ups and the trip page step. Names show as first name and last initial, and only for accepted guests.

The one exception: if you let guests pick their own rooms, the list stays on, so guests can see who they might room with.`,
    pages: ['editor:signups', 'editor:rooms'],
  },
  {
    key: 'public-vs-crew',
    topic: 'tripPage',
    question: 'What can people see before they sign up, and what’s only for my crew?',
    answer: `Anyone with the link, once the trip is published: the trip's name, place and dates, your name, photos, highlights, key dates, the price and payment plan, how many spots are left, the rooms if guests pick their own, and the trip's Questions with the answers you shared with everyone. Accepted guests' names show only if you turn on "Who's going" or let guests pick rooms, as first name and last initial.

Only people who joined: how to pay you (on an accept-first trip, only once you've accepted them), their own balance and payments, their signed agreement, and answers you gave just to them. Announcements go only to accepted guests.

Never shown to guests: anyone's email or phone, anyone's agreement but their own, and the names of people you haven't accepted.

Photos, highlights, key dates and rooms only show once you add them. The Questions section always shows.`,
    pages: ['editor:customization', 'editor:signups', 'control'],
  },
  {
    key: 'guest-enters-payment',
    topic: 'payments',
    question: 'Can a guest enter a payment themselves?',
    answer: `Yes, and the app can record most payments for you. Each trip gets its own email address (set it in the editor's Payments step). Guests forward their Zelle, Cash App or bank email there and the payment is recorded on their row. With "Confirm guests' receipts as they arrive" on, it counts right away; off, it waits in your Actions for a tap.

Guests can also tap Report a payment on the trip page and type the amount and how they paid. That one always waits in your Actions for you to confirm.

You can always record things yourself: on Trip Control, open the guest's Details in Manage Guests, then use Log a payment, or Add a credit or charge to lower or raise what they owe.`,
    pages: ['editor:payments', 'control'],
  },
  {
    key: 'split-payment',
    topic: 'payments',
    question: 'Can one payment cover more than one traveler?',
    answer: `Yes. When a guest reports a payment, they choose how it's split across the travelers they're responsible for: what's due now first, evenly, or their own amount for each.

A guest is responsible for the travelers they signed up. If two people signed up on their own and one pays for both, like roommates, you can link them: in Trip Control open the traveler's Details, and next to "Sign-up and payments handled by" tap Change and pick who pays for them.`,
    pages: ['editor:payments', 'control'],
  },
  {
    key: 'guest-question-visibility',
    topic: 'questions',
    question: 'When a guest asks a question, who sees it?',
    answer: `Only you and the other organizers, until you answer. It waits in your Actions, and you decide who sees the answer: just the person who asked, or everyone, in which case it joins the trip page's Questions without the asker's name.

You can edit any question and answer at any time, reorder them, or add your own before anyone asks, from the Questions card at the end of Trip Control. Answer once for everyone and you won't get asked the same thing twice.`,
    pages: ['control', 'editor:customization'],
  },
]

/**
 * A default's fingerprint, kept with the admin's edit of it: when the default in code changes later, the two differ
 * and the Help page flags the edit.
 */
export function defaultHash(entry: Pick<HelpEntry, 'question' | 'answer'>): string {
  return createHash('sha256')
    .update(`${entry.question}\n${entry.answer}`)
    .digest('hex')
    .slice(0, 16)
}
