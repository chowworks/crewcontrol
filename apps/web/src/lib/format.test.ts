import { paymentPlan } from '@cc/types'
import { describe, expect, it } from 'vitest'
import { dateRange, installmentLine, money, shortDate } from './format'

describe('format', () => {
  it('formats money without empty cents', () => {
    expect(money(120000)).toBe('$1,200')
    expect(money(120050)).toBe('$1,200.50')
  })

  it('formats date ranges within and across months and years', () => {
    expect(dateRange('2027-06-18', '2027-06-21')).toBe('June 18–21, 2027')
    expect(dateRange('2027-06-30', '2027-07-02')).toBe('June 30–July 2, 2027')
    expect(dateRange('2027-12-30', '2028-01-02')).toBe('December 30, 2027–January 2, 2028')
    expect(shortDate('2026-11-01')).toBe('Nov 1')
  })

  it('describes installments', () => {
    expect(installmentLine(paymentPlan(120000, 4, null, []))).toBe(
      'Paid in 4 installments of $300.'
    )
    expect(installmentLine(paymentPlan(100000, 3, null, []))).toBe(
      'Paid in 3 installments of about $333.'
    )
    expect(installmentLine(paymentPlan(50000, 1, null, []))).toBe('Paid in one payment.')
    expect(installmentLine(paymentPlan(50000, 1, null, ['2027-03-01']))).toBe(
      'Paid in one payment, due by Mar 1, 2027.'
    )
    expect(
      installmentLine(paymentPlan(120000, 3, 30000, ['2026-11-01', '2027-01-01', '2027-03-01']))
    ).toBe('A $300 deposit, then 2 installments of $450, the last due by Mar 1, 2027.')
  })
})
