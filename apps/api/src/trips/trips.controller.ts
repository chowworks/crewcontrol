import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common'
import { parseTripInput } from './trip-input'
import { TripsService } from './trips.service'

// Organizer endpoints. The prototype has no login yet (see README), so anyone with the API address can use these.
@Controller('trips')
export class TripsController {
  constructor(private readonly trips: TripsService) {}

  @Get()
  list() {
    return this.trips.list()
  }

  @Post()
  create(@Body() body: unknown) {
    return this.trips.create(parseTripInput(body))
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.trips.get(id)
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.trips.update(id, parseTripInput(body))
  }
}

@Controller('public/trips')
export class PublicTripsController {
  constructor(private readonly trips: TripsService) {}

  @Get(':slug')
  get(@Param('slug') slug: string) {
    return this.trips.getPublic(slug)
  }
}
