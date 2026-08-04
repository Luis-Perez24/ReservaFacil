import { ApiProperty } from '@nestjs/swagger';
import type { CreateServiceRequest } from '@reservafacil/contracts';
import { IsInt, IsNotEmpty, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateServiceDto implements CreateServiceRequest {
  @ApiProperty({ description: 'Nombre del servicio', example: 'Corte de cabello' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiProperty({
    description: 'Duración del servicio en minutos',
    example: 30,
    minimum: 1,
    maximum: 1440,
  })
  @IsInt()
  @Min(1)
  @Max(1440)
  durationMin!: number;

  @ApiProperty({ description: 'Precio en pesos chilenos', example: 15000, minimum: 0 })
  @IsInt()
  @Min(0)
  priceClp!: number;
}
