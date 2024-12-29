import * as WEBIFC from "web-ifc";
import {IIfcTree} from "./types";
import {getKeyFromValue} from "./IfcCategoryMap";
/**
 * Object to export all the properties from an IFC to a JS object.
 */
export class IfcGeometryJson {
  /**
   *
   */
  constructor(private webIfc: WEBIFC.IfcAPI) {}

  async streamFromBuffer() {
    try {
      const before = performance.now();

      const modelTree = await this.webIfc.properties.getSpatialStructure(0);

      this.refactoringTree(modelTree);

      console.log(
        `Streaming GeometryJson the IFC took ${performance.now() - before} ms!`
      );
      return modelTree;
    } catch (error: any) {
      console.log(error);
      return null;
    }
  }
  private refactoringTree(modelTree: IIfcTree) {
    if (!modelTree.expressID || !modelTree.children) return;

    const type = modelTree.type;

    if (type !== "IfcBuildingStorey") {
      for (const item of modelTree.children as any[]) {
        this.refactoringTree(item);
      }
      const count = modelTree.children.length;
      modelTree.type += ` (${count}) `;
    } else {
      const newChildren: {
        [type: string]: {
          expressID: number;
          type: string;
          children: any[];
        };
      } = {};

      // loop all structure.children
      for (const item of modelTree.children as any[]) {
        if (!item.type) continue;
        const childType = item.type as string;
        // order by alphabet in current language
        if (!newChildren[childType])
          newChildren[childType] = {
            expressID: getKeyFromValue(childType) ?? -1,
            type: childType,
            children: [],
          };
        newChildren[childType].children.push(item);
      }
      // order by alphabet in current language
      const keys = Object.keys(newChildren).sort(function (a, b) {
        const left = a.toLowerCase();

        const right = b.toLowerCase();

        if (left < right) return -1;

        if (left > right) return 1;

        return 0;
      });
      modelTree.children = keys.map((key) => {
        const child = {...newChildren[key]};
        const count = child.children.length;
        child.type += ` (${count}) `;
        return child;
      });
      const count = modelTree.children.length;
      modelTree.type += ` (${count}) `;
    }
  }
}
