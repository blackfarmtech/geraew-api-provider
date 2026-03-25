import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Put,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { StripeService } from './stripe.service';
import { PurchaseCreditsDto } from './dto/purchase-credits.dto';
import { ConfigureAutoRechargeDto } from './dto/configure-auto-recharge.dto';
import { Public } from '../auth/guards/public.decorator';

@ApiTags('Stripe')
@Controller('stripe')
export class StripeController {
  constructor(private readonly stripeService: StripeService) {}

  @Get('packages')
  @ApiBearerAuth()
  @ApiSecurity('x-api-key')
  @ApiOperation({ summary: 'List available credit packages' })
  getPackages() {
    return this.stripeService.getPackages();
  }

  @Post('purchase')
  @ApiBearerAuth()
  @ApiSecurity('x-api-key')
  @ApiOperation({ summary: 'Create a payment intent to purchase credits' })
  purchase(@Req() req, @Body() dto: PurchaseCreditsDto) {
    return this.stripeService.createPurchaseIntent(req.user.id, dto.packageId);
  }

  @Post('setup-intent')
  @ApiBearerAuth()
  @ApiSecurity('x-api-key')
  @ApiOperation({ summary: 'Create a setup intent to save a payment method' })
  setupIntent(@Req() req) {
    return this.stripeService.createSetupIntent(req.user.id);
  }

  @Get('payment-methods')
  @ApiBearerAuth()
  @ApiSecurity('x-api-key')
  @ApiOperation({ summary: 'List saved payment methods' })
  listPaymentMethods(@Req() req) {
    return this.stripeService.listPaymentMethods(req.user.id);
  }

  @Delete('payment-methods/:id')
  @ApiBearerAuth()
  @ApiSecurity('x-api-key')
  @ApiOperation({ summary: 'Remove a saved payment method' })
  detachPaymentMethod(@Req() req, @Param('id') id: string) {
    return this.stripeService.detachPaymentMethod(req.user.id, id);
  }

  @Put('auto-recharge')
  @ApiBearerAuth()
  @ApiSecurity('x-api-key')
  @ApiOperation({ summary: 'Configure auto-recharge settings' })
  configureAutoRecharge(@Req() req, @Body() dto: ConfigureAutoRechargeDto) {
    return this.stripeService.configureAutoRecharge(req.user.id, dto);
  }

  @Public()
  @Post('webhook')
  @ApiOperation({ summary: 'Stripe webhook endpoint' })
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    const event = this.stripeService.constructWebhookEvent(
      req.rawBody,
      signature,
    );
    await this.stripeService.handleWebhookEvent(event);
    return { received: true };
  }
}
