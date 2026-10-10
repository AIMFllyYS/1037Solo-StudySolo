import { getOwnerEpoch, getStorageOwner } from "@/lib/storage/ownerScope";
export function ownerStillCurrent(ownerId: string | null, epoch: number): boolean {
  return getStorageOwner() === ownerId && getOwnerEpoch() === epoch;
}
