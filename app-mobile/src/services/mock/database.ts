import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Content } from '@shared/domain/content';
import type { Idea } from '@shared/domain/idea';
import type { PlanSlot } from '@shared/domain/plan';

import type { Workspace } from '@shared/services/types';

/** Il "server" del mock: documenti JSON nello storage locale. */
const WORKSPACE_KEY = 'presenza/mock-db/v1';
const IDEAS_KEY = 'presenza/mock-ideas/v1';
const SLOTS_KEY = 'presenza/mock-plan/v1';
const CONTENTS_KEY = 'presenza/mock-contents/v1';

export async function readDatabase(): Promise<Workspace> {
  const raw = await AsyncStorage.getItem(WORKSPACE_KEY);
  return raw ? (JSON.parse(raw) as Workspace) : { brands: [], activeBrandId: null };
}

export async function writeDatabase(workspace: Workspace): Promise<void> {
  await AsyncStorage.setItem(WORKSPACE_KEY, JSON.stringify(workspace));
}

/**
 * Una lista di documenti con le scritture in fila: con gli swipe rapidi due modifiche
 * concorrenti partirebbero dalla stessa lettura e una andrebbe persa.
 */
function createCollection<T>(key: string) {
  let queue: Promise<unknown> = Promise.resolve();

  const read = async (): Promise<T[]> => {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  };

  return {
    list: (): Promise<T[]> => queue.then(read),
    update<R>(change: (items: T[]) => { items: T[]; result: R }): Promise<R> {
      const run = queue.then(async () => {
        const { items, result } = change(await read());
        await AsyncStorage.setItem(key, JSON.stringify(items));
        return result;
      });
      queue = run.catch(() => undefined);
      return run;
    },
  };
}

export const ideasCollection = createCollection<Idea>(IDEAS_KEY);
export const slotsCollection = createCollection<PlanSlot>(SLOTS_KEY);
export const contentsCollection = createCollection<Content>(CONTENTS_KEY);

export async function clearDatabase(): Promise<void> {
  await AsyncStorage.multiRemove([WORKSPACE_KEY, IDEAS_KEY, SLOTS_KEY, CONTENTS_KEY]);
}
