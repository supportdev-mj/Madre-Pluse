import { BadRequestException, Controller, Delete, Get, HttpCode, Param, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AttachmentsService } from './attachments.service';

const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

@UseGuards(JwtAuthGuard)
@Controller('tasks/:taskId/attachments')
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Get()
  list(@Param('taskId') taskId: string) {
    return this.attachmentsService.list(taskId);
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_ATTACHMENT_BYTES } }))
  upload(@Param('taskId') taskId: string, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file provided');
    return this.attachmentsService.upload(taskId, file);
  }

  @Get(':id/download-url')
  getDownloadUrl(@Param('taskId') taskId: string, @Param('id') id: string) {
    return this.attachmentsService.getDownloadUrl(taskId, id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('taskId') taskId: string, @Param('id') id: string) {
    return this.attachmentsService.remove(taskId, id);
  }
}
