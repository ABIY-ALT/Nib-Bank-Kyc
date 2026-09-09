'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { generateSecureNumericCode } from '@/lib/security';
import { getSafeErrorMessage } from '@/lib/information-disclosure-prevention';

/**
 * The branch/district hierarchy changes when an administrator edits it — a
 * handful of times a year — but it is read on every load of eleven pages, and
 * each read rebuilds roughly 1,100 nested objects (every branch carrying its
 * district, every district carrying its branches).
 *
 * Measured on 553 branches: 16 ms for one reader, but 8.7 s at the 95th
 * percentile with 200 concurrent sessions — by a wide margin the most expensive
 * thing on the master bundle page under load, and almost none of it is database
 * time. It is object construction on the single-threaded Node event loop, which
 * every other request then queues behind.
 *
 * Five minutes, and every path that edits the hierarchy clears it immediately,
 * so an administrator never waits to see their own change.
 */
const HIERARCHY_TTL_MS = 5 * 60_000;

/** Bumped by every edit; invalidates both caches and any in-flight read. */
let hierarchyGeneration = 0;

function cachedReader<T>(compute: () => Promise<T>) {
  let cache: { at: number; generation: number; value: T } | null = null;
  let inFlight: { generation: number; promise: Promise<T> } | null = null;

  return async function read(): Promise<T> {
    // At most two passes: use what is there, and if that predated an edit,
    // fetch once more.
    for (let attempt = 0; attempt < 2; attempt++) {
      if (cache && cache.generation === hierarchyGeneration && Date.now() - cache.at < HIERARCHY_TTL_MS) {
        return cache.value;
      }
      // Only join a read started for the current generation — one started
      // before the last edit is already answering the wrong question.
      if (!inFlight || inFlight.generation !== hierarchyGeneration) {
        const generation = hierarchyGeneration;
        inFlight = {
          generation,
          promise: compute()
            .then(value => {
              if (hierarchyGeneration === generation) cache = { at: Date.now(), generation, value };
              return value;
            })
            .finally(() => {
              if (inFlight?.generation === generation) inFlight = null;
            }),
        };
      }
      const current = inFlight;
      const value = await current.promise;
      if (hierarchyGeneration === current.generation) return value;
    }
    return compute();
  };
}

const readDistricts = cachedReader(() =>
  prisma.district.findMany({ include: { branches: true }, orderBy: { name: 'asc' } }),
);

const readBranches = cachedReader(() =>
  prisma.branch.findMany({ include: { district: true }, orderBy: { name: 'asc' } }),
);

/** Called by every action that edits the hierarchy. */
function invalidateHierarchyCache() {
  hierarchyGeneration++;
}

export async function getDistricts() {
  try {
    return await readDistricts();
  } catch (error) {
    return [];
  }
}

export async function getBranches() {
  try {
    return await readBranches();
  } catch (error) {
    return [];
  }
}

export async function createDistrict(name: string) {
  try {
    const district = await prisma.district.create({
      data: { name }
    });
    invalidateHierarchyCache();
    revalidatePath('/admin/branches');
    return district;
  } catch (error: any) {
    if (error.code === 'P2002') {
      throw new Error(`The region "${name}" is already established in the hierarchy.`);
    }
    throw new Error('Institutional database fault during region registration.');
  }
}

export async function updateDistrict(id: string, name: string) {
  try {
    const district = await prisma.district.update({
      where: { id },
      data: { name }
    });
    invalidateHierarchyCache();
    revalidatePath('/admin/branches');
    return district;
  } catch (error: any) {
    if (error.code === 'P2002') {
      throw new Error(`Another region with the name "${name}" already exists.`);
    }
    throw new Error('Institutional database fault during region update.');
  }
}

export async function createBranch(data: { name: string, code?: string, districtName: string }) {
  try {
    const district = await prisma.district.findUnique({
      where: { name: data.districtName }
    });

    if (!district) {
      throw new Error(`Parent District "${data.districtName}" not found.`);
    }

    const branch = await prisma.branch.create({
      data: {
        name: data.name,
        code: data.code || `BR-${generateSecureNumericCode(100, 999)}`,
        districtId: district.id
      }
    });

    invalidateHierarchyCache();
    revalidatePath('/admin/branches');
    return branch;
  } catch (error: any) {
    if (error.code === 'P2002') {
      throw new Error(`Branch node "${data.name}" is already registered.`);
    }
    // SECURITY: Use generic safe error message (A03:2021 - Information Disclosure)
    throw new Error(getSafeErrorMessage(error) || 'Institutional database fault during branch registration.');
  }
}

export async function updateBranch(id: string, data: { name: string, code?: string, districtName: string }) {
  try {
    const district = await prisma.district.findUnique({
      where: { name: data.districtName }
    });

    if (!district) {
      throw new Error(`Parent District "${data.districtName}" not found.`);
    }

    const branch = await prisma.branch.update({
      where: { id },
      data: {
        name: data.name,
        code: data.code,
        districtId: district.id
      }
    });

    invalidateHierarchyCache();
    revalidatePath('/admin/branches');
    return branch;
  } catch (error: any) {
    if (error.code === 'P2002') {
      throw new Error(`Another branch node with the name "${data.name}" already exists.`);
    }
    // SECURITY: Use generic safe error message (A03:2021 - Information Disclosure)
    throw new Error(getSafeErrorMessage(error) || 'Institutional database fault during branch update.');
  }
}

export async function deleteNode(type: 'district' | 'branch', id: string) {
  try {
    if (type === 'district') {
      await prisma.district.delete({ where: { id } });
    } else {
      await prisma.branch.delete({ where: { id } });
    }
    invalidateHierarchyCache();
    revalidatePath('/admin/branches');
  } catch (error) {
    throw new Error('Node contains active records and cannot be purged.');
  }
}
