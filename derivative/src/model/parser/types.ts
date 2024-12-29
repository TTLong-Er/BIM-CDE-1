export type IPropertiesStreamed = {
  type: number;
  data: {[id: number]: any};
};
export type IProgress = {
  type: "property" | "geometry";
  progress: number;
};
export type IAssetStreamed = StreamedAsset[];
export type IGeometryStreamed = {
  data: StreamedGeometries;
  buffer: Uint8Array;
};

export interface IWorkerAction {
  action: "onLoad" | "onError" | "onSuccess" | "onProperty";
  input: IInputStream;
  payload: any;
}

export interface IfcItemsCategories {
  [itemID: number]: number;
}

/**
 * A dictionary of geometries streamed from a server. Each geometry is identified by a unique number (id), and contains information about its bounding box, whether it has holes, and an optional file path for the geometry data.
 */
export interface StreamedGeometries {
  [id: number]: {
    /** The bounding box of the geometry as a Float32Array. */
    boundingBox: Float32Array;
    /** An optional file path for the geometry data. */
    geometryFile?: string;
  };
}

/**
 * A streamed asset, which consists of multiple geometries. Each geometry in the asset is identified by a unique number (geometryID), and contains information about its transformation and color.
 */
export interface StreamedAsset {
  /** The unique identifier of the asset. */
  id: number;
  /** An array of geometries associated with the asset. */
  geometries: {
    /** The unique identifier of the geometry. */
    geometryID: number;
    /** The transformation matrix of the geometry as a number array. */
    transformation: number[];
    /** The color of the geometry as a number array. */
    color: number[];
  }[];
}
export interface StreamedProperties {
  types: {
    [typeID: number]: number[];
  };

  ids: {
    [id: number]: number;
  };

  indexesFile: string;
}

export interface IfcProperties {
  /**
   * The unique identifier of the IFC entity.
   */
  [expressID: number]: {
    /**
     * The attribute name of the property.
     */
    [attribute: string]: any;
  };
}
export interface StreamLoaderSettings {
  assets: StreamedAsset[];
  geometries: StreamedGeometries;
}
export interface IInputStream {
  tempFilePath: string;
  name: string;
  modelId: string;
  projectId: string;
  userId: string;
}
/**
 *
 */
export interface IIfcTree {
  type: string;
  expressID: number;
  children: IIfcTree[];
}
