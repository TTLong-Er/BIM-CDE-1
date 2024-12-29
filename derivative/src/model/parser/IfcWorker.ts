import {parentPort} from "worker_threads";
import * as WEBIFC from "web-ifc";
import {LogLevel} from "web-ifc";

import {
  IAssetStreamed,
  IGeometryStreamed,
  IWorkerAction,
  StreamedAsset,
  StreamedProperties,
  StreamedGeometries,
  IInputStream,
} from "./types";
import {IfcPropertiesTiler} from "./IfcPropertiesTiler";
import {IfcGeometryTiler} from "./IfcGeometryTiler";
import {IfcGeometryJson} from "./IfcGeometryJson";

const wasm = {
  path: "./",
  absolute: false,
  LogLevel: LogLevel.LOG_LEVEL_OFF,
};

const setting: WEBIFC.LoaderSettings = {
  COORDINATE_TO_ORIGIN: true,
  //@ts-ignore
  OPTIMIZE_PROFILES: true,
} as const;

// streamer geometry

const onError = (input: IInputStream, payload: string) => {
  parentPort?.postMessage({
    action: "onError",
    input,
    payload,
  } as IWorkerAction);
};

parentPort?.on("message", async (data: IWorkerAction) => {
  const {action, payload, input} = data;
  if (action !== "onLoad") return;
  try {
    const webIfc = new WEBIFC.IfcAPI();
    const {path, absolute, LogLevel} = wasm;

    webIfc.SetWasmPath(path, absolute);

    await webIfc.Init();
    webIfc.SetLogLevel(LogLevel);
    webIfc.OpenModel(payload as Uint8Array, setting);

    const {modelId} = input;

    const modelTree = await new IfcGeometryJson(webIfc).streamFromBuffer();

    const assets: StreamedAsset[] = [];
    const geometries: StreamedGeometries = {};
    let groupBuffer: Uint8Array | null = null;

    const streamedGeometryFiles: {[fileName: string]: Uint8Array} = {};

    const jsonFile: StreamedProperties = {
      types: {},
      ids: {},
      indexesFile: `properties`,
    };

    const propertyStorageFiles: {
      name: string;
      bits: any;
    }[] = [];

    const propertyServerData: {
      modelId: string;
      name: string;
      data: {[id: number]: any};
    }[] = [];
    let propertyCount = 0;
    let geometryFilesCount = 0;

    const onSuccess = async () => {
      if (
        propertyStorageFiles.length === 0 ||
        propertyServerData.length === 0 ||
        assets.length === 0 ||
        Object.keys(geometries).length === 0 ||
        Object.keys(streamedGeometryFiles).length === 0 ||
        groupBuffer === null
      )
        return;

      parentPort?.postMessage({
        action: "onSuccess",
        input,
        payload: {
          propertyStorageFiles,
          propertyServerData,
          assets,
          geometries,
          groupBuffer,
          streamedGeometryFiles,
          modelTree,
        },
      } as IWorkerAction);
      webIfc.CloseModel(0);
      webIfc.Dispose();
    };

    // streamer geometry
    const onAssetStreamed = (payload: IAssetStreamed) => {
      for (const asset of payload) {
        assets.push(asset);
      }
    };
    const onGeometryStreamed = (payload: IGeometryStreamed) => {
      const {data, buffer} = payload;

      const geometryFile = `geometries-${geometryFilesCount}.frag`;

      for (const id in data) {
        if (!geometries[id]) geometries[id] = {...data[id], geometryFile};
      }

      if (!streamedGeometryFiles[geometryFile])
        streamedGeometryFiles[geometryFile] = buffer;

      geometryFilesCount++;
    };
    const onIfcLoaded = (payload: Uint8Array) => {
      groupBuffer = payload;
      onSuccess();
    };
    // streamer property
    const onIndicesStreamed = (payload: string) => {
      propertyStorageFiles.push({
        name: `properties.json`,
        bits: jsonFile,
      });
      propertyStorageFiles.push({
        name: `properties-indexes.json`,
        bits: payload,
      });
      onSuccess();
    };
    const onPropertiesStreamed = (payload: {
      type: number;
      data: {[id: number]: any};
    }) => {
      const {type, data} = payload;

      if (!jsonFile.types[type]) jsonFile.types[type] = [];
      jsonFile.types[type].push(propertyCount);

      for (const id in data) {
        jsonFile.ids[id] = propertyCount;
      }
      const name = `properties-${propertyCount}`;

      propertyServerData.push({
        data,
        name,
        modelId,
      });
      propertyCount++;
    };

    const ifcGeometryTiler = new IfcGeometryTiler(
      webIfc,
      onAssetStreamed,
      onGeometryStreamed,
      onIfcLoaded,
      (message: string) => {
        onError(input, message);
      }
    );
    ifcGeometryTiler.settings.minGeometrySize = 50;
    ifcGeometryTiler.settings.minAssetsSize = 1000;

    const ifcPropertiesTiler = new IfcPropertiesTiler(
      webIfc,
      onIndicesStreamed,
      onPropertiesStreamed,
      (message: string) => {
        onError(input, message);
      }
    );
    ifcPropertiesTiler.settings.propertiesSize = 100;
    await ifcPropertiesTiler.streamFromBuffer();
    await ifcGeometryTiler.streamFromBuffer();
  } catch (error: any) {
    onError(input, error.message as string);
  }
});
