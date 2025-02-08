import * as OBC from "@thatopen/components";
/**
 *
 */
export interface IOffScreenCanvasConfig {
  canvas: OffscreenCanvas | any;
  width: number;
  height: number;
  pixelRatio: number;
}
/**
 *
 */
export interface ICameraData {
  position: number[];
  quaternion: number[];
  width: number;
  height: number;
}
/**
 *
 */
export interface ICullingUpdate {
  toHide: {[modelID: string]: Set<number>};
  toShow: {[modelID: string]: Set<number>};
}
/**
 *
 */
export interface ILoadModel {
  serverUrl: string;

  matrix: number[];
  /**
   * Array of streamed assets.
   */
  assets: OBC.StreamedAsset[];
  /**
   * Streamed geometries.
   */
  geometries: OBC.StreamedGeometries;

  keyFragments: Map<number, string>;

  geometryIDs: {
    opaque: Map<number, number>;
    transparent: Map<number, number>;
  };
}
/**
 *
 */
export interface IAddFragments {
  results: Map<
    number,
    {
      position: Float32Array;
      index: Uint32Array;
    }
  >;
  serverUrl: string;
  allIDs: Set<number>;
}
/**
 *
 */
export type IWorkerAction =
  | "onInit"
  | "onError"
  | "onLoadModel"
  | "onUpdateCamera"
  | "onUpdateCuller"
  | "onAddFragments";
/**
 *
 */
export type IWorkerPayLoad =
  | IOffScreenCanvasConfig
  | any
  | ICameraData
  | ICullingUpdate
  | IAddFragments
  | ILoadModel;

/**
 *
 */
export interface IStreamerWorker {
  action: IWorkerAction;
  payload: IWorkerPayLoad;
}
