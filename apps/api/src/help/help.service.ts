import { randomBytes } from 'node:crypto'
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import type { HelpEntry as HelpRow } from '@prisma/client'
import type { Caller } from '../auth/caller'
import { ClerkService } from '../auth/clerk.service'
import { EmailsService } from '../messaging/emails.service'
import { PrismaService } from '../prisma/prisma.service'
import {
  HELP_PAGES,
  HELP_TOPICS,
  type AdminHelpEntry,
  type AdminHelpQuestion,
  type HelpAnswerInput,
  type HelpAskInput,
  type HelpEntry,
  type HelpEntryInput,
  type HelpPage,
  type HelpTopic,
} from '../trips/trip-types'
import { HELP_DEFAULTS, defaultHash } from './help-defaults'

const topicOrder = (t: string) => HELP_TOPICS.findIndex((x) => x.value === t)

/**
 * Every answer as the admin sees it: each default, replaced by the admin's version where there is one, then the
 * answers the admin added; in topic order, the defaults' own order within a topic.
 */
export function mergeHelp(rows: HelpRow[]): AdminHelpEntry[] {
  const byKey = new Map(rows.map((r) => [r.key, r]))
  const fromRow = (r: HelpRow) => ({
    key: r.key,
    topic: r.topic as HelpTopic,
    question: r.question,
    answer: r.answer,
    pages: r.pages as HelpPage[],
    hidden: r.hidden,
  })
  const defaults = HELP_DEFAULTS.map((d): AdminHelpEntry => {
    const row = byKey.get(d.key)
    if (!row)
      return { ...d, source: 'default', hidden: false, defaultChanged: false, original: null }
    return {
      ...fromRow(row),
      source: 'edited',
      defaultChanged: row.defaultHash !== defaultHash(d),
      original: { question: d.question, answer: d.answer },
    }
  })
  const added = rows
    .filter((r) => !HELP_DEFAULTS.some((d) => d.key === r.key))
    .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime())
    .map((r): AdminHelpEntry => ({
      ...fromRow(r),
      source: 'added',
      defaultChanged: false,
      original: null,
    }))
  return [...defaults, ...added]
    .map((e, i) => ({ e, i }))
    .sort((a, b) => topicOrder(a.e.topic) - topicOrder(b.e.topic) || a.i - b.i)
    .map(({ e }) => e)
}

/** A key for an answer the admin adds: words from its question, and a little randomness so two never collide. */
export function newHelpKey(question: string): string {
  const words = question
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '')
  return `${words || 'answer'}-${randomBytes(3).toString('hex')}`
}

const pageLabel = (page: string) => HELP_PAGES.find((p) => p.value === page)?.label ?? page

/** Organizer help (issue #66): the answers behind the Help button, questions organizers ask, and the admin's answers. */
@Injectable()
export class HelpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clerk: ClerkService,
    private readonly emails: EmailsService
  ) {}

  private async all(): Promise<AdminHelpEntry[]> {
    return mergeHelp(await this.prisma.helpEntry.findMany())
  }

  /** The answers organizers see: every one the admin hasn't hidden. */
  async list(): Promise<HelpEntry[]> {
    return (await this.all())
      .filter((e) => !e.hidden)
      .map(({ key, topic, question, answer, pages }) => ({ key, topic, question, answer, pages }))
  }

  /** An organizer asks us; support is emailed at once, and the admin answers it in the Admin toolbox. */
  async ask(input: HelpAskInput, caller: Caller): Promise<void> {
    const trip = input.tripId
      ? await this.prisma.trip.findFirst({
          where: {
            id: input.tripId,
            deletedAt: null,
            members: { some: { userId: caller.userId } },
          },
          select: { id: true, name: true },
        })
      : null
    // Written without reading it back: only the admin reads these.
    await this.prisma.helpQuestion.createMany({
      data: {
        userId: caller.userId,
        page: input.page,
        tripId: trip?.id ?? null,
        tripName: trip?.name ?? '',
        question: input.question,
      },
    })
    const who = (await this.clerk.people([caller.userId])).get(caller.userId)
    this.emails.alertHelpQuestion({
      name: who?.name ?? 'An organizer',
      email: who?.email ?? '',
      question: input.question,
      where: trip ? `${pageLabel(input.page)} on ${trip.name}` : pageLabel(input.page),
    })
  }

  /**
   * What needs the admin, for their red count: questions nobody answered, and answers they edited whose default changed
   * since (saving theirs again or going back to Travel HQ's wording clears it).
   */
  async waiting(): Promise<{ questions: number; changed: number }> {
    const [questions, entries] = await Promise.all([
      this.prisma.helpQuestion.count({ where: { answeredAt: null } }),
      this.all(),
    ])
    return { questions, changed: entries.filter((e) => e.defaultChanged).length }
  }

  /** The admin's Help page: every answer with where it comes from, and every question asked, newest first. */
  async adminView(): Promise<{ entries: AdminHelpEntry[]; questions: AdminHelpQuestion[] }> {
    const [entries, rows] = await Promise.all([
      this.all(),
      this.prisma.helpQuestion.findMany({ orderBy: { createdAt: 'desc' }, take: 500 }),
    ])
    const people = await this.clerk.people([...new Set(rows.map((r) => r.userId))])
    const questions = rows.map((r): AdminHelpQuestion => ({
      id: r.id,
      question: r.question,
      page: r.page as HelpPage,
      tripName: r.tripName,
      userName: people.get(r.userId)?.name ?? 'Unknown',
      userEmail: people.get(r.userId)?.email ?? '',
      createdAt: r.createdAt.toISOString(),
      answer: r.answer,
      answeredAt: r.answeredAt?.toISOString() ?? null,
    }))
    return { entries, questions }
  }

  /**
   * The admin changes an answer. For a default, saving its own wording back (and not hidden) drops the admin's
   * version, so later changes to the default show again.
   */
  async save(key: string, input: HelpEntryInput, caller: Caller): Promise<AdminHelpEntry[]> {
    const def = HELP_DEFAULTS.find((d) => d.key === key)
    if (def) {
      const same =
        !input.hidden &&
        input.topic === def.topic &&
        input.question === def.question &&
        input.answer === def.answer &&
        input.pages.length === def.pages.length &&
        input.pages.every((p) => def.pages.includes(p))
      if (same) await this.prisma.helpEntry.deleteMany({ where: { key } })
      else {
        const data = {
          ...input,
          defaultHash: defaultHash(def),
          updatedAt: new Date(),
          updatedByUserId: caller.userId,
        }
        await this.prisma.helpEntry.upsert({
          where: { key },
          create: { key, ...data },
          update: data,
        })
      }
    } else {
      const { count } = await this.prisma.helpEntry.updateMany({
        where: { key },
        data: { ...input, updatedAt: new Date(), updatedByUserId: caller.userId },
      })
      if (!count) throw new NotFoundException('That answer is gone. Reload the page.')
    }
    return this.all()
  }

  /** The admin adds an answer of their own. */
  async add(input: HelpEntryInput, caller: Caller): Promise<AdminHelpEntry[]> {
    await this.prisma.helpEntry.create({
      data: { key: newHelpKey(input.question), ...input, updatedByUserId: caller.userId },
    })
    return this.all()
  }

  /** Back to the default for a default's key; an answer the admin added is deleted. */
  async reset(key: string): Promise<AdminHelpEntry[]> {
    await this.prisma.helpEntry.deleteMany({ where: { key } })
    return this.all()
  }

  /**
   * The admin answers a question: it's saved, emailed to the organizer, and added to the help when asked to. Once
   * answered it stays answered; a follow-up goes by email. Says whether the email went: the answer is saved either way.
   */
  async answer(id: string, input: HelpAnswerInput, caller: Caller): Promise<{ emailed: boolean }> {
    const q = await this.prisma.helpQuestion.findUnique({ where: { id } })
    if (!q) throw new NotFoundException('That question is gone. Reload the page.')
    if (q.answeredAt) throw new ConflictException('That question was already answered.')
    await this.prisma.helpQuestion.update({
      where: { id },
      data: { answer: input.answer, answeredAt: new Date(), answeredByUserId: caller.userId },
    })
    if (input.addToHelp)
      await this.add({ ...input.addToHelp, answer: input.answer, hidden: false }, caller)
    const who = (await this.clerk.people([q.userId])).get(q.userId)
    if (!who?.email) return { emailed: false }
    const web = (process.env.FRONTEND_URL ?? 'http://localhost:5173').split(',')[0].trim()
    try {
      await this.emails.sendHelpAnswer(
        {
          firstName: who.name.split(' ')[0] || 'there',
          question: q.question,
          answer: input.answer,
          link: `${web}/organize`,
        },
        who.email
      )
      return { emailed: true }
    } catch (err) {
      console.error(`Help answer email failed: ${err instanceof Error ? err.message : err}`)
      return { emailed: false }
    }
  }
}
