import { HttpException } from '@nestjs/common';

export class PaymentRequiredException extends HttpException {
  constructor(message = 'Insufficient credits') {
    super(
      { statusCode: 402, message, error: 'Payment Required' },
      402,
    );
  }
}
