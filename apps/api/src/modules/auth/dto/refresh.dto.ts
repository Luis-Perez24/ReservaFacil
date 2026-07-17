import type { RefreshRequest } from '@reservafacil/contracts';
import { IsJWT } from 'class-validator';

export class RefreshDto implements RefreshRequest {
  @IsJWT()
  refreshToken!: string;
}
