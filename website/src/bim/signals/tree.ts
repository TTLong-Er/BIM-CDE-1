import {IModelTree} from "@bim/types";
import {signal} from "@preact/signals-react";

export const modelTreeSignal = signal<IModelTree | null>(null);

export function disposeTreeViewer() {
  modelTreeSignal.value = null;
}
export function initTree(projectId: string | null) {
  console.log(projectId);
}
