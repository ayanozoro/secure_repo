import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OsvService } from './osv/osv.service';
import { DependencyParserService } from './parser/dependency-parser.service';
import { ScannerService } from './scanner.service';
import { ScannerController } from './scanner.controller';

@Module({
  imports: [ConfigModule],
  controllers: [ScannerController],
  providers: [OsvService, DependencyParserService, ScannerService],
  exports: [OsvService, DependencyParserService, ScannerService],
})
export class ScannerModule {}
