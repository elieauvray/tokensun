export function getPool(): never {
  throw new Error('Stateless mode: PostgreSQL is intentionally not used.');
}
