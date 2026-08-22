/**
 * Firestore Cleanup: Delete cached syllabi docs.
 * Forces fresh AI-generated syllabus on next request.
 *
 * Usage (from apps/api directory):
 *   node scripts/cleanup-syllabi-cache.mjs --dry-run
 *   node scripts/cleanup-syllabi-cache.mjs
 *   node scripts/cleanup-syllabi-cache.mjs --exam=upsc-cse
 */

import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const COLLECTION = 'syllabi';
const BATCH_SIZE = 100;

const isDryRun = process.argv.includes('--dry-run');
const examArg = process.argv.find(a => a.startsWith('--exam='));
const targetExam = examArg ? examArg.split('=')[1] : null;

async function main() {
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCP_PROJECT_ID || 'nexigrate-prod';

  if (getApps().length === 0) {
    if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      initializeApp({
        credential: cert({
          projectId,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
      });
    } else {
      initializeApp({ projectId });
    }
  }

  const db = getFirestore();
  console.log(`🔥 Connected to Firestore (project: ${projectId})`);
  console.log(`📂 Collection: ${COLLECTION}`);
  if (targetExam) console.log(`🎯 Target: ${targetExam}`);
  console.log(`${isDryRun ? '🏃 DRY RUN' : '🗑️  DELETE MODE'}\n`);

  let deletedCount = 0;

  if (targetExam) {
    const docRef = db.collection(COLLECTION).doc(targetExam);
    const docSnap = await docRef.get();
    if (docSnap.exists) {
      const data = docSnap.data();
      const subjectCount = data?.subjects?.length ?? '?';
      if (!isDryRun) {
        await docRef.delete();
        deletedCount++;
        console.log(`  🗑️  Deleted: ${targetExam} (had ${subjectCount} subjects)`);
      } else {
        deletedCount++;
        console.log(`  👁️  Would delete: ${targetExam} (${subjectCount} subjects cached)`);
      }
    } else {
      console.log(`  📭 No cached syllabus for: ${targetExam}`);
    }
  } else {
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
      if (!isDryRun && deletedCount > 0) await batch.commit();
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📊 ${isDryRun ? 'Would delete' : 'Deleted'}: ${deletedCount} doc(s)`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (!isDryRun && deletedCount > 0) {
    console.log('\n✅ Done! Fresh syllabi will generate on next request.');
  }
  if (isDryRun && deletedCount > 0) {
    console.log('\n⚠️  Run without --dry-run to delete:');
    console.log('   node scripts/cleanup-syllabi-cache.mjs');
  }
}

main().catch(err => { console.error('❌ Failed:', err.message); process.exit(1); });
