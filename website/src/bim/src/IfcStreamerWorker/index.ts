import * as THREE from "three";
import * as FRAG from "@thatopen/fragments";
import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import {StreamPropertiesSettings} from "../IfcStreamerComponent";
import {
  IAddFragments,
  ICameraData,
  ICullingUpdate,
  ILoadModel,
  IOffScreenCanvasConfig,
  IStreamerWorker,
} from "./src";

export * from "./src";

/**
 * The IfcStreamer component is responsible for managing and streaming tiled IFC data. It provides methods for loading, removing, and managing IFC models, as well as handling visibility and caching. 📕 [Tutorial](https://docs.thatopen.com/Tutorials/Components/Front/IfcStreamer). 📘 [API](https://docs.thatopen.com/api/@thatopen/components-front/classes/IfcStreamer).
 */
export class IfcStreamerWorker extends OBC.Component implements OBC.Disposable {
  /**
   * A unique identifier for the component.
   * This UUID is used to register the component within the Components system.
   */
  static readonly uuid = "180928d1-2c6e-48ed-bdb3-4353deac99d3" as const;
  private static width = 500;
  private static height = 500;
  /** {@link OBC.Component.enabled} */
  enabled = true;

  /**
   * Event triggered when fragments are deleted.
   */
  readonly onFragmentsDeleted = new OBC.Event<FRAG.Fragment[]>();

  /**
   * Event triggered when fragments are loaded.
   */
  readonly onFragmentsLoaded = new OBC.Event<FRAG.Fragment[]>();

  /** {@link OBC.Disposable.onDisposed} */
  readonly onDisposed = new OBC.Event();

  private _isDisposing = false;

  /**
   * The data of the streamed models. It defines the geometries, their instances, its bounding box (OBB) and the assets to which they belong.
   */
  models: {
    [modelID: string]: {
      assets: OBC.StreamedAsset[];
      geometries: OBC.StreamedGeometries;
    };
  } = {};

  private _geometryInstances: {
    [modelID: string]: OBF.StreamedInstances;
  } = {};

  private _loadedFragments: {
    [modelID: string]: {[geometryID: number]: FRAG.Fragment[]};
  } = {};

  private fragIDData = new Map<
    string,
    [FRAG.FragmentsGroup, number, Set<number>]
  >();

  private _baseMaterial = new THREE.MeshLambertMaterial();

  private _baseMaterialT = new THREE.MeshLambertMaterial({
    transparent: true,
    opacity: 0.5,
  });

  fromServer = false;

  private worker!: Worker;
  dockingPanel!: HTMLDivElement;
  private canvas!: HTMLCanvasElement;

  private _world: OBC.World | null = null;
  /**
   * The world in which the fragments will be displayed.
   * It must be set before using the streaming service.
   * If not set, an error will be thrown when trying to access the world.
   */
  get world() {
    if (!this._world) {
      throw new Error("You must set a world before using the streamer!");
    }
    return this._world;
  }
  /**
   * Sets the world in which the fragments will be displayed.
   * @param world - The new world to be set.
   */
  set world(world: OBC.World) {
    this._world = world;
    this.disposeWorker();
    this.initWorker();
    this.setupEvent = false;
    this.setupEvent = true;
  }

  set setupEvent(enabled: boolean) {
    if (!this._world) return;
    if (!this._world.camera) return;
    const camera = this._world.camera;
    if (!camera.hasCameraControls()) return;
    const controls = camera.controls;
    if (enabled) {
      controls.addEventListener("controlstart", this.updateCuller);
      controls.addEventListener("controlend", this.updateCuller);
      controls.addEventListener("wake", this.updateCuller);
      controls.addEventListener("sleep", this.updateCuller);
      controls.addEventListener("rest", this.updateCuller);
    } else {
      controls.removeEventListener("controlstart", this.updateCuller);
      controls.removeEventListener("controlend", this.updateCuller);
      controls.removeEventListener("wake", this.updateCuller);
      controls.removeEventListener("sleep", this.updateCuller);
      controls.removeEventListener("rest", this.updateCuller);
    }
  }
  /**
   *
   */
  get cameraData(): ICameraData | null {
    try {
      if (!this.world) return null;
      const camera = this.world.camera;
      if (!camera) return null;

      const {quaternion, position} = camera.three;
      return {
        position: position.toArray(),
        quaternion: quaternion.toArray(),
        width: IfcStreamerWorker.width,
        height: IfcStreamerWorker.height,
      };
    } catch (error) {
      return null;
    }
  }

  get groups() {
    const fragments = this.components.get(OBC.FragmentsManager);
    if (!fragments) return [];
    return Array.from(fragments.groups.values());
  }

  private updateCuller = async () => {
    const payload = this.cameraData;
    if (this.worker && payload) {
      this.worker.postMessage({
        action: "onUpdateCamera",
        payload,
      } as IStreamerWorker);
    }
    if (this.world) {
      const shadow = this.world.scene as OBC.ShadowedScene;
      await shadow.updateShadows();
    }
  };
  /**
   *
   * @param components
   */
  constructor(components: OBC.Components) {
    super(components);
    this.components.add(IfcStreamerWorker.uuid, this);
  }
  dispose() {
    this._isDisposing = true;
    this.onFragmentsLoaded.reset();
    this.onFragmentsDeleted.reset();
    this.fromServer = false;

    this.disposeWorker();

    this.onDisposed.trigger(IfcStreamerWorker.uuid);
    this.onDisposed.reset();
    this._isDisposing = false;
  }

  private async loadFoundGeometries(
    group: FRAG.FragmentsGroup,
    results: Map<
      number,
      {
        position: Float32Array;
        index: Uint32Array;
      }
    >,
    serverUrl: string,
    allIDs: Set<number>
  ) {
    const loaded: FRAG.Fragment[] = [];
    for (const [geometryID, {position, index}] of results) {
      if (this._isDisposing) return;

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

      this.newFragment(group, geometryID, geom, transp, true, loaded);
      this.newFragment(group, geometryID, geom, opaque, false, loaded);
    }

    if (loaded.length && !this._isDisposing) {
      this.onFragmentsLoaded.trigger(loaded);
    }
  }

  private newFragment(
    group: FRAG.FragmentsGroup,
    geometryID: number,
    geometry: THREE.BufferGeometry,
    instances: OBF.StreamedInstance[],
    transparent: boolean,
    result: FRAG.Fragment[]
  ) {
    if (instances.length === 0) return;
    if (this._isDisposing) return;

    const serverUrl = group.userData.serverUrl;
    if (!serverUrl) return;

    const uuids = group.geometryIDs;
    const uuidMap = transparent ? uuids.transparent : uuids.opaque;
    const factor = transparent ? -1 : 1;
    const tranpsGeomID = geometryID * factor;
    const key = uuidMap.get(tranpsGeomID);

    if (key === undefined) {
      // throw new Error("Malformed fragment!");
      return;
    }
    const fragID = group.keyFragments.get(key);
    if (fragID === undefined) {
      // throw new Error("Malformed fragment!");
      return;
    }

    const fragments = this.components.get(OBC.FragmentsManager);
    const fragmentAlreadyExists = fragments.list.has(fragID);
    if (fragmentAlreadyExists) {
      return;
    }

    const material = transparent ? this._baseMaterialT : this._baseMaterial;
    const fragment = new FRAG.Fragment(geometry, material, instances.length);

    fragment.id = fragID;
    fragment.mesh.uuid = fragID;

    fragment.group = group;
    group.add(fragment.mesh);
    group.items.push(fragment);

    fragments.list.set(fragment.id, fragment);
    this.world.meshes.add(fragment.mesh);

    if (!this._loadedFragments[serverUrl]) {
      this._loadedFragments[serverUrl] = {};
    }
    const geoms = this._loadedFragments[serverUrl];
    if (!geoms[geometryID]) {
      geoms[geometryID] = [];
    }

    geoms[geometryID].push(fragment);

    const itemsMap = new Map<number, FRAG.Item>();
    for (let i = 0; i < instances.length; i++) {
      const transform = new THREE.Matrix4();
      const col = new THREE.Color();
      const {id, transformation, color} = instances[i];
      transform.fromArray(transformation);
      const [r, g, b] = color;
      col.setRGB(r, g, b, "srgb");
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
    fragment.add(items);

    const data = this.fragIDData.get(fragment.id);
    if (!data) {
      throw new Error("Fragment data not found!");
    }

    const hiddenItems = data[2];
    if (hiddenItems.size) {
      fragment.setVisibility(false, hiddenItems);
    }

    result.push(fragment);
  }

  private setMeshVisibility(
    filter: {[modelID: string]: Set<number>},
    visible: boolean
  ) {
    for (const modelID in filter) {
      for (const geometryID of filter[modelID]) {
        const geometries = this._loadedFragments[modelID];
        if (!geometries) continue;
        const frags = geometries[geometryID];
        if (!frags) continue;
        for (const frag of frags) {
          frag.mesh.visible = visible;
        }
      }
    }
  }
  /**
   *
   */
  private handlerMap = {
    onUpdateCuller: (payload: ICullingUpdate) => {
      const {toHide, toShow} = payload;
      this.setMeshVisibility(toShow, true);
      this.setMeshVisibility(toHide, false);
    },
    onAddFragments: (payload: IAddFragments) => {
      const {serverUrl, results, allIDs} = payload;
      const group = this.groups.find(
        (g) => g.userData.serverUrl && g.userData.serverUrl === serverUrl
      );
      if (group === undefined) return;
      this.loadFoundGeometries(group, results, serverUrl, allIDs);
    },
  };
  /**
   *
   */
  private initWorker() {
    this.canvas = document.createElement("canvas");

    const pixelRatio = 1;
    this.canvas.width = IfcStreamerWorker.width;
    this.canvas.height = IfcStreamerWorker.height;
    this.canvas.style.width = `${IfcStreamerWorker.width}px`;
    this.canvas.style.height = `${IfcStreamerWorker.height}px`;
    const canvas = this.canvas.transferControlToOffscreen();

    this.dockingPanel = document.createElement("div");
    this.dockingPanel.className = "absolute top-3 left-3 z-10 bg-black p-2";
    this.dockingPanel.appendChild(this.canvas);

    this.worker = new Worker(
      new URL("./src/StreamerWorker.ts", import.meta.url),
      {type: "module", credentials: "include"}
    );

    this.worker.postMessage(
      {
        action: "onInit",
        payload: {
          canvas,
          width: IfcStreamerWorker.width,
          height: IfcStreamerWorker.width,
          pixelRatio,
        } as IOffScreenCanvasConfig,
      } as IStreamerWorker,
      [canvas]
    );

    this.worker.addEventListener("message", (event: MessageEvent) => {
      const {action, payload} = event.data as IStreamerWorker;
      if (action === "onError") return;
      const handler = this.handlerMap[action as keyof typeof this.handlerMap];
      if (handler) handler(payload);
    });
  }
  /**
   *
   */
  private disposeWorker() {
    this.canvas?.remove();
    (this.canvas as any) = null;
    this.dockingPanel?.remove();
    (this.dockingPanel as any) = null;
    this.worker?.terminate();
    (this.worker as any) = null;
  }
  /**
   * Loads a new fragment group into the scene using streaming.
   *
   * @param settings - The settings for the new fragment group.
   * @param coordinate - Whether to federate this model with the rest.
   * @param properties - Optional properties for the new fragment group.
   * @returns The newly loaded fragment group.
   */
  async loadFromServer(
    settings: OBF.StreamLoaderSettings,
    groupBuffer: Uint8Array,
    coordinate: boolean,
    serverUrl: string,
    baseUrl: string,
    properties?: StreamPropertiesSettings
  ) {
    if (!this.worker) throw new Error("worker was not initialized");

    const {assets, geometries} = settings;
    const fragments = this.components.get(OBC.FragmentsManager);
    const group = fragments.load(groupBuffer, {coordinate});
    group.userData.serverUrl = serverUrl;
    this.world.scene.three.add(group);
    const {opaque, transparent} = group.geometryIDs;
    for (const [geometryID, key] of opaque) {
      const fragID = group.keyFragments.get(key);
      if (fragID === undefined) {
        throw new Error("Malformed fragments group!");
      }
      this.fragIDData.set(fragID, [group, geometryID, new Set()]);
    }
    for (const [geometryID, key] of transparent) {
      const fragID = group.keyFragments.get(key);
      if (fragID === undefined) {
        throw new Error("Malformed fragments group!");
      }
      this.fragIDData.set(fragID, [group, Math.abs(geometryID), new Set()]);
    }

    this.worker.postMessage({
      action: "onLoadModel",
      payload: {
        matrix: group.matrixWorld.elements,
        assets,
        geometries,
        serverUrl,
        keyFragments: group.keyFragments,
        geometryIDs: group.geometryIDs,
      } as ILoadModel,
    } as IStreamerWorker);

    this.models[serverUrl] = {assets, geometries};
    const instances: OBF.StreamedInstances = new Map();

    for (const asset of assets) {
      const id = asset.id;
      for (const {transformation, geometryID, color} of asset.geometries) {
        if (!instances.has(geometryID)) {
          instances.set(geometryID, []);
        }
        const current = instances.get(geometryID);
        if (!current) {
          throw new Error("Malformed instances");
        }
        current.push({id, transformation, color});
      }
    }

    this._geometryInstances[serverUrl] = instances;

    if (properties) {
      const ids = new Map<number, number>();
      const types = new Map<number, number[]>();

      for (const id in properties.ids) {
        ids.set(+id, properties.ids[id]);
      }

      for (const type in properties.types) {
        types.set(+type, properties.types[type]);
      }

      group.streamSettings = {
        ids,
        types,
        baseFileName: properties.indexesFile,
        baseUrl,
      };
      const {relationsMap} = properties;
      const indexer = this.components.get(OBC.IfcRelationsIndexer);
      indexer.setRelationMap(group, relationsMap);
    }

    return group;
  }
}
