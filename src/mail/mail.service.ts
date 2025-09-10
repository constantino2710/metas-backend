/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-call */

import { MailerService } from "@nestjs-modules/mailer/dist/mailer.service";
import { Injectable } from "@nestjs/common/decorators/core/injectable.decorator";

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
@Injectable()
export class MailService {
  constructor(private readonly mailer: MailerService) {}

  async sendResetPassword(email: string, token: string) {
    const url = `${process.env.FRONTEND_RESET_PASSWORD_URL}?token=${token}`;
    await this.mailer.sendMail({
      to: email,
      subject: 'Redefinição de senha',
      template: 'reset-password',
      context: { url },
    });
  }
}
