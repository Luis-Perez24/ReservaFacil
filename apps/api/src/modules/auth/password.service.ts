import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/**
 * Hashing con argon2id (el default de la librería: m=64MB, t=3, p=4).
 *
 * argon2 sobre bcrypt: su costo en memoria es lo que encarece el ataque por
 * GPU, donde bcrypt —que solo es caro en CPU— rinde mucho mejor al atacante.
 */
@Injectable()
export class PasswordService {
  async hash(plainPassword: string): Promise<string> {
    return argon2.hash(plainPassword);
  }

  async verify(hash: string, plainPassword: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plainPassword);
    } catch {
      // Un hash corrupto o de otro formato no es una excepción del flujo:
      // es una credencial que no valida.
      return false;
    }
  }
}
