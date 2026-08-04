import { ApiProperty } from '@nestjs/swagger';
import type { RefreshRequest } from '@reservafacil/contracts';
import { IsJWT } from 'class-validator';

export class RefreshDto implements RefreshRequest {
  // El ejemplo va completo, no truncado: uno con "…" no pasa `@IsJWT()` y
  // quien prueba desde /docs recibiría un 400 que no dice nada del endpoint.
  @ApiProperty({
    description: 'Token de refresco entregado al iniciar sesión',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c3VhcmlvIn0.firma',
  })
  @IsJWT()
  refreshToken!: string;
}
