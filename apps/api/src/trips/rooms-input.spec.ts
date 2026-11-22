import { BadRequestException } from '@nestjs/common'
import { parseRooms } from './trip-input'

const suite = {
  name: 'Primary suite',
  beds: 'King, private bath',
  capacity: 2,
  bedTypes: ['king'],
  minPeople: 1,
}

describe('parseRooms', () => {
  it('accepts a room list in order', () => {
    expect(parseRooms({ rooms: [suite, { ...suite, name: 'Bonus room', capacity: 6 }] })).toEqual([
      { ...suite, priceCents: null, wholeRoomExtraCents: null },
      { ...suite, name: 'Bonus room', capacity: 6, priceCents: null, wholeRoomExtraCents: null },
    ])
  })

  it('ignores the old “Priced for”: a room is priced for the people it sleeps', () => {
    expect(parseRooms({ rooms: [{ ...suite, minPeople: 2 }] })[0].minPeople).toBe(1)
  })

  it('keeps a room’s own price', () => {
    expect(parseRooms({ rooms: [{ ...suite, priceCents: 90000 }] })[0].priceCents).toBe(90000)
  })

  it('keeps a “room to myself” price only on a room that sleeps 2', () => {
    const [two, six] = parseRooms({
      rooms: [
        { ...suite, wholeRoomExtraCents: 80000 },
        { ...suite, capacity: 6, wholeRoomExtraCents: 80000 },
      ],
    })
    expect([two.wholeRoomExtraCents, six.wholeRoomExtraCents]).toEqual([80000, null])
  })

  it.each([
    [{ ...suite, name: '' }, 'name is required'],
    [{ ...suite, capacity: 0 }, 'capacity must be a whole number from 1 to 20'],
    [{ ...suite, priceCents: 0 }, 'priceCents must be a whole number from 1 to 10000000'],
    [
      { ...suite, bedTypes: ['hammock'] },
      'bedTypes must be a list of up to 8 of king, queen, double, twin, daybed, sofa-bed, bunk',
    ],
  ])('rejects %o', (room, message) => {
    expect(() => parseRooms({ rooms: [room] })).toThrow(new BadRequestException(message))
  })
})
