/**
 * Firestore Cleanup Script: Delete cached syllabi docs
 *
 * Problem: Old cached syllabus data in Firestore may have stale/incomplete subjects.
 * For example, UPSC showing only 2 subjects instead of 7.
 * Deleting the cached syllabi forces fresh AI-generated syllabus on next request.
 *
 * Usage:
 *   npx tsx scripts/cleanup-syllabi-cache.ts
 *
 * Optionally target a specific exam:
 *   npx tsx scripts/cleanup-syllabi-cache.ts --exam=upsc-cse
 *
 * Add --dry-run flag to preview without deleting:
 *   npx tsx scripts/cleanup-syllabi-cache.ts --dry-run
 */

import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const COLLECTION = 'syllabi';
const BATCH_SIZE = 100;

const isDryRun = process.argv.includes('--dry-run');
const examArg = process.argv.find(a => a.startsWith('--exam='));
const targetExam = examArg ? examArg.split('=')[1] : null;

async function main() {
  const projectId = process.env['FIREBASE_PROJECT_ID'] || process.env['GCP_PROJECT_ID'] || 'nexigrate-prod';

  if (getApps().length === 0) {
    if (process.env['FIREBASE_CLIENT_EMAIL'] && process.env['FIREBASE_PRIVATE_KEY']) {
      initializeApp({
        credential: cert({
          projectId,
          clientEmail: process.env['FIREBASE_CLIENT_EMAIL'],
          privateKey: (process.env['FIREBASE_PRIVATE_KEY'] ?? '').replace(/\\n/g, '\n'),
        }),
      });
    } else {
      initializeApp({ projectId });
    }
  }

  const db = getFirestore();
  console.log(`🔥 Connected to Firestore (project: ${projectId})`);
  console.log(`📂 Collection: ${COLLECTION}`);
  if (targetExam) console.log(`🎯 Target exam: ${targetExam}`);
  console.log(`${isDryRun ? '🏃 DRY RUN MODE' : '🗑️  DELETE MODE'}\n`);

  let deletedCount = 0;

  if (targetExam) {
    // Delete specific exam's cached syllabus
    const docRef = db.collection(COLLECTION).doc(targetExam);
    const docSnap = await docRef.get();
    if (docSnap.exists) {
      if (!isDryRun) {
        await docRef.delete();
        deletedCount++;
        console.log(`  🗑️  Deleted: ${targetExam}`);
      } else {
        deletedCount++;
        const data = docSnap.data();
        const subjectCount = data?.subjects?.length ?? '?';
        console.log(`  👁️  Would delete: ${targetExam} (${subjectCount} subjects cached)`);
      }
    } else {
      console.log(`  📭 No cached syllabus found for: ${targetExam}`);
    }
  } else {
    // Delete ALL cached syllabi
    const snap = await db.collection(COLLECTION).limit(BATCH_SIZE).get();

    if (snap.empty) {
      console.log('📭 No cached syllabi found.');
    } else {
      const batch = db.batch();
      for (const doc of snap.docs) {
        const data = doc.data();
        const subjectCount = data?.subjects?.length ?? '?';
        console.log(`  ${isDryRun ? '👁️  Would delete' : '🗑️  Deleting'}: ${doc.id} (${subjectCount} subjects)`);
        if (!isDryRun) batch.delete(doc.ref);
        deletedCount++;
      }
      if (!isDryRun && deletedCount > 0) {
        await batch.commit();
      }
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📊 ${isDryRun ? 'Would delete' : 'Deleted'}: ${deletedCount} syllabus doc(s)`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (!isDryRun && deletedCount > 0) {
    console.log('\n✅ Done! Fresh syllabi will be generated on next user request.');
  }

  if (isDryRun && deletedCount > 0) {
    console.log('\n⚠️  Run without --dry-run to actually delete:');
    console.log('   npx tsx scripts/cleanup-syllabi-cache.ts');
  }
}

main().catch((err) => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});
