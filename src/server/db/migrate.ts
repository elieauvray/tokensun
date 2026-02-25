export async function migrate(): Promise<void> {
  // Stateless mode intentionally has no migrations.
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrate().catch((err) => {
    console.error(err instanceof Error ? err.message : 'migration_error');
    process.exit(1);
  });
}
