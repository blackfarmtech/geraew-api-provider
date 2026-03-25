import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, Min } from 'class-validator';

export class ConfigureAutoRechargeDto {
  @ApiProperty({ description: 'Enable or disable auto-recharge' })
  @IsBoolean()
  enabled: boolean;

  @ApiProperty({
    description: 'Minimum credit balance that triggers auto-recharge',
    example: 100,
  })
  @IsInt()
  @Min(0)
  threshold: number;

  @ApiProperty({
    description: 'Number of credits to purchase on auto-recharge',
    example: 500,
  })
  @IsInt()
  @Min(0)
  amount: number;
}
