"use client";

import MemoryProposalCloud from "@/components/memory/MemoryProposalCloud";
import { useMemoryInbox } from "@/lib/stores/memoryInbox";

export default function MemoryInboxLayer() {
  const byId = useMemoryInbox((s) => s.byId);
  const order = useMemoryInbox((s) => s.order);


  const visible = order
    .map((id) => byId[id])
    .filter((item) => item && item.status !== "dismissed");

  return (
    <>
      {visible.map((proposal) => (
        <MemoryProposalCloud key={proposal.id} proposal={proposal} />
      ))}
    </>
  );
}
