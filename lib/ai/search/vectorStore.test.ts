import assert from "node:assert/strict";
import { test } from "node:test";
import { cosineSimilarity, cosineSimilarityRow,float32ViewFromBuffer } from "./vectorStore.ts";

test("cosineSimilarity：相同向量返回 1", () => {
  const v = [1, 2, 3];
  assert.equal(cosineSimilarity(v, v), 1);
});

test("cosineSimilarity：正交向量返回 0", () => {
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
});

test("cosineSimilarity：相反向量返回 -1", () => {
  assert.equal(cosineSimilarity([1, 0], [-1, 0]), -1);
});

test("cosineSimilarity：零向量返回 0（避免 NaN）", () => {
  assert.equal(cosineSimilarity([0, 0, 0], [1, 2, 3]), 0);
  assert.equal(cosineSimilarity([0, 0], [0, 0]), 0);
});

test("cosineSimilarity：已知值验证", () => {
  // [1,1] vs [1,0] → cos(45°) ≈ 0.7071
  const result = cosineSimilarity([1, 1], [1, 0]);
  assert.ok(Math.abs(result - Math.SQRT1_2) < 1e-10);
});

test("cosineSimilarity：不同长度按较短对齐（JS 不越界）", () => {
  const result = cosineSimilarity([1, 0, 0], [1, 0, 0]);
  assert.equal(result, 1);
});

test("cosineSimilarityRow：从矩阵中取一行与 cosineSimilarity 一致", () => {
  const row0 = [1, 0];
  const row1 = [0, 1];
  const matrix = Float32Array.from([...row0, ...row1]);
  assert.equal(cosineSimilarityRow([1, 0], matrix, 0, 2), 1);
  assert.equal(cosineSimilarityRow([1, 0], matrix, 2, 2), 0);
  assert.ok(Math.abs(cosineSimilarityRow([1, 1], matrix, 0, 2) - Math.SQRT1_2) < 1e-6);
});

test('aligned vector Buffer can be borrowed, while an unaligned slice is copied once',()=>{
  const aligned=Buffer.allocUnsafeSlow(16)
  aligned.writeFloatLE(1.25,0);aligned.writeFloatLE(2.5,4);aligned.writeFloatLE(3.75,8);aligned.writeFloatLE(4.5,12)
  const direct=float32ViewFromBuffer(aligned)
  assert.equal(direct.matrix.length,4)
  assert.equal(direct.matrix[0],1.25)
  if(direct.borrowed){aligned.writeFloatLE(9,0);assert.equal(direct.matrix[0],9)}
  const unaligned=Buffer.allocUnsafeSlow(17).subarray(1)
  unaligned.writeFloatLE(7.5,0)
  const copied=float32ViewFromBuffer(unaligned)
  assert.equal(copied.borrowed,false)
  assert.equal(copied.matrix[0],7.5)
  unaligned.writeFloatLE(8.5,0)
  assert.equal(copied.matrix[0],7.5)
})
