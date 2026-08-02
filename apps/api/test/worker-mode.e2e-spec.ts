import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AppModule } from '../src/app.module';
import { ReminderProcessor } from '../src/modules/notifications/reminder.processor';

/**
 * `main.ts` y `main.worker.ts` bootean el mismo `AppModule` (`02-arquitectura.md`):
 * si `ReminderProcessor` no se quedara quieto en el proceso HTTP, cada réplica
 * del api mandaría recordatorios por su cuenta, duplicando envíos sin que
 * nadie lo pidiera.
 *
 * **Lo que este test NO prueba:** la primera versión pausaba el worker en
 * `onModuleInit` (`await this.worker.pause()`) en vez de con `autorun: false`
 * en el decorador. Una prueba manual con dos procesos reales mostró la falla
 * —el `Worker` de BullMQ arranca a consumir apenas se construye, así que un
 * job ya listo justo al bootear alcanzaba a procesarse antes de que el
 * `pause()` resolviera—, pero esa ventana de milisegundos no se reprodujo de
 * forma confiable dentro de Jest: al terminar `app.init()`, las dos versiones
 * ya muestran `isRunning() === false` por igual (`pause()` también completó).
 * Un test por tiempos habría quedado intermitente, peor que no tenerlo. Este
 * test verifica el contrato estable —qué corre en cada modo—, no la carrera;
 * la carrera se verificó a mano y se corrigió con `autorun: false`.
 */
describe('ReminderProcessor — aislamiento api/worker', () => {
  afterEach(() => {
    delete process.env.WORKER_MODE;
  });

  it('★ en el proceso api (sin WORKER_MODE) el worker de BullMQ no corre', async () => {
    delete process.env.WORKER_MODE;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app: INestApplication = moduleRef.createNestApplication();
    await app.init();

    expect(app.get(ReminderProcessor).worker.isRunning()).toBe(false);

    await app.close();
  });

  it('★ con WORKER_MODE=true el worker de BullMQ sí corre', async () => {
    process.env.WORKER_MODE = 'true';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app: INestApplication = moduleRef.createNestApplication();
    await app.init();

    expect(app.get(ReminderProcessor).worker.isRunning()).toBe(true);

    await app.close();
  });
});
