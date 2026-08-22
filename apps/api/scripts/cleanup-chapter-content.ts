/**
 * Firestore Cleanup Script: Delete old chapter_content docs WITHOUT level suffix
 *
 * Problem: Old cached content in Firestore has doc IDs like:
 *   `jee-main_physics_kinematics_en` (no level suffix)
 * New docs have:
 *   `jee-main_physics_kinematics_en_beginner`
 *   `jee-main_physics_kinematics_en_intermediate`
 *   `jee-main_physics_kinematics_en_advanced`
 *
 * Old docs serve non-personalized content. Deleting them forces fresh
 * AI-generated level-specific content on next request.
 *
 * Usage:
 *   npx tsx scripts/cleanup-chapter-content.ts
 *
 * Requirements:
 *   - GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_PROJECT_ID env var set
 *   - Or run from Cloud Shell (auto-authenticated)
 *
 * Add --dry-run flag to preview without deleting:
 *   npx tsx scripts/cleanup-chapter-content.ts --dry-run
 */

import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const LEVEL_SUFFIXES = ['_beginner', '_intermediate', '_advanced'];
const COLLECTION = 'chapter_content';
const BATCH_SIZE = 500;

const isDryRun = process.argv.includes('--dry-run');

async function main() {
  // Initialize Firebase Admin
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
      // Default credentials (Cloud Shell / ADC)
      initializeApp({ projectId });
    }
  }

  const db = getFirestore();
  console.log(`🔥 Connected to Firestore (project: ${projectId})`);
  console.log(`📂 Collection: ${COLLECTION}`);
  console.log(`${isDryRun ? '🏃 DRY RUN MODE — no deletions will happen' : '🗑️  DELETE MODE — old docs will be removed'}\n`);

  let totalDocs = 0;
  let oldDocs = 0;
  let newDocs = 0;
  let deletedCount = 0;
  let lastDoc: FirebaseFirestore.DocumentSnapshot | undefined;

  // Paginate through all docs in the collection
  while (true) {
    let query = db.collection(COLLECTION).orderBy('__name__').limit(BATCH_SIZE);
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    const snap = await query.get();
    if (snap.empty) break;

    const toDelete: FirebaseFirestore.DocumentReference[] = [];

    for (const doc of snap.docs) {
      totalDocs++;
      const docId = doc.id;

      // Check if doc ID ends with a level suffix
      const hasLevel = LEVEL_SUFFIXES.some(suffix => docId.endsWith(suffix));

      if (hasLevel) {
        newDocs++;
      } else {
        oldDocs++;
        toDelete.push(doc.ref);
      }
    }

    // Delete old docs in batch
    if (toDelete.length > 0 && !isDryRun) {
      const batch = db.batch();
      toDelete.forEach(ref => batch.delete(ref));
      await batch.commit();
      deletedCount += toDelete.length;
      console.log(`  🗑️  Deleted batch of ${toDelete.length} old docs (total deleted: ${deletedCount})`);
    } else if (toDelete.length > 0) {
      deletedCount += toDelete.length;
      console.log(`  👁️  Would delete ${toDelete.length} old docs: ${toDelete.slice(0, 3).map(r => r.id).join(', ')}${toDelete.length > 3 ? '...' : ''}`);
    }

    lastDoc = snap.docs[snap.docs.length - 1];

    // Safety: if less than BATCH_SIZE returned, we've reached the end
    if (snap.docs.length < BATCH_SIZE) break;
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Summary:');
  console.log(`   Total docs scanned: ${totalDocs}`);
  console.log(`   New docs (with level): ${newDocs} ✅`);
  console.log(`   Old docs (without level): ${oldDocs} ❌`);
  console.log(`   ${isDryRun ? 'Would delete' : 'Deleted'}: ${deletedCount}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (isDryRun && deletedCount > 0) {
    console.log('\n⚠️  Run without --dry-run to actually delete these docs:');
    console.log('   npx tsx scripts/cleanup-chapter-content.ts');
  }

  if (!isDryRun && deletedCount > 0) {
    console.log('\n✅ Cleanup complete! New personalized content will be generated on next user request.');
  }

  if (totalDocs === 0) {
    console.log('\n📭 Collection is empty or does not exist. Nothing to clean up.');
  }
}

main().catch((err) => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});
