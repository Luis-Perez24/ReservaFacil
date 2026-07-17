import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const passwordService = new PasswordService();

  it('nunca guarda la contraseña en claro', async () => {
    const hash = await passwordService.hash('clave-super-secreta');

    expect(hash).not.toContain('clave-super-secreta');
    expect(hash.startsWith('$argon2id$')).toBe(true);
  });

  it('acepta la contraseña correcta', async () => {
    const hash = await passwordService.hash('clave-super-secreta');

    await expect(passwordService.verify(hash, 'clave-super-secreta')).resolves.toBe(true);
  });

  it('rechaza una contraseña incorrecta', async () => {
    const hash = await passwordService.hash('clave-super-secreta');

    await expect(passwordService.verify(hash, 'clave-equivocada')).resolves.toBe(false);
  });

  it('produce hashes distintos para la misma contraseña', async () => {
    // El salt es aleatorio: dos usuarios con la misma clave no comparten hash,
    // así que un hash filtrado no delata a los demás.
    const [primero, segundo] = await Promise.all([
      passwordService.hash('clave-super-secreta'),
      passwordService.hash('clave-super-secreta'),
    ]);

    expect(primero).not.toEqual(segundo);
  });

  it('trata un hash corrupto como credencial inválida, no como error', async () => {
    await expect(passwordService.verify('no-es-un-hash', 'lo-que-sea')).resolves.toBe(false);
  });
});
