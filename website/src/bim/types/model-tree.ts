export interface IModel {
  id: string;
  name: string;
  type: number;
  status: "success" | "processing" | "failed";
  createAt: Date;
  projectId: string;
}

export interface IProject {
  id: string;
  name: string;
  createAt: Date;
  models: IModel[];
}
export interface IModelTree {
  id: string;
  name: string;
  children: IModelTree[];
  checked: boolean;
  expandIds: string[];
  type: "project" | "model";
}
export interface ISpatialStructure {
  type: string;
  expressID: number;
  children: ISpatialStructure[];
}
