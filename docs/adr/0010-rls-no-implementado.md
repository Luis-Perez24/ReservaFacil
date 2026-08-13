# ADR 0010 — Row-Level Security evaluado y no implementado

**Estado:** aceptada

## Contexto

Hoy el aislamiento entre negocios tiene una sola capa: `TenantGuard`
resuelve el `tenant_id` desde el JWT (o desde el slug público) y cada
query lo filtra explícitamente — verificado por `architecture.spec.ts`
(fronteras entre módulos) y por `multi-tenancy.e2e-spec.ts` (día 13,
aislamiento consolidado entre negocios). Row-Level Security (RLS) de
Postgres agregaría una segunda capa **en la base de datos**: aunque una
query nueva olvidara el `WHERE tenant_id = $1`, la base igual bloquearía
las filas de otro tenant.

Se evaluó implementarlo en el día 13 y se decidió no hacerlo — no por
falta de tiempo, sino porque el mecanismo real de RLS no encaja limpio con
cómo este proyecto usa TypeORM.

## Decisión

**No se implementa RLS por ahora.** El aislamiento sigue dependiendo solo
de `TenantGuard` + el filtro explícito en cada query, con la red de
pruebas (`architecture.spec.ts`, `multi-tenancy.e2e-spec.ts`) como lo que
detecta una regresión.

### El problema técnico real

RLS depende de una variable de sesión (`SET LOCAL app.tenant_id = '…'`)
fijada en la conexión **antes** de cada query — la política compara cada
fila contra esa variable. Pero cada servicio de este proyecto recibe su
`Repository<T>` vía `@InjectRepository(...)` (`reservations.service.ts`,
`services.service.ts`, y así en los ~10 módulos), conectado a un **pool
compartido** de conexiones de TypeORM. Cada query puede tomar una conexión
distinta del pool — fijar la variable al principio de un request no
garantiza que la query real de ese mismo request la vea, porque bien puede
tocarle otra conexión.

Para que RLS funcione de verdad (no solo "aparente" funcionar) hace falta
fijar una única conexión o transacción por request — un cambio de
arquitectura real en cómo cada servicio accede a la base, no una
migración chica.

Además, el rol de Postgres que corre las migraciones es el mismo que corre
las queries de la app en producción (`docker-compose.prod.yml`, servicio
`api`). Por defecto, el dueño de una tabla **se salta RLS** salvo que se
fuerce explícitamente con `FORCE ROW LEVEL SECURITY` — y forzarlo
rompería el propio seed de demo, que inserta datos de varios tenants a la
vez a propósito.

## Alternativas descartadas

**Implementarlo igual, aceptando el hueco del pool de conexiones.** Sin
fijar la conexión por request, las políticas quedarían aplicadas de forma
inconsistente — a veces la query cae en una conexión con la variable
seteada, a veces no. Es peor que no tener RLS: da una sensación de
seguridad que no es real, y quien lea el código después puede confiar en
una protección que no está garantizada.

**Rehacer el acceso a datos con conexión/transacción por request ahora
mismo.** Existe un patrón real para esto sin reescribir cada servicio uno
por uno: interceptar las llamadas a los repositorios vía
`AsyncLocalStorage` (el enfoque que usa la librería `typeorm-transactional`)
para enrutarlas automáticamente a una transacción fijada por request. Se
descartó para el día 13 porque sería la primera vez que este patrón entra
al proyecto, afecta **todo** request que toca la base (incluidos los
públicos, que resuelven el tenant por slug en vez de JWT — un segundo
camino que también tendría que fijar la variable correctamente), y el
proyecto ya tiene ~200 tests escritos asumiendo el patrón de conexión
actual. Introducirlo de una sentada, sin poder validarlo visualmente en
este entorno, es más riesgo del que vale la pena para un proyecto que ya
está cerrando.

## Consecuencias

**A favor:** cero riesgo de romper el proyecto ya funcionando por
introducir un patrón de acceso a datos nuevo bajo presión de tiempo. La
decisión y su razón técnica quedan documentadas — más honesto que fingir
que "ya está protegido" con una implementación a medias.

**En contra:** el aislamiento depende enteramente de la disciplina de
código (cada query nueva tiene que acordarse de filtrar por `tenant_id`) y
de los tests, no de una garantía estructural de la base de datos.

**Riesgo asumido:** un bug futuro que olvide el filtro por `tenant_id` en
una query nueva no tiene una segunda red de seguridad a nivel de base —
solo `architecture.spec.ts` y la suite de aislamiento, que corren en CI
pero no en producción en tiempo real. Se acepta porque el camino
correcto (rol de Postgres separado + `AsyncLocalStorage` para fijar la
transacción por request) queda identificado acá para cuando el proyecto
lo justifique — un SaaS con clientes reales, no un portafolio.
