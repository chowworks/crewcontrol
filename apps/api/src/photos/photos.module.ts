import { Module } from '@nestjs/common'
import { TermsModule } from '../terms/terms.module'
import { PhotosController } from './photos.controller'

@Module({ imports: [TermsModule], controllers: [PhotosController] })
export class PhotosModule {}
