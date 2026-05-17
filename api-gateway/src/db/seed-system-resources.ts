/**
 * Seed script for system resources (SGK/SGV).
 * Inserts official textbook entries into the resources table.
 *
 * Run: npm run db:seed
 * Idempotent: skips existing entries matched by (filename, category, subject, grade).
 */
import dotenv from 'dotenv';
dotenv.config();

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { resources } from './schema';
import { and, eq } from 'drizzle-orm';

const SYSTEM_RESOURCES = [
  // ── Toán ──
  { filename: 'SGK Toán 10', category: 'sgk' as const, subject: 'Toán', grade: '10', description: 'Sách giáo khoa Toán 10 — Chương trình GDPT 2018', pageCount: 192 },
  { filename: 'SGK Toán 11', category: 'sgk' as const, subject: 'Toán', grade: '11', description: 'Sách giáo khoa Toán 11 — Chương trình GDPT 2018', pageCount: 196 },
  { filename: 'SGK Toán 12', category: 'sgk' as const, subject: 'Toán', grade: '12', description: 'Sách giáo khoa Toán 12 — Chương trình GDPT 2018', pageCount: 200 },
  { filename: 'SGV Toán 10', category: 'sgv' as const, subject: 'Toán', grade: '10', description: 'Sách giáo viên Toán 10 — Hướng dẫn giảng dạy', pageCount: 240 },
  { filename: 'SGV Toán 11', category: 'sgv' as const, subject: 'Toán', grade: '11', description: 'Sách giáo viên Toán 11 — Hướng dẫn giảng dạy', pageCount: 248 },

  // ── Vật Lý ──
  { filename: 'SGK Vật Lý 10', category: 'sgk' as const, subject: 'Vật Lý', grade: '10', description: 'Sách giáo khoa Vật Lý 10 — Chương trình GDPT 2018', pageCount: 180 },
  { filename: 'SGK Vật Lý 11', category: 'sgk' as const, subject: 'Vật Lý', grade: '11', description: 'Sách giáo khoa Vật Lý 11 — Chương trình GDPT 2018', pageCount: 184 },
  { filename: 'SGV Vật Lý 10', category: 'sgv' as const, subject: 'Vật Lý', grade: '10', description: 'Sách giáo viên Vật Lý 10 — Hướng dẫn giảng dạy', pageCount: 220 },

  // ── Hóa Học ──
  { filename: 'SGK Hóa Học 10', category: 'sgk' as const, subject: 'Hóa Học', grade: '10', description: 'Sách giáo khoa Hóa Học 10 — Chương trình GDPT 2018', pageCount: 172 },
  { filename: 'SGK Hóa Học 11', category: 'sgk' as const, subject: 'Hóa Học', grade: '11', description: 'Sách giáo khoa Hóa Học 11 — Chương trình GDPT 2018', pageCount: 176 },

  // ── Ngữ Văn ──
  { filename: 'SGK Ngữ Văn 10', category: 'sgk' as const, subject: 'Ngữ Văn', grade: '10', description: 'Sách giáo khoa Ngữ Văn 10 — Chương trình GDPT 2018', pageCount: 200 },
  { filename: 'SGK Ngữ Văn 11', category: 'sgk' as const, subject: 'Ngữ Văn', grade: '11', description: 'Sách giáo khoa Ngữ Văn 11 — Chương trình GDPT 2018', pageCount: 204 },

  // ── Lịch Sử ──
  { filename: 'SGK Lịch Sử 10', category: 'sgk' as const, subject: 'Lịch Sử', grade: '10', description: 'Sách giáo khoa Lịch Sử 10 — Chương trình GDPT 2018', pageCount: 160 },

  // ── Sinh Học ──
  { filename: 'SGK Sinh Học 10', category: 'sgk' as const, subject: 'Sinh Học', grade: '10', description: 'Sách giáo khoa Sinh Học 10 — Chương trình GDPT 2018', pageCount: 168 },

  // ── Tiếng Anh ──
  { filename: 'SGK Tiếng Anh 10', category: 'sgk' as const, subject: 'Tiếng Anh', grade: '10', description: 'Sách giáo khoa Tiếng Anh 10 — Chương trình GDPT 2018', pageCount: 148 },
];

async function seed() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('❌ DATABASE_URL not set. Check your .env file.');
    process.exit(1);
  }

  const sql = postgres(connectionString, { max: 1, prepare: false });
  const database = drizzle(sql);

  console.log('🌱 Seeding system resources...\n');

  let inserted = 0;
  let skipped = 0;

  for (const res of SYSTEM_RESOURCES) {
    // Idempotent check: skip if already exists
    const existing = await database
      .select({ id: resources.id })
      .from(resources)
      .where(
        and(
          eq(resources.filename, res.filename),
          eq(resources.subject, res.subject),
          eq(resources.grade, res.grade),
          eq(resources.isSystem, true),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      console.log(`  ⏭  Skipped: ${res.filename} (${res.subject} ${res.grade}) — already exists`);
      skipped++;
      continue;
    }

    await database.insert(resources).values({
      userId: null,
      filename: res.filename,
      fileUrl: `system-resources/${res.subject.toLowerCase().replace(/ /g, '-')}/${res.filename.toLowerCase().replace(/ /g, '-')}.pdf`,
      fileSize: null,
      pageCount: res.pageCount,
      contentText: null,
      isEmbedded: false,
      isSystem: true,
      category: res.category,
      subject: res.subject,
      grade: res.grade,
      description: res.description,
      metadata: {},
    });

    console.log(`  ✅ Inserted: ${res.filename} (${res.subject} ${res.grade})`);
    inserted++;
  }

  console.log(`\n🏁 Done! Inserted: ${inserted}, Skipped: ${skipped}, Total: ${SYSTEM_RESOURCES.length}`);
  await sql.end();
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
