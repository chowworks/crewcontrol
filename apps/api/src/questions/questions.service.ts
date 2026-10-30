import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import type { TripQuestion as Row } from '@prisma/client'
import type { Caller } from '../auth/caller'
import { ClerkService } from '../auth/clerk.service'
import { runAsPublic } from '../core/tenant-context'
import { EmailsService } from '../messaging/emails.service'
import { PrismaService } from '../prisma/prisma.service'
import type {
  MyQuestion,
  QuestionAnswerInput,
  QuestionStatus,
  TripQuestion,
  TripQuestions,
} from '../trips/trip-types'
import { TripsService } from '../trips/trips.service'

const webUrl = () => (process.env.FRONTEND_URL ?? 'http://localhost:5173').split(',')[0].trim()

/** The trip page's order: by position, then oldest first. */
const byPosition = (a: Row, b: Row) =>
  a.position - b.position || a.createdAt.getTime() - b.createdAt.getTime()

/**
 * Questions, the trip page's FAQ (issue #13). A signed-in person asks on the trip page and everyone who runs
 * the trip is emailed; an organizer answers it for everyone (it joins the trip page's questions) or for the asker only, and the
 * asker is emailed the answer. Organizers also add, edit, reorder and delete entries (owner's decisions, 2026-10-28
 * and 2026-10-30). Organizers work as members of the trip; an asker as themselves, whom row-level security keeps to
 * their own questions (migration 20261030010000_trip_questions).
 */
@Injectable()
export class QuestionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trips: TripsService,
    private readonly clerk: ClerkService,
    private readonly emails: EmailsService
  ) {}

  /** Trip Control's Questions: the waiting ones, the trip page's in order, and the private answers. */
  async forTrip(id: string, caller: Caller): Promise<TripQuestions> {
    await this.trips.get(id, caller)
    const guests = await this.prisma.guest.findMany({
      where: { tripId: id, status: { not: 'declined' }, userId: { not: null } },
      select: { userId: true },
    })
    const onTrip = new Set(guests.map((g) => g.userId))
    const rows = await this.prisma.tripQuestion.findMany({
      where: { tripId: id },
      orderBy: { createdAt: 'asc' },
    })
    const view = (r: Row): TripQuestion => ({
      id: r.id,
      question: r.question,
      answer: r.answer,
      status: r.status as QuestionStatus,
      askerName: r.askerUserId ? r.askerName || 'Someone' : null,
      askerOnTrip: r.askerUserId !== null && onTrip.has(r.askerUserId),
      createdAt: r.createdAt.toISOString(),
      answeredAt: r.answeredAt?.toISOString() ?? null,
    })
    return {
      waiting: rows.filter((r) => r.status === 'waiting').map(view),
      published: rows
        .filter((r) => r.status === 'public')
        .sort(byPosition)
        .map(view),
      private: rows
        .filter((r) => r.status === 'private')
        .reverse()
        .map(view),
    }
  }

  /** An entry the organizer writes themselves: on the trip page, last. */
  async add(id: string, input: QuestionAnswerInput, caller: Caller): Promise<TripQuestions> {
    await this.trips.get(id, caller)
    if (input.status !== 'public')
      throw new BadRequestException('A question you add yourself goes on the trip page')
    await this.prisma.tripQuestion.create({
      data: {
        tripId: id,
        question: input.question,
        answer: input.answer,
        status: 'public',
        position: await this.nextPosition(id),
        answeredByName: await this.firstName(caller),
        answeredAt: new Date(),
      },
    })
    return this.forTrip(id, caller)
  }

  /** Answers a waiting question, for everyone or for the asker only, and emails the asker the answer. */
  async answer(
    id: string,
    questionId: string,
    input: QuestionAnswerInput,
    caller: Caller
  ): Promise<TripQuestions> {
    const trip = await this.trips.get(id, caller)
    const row = await this.find(id, questionId)
    if (row.status !== 'waiting') throw new BadRequestException('That question is already answered')
    const me = await this.clerk.contact(caller.userId)
    await this.prisma.tripQuestion.update({
      where: { id: row.id },
      data: {
        question: input.question,
        answer: input.answer,
        status: input.status,
        position: input.status === 'public' ? await this.nextPosition(id) : 0,
        answeredByName: me.name.split(' ')[0] || trip.organizerName || null,
        answeredAt: new Date(),
      },
    })
    // Sent after the reply, as when asking; a failure is logged.
    if (row.askerEmail)
      void this.emails.sendQuestion(
        'question_answered',
        {
          tripName: trip.name,
          askerName: (row.askerName ?? '').split(' ')[0] || 'there',
          question: input.question,
          answer: input.answer,
          private: input.status === 'private',
          link: `${webUrl()}/t/${trip.slug}`,
        },
        row.askerEmail,
        me.email || undefined
      )
    return this.forTrip(id, caller)
  }

  /** Changes an answered entry's wording, or who sees it. Not emailed again. */
  async edit(
    id: string,
    questionId: string,
    input: QuestionAnswerInput,
    caller: Caller
  ): Promise<TripQuestions> {
    await this.trips.get(id, caller)
    const row = await this.find(id, questionId)
    if (row.status === 'waiting') throw new BadRequestException('Answer that question first')
    if (input.status === 'private' && !row.askerUserId)
      throw new BadRequestException('Only a question someone asked can be answered just for them')
    await this.prisma.tripQuestion.update({
      where: { id: row.id },
      data: {
        question: input.question,
        answer: input.answer,
        status: input.status,
        // Made public, it joins the end of the trip page's list.
        ...(input.status === 'public' && row.status !== 'public'
          ? { position: await this.nextPosition(id) }
          : {}),
      },
    })
    return this.forTrip(id, caller)
  }

  /** The trip page's order: every public entry's id, top first. */
  async reorder(id: string, ids: string[], caller: Caller): Promise<TripQuestions> {
    await this.trips.get(id, caller)
    const published = await this.prisma.tripQuestion.findMany({
      where: { tripId: id, status: 'public' },
      select: { id: true },
    })
    const known = new Set(published.map((r) => r.id))
    if (
      ids.length !== known.size ||
      new Set(ids).size !== ids.length ||
      ids.some((x) => !known.has(x))
    )
      throw new BadRequestException('The list changed. Reload the page and try again.')
    await this.prisma.$transaction(
      ids.map((qid, position) =>
        this.prisma.tripQuestion.update({ where: { id: qid }, data: { position } })
      )
    )
    return this.forTrip(id, caller)
  }

  /** Deletes an entry, or a question nobody answered. Nobody is emailed. */
  async remove(id: string, questionId: string, caller: Caller): Promise<TripQuestions> {
    await this.trips.get(id, caller)
    await this.prisma.tripQuestion.deleteMany({ where: { id: questionId, tripId: id } })
    return this.forTrip(id, caller)
  }

  /** The signed-in caller's own questions on a trip, newest first. */
  async mine(slug: string, caller: Caller): Promise<MyQuestion[]> {
    const trip = await this.published(slug)
    const rows = await this.prisma.tripQuestion.findMany({
      where: { tripId: trip.id, askerUserId: caller.userId },
      orderBy: { createdAt: 'desc' },
    })
    return rows.map((r) => ({
      id: r.id,
      question: r.question,
      answer: r.answer,
      status: r.status as QuestionStatus,
      createdAt: r.createdAt.toISOString(),
    }))
  }

  /** Asks the organizers a question, and emails it to each of them with Reply-To the asker. */
  async ask(slug: string, question: string, caller: Caller): Promise<MyQuestion[]> {
    const trip = await this.published(slug)
    const me = await this.clerk.contact(caller.userId)
    await this.prisma.tripQuestion.create({
      data: {
        tripId: trip.id,
        askerUserId: caller.userId,
        askerName: me.name || me.email.split('@')[0] || null,
        askerEmail: me.email || null,
        question,
      },
    })
    // Sent after the reply, so the asker isn't kept waiting on the email; a failure is logged (sendQuestion).
    void this.tellOrganizers(trip, question, me)
    return this.mine(slug, caller)
  }

  /** Emails everyone who runs the trip a new question, with Reply-To the asker. Never throws. */
  private async tellOrganizers(
    trip: { id: string; name: string },
    question: string,
    asker: { name: string; email: string }
  ): Promise<void> {
    const organizers = await this.trips.organizerContacts(trip.id).catch(() => [])
    for (const o of organizers)
      await this.emails.sendQuestion(
        'question_asked',
        {
          tripName: trip.name,
          askerName: asker.name || asker.email || 'Someone',
          question,
          answer: '',
          private: false,
          link: `${webUrl()}/organize/${trip.id}/control`,
        },
        o.email,
        asker.email || undefined
      )
  }

  private async find(tripId: string, questionId: string): Promise<Row> {
    const row = await this.prisma.tripQuestion.findFirst({ where: { id: questionId, tripId } })
    if (!row) throw new NotFoundException('Question not found')
    return row
  }

  private async nextPosition(tripId: string): Promise<number> {
    const last = await this.prisma.tripQuestion.aggregate({
      where: { tripId, status: 'public' },
      _max: { position: true },
    })
    return (last._max.position ?? -1) + 1
  }

  private async firstName(caller: Caller): Promise<string | null> {
    return (await this.clerk.contact(caller.userId)).name.split(' ')[0] || null
  }

  /** A published trip by its link, read as its public page, or not found. */
  private async published(slug: string) {
    const trip = await runAsPublic(() =>
      this.prisma.trip.findUnique({
        where: { slug },
        select: { id: true, name: true, published: true },
      })
    )
    if (!trip?.published) throw new NotFoundException('Trip not found')
    return trip
  }
}
