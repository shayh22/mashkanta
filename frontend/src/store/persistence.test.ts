import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { storageKey, uniqueId } from './persistence';
import { useConsolidation } from './consolidationStore';
import { useRefinance } from './refinanceStore';
import { useWizard } from './wizardStore';

class MemoryStorage {
  data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}

const global = globalThis as { localStorage?: unknown };

describe('input persistence', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    global.localStorage = storage;
  });

  afterEach(() => {
    delete global.localStorage;
    useRefinance.getState().reset();
    useConsolidation.getState().reset();
    useWizard.getState().reset();
  });

  it('writes only the inputs, never the actions or wizard navigation', () => {
    useWizard.getState().setProfile({ monthlyNetIncome: 41_000 });
    useWizard.getState().next();
    const saved = JSON.parse(storage.getItem(storageKey('wizard'))!);
    expect(saved.state.profile.monthlyNetIncome).toBe(41_000);
    expect(saved.state.step).toBeUndefined();
    expect(saved.version).toBe(1);
  });

  it('restores edited tracks and debts on rehydration', async () => {
    useRefinance.getState().setPropertyValue(3_100_000);
    const debtId = useConsolidation.getState().debts[0]!.id;
    useConsolidation.getState().updateDebt(debtId, { balance: 12_345 });

    // Simulate a reload: memory goes back to defaults, storage keeps what was written.
    const refinanceSnapshot = storage.getItem(storageKey('refinance'))!;
    const consolidationSnapshot = storage.getItem(storageKey('consolidation'))!;
    useRefinance.setState({ propertyValue: 1 });
    useConsolidation.setState({ debts: [] });
    storage.setItem(storageKey('refinance'), refinanceSnapshot);
    storage.setItem(storageKey('consolidation'), consolidationSnapshot);

    await useRefinance.persist.rehydrate();
    await useConsolidation.persist.rehydrate();
    expect(useRefinance.getState().propertyValue).toBe(3_100_000);
    expect(useConsolidation.getState().debts.find((debt) => debt.id === debtId)?.balance).toBe(12_345);
  });

  it('keeps working when storage throws', () => {
    global.localStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(() => useRefinance.getState().setDayOfMonth(18)).not.toThrow();
    expect(useRefinance.getState().dayOfMonth).toBe(18);
  });

  it('issues row ids that do not collide after a reload', () => {
    const ids = new Set(Array.from({ length: 500 }, () => uniqueId('t')));
    expect(ids.size).toBe(500);
  });

  it('starts from the defaults, without failing, when storage cannot be read or cleared', async () => {
    useRefinance.getState().setPropertyValue(2_750_000);
    global.localStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    await expect(useRefinance.persist.rehydrate()).resolves.toBeUndefined();
    expect(useRefinance.getState().propertyValue).toBe(2_750_000);
    await expect(Promise.resolve(useRefinance.persist.clearStorage())).resolves.toBeUndefined();
  });

  it('ignores a corrupted saved value instead of crashing on load', async () => {
    useWizard.getState().setProfile({ monthlyNetIncome: 33_000 });
    storage.setItem(storageKey('wizard'), '{not json');
    await expect(useWizard.persist.rehydrate()).resolves.toBeUndefined();
    expect(useWizard.getState().profile.monthlyNetIncome).toBe(33_000);
  });

  it('still issues unique, prefixed ids where crypto.randomUUID is unavailable', () => {
    const crypto = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', { value: {}, configurable: true });
    try {
      const ids = new Set(Array.from({ length: 200 }, () => uniqueId('d')));
      expect(ids.size).toBe(200);
      expect([...ids].every((id) => /^d-[a-z0-9]{1,8}$/.test(id))).toBe(true);
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: crypto, configurable: true });
    }
  });
});
