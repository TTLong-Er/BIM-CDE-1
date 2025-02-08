import * as THREE from "three";
import {readPixelsAsync} from "./screen-culler-helper";
import * as FRAGS from "@thatopen/fragments";
import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import axios from "axios";

import {
  IAddFragments,
  ICameraData,
  ICullingUpdate,
  ILoadModel,
  IOffScreenCanvasConfig,
} from "./types";

import {StreamSerializer} from "@bim/src/streamed-geometries";

type NextColor = {r: number; g: number; b: number; code: string};
type CullerBoundingBox = {
  modelIndex: number;
  geometryID: number;
  assetIDs: Set<number>;
  exists: boolean;
  time: number;
  hidden: boolean;
  fragment?: FRAGS.Fragment;
};
export class OffScreen {
  private readonly renderTarget!: THREE.WebGLRenderTarget;
  private baseCoordinationMatrix = new THREE.Matrix4();

  private readonly scene = new THREE.Scene();
  private readonly buffer!: Uint8Array;

  private readonly rtWidth = 512;

  private readonly rtHeight = 512;

  private renderer!: THREE.WebGLRenderer;

  private camera!: THREE.PerspectiveCamera;

  private renderDebug = true;

  private cameraData!: ICameraData;

  private threshold = 50;

  private maxLostTime = 30000;

  private maxHiddenTime = 5000;

  private boxes = new Map<number, FRAGS.Fragment>();

  private readonly _geometry!: THREE.BufferGeometry;

  private _material = new THREE.MeshBasicMaterial({
    transparent: true,
    side: 2,
    opacity: 1,
  });

  private _modelIDIndex = new Map<string, number>();
  private _indexModelID = new Map<number, string>();
  private _nextModelID = 0;

  private _geometries = new Map<string, CullerBoundingBox>();
  private _geometriesGroups = new Map<number, THREE.Group>();
  private _geometriesInMemory = new Set<string>();
  private _geometryInstances: {
    [modelID: string]: OBF.StreamedInstances;
  } = {};
  /**
   * The data of the streamed models. It defines the geometries, their instances, its bounding box (OBB) and the assets to which they belong.
   */
  private models: {
    [modelID: string]: {
      assets: OBC.StreamedAsset[];
      geometries: OBC.StreamedGeometries;
      keyFragments: Map<number, string>;

      geometryIDs: {
        opaque: Map<number, number>;
        transparent: Map<number, number>;
      };
    };
  } = {};

  private codes = new Map<number, Map<number, string>>();

  /**
   * Importer of binary IFC data previously converted to fragment tiles.
   */
  private serializer = new StreamSerializer();

  private _ramCache = new Map<
    string,
    Map<
      number,
      {
        position: Float32Array;
        index: Uint32Array;
      }
    >
  >();

  private listFragments = new Set<string>();
  /**
   *
   */
  constructor(
    private config: IOffScreenCanvasConfig,
    private onUpdateCuller: (payload: ICullingUpdate) => void,
    private onAddFragments: (payload: IAddFragments) => void
  ) {
    const {canvas, width, height, pixelRatio} = this.config;

    (canvas as OffscreenCanvas).width = width;

    (canvas as OffscreenCanvas).height = height;
    //@ts-ignore
    if (!canvas.style) canvas.style = {};
    //@ts-ignore
    canvas.style.width = width;
    //@ts-ignore
    canvas.style.height = height;

    this.renderTarget = new THREE.WebGLRenderTarget(
      this.rtWidth,
      this.rtHeight
    );

    const bufferSize = this.rtWidth * this.rtHeight * 4;

    this.buffer = new Uint8Array(bufferSize);

    this.camera = this.initPerspectiveCamera(width / height);

    this.renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      context: canvas.getContext("webgl2")!,
    });

    this.renderer.setSize(width, height);

    this.renderer.setPixelRatio(pixelRatio);

    // this.scene.add(new THREE.AxesHelper(5));
    this._geometry = new THREE.BoxGeometry(1, 1, 1);
    this._geometry.groups = [];
    this._geometry.deleteAttribute("uv");
    const position = this._geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < position.length; i++) {
      position[i] += 0.5;
    }
    this._geometry.attributes.position.needsUpdate = true;
    this.gameLoop();
  }
  /**
   *
   * @param aspect
   * @returns
   */
  private initPerspectiveCamera(aspect: number): THREE.PerspectiveCamera {
    const camera = new THREE.PerspectiveCamera(45, aspect, 1, 10000);
    camera.position.copy(new THREE.Vector3(30, 30, 30));
    camera.lookAt(0, 0, 0);
    return camera;
  }
  /**
   *
   * @param payload
   */
  onLoadModel = async (payload: ILoadModel) => {
    const {assets, geometries, matrix, keyFragments, geometryIDs, serverUrl} =
      payload;

    const modelIndex = this.createModelIndex(serverUrl);

    const colorEnabled = THREE.ColorManagement.enabled;
    THREE.ColorManagement.enabled = false;

    const visitedGeometries = new Map<number, NextColor>();

    const tempMatrix = new THREE.Matrix4();

    const bboxes = new FRAGS.Fragment(this._geometry, this._material, 10);
    this.boxes.set(modelIndex, bboxes);
    this.scene.add(bboxes.mesh);

    const fragmentsGroup = new THREE.Group();
    this.scene.add(fragmentsGroup);
    this._geometriesGroups.set(modelIndex, fragmentsGroup);

    const items = new Map<
      number,
      FRAGS.Item & {geometryColors: THREE.Color[]}
    >();

    this.models[serverUrl] = {assets, geometries, keyFragments, geometryIDs};

    const instances: OBF.StreamedInstances = new Map();

    for (const asset of assets) {
      // if (asset.id !== 9056429) continue;
      const id = asset.id;
      for (const geometryData of asset.geometries) {
        const {geometryID, transformation, color} = geometryData;

        if (!instances.has(geometryID)) {
          instances.set(geometryID, []);
        }
        const current = instances.get(geometryID);
        if (!current) {
          throw new Error("Malformed instances");
        }
        current.push({id, transformation, color});

        const geometryColor = new THREE.Color();
        geometryColor.setRGB(color[0], color[1], color[2], "srgb");

        const instanceID = this.getInstanceID(asset.id, geometryID);

        const geometry = geometries[geometryID];
        if (!geometry) {
          console.log(`Geometry not found: ${geometryID}`);
          continue;
        }

        const {boundingBox} = geometry;

        // Get bounding box color

        let nextColor: NextColor;
        if (visitedGeometries.has(geometryID)) {
          nextColor = visitedGeometries.get(geometryID) as NextColor;
        } else {
          nextColor = this.getAvailableColor();
          this.increaseColor();
          visitedGeometries.set(geometryID, nextColor);
        }
        const {r, g, b, code} = nextColor;
        const threeColor = new THREE.Color();
        threeColor.setRGB(r / 255, g / 255, b / 255, "srgb");

        // Save color code by model and geometry

        if (!this.codes.has(modelIndex)) {
          this.codes.set(modelIndex, new Map());
        }
        const map = this.codes.get(modelIndex) as Map<number, string>;
        map.set(geometryID, code);

        // Get bounding box transform

        const instanceMatrix = new THREE.Matrix4();
        const boundingBoxArray = Object.values(boundingBox);
        instanceMatrix.fromArray(transformation);
        tempMatrix.fromArray(boundingBoxArray);
        instanceMatrix.multiply(tempMatrix);

        if (items.has(instanceID)) {
          // This geometry exists multiple times in this asset
          const item = items.get(instanceID);
          if (item === undefined || !item.colors) {
            throw new Error("Malformed item!");
          }
          item.colors.push(threeColor);
          item.geometryColors.push(geometryColor);
          item.transforms.push(instanceMatrix);
        } else {
          // This geometry exists only once in this asset (for now)
          items.set(instanceID, {
            id: instanceID,
            colors: [threeColor],
            geometryColors: [geometryColor],
            transforms: [instanceMatrix],
          });
        }

        if (!this._geometries.has(code)) {
          const assetIDs = new Set([asset.id]);
          this._geometries.set(code, {
            modelIndex,
            geometryID,
            assetIDs,
            exists: false,
            hidden: false,
            time: 0,
          });
        } else {
          const box = this._geometries.get(code) as CullerBoundingBox;
          box.assetIDs.add(asset.id);
        }
      }
    }

    const itemsArray = Array.from(items.values());
    bboxes.add(itemsArray);

    const transform = new THREE.Matrix4().fromArray(matrix);

    bboxes.mesh.position.set(0, 0, 0);
    bboxes.mesh.rotation.set(0, 0, 0);
    bboxes.mesh.scale.set(1, 1, 1);
    bboxes.mesh.applyMatrix4(transform);

    fragmentsGroup.position.set(0, 0, 0);
    fragmentsGroup.rotation.set(0, 0, 0);
    fragmentsGroup.scale.set(1, 1, 1);
    fragmentsGroup.applyMatrix4(transform);

    this._geometryInstances[serverUrl] = instances;

    if (this.cameraData) await this.updateCamera(this.cameraData);

    THREE.ColorManagement.enabled = colorEnabled;
  };
  /**
   *
   * @param cameraData
   */
  async updateCamera(cameraData: ICameraData) {
    this.cameraData = cameraData;

    const {quaternion, position, width, height} = cameraData;

    this.camera.quaternion.fromArray(quaternion);

    this.camera.position.fromArray(position);

    this.camera.updateProjectionMatrix();

    this.renderDebug = false;

    this.renderer.setSize(width, height);

    this.renderer.setRenderTarget(this.renderTarget);

    this.renderer.render(this.scene, this.camera);

    const context = this.renderer.getContext() as WebGL2RenderingContext;

    await readPixelsAsync(
      context,
      0,
      0,
      this.rtWidth,
      this.rtHeight,
      context.RGBA,
      context.UNSIGNED_BYTE,
      this.buffer
    );

    this.renderDebug = true;

    this.renderer.setRenderTarget(null);

    const buffer = this.buffer;

    const colors = new Map<string, number>();

    let viewWasUpdated = false;
    // We can only lose geometries that were previously found
    const lostGeometries = new Set(this._geometriesInMemory);

    const now = performance.now();
    const toLoad: {[modelID: string]: Map<number, Set<number>>} = {};
    const toHide: {[modelID: string]: Set<number>} = {};
    const toShow: {[modelID: string]: Set<number>} = {};

    for (let i = 0; i < buffer.length; i += 4) {
      const r = buffer[i];
      const g = buffer[i + 1];
      const b = buffer[i + 2];
      const code = "" + r + "-" + g + "-" + b;
      if (colors.has(code)) {
        colors.set(code, colors.get(code)! + 1);
      } else {
        colors.set(code, 1);
      }

      const pixel = colors.get(code);

      if (!pixel) continue;

      const isGeometryBigEnough = pixel > this.threshold;

      if (!isGeometryBigEnough) {
        continue;
      }
      const geometry = this._geometries.get(code);
      if (!geometry) {
        continue;
      }

      // The geometry is big enough to be considered seen, so remove it
      // from the geometries to be considered lost
      lostGeometries.delete(code);

      const {exists} = geometry;

      const modelID = this._indexModelID.get(geometry.modelIndex) as string;
      if (exists) {
        // Geometry was present in memory, and still is, so show it
        geometry.time = now;

        if (!toShow[modelID]) {
          toShow[modelID] = new Set();
        }

        toShow[modelID].add(geometry.geometryID);

        viewWasUpdated = true;
      } else {
        // New geometry found that is not in memory
        if (!toLoad[modelID]) {
          toLoad[modelID] = new Map();
        }

        geometry.time = now;

        geometry.exists = true;

        if (!toLoad[modelID].has(pixel)) {
          toLoad[modelID].set(pixel, new Set());
        }

        const set = toLoad[modelID].get(pixel) as Set<number>;

        set.add(geometry.geometryID);

        viewWasUpdated = true;
      }
      this._geometriesInMemory.add(code);
    }

    await this.loadFoundGeometries(toLoad);

    // Handle geometries that were lost
    for (const color of lostGeometries) {
      const geometry = this._geometries.get(color);

      if (geometry) {
        this.handleLostGeometries(now, geometry, toHide);

        viewWasUpdated = true;
      }
    }

    if (viewWasUpdated) {
      this.onUpdateCuller({toHide, toShow});
    }
  }

  private handleLostGeometries(
    now: number,
    geometry: CullerBoundingBox,
    toHide: {[p: string]: Set<number>}
  ) {
    const modelID = this._indexModelID.get(geometry.modelIndex) as string;

    const lostTime = now - geometry.time;
    if (lostTime > this.maxLostTime) return;

    if (lostTime > this.maxHiddenTime) {
      // This geometry was lost for a while - hide it
      if (!toHide[modelID]) {
        toHide[modelID] = new Set();
      }
      toHide[modelID].add(geometry.geometryID);
    }
  }

  private async loadFoundGeometries(seen: {
    [modelID: string]: Map<number, Set<number>>;
  }) {
    for (const modelID in seen) {
      if (!this.models[modelID]) continue;
      const {geometries} = this.models[modelID];

      const files = new Map<string, number>();

      const allIDs = new Set<number>();

      for (const [priority, ids] of seen[modelID]) {
        for (const id of ids) {
          allIDs.add(id);
          const geometry = geometries[id];
          if (!geometry) {
            throw new Error("Geometry not found");
          }
          if (geometry.geometryFile) {
            const file = geometry.geometryFile;
            const value = files.get(file) || 0;
            files.set(file, value + priority);
          }
        }
      }

      const sortedFiles = Array.from(files)
        .sort((a, b) => b[1] - a[1])
        .map((file) => file[0]);

      await Promise.all(
        sortedFiles.map(async (file) => {
          await this.loadFragment(file, allIDs, modelID);
        })
      );
    }
  }
  /**
   *
   * @param geometryFile
   * @param serverUrl
   * @returns
   */
  private async getGeometryFile(geometryFile: string, serverUrl: string) {
    const url = `${serverUrl}/${geometryFile}`;
    const result = this._ramCache.get(url);
    if (result === undefined) {
      try {
        const res = await axios({
          url,
          method: "GET",
          responseType: "arraybuffer",
        });
        const bytes = new Uint8Array(res.data);
        const data = this.serializer.import(bytes);
        this._ramCache.set(url, data);
        return data;
      } catch (error) {
        return null;
      }
    }
    return result;
  }
  /**
   *
   * @param geometryFile
   * @param serverUrl
   * @returns
   */
  private async loadFragment(
    geometryFile: string,
    allIDs: Set<number>,
    serverUrl: string
  ) {
    const modelIndex = this._modelIDIndex.get(serverUrl);
    if (modelIndex === undefined) {
      throw new Error("Model not found!");
    }
    const group = this._geometriesGroups.get(modelIndex);

    if (group === undefined) return;

    const model = this.models[serverUrl];

    if (model === undefined) return;

    const {geometryIDs, keyFragments} = model;

    const results = await this.getGeometryFile(geometryFile, serverUrl);
    if (!results) return;

    this.onAddFragments({serverUrl, results, allIDs});

    for (const [geometryID, {position, index}] of results) {
      if (!allIDs.has(geometryID)) continue;

      if (
        !this._geometryInstances[serverUrl] ||
        !this._geometryInstances[serverUrl].has(geometryID)
      ) {
        continue;
      }

      const geoms = this._geometryInstances[serverUrl];
      const instances = geoms.get(geometryID);

      if (!instances) {
        throw new Error("Instances not found!");
      }

      const geom = new THREE.BufferGeometry();

      const posAttr = new THREE.BufferAttribute(position, 3);
      // const norAttr = new THREE.BufferAttribute(normal, 3);

      geom.setAttribute("position", posAttr);
      // geom.setAttribute("normal", norAttr);

      geom.setIndex(Array.from(index));
      geom.computeVertexNormals();
      // Separating opaque and transparent items is neccesary for Three.js
      const transp: OBF.StreamedInstance[] = [];
      const opaque: OBF.StreamedInstance[] = [];
      for (const instance of instances) {
        if (instance.color[3] === 1) {
          opaque.push(instance);
        } else {
          transp.push(instance);
        }
      }

      this.newFragment(
        group,
        geometryIDs,
        keyFragments,
        geometryID,
        serverUrl,
        geom,
        transp,
        true
      );
      this.newFragment(
        group,
        geometryIDs,
        keyFragments,
        geometryID,
        serverUrl,
        geom,
        opaque,
        false
      );
    }
    if (this.cameraData) await this.updateCamera(this.cameraData);
  }
  private newFragment(
    group: THREE.Group,
    geometryIDs: {
      opaque: Map<number, number>;
      transparent: Map<number, number>;
    },
    keyFragments: Map<number, string>,
    geometryID: number,
    serverUrl: string,
    geom: THREE.BufferGeometry,
    instances: OBF.StreamedInstance[],
    transparent: boolean
  ) {
    if (instances.length === 0) return;

    const uuidMap = transparent ? geometryIDs.transparent : geometryIDs.opaque;
    const factor = transparent ? -1 : 1;
    const tranpsGeomID = geometryID * factor;
    const key = uuidMap.get(tranpsGeomID);

    if (key === undefined) {
      // throw new Error("Malformed fragment!");
      return;
    }
    const fragID = keyFragments.get(key);
    if (fragID === undefined) {
      // throw new Error("Malformed fragment!");
      return;
    }

    if (this.listFragments.has(fragID)) return;

    this.listFragments.add(fragID);

    const colorEnabled = THREE.ColorManagement.enabled;
    THREE.ColorManagement.enabled = false;

    const modelIndex = this._modelIDIndex.get(serverUrl) as number;

    const map = this.codes.get(modelIndex) as Map<number, string>;
    const code = map.get(geometryID) as string;
    const geometry = this._geometries.get(code) as CullerBoundingBox;
    this.setGeometryVisibility(geometry, false, false);

    if (!geometry.fragment) {
      geometry.fragment = new FRAGS.Fragment(
        geom,
        this._material,
        instances.length
      );

      group.add(geometry.fragment.mesh);
    }
    const itemsMap = new Map<number, FRAGS.Item>();
    const [r, g, b] = code.split("-").map((value) => parseInt(value, 10));

    for (let i = 0; i < instances.length; i++) {
      const transform = new THREE.Matrix4();
      const col = new THREE.Color();
      const {id, transformation, color} = instances[i];
      transform.fromArray(transformation);
      col.setRGB(r / 255, g / 255, b / 255, "srgb");
      if (itemsMap.has(id)) {
        const item = itemsMap.get(id)!;
        if (!item) continue;
        item.transforms.push(transform);
        if (item.colors) {
          item.colors.push(col);
        }
      } else {
        itemsMap.set(id, {id, colors: [col], transforms: [transform]});
      }
    }

    const items = Array.from(itemsMap.values());
    geometry.fragment.add(items);

    THREE.ColorManagement.enabled = colorEnabled;
  }
  /**
   *
   * @param geometry
   * @param visible
   * @param includeFragments
   * @param assets
   */
  private setGeometryVisibility(
    geometry: CullerBoundingBox,
    visible: boolean,
    includeFragments: boolean,
    assets?: Iterable<number>
  ) {
    const {modelIndex, geometryID, assetIDs} = geometry;
    const bbox = this.boxes.get(modelIndex);
    if (bbox === undefined) {
      throw new Error("Model not found!");
    }
    const items = assets || assetIDs;

    if (includeFragments && geometry.fragment) {
      geometry.fragment.setVisibility(visible, items);
    } else {
      const instancesID = new Set<number>();
      for (const id of items) {
        const instanceID = this.getInstanceID(id, geometryID);
        instancesID.add(instanceID);
      }
      bbox.setVisibility(visible, instancesID);
    }
  }
  private createModelIndex(modelID: string) {
    if (this._modelIDIndex.has(modelID)) {
      throw new Error("Can't load the same model twice!");
    }
    const count = this._nextModelID;
    this._nextModelID++;
    this._modelIDIndex.set(modelID, count);
    this._indexModelID.set(count, modelID);
    return count;
  }

  private getInstanceID(assetID: number, geometryID: number) {
    // src: https://stackoverflow.com/questions/14879691/get-number-of-digits-with-javascript
    // eslint-disable-next-line no-bitwise
    const size = (Math.log(geometryID) * Math.LOG10E + 1) | 0;
    const factor = 10 ** size;
    return assetID + geometryID / factor;
  }

  private _availableColor = 1;

  protected getAvailableColor() {
    // src: https://stackoverflow.com/a/67579485

    let bigOne = BigInt(this._availableColor.toString());
    const colorArray: number[] = [];
    do {
      colorArray.unshift(Number(bigOne % 256n));
      bigOne /= 256n;
    } while (bigOne);

    while (colorArray.length !== 3) {
      colorArray.unshift(0);
    }

    const [r, g, b] = colorArray;
    const code = `${r}-${g}-${b}`;

    return {r, g, b, code} as NextColor;
  }
  /**
   *
   * @returns
   */
  protected increaseColor() {
    if (this._availableColor === 256 * 256 * 256) {
      console.warn("Color can't be increased over 256 x 256 x 256!");
      return;
    }
    this._availableColor++;
  }
  /**
   *
   * @returns
   */
  protected decreaseColor() {
    if (this._availableColor === 1) {
      console.warn("Color can't be decreased under 0!");
      return;
    }
    this._availableColor--;
  }

  private gameLoop = () => {
    if (this.renderDebug) {
      this.camera.updateProjectionMatrix();
      this.renderer.render(this.scene, this.camera);
    }
    requestAnimationFrame(this.gameLoop);
  };
}
