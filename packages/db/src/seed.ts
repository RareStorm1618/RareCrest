import { DatabaseClient } from "./client.js";

const DEFAULT_REGIMES: Record<string, string[]> = {
  nonprofit: ["IRS-501c3", "Form-990"],
  for_profit_platform: ["GDPR", "State-Privacy"],
  fund: ["SEC", "AML"],
  token_protocol: ["AML", "Money-Transmission"],
  holding: ["GDPR", "NIST-AI-RMF"],
};

/** Seed the five verticals + holding entity for local dev */
export async function seedPortfolio(db: DatabaseClient): Promise<void> {
  const existing = await db.query(
    "SELECT COUNT(*)::int AS count FROM rarecrest.entities WHERE deleted_at IS NULL",
  );
  if ((existing.rows[0] as { count: number }).count > 0) {
    console.log("Seed skipped: entities already exist");
    return;
  }

  const entities = [
    { name: "RareCrest Holding", vertical: "holding", tenancyKey: "holding-1", entityType: "holding", isHolding: true },
    { name: "RareStorm", vertical: "rarestorm", tenancyKey: "rs-1", entityType: "nonprofit", isHolding: false },
    { name: "RareAngels", vertical: "rareangels", tenancyKey: "ra-1", entityType: "for_profit_platform", isHolding: false },
    { name: "RareEdge", vertical: "rareedge", tenancyKey: "re-1", entityType: "fund", isHolding: false },
    { name: "HopeCoin", vertical: "hopecoin", tenancyKey: "hc-1", entityType: "token_protocol", isHolding: false },
    { name: "Heal Kids.AI", vertical: "healkids", tenancyKey: "hk-1", entityType: "for_profit_platform", isHolding: false },
  ];

  const ids: string[] = [];
  for (const e of entities) {
    const regimes = JSON.stringify(DEFAULT_REGIMES[e.entityType] ?? []);
    const result = await db.query<{ id: string }>(
      `INSERT INTO rarecrest.entities
         (name, vertical, tenancy_key, entity_type, is_holding_entity, regulatory_regimes)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [e.name, e.vertical, e.tenancyKey, e.entityType, e.isHolding, regimes],
    );
    ids.push(result.rows[0].id);
  }

  await db.query(
    `INSERT INTO rarecrest.attention_flags (entity_id, flag_type, signal_type, severity, message, link_path)
     VALUES ($1, 'kill_switch_overdue', 'open_governance_gate', 'high', 'Kill switch test overdue', $2)`,
    [ids[3], `/portfolio/entities/${ids[3]}`],
  );

  await db.query(
    `INSERT INTO rarecrest.entity_relationships (from_entity_id, to_entity_id, relationship_type, constraint_note)
     VALUES ($1, $2, 'fiscal_sponsorship', 'Charitable license retained by RareStorm')`,
    [ids[1], ids[2]],
  );

  console.log(`Seeded ${entities.length} entities with sample flags and relationships`);
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }
  const db = new DatabaseClient({ connectionString: url });
  await seedPortfolio(db);
  await db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
