import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OsvService } from './osv/osv.service';
import { ScannerController } from './scanner.controller';

@Module({
  imports: [ConfigModule],
  controllers: [ScannerController],
  providers: [OsvService],
  exports: [OsvService],
})
export class ScannerModule {}
