/**
 * Master catalog of Indian States + Union Territories.
 *
 * Used by the Current Affairs "state edition" feature: admins tag RSS
 * feeds (and the items they produce) with a state slug, and students
 * pick a state to see region-specific current affairs. The platform
 * keeps ALL states in this catalog but exposes only the ones an admin
 * has marked "live" (see currentAffairsConfig/states in Firestore) so
 * the founder can roll out one state at a time (e.g. start with CG).
 *
 * Rules:
 *   - `slug` is the stable, URL-safe identifier. NEVER change an existing
 *     slug — it is persisted on feed + item docs. Add new entries instead.
 *   - `name` is the English display label, `nameHi` the Devanagari label.
 *   - `isUT` flags Union Territories so the UI can group them separately.
 *
 * "National" is intentionally NOT in this list — it is the implicit
 * default for any item without a `state` tag.
 */
export interface IndianState {
  /** Stable URL-safe identifier persisted on feed + current-affairs docs. */
  slug: string;
  /** English display label. */
  name: string;
  /** Hindi (Devanagari) display label. */
  nameHi: string;
  /** True for Union Territories. */
  isUT: boolean;
}

export const INDIAN_STATES: readonly IndianState[] = [
  // ─── States (28) ───
  { slug: 'andhra-pradesh',   name: 'Andhra Pradesh',   nameHi: 'आंध्र प्रदेश',     isUT: false },
  { slug: 'arunachal-pradesh', name: 'Arunachal Pradesh', nameHi: 'अरुणाचल प्रदेश', isUT: false },
  { slug: 'assam',            name: 'Assam',            nameHi: 'असम',             isUT: false },
  { slug: 'bihar',            name: 'Bihar',            nameHi: 'बिहार',           isUT: false },
  { slug: 'chhattisgarh',     name: 'Chhattisgarh',     nameHi: 'छत्तीसगढ़',        isUT: false },
  { slug: 'goa',              name: 'Goa',              nameHi: 'गोवा',            isUT: false },
  { slug: 'gujarat',          name: 'Gujarat',          nameHi: 'गुजरात',          isUT: false },
  { slug: 'haryana',          name: 'Haryana',          nameHi: 'हरियाणा',         isUT: false },
  { slug: 'himachal-pradesh', name: 'Himachal Pradesh', nameHi: 'हिमाचल प्रदेश',   isUT: false },
  { slug: 'jharkhand',        name: 'Jharkhand',        nameHi: 'झारखंड',          isUT: false },
  { slug: 'karnataka',        name: 'Karnataka',        nameHi: 'कर्नाटक',         isUT: false },
  { slug: 'kerala',           name: 'Kerala',           nameHi: 'केरल',            isUT: false },
  { slug: 'madhya-pradesh',   name: 'Madhya Pradesh',   nameHi: 'मध्य प्रदेश',     isUT: false },
  { slug: 'maharashtra',      name: 'Maharashtra',      nameHi: 'महाराष्ट्र',       isUT: false },
  { slug: 'manipur',          name: 'Manipur',          nameHi: 'मणिपुर',          isUT: false },
  { slug: 'meghalaya',        name: 'Meghalaya',        nameHi: 'मेघालय',          isUT: false },
  { slug: 'mizoram',          name: 'Mizoram',          nameHi: 'मिज़ोरम',         isUT: false },
  { slug: 'nagaland',         name: 'Nagaland',         nameHi: 'नागालैंड',        isUT: false },
  { slug: 'odisha',           name: 'Odisha',           nameHi: 'ओडिशा',           isUT: false },
  { slug: 'punjab',           name: 'Punjab',           nameHi: 'पंजाब',           isUT: false },
  { slug: 'rajasthan',        name: 'Rajasthan',        nameHi: 'राजस्थान',        isUT: false },
  { slug: 'sikkim',           name: 'Sikkim',           nameHi: 'सिक्किम',         isUT: false },
  { slug: 'tamil-nadu',       name: 'Tamil Nadu',       nameHi: 'तमिलनाडु',        isUT: false },
  { slug: 'telangana',        name: 'Telangana',        nameHi: 'तेलंगाना',        isUT: false },
  { slug: 'tripura',          name: 'Tripura',          nameHi: 'त्रिपुरा',         isUT: false },
  { slug: 'uttar-pradesh',    name: 'Uttar Pradesh',    nameHi: 'उत्तर प्रदेश',    isUT: false },
  { slug: 'uttarakhand',      name: 'Uttarakhand',      nameHi: 'उत्तराखंड',       isUT: false },
  { slug: 'west-bengal',      name: 'West Bengal',      nameHi: 'पश्चिम बंगाल',    isUT: false },

  // ─── Union Territories (8) ───
  { slug: 'andaman-nicobar',  name: 'Andaman & Nicobar Islands', nameHi: 'अंडमान और निकोबार द्वीप समूह', isUT: true },
  { slug: 'chandigarh',       name: 'Chandigarh',       nameHi: 'चंडीगढ़',         isUT: true },
  { slug: 'dadra-nagar-haveli-daman-diu', name: 'Dadra & Nagar Haveli and Daman & Diu', nameHi: 'दादरा और नगर हवेली तथा दमन और दीव', isUT: true },
  { slug: 'delhi',            name: 'Delhi (NCT)',      nameHi: 'दिल्ली',          isUT: true },
  { slug: 'jammu-kashmir',    name: 'Jammu & Kashmir',  nameHi: 'जम्मू और कश्मीर', isUT: true },
  { slug: 'ladakh',           name: 'Ladakh',           nameHi: 'लद्दाख',          isUT: true },
  { slug: 'lakshadweep',      name: 'Lakshadweep',      nameHi: 'लक्षद्वीप',       isUT: true },
  { slug: 'puducherry',       name: 'Puducherry',       nameHi: 'पुदुचेरी',        isUT: true },
] as const;

export const STATE_BY_SLUG: ReadonlyMap<string, IndianState> = new Map(
  INDIAN_STATES.map((s) => [s.slug, s]),
);

/** Type guard: is this string a known Indian state / UT slug? */
export function isStateSlug(value: unknown): value is string {
  return typeof value === 'string' && STATE_BY_SLUG.has(value);
}
