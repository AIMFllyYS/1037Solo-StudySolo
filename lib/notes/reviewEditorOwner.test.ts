import assert from "node:assert/strict";
import { test } from "node:test";
import { activateStorageOwner, getOwnerEpoch, getStorageOwner } from "@/lib/storage/ownerScope";
import { useUserNotes } from "@/lib/stores/userNotes";
import {
  captureReviewEditorOwner,
  isReviewNoteOwnerReady,
} from "./reviewEditorOwner.ts";

test("owner-bound Review edits are rejected while the new note partition is not hydrated", () => {
  const previousOwner = getStorageOwner();
  try {
    activateStorageOwner("review-owner-a");
    useUserNotes.setState({ _hydratedOwnerEpoch: getOwnerEpoch() });
    const oldBinding = captureReviewEditorOwner("note-1");
    assert.equal(oldBinding.isCurrent(), true);

    activateStorageOwner("review-owner-b");
    assert.equal(oldBinding.isCurrent(), false);
    assert.equal(isReviewNoteOwnerReady(), false);
  } finally {
    activateStorageOwner(previousOwner);
    useUserNotes.setState({ _hydratedOwnerEpoch: getOwnerEpoch() });
  }
});

test("an old Review editor callback cannot write the same note id into a new owner", () => {
  const previousOwner = getStorageOwner();
  const id = "same-note-id";
  try {
    activateStorageOwner("review-owner-a");
    useUserNotes.setState({
      byId: {
        [id]: {
          id, title: "A note", markdown: "A draft", subjectId: "anatomy",
          createdAt: 1, updatedAt: 1,
        },
      },
      order: [id],
      _hydratedOwnerEpoch: getOwnerEpoch(),
    } as never);
    const ownerABinding = captureReviewEditorOwner(id);
    assert.equal(ownerABinding.isCurrent(), true);

    activateStorageOwner("review-owner-b");
    assert.equal(isReviewNoteOwnerReady(), false);
    useUserNotes.setState({
      byId: {
        [id]: {
          id, title: "B note", markdown: "B draft", subjectId: "physics",
          createdAt: 2, updatedAt: 2,
        },
      },
      order: [id],
      _hydratedOwnerEpoch: getOwnerEpoch(),
    } as never);
    assert.equal(isReviewNoteOwnerReady(), true);

    if (ownerABinding.isCurrent()) {
      useUserNotes.getState().updateNote(id, { markdown: "stale A callback" });
    }
    assert.equal(useUserNotes.getState().byId[id]?.markdown, "B draft");
    assert.equal(ownerABinding.isCurrent(), false);
    assert.equal(captureReviewEditorOwner(id).isCurrent(), true);
  } finally {
    activateStorageOwner(previousOwner);
    useUserNotes.setState({ _hydratedOwnerEpoch: getOwnerEpoch() });
  }
});

test("guest Review editors stay usable without assigning their local note to an account", () => {
  const previousOwner = getStorageOwner();
  try {
    activateStorageOwner(null);
    const binding = captureReviewEditorOwner("guest-note");
    assert.equal(binding.ownerId, null);
    assert.equal(binding.isCurrent(), true);
    assert.equal(isReviewNoteOwnerReady(), true);
  } finally {
    activateStorageOwner(previousOwner);
  }
});
