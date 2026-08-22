import type { Firestore } from 'firebase-admin/firestore';
import type { Coupon } from '@nexigrate/shared';
import type { PlanId } from '@nexigrate/shared';

export interface CouponValidation {
  valid: boolean;
  discount: number;       // amount off in paise
  finalAmount: number;    // after discount in paise
  error?: string;
}

export interface CouponStore {
  validate(code: string, planId: PlanId, uid: string, baseAmountPaise: number): Promise<CouponValidation>;
  create(coupon: Coupon): Promise<void>;
  deactivate(code: string): Promise<void>;
  incrementUsage(code: string): Promise<void>;
  listAll(): Promise<Coupon[]>;
  delete(code: string): Promise<void>;
}

export class InMemoryCouponStore implements CouponStore {
  private coupons = new Map<string, Coupon>();

  async validate(code: string, planId: PlanId, _uid: string, baseAmountPaise: number): Promise<CouponValidation> {
    const coupon = this.coupons.get(code.toUpperCase());
    if (!coupon) return { valid: false, discount: 0, finalAmount: baseAmountPaise, error: 'Invalid coupon code' };
    if (!coupon.isActive) return { valid: false, discount: 0, finalAmount: baseAmountPaise, error: 'Coupon is inactive' };
    if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < Date.now()) return { valid: false, discount: 0, finalAmount: baseAmountPaise, error: 'Coupon has expired' };
    if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) return { valid: false, discount: 0, finalAmount: baseAmountPaise, error: 'Coupon usage limit reached' };
    if (coupon.applicablePlans.length > 0 && !coupon.applicablePlans.includes(planId)) return { valid: false, discount: 0, finalAmount: baseAmountPaise, error: 'Coupon not applicable to this plan' };

    let discount = 0;
    if (coupon.discountType === 'percent') {
      discount = Math.round(baseAmountPaise * (coupon.discountValue / 100));
    } else {
      discount = coupon.discountValue * 100; // flat INR to paise
    }
    const finalAmount = Math.max(0, baseAmountPaise - discount);
    return { valid: true, discount, finalAmount };
  }

  async create(coupon: Coupon) { this.coupons.set(coupon.code.toUpperCase(), coupon); }
  async deactivate(code: string) { const c = this.coupons.get(code.toUpperCase()); if (c) c.isActive = false; }
  async incrementUsage(code: string) { const c = this.coupons.get(code.toUpperCase()); if (c) c.usedCount++; }
  async listAll() { return Array.from(this.coupons.values()); }
  async delete(code: string) { this.coupons.delete(code.toUpperCase()); }
}

export class FirestoreCouponStore implements CouponStore {
  constructor(private readonly db: Firestore) {}

  async validate(code: string, planId: PlanId, uid: string, baseAmountPaise: number): Promise<CouponValidation> {
    const upperCode = code.toUpperCase();
    const snap = await this.db.collection('coupons').doc(upperCode).get();
    if (!snap.exists) return { valid: false, discount: 0, finalAmount: baseAmountPaise, error: 'Invalid coupon code' };

    const coupon = snap.data() as Coupon;
    if (!coupon.isActive) return { valid: false, discount: 0, finalAmount: baseAmountPaise, error: 'Coupon is inactive' };
    if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < Date.now()) return { valid: false, discount: 0, finalAmount: baseAmountPaise, error: 'Coupon has expired' };
    if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) return { valid: false, discount: 0, finalAmount: baseAmountPaise, error: 'Coupon usage limit reached' };
    if (coupon.applicablePlans.length > 0 && !coupon.applicablePlans.includes(planId)) return { valid: false, discount: 0, finalAmount: baseAmountPaise, error: 'Coupon not applicable to this plan' };

    // Check if user already used this coupon
    const usedSnap = await this.db.collection('users').doc(uid).collection('usedCoupons').doc(upperCode).get();
    if (usedSnap.exists) return { valid: false, discount: 0, finalAmount: baseAmountPaise, error: 'You have already used this coupon' };

    let discount = 0;
    if (coupon.discountType === 'percent') {
      discount = Math.round(baseAmountPaise * (coupon.discountValue / 100));
    } else {
      discount = coupon.discountValue * 100;
    }
    const finalAmount = Math.max(0, baseAmountPaise - discount);
    return { valid: true, discount, finalAmount };
  }

  async create(coupon: Coupon) {
    await this.db.collection('coupons').doc(coupon.code.toUpperCase()).set(coupon);
  }

  async deactivate(code: string) {
    await this.db.collection('coupons').doc(code.toUpperCase()).set({ isActive: false }, { merge: true });
  }

  async incrementUsage(code: string) {
    const ref = this.db.collection('coupons').doc(code.toUpperCase());
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists) tx.update(ref, { usedCount: (snap.data()?.usedCount ?? 0) + 1 });
    });
  }

  async listAll() {
    const snap = await this.db.collection('coupons').get();
    return snap.docs.map(d => d.data() as Coupon);
  }

  async delete(code: string) {
    await this.db.collection('coupons').doc(code.toUpperCase()).delete();
  }
}
