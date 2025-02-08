import {parentPort} from "worker_threads";
import * as WEBIFC from "web-ifc";
import {LogLevel} from "web-ifc";
import * as pako from "pako";
import axios, {AxiosResponse} from "axios";
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
import {awsClient, uploadLarge, uploadSmall} from "../../config/AWS3";
import env from "../../config/env";

const SERVER_TILES_API = env.SERVER_TILES_API;
const PROPERTY_API = env.PROPERTY_API;

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
/**
 *
 * @param token
 * @param data
 * @returns
 */
const createModel = async (data: {
  projectId: string;
  modelId: string;
  name: string;
  userId: string;
}): Promise<AxiosResponse<any>> => {
  return await axios({
    url: `${SERVER_TILES_API}/v1/models`,
    method: "POST",
    responseType: "json",
    data,
  });
};
/**
 *
 * @param token
 * @param data
 * @returns
 */
const storageServerProperty = async (
  data: {
    modelId: string;
    name: string;
    data: {[id: number]: any};
  }[]
): Promise<AxiosResponse<any>> => {
  return await axios({
    url: `${PROPERTY_API}/v1/models`,
    method: "POST",
    responseType: "json",
    data,
  });
};

/**
 *
 * @param token
 * @param data
 * @returns
 */
const updateModel = async (
  data: {
    projectId: string;
    modelId: string;
    userId: string;
  },
  message: string,
  isDelete = true
): Promise<AxiosResponse<any>> => {
  const method = isDelete ? "DELETE" : "PUT";
  return await axios({
    url: `${SERVER_TILES_API}/v1/models?message=${message}`,
    method,
    responseType: "json",
    data,
  });
};
/**
 *
 * @param data
 * @param chunkSize
 */
const insertInChunks = async (
  data: {
    modelId: string;
    name: string;
    data: {[id: number]: any};
  }[],
  chunkSize: number
) => {
  const promises = [];

  try {
    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.slice(i, i + chunkSize);
      promises.push(storageServerProperty(chunk));
    }
    await Promise.all(promises);
  } catch (error) {
    console.log(`Error property`);
  }
};
/**
 *
 */
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

    const {projectId, modelId, name, userId} = input;
    // we tell managerServer create a model
    await createModel({projectId, modelId, name, userId});
    // upload ifc file in cloud with pako compress
    await uploadLarge(
      awsClient,
      payload,
      projectId,
      `${modelId}/${name}`,
      "application/octet-stream"
    );
    const modelTree = await new IfcGeometryJson(webIfc).streamFromBuffer();
    // upload modelTree in cloud with pako compress
    await uploadLarge(
      awsClient,
      pako.deflate(Buffer.from(JSON.stringify(modelTree))),
      projectId,
      `${modelId}/modelTree`,
      "application/octet-stream"
    );

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
      const settings = {assets, geometries};
      try {
        await Promise.all([
          // setting will decided which element(fragment) will loaded or visibility
          await uploadSmall(
            awsClient,
            pako.deflate(Buffer.from(JSON.stringify(settings))),
            projectId,
            `${modelId}/Settings`,
            "application/octet-stream"
          ),
          // fragmentGroup will decided group ( data, keyFragments)
          await uploadSmall(
            awsClient,
            groupBuffer,
            projectId,
            `${modelId}/fragmentsGroup.frag`,
            "application/octet-stream"
          ),
          ...propertyStorageFiles.map(
            async ({name, bits}: {name: string; bits: any}) => {
              if (typeof bits === "string") {
                await uploadSmall(
                  awsClient,
                  pako.deflate(Buffer.from(bits)),
                  projectId,
                  `${modelId}/${name}`,
                  "application/octet-stream"
                );
              } else {
                await uploadSmall(
                  awsClient,
                  pako.deflate(Buffer.from(JSON.stringify(bits))),
                  projectId,
                  `${modelId}/${name}`,
                  "application/octet-stream"
                );
              }
            }
          ),
          ...Object.keys(streamedGeometryFiles).map(
            async (fileName: string) => {
              await uploadSmall(
                awsClient,
                streamedGeometryFiles[fileName] as Uint8Array,
                projectId,
                `${modelId}/${fileName}`,
                "application/octet-stream"
              );
            }
          ),
          ...propertyServerData.map(async ({modelId, name, data}) => {
            await uploadSmall(
              awsClient,
              Buffer.from(JSON.stringify(data)),
              projectId,
              `${modelId}/${name}`,
              "application/json"
            );
          }),
          await updateModel({projectId, modelId, userId}, "onSuccess", false),
        ]);
      } catch (error: any) {
        console.log(error);
        await updateModel({projectId, modelId, userId}, error.message);
      }
      parentPort?.postMessage({
        action: "onSuccess",
        input,
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
    const onPropertiesStreamed = async (payload: {
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
