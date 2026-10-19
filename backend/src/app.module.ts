import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { AppController } from './app.controller';
import { ScannerModule } from './scanner/scanner.module';
import { GitHubModule } from './github/github.module';
import { WebhookModule } from './webhook/webhook.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    ScannerModule,
    GitHubModule,
    WebhookModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
