/**
 * Firestore Cleanup: Delete old chapter_content docs WITHOUT level suffix.
 *
 * Old docs: `jee-main_physics_kinematics_en`
 * New docs: `jee-main_physics_kinematics_en_beginner`
 *
 * Usage (from apps/api directory):
 *   node scripts/cleanup-chapter-content.mjs --dry-run
 *   node scripts/cleanup-chapter-content.mjs
 */

import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const LEVEL_SUFFIXES = ['_beginner', '_intermediate', '_advanced'];
const COLLECTION = 'chapter_content';
const BATCH_SIZE = 500;

const isDryRun = process.argv.includes('--dry-run');

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
      // Default credentials (Cloud Shell / ADC)
      initializeApp({ projectId });
    }
  }

  const db = getFirestore();
  console.log(`🔥 Connected to Firestore (project: ${projectId})`);
  console.log(`📂 Collection: ${COLLECTION}`);
  console.log(`${isDryRun ? '🏃 DRY RUN — no deletions' : '🗑️  DELETE MODE'}\n`);

  let totalDocs = 0;
  let oldDocs = 0;
  let newDocs = 0;
  let deletedCount = 0;
  let lastDoc = undefined;

  while (true) {
    let query = db.collection(COLLECTION).orderBy('__name__').limit(BATCH_SIZE);
    if (lastDoc) query = query.startAfter(lastDoc);

    const snap = await query.get();
    if (snap.empty) break;

    const toDelete = [];

    for (const doc of snap.docs) {
      totalDocs++;
      const hasLevel = LEVEL_SUFFIXES.some(suffix => doc.id.endsWith(suffix));
      if (hasLevel) {
        newDocs++;
      } else {
        oldDocs++;
        toDelete.push(doc.ref);
      }
    }

    if (toDelete.length > 0 && !isDryRun) {
      const batch = db.batch();
      toDelete.forEach(ref => batch.delete(ref));
      await batch.commit();
      deletedCount += toDelete.length;
      console.log(`  🗑️  Deleted ${toDelete.length} old docs (total: ${deletedCount})`);
    } else if (toDelete.length > 0) {
      deletedCount += toDelete.length;
      console.log(`  👁️  Would delete ${toDelete.length} docs: ${toDelete.slice(0, 3).map(r => r.id).join(', ')}${toDelete.length > 3 ? '...' : ''}`);
    }

    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < BATCH_SIZE) break;
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📊 Total scanned: ${totalDocs}`);
  console.log(`   With level (keep): ${newDocs} ✅`);
  console.log(`   Without level (old): ${oldDocs} ❌`);
  console.log(`   ${isDryRun ? 'Would delete' : 'Deleted'}: ${deletedCount}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (isDryRun && deletedCount > 0) {
    console.log('\n⚠️  Run without --dry-run to delete:');
    console.log('   node scripts/cleanup-chapter-content.mjs');
  }
  if (!isDryRun && deletedCount > 0) {
    console.log('\n✅ Done! Fresh personalized content will generate on next request.');
  }
  if (totalDocs === 0) {
    console.log('\n📭 Collection empty — nothing to clean.');
  }
}

main().catch(err => { console.error('❌ Failed:', err.message); process.exit(1); });
