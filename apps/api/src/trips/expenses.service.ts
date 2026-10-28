import { Injectable, NotFoundException } from '@nestjs/common'
import type { Expense as ExpenseRow } from '@prisma/client'
import type { Caller } from '../auth/caller'
import { PrismaService } from '../prisma/prisma.service'
import type { Expense, ExpenseInput } from './trip-types'

const toExpense = (row: ExpenseRow): Expense => ({
  id: row.id,
  payee: row.payee,
  description: row.description,
  amountCents: row.amountCents,
  paidOn: row.paidOn,
  dueOn: row.dueOn,
  createdAt: row.createdAt.toISOString(),
})

/**
 * Trip Financials' vendor expenses (issue #16): what the organizer pays out for the trip, recorded only. The trip's
 * members add, change and remove them; the admin reads them from the Admin toolbox. The Expense policies draw the same
 * line; `admin` is true only on the admin's routes.
 */
@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  /** The trip's expenses, paid ones by the day they were paid, then what is still owed by its due date. */
  async list(tripId: string, caller: Caller, admin = false): Promise<Expense[]> {
    await this.trip(tripId, caller, admin)
    const rows = await this.prisma.expense.findMany({
      where: { tripId },
      orderBy: [{ paidOn: { sort: 'asc', nulls: 'last' } }, { dueOn: 'asc' }, { createdAt: 'asc' }],
    })
    return rows.map(toExpense)
  }

  async add(tripId: string, input: ExpenseInput, caller: Caller): Promise<Expense[]> {
    await this.trip(tripId, caller)
    await this.prisma.expense.create({
      data: { ...input, tripId, createdByUserId: caller.userId },
    })
    return this.list(tripId, caller)
  }

  async update(
    tripId: string,
    expenseId: string,
    input: ExpenseInput,
    caller: Caller
  ): Promise<Expense[]> {
    await this.trip(tripId, caller)
    const { count } = await this.prisma.expense.updateMany({
      where: { id: expenseId, tripId },
      data: input,
    })
    if (!count) throw new NotFoundException('Expense not found')
    return this.list(tripId, caller)
  }

  async remove(tripId: string, expenseId: string, caller: Caller): Promise<Expense[]> {
    await this.trip(tripId, caller)
    const { count } = await this.prisma.expense.deleteMany({ where: { id: expenseId, tripId } })
    if (!count) throw new NotFoundException('Expense not found')
    return this.list(tripId, caller)
  }

  /** A trip the caller works on (the admin: any trip); anyone else's reads as not found. */
  private async trip(id: string, caller: Caller, admin = false): Promise<void> {
    const found = await this.prisma.trip.findFirst({
      where: admin ? { id } : { id, members: { some: { userId: caller.userId } } },
      select: { id: true },
    })
    if (!found) throw new NotFoundException('Trip not found')
  }
}
