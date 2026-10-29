import { BadRequestException } from '@nestjs/common'
import { parseRooms } from './trip-input'

const suite = {
  name: 'Primary suite',
  beds: 'King, private bath',
  capacity: 2,
  weight: 1.75,
  bedTypes: ['king'],
  minPeople: 2,
}

describe('parseRooms', () => {
  it('accepts a room list in order', () => {
    expect(
      parseRooms({ rooms: [suite, { ...suite, name: 'Bonus room', capacity: 6, weight: 1 }] })
    ).toEqual([
      { ...suite, priceCents: null },
      { ...suite, name: 'Bonus room', capacity: 6, weight: 1, priceCents: null },
    ])
  })

  it('keeps a room’s own price', () => {
    expect(parseRooms({ rooms: [{ ...suite, priceCents: 90000 }] })[0].priceCents).toBe(90000)
  })

  it.each([
    [{ ...suite, name: '' }, 'name is required'],
    [{ ...suite, capacity: 0 }, 'capacity must be a whole number from 1 to 20'],
    [{ ...suite, weight: 0 }, 'A room weight must be a number above 0 and at most 10'],
    [{ ...suite, minPeople: 3 }, 'A room can’t need more people than it sleeps'],
    [{ ...suite, priceCents: 0 }, 'priceCents must be a whole number from 1 to 10000000'],
    [
      { ...suite, bedTypes: ['hammock'] },
      'bedTypes must be a list of up to 8 of king, queen, double, twin, daybed, sofa-bed, bunk',
    ],
  ])('rejects %o', (room, message) => {
    expect(() => parseRooms({ rooms: [room] })).toThrow(new BadRequestException(message))
  })
})
