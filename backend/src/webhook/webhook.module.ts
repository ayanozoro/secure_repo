import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { GitHubModule } from '../github/github.module';
import { ScannerModule } from '../scanner/scanner.module';

@Module({
  imports: [GitHubModule, ScannerModule],
  controllers: [WebhookController],
})
export class WebhookModule {}
