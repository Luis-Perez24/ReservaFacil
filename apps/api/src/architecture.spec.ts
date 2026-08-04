import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Las fronteras entre módulos no se sostienen solas: se erosionan de a un
 * import a la vez, y cada uno parece inofensivo cuando se escribe. Este test
 * las convierte en algo que falla, que es la única forma de que sigan siendo
 * ciertas dentro de seis meses.
 *
 * `02-arquitectura.md` decía que esto se reforzaría con ESLint
 * (`no-restricted-imports`); nunca se configuró. Un test hace el mismo trabajo
 * sin sumar dependencias ni una etapa aparte al CI: ya corre en
 * `pnpm --filter api test`.
 */

const MODULOS = join(__dirname, 'modules');

/** Quién puede depender de quién (`02-arquitectura.md`). */
const PERMITIDAS: Record<string, readonly string[]> = {
  auth: ['tenants'],
  catalog: ['tenants'],
  notifications: ['reservations', 'tenants', 'catalog', 'auth'],
  payments: ['reservations', 'tenants'],
  realtime: ['reservations'],
  reservations: ['catalog', 'tenants'],
  tenants: [],
};

/**
 * Desvíos aceptados a conciencia. Vacío hoy, y conviene que siga así: cada
 * entrada acá es una excepción que alguien tendrá que explicar.
 */
const DESVIOS_CONOCIDOS: ReadonlyArray<{ de: string; a: string }> = [];

/** El núcleo no puede conocer a quienes reaccionan a él. */
const CONSUMIDORES_DEL_NUCLEO = ['payments', 'notifications', 'realtime', 'ai', 'analytics'];

interface Import {
  archivo: string;
  de: string;
  a: string;
  ruta: string;
}

function archivosTs(dir: string): string[] {
  return readdirSync(dir).flatMap((entrada) => {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) return archivosTs(ruta);
    // Los specs quedan fuera: un test puede armar fixtures con piezas de otro
    // módulo sin que eso sea un acoplamiento de producción.
    return ruta.endsWith('.ts') && !ruta.endsWith('.spec.ts') ? [ruta] : [];
  });
}

function importsEntreModulos(): Import[] {
  const modulos = readdirSync(MODULOS).filter((m) => statSync(join(MODULOS, m)).isDirectory());

  return modulos.flatMap((modulo) =>
    archivosTs(join(MODULOS, modulo)).flatMap((archivo) => {
      const codigo = readFileSync(archivo, 'utf8');
      const encontrados: Import[] = [];

      for (const [, destino, resto] of codigo.matchAll(/from '\.\.\/([a-z-]+)\/([^']*)'/g)) {
        if (destino !== modulo) {
          encontrados.push({
            archivo: archivo.slice(MODULOS.length + 1),
            de: modulo,
            a: destino,
            ruta: resto,
          });
        }
      }
      return encontrados;
    }),
  );
}

describe('fronteras entre módulos', () => {
  const imports = importsEntreModulos();

  it('★ solo existen las dependencias permitidas, más los desvíos ya conocidos', () => {
    const infracciones = imports
      .filter(({ de, a }) => {
        if (PERMITIDAS[de]?.includes(a)) return false;
        return !DESVIOS_CONOCIDOS.some((d) => d.de === de && d.a === a);
      })
      .map(({ archivo, de, a }) => `${de} → ${a} (en ${archivo})`);

    expect([...new Set(infracciones)]).toEqual([]);
  });

  it('★ el núcleo de reservas no conoce a sus consumidores', () => {
    const acoplado = imports
      .filter(({ de, a }) => de === 'reservations' && CONSUMIDORES_DEL_NUCLEO.includes(a))
      .map(({ archivo, a }) => `reservations → ${a} (en ${archivo})`);

    expect(acoplado).toEqual([]);
  });

  it('★ nadie entra por la puerta de atrás de otro módulo', () => {
    // La frontera de un módulo es lo que exporta su `@Module`. Sus entidades y
    // sus DTOs son asunto suyo: si otro módulo los importa, un cambio interno
    // que debería ser libre pasa a romper código ajeno. Lo compartido de
    // verdad vive en `packages/contracts`.
    const internals = imports
      .filter(({ ruta }) => ruta.startsWith('entities/') || ruta.startsWith('dto/'))
      .map(({ archivo, de, a, ruta }) => `${de} → ${a}/${ruta} (en ${archivo})`);

    expect(internals).toEqual([]);
  });

  it('★ los desvíos conocidos siguen existiendo (si no, sobra la excepción)', () => {
    // Una lista de excepciones que nadie limpia se vuelve mentira. Si el
    // desvío ya se arregló, este test avisa para borrarlo de la lista.
    for (const desvio of DESVIOS_CONOCIDOS) {
      const sigue = imports.some(({ de, a }) => de === desvio.de && a === desvio.a);

      expect({ ...desvio, sigue }).toEqual({ ...desvio, sigue: true });
    }
  });
});
