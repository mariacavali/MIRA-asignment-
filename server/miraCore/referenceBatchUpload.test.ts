import { describe, expect, it, vi } from "vitest";
import {
  selectReferenceBatch,
  uploadReferenceBatch,
} from "../../client/src/lib/referenceBatchUpload";

const image = (name: string) => ({ name, type: "image/jpeg", size: 512 });
describe("batch reference selection", () => {
  it("accepts several files and respects remaining room capacity", () => {
    const result = selectReferenceBatch(
      [image("one.jpg"), image("two.jpg"), image("three.jpg")],
      2
    );
    expect(result.accepted.map(file => file.name)).toEqual([
      "one.jpg",
      "two.jpg",
    ]);
    expect(result.errors).toEqual(["three.jpg: No space left in this batch."]);
    expect(selectReferenceBatch([image("one.jpg")], 0).accepted).toEqual([]);
  });
  it("keeps valid images when another selected file has an unsupported type", () => {
    const result = selectReferenceBatch(
      [
        { name: "phone.heic", type: "image/heic", size: 512 },
        image("valid.jpg"),
      ],
      2
    );
    expect(result.accepted).toEqual([image("valid.jpg")]);
    expect(result.errors[0]).toContain("phone.heic");
    expect(result.errors[0]).toContain("export it as JPG");
  });
  it("uploads sequentially and reports partial failures without repeating successful requests", async () => {
    const order: string[] = [];
    const error = new Error("Network failed");
    const upload = vi.fn(async (id: number) => {
      order.push(`start:${id}`);
      await Promise.resolve();
      if (id === 2) throw error;
      order.push(`saved:${id}`);
    });
    const settled = vi.fn();
    await uploadReferenceBatch([1, 2, 3], upload, settled);
    expect(order).toEqual([
      "start:1",
      "saved:1",
      "start:2",
      "start:3",
      "saved:3",
    ]);
    expect(upload).toHaveBeenCalledTimes(3);
    expect(settled.mock.calls).toEqual([[1], [2, error], [3]]);
  });
});
