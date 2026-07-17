import type { CreateServiceRequest } from '@reservafacil/contracts';
import { IsInt, IsNotEmpty, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateServiceDto implements CreateServiceRequest {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsInt()
  @Min(1)
  @Max(1440)
  durationMin!: number;

  @IsInt()
  @Min(0)
  priceClp!: number;
}
