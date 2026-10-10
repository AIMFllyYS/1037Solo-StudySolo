import { CUSTOM_OPENAI_MODEL_ID, type ModelInfo } from "./contracts";
import { MODELS } from "./catalog";
/** 网页模型菜单 / 设置内置列表不展示桌面专用「自由中转」；resolveProvider 仍识别该 id。 */
export function isPickerHiddenModel(id: string): boolean {
  return id === CUSTOM_OPENAI_MODEL_ID;
}

export function modelsForPicker(models: ModelInfo[]): ModelInfo[] {
  return models.filter((m) => !isPickerHiddenModel(m.id));
}

/** 菜单分类列名归一：注册表 group 值 → 菜单分类名（多模态 → 多模态模型）。 */
export function menuCategoryOfGroup(group: string): string {
  return group === "多模态" ? "多模态模型" : group;
}

/** 模型归属的全部菜单分类：主分类在前，extraGroups 归一后去重追加。 */
export function modelMenuCategories(model: ModelInfo): string[] {
  const out = [menuCategoryOfGroup(model.group)];
  for (const g of model.extraGroups ?? []) {
    const c = menuCategoryOfGroup(g);
    if (!out.includes(c)) out.push(c);
  }
  return out;
}

/** 按 group 聚合，保持声明顺序，供菜单分区渲染。 */
export function getModelGroups(): { group: string; models: ModelInfo[] }[] {
  const order: string[] = [];
  const map = new Map<string, ModelInfo[]>();
  for (const m of modelsForPicker(MODELS)) {
    if (!map.has(m.group)) {
      map.set(m.group, []);
      order.push(m.group);
    }
    map.get(m.group)!.push(m);
  }
  return order.map((group) => ({ group, models: map.get(group)! }));
}
