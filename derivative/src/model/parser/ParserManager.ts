import {Worker} from "worker_threads";
import {resolve} from "path";
import * as fs from "fs";
import * as pako from "pako";
import axios, {AxiosResponse} from "axios";
import env from "../../config/env";
import {IInputStream, IWorkerAction} from "./types";
import {awsClient, uploadLarge, uploadSmall} from "../../config/AWS3";

const suffix = process.env.NODE_ENV === "development" ? ".ts" : ".js";
const SERVER_TILES_API = env.SERVER_TILES_API;
const PROPERTY_API = env.PROPERTY_API;
const workerPath = "IfcWorker";

export class ParserManager {
  private static readonly maxModel = 20 as const;

  private listWaiting: IInputStream[] = [];

  private currentModelIndex = 0;
  /**
   *
   * @param worker Worker
   * @param type string name of worker
   * @param onHandleStream handle
   * @param onSuccess handle
   * @param onError handle
   */
  private runWorker(data: Uint8Array, input: IInputStream) {
    const {tempFilePath} = input;

    const worker = new Worker(resolve(__dirname, `${workerPath}${suffix}`));

    worker.postMessage({
      action: "onLoad",
      input,
      payload: data,
    } as IWorkerAction);

    worker.on("message", async (data: IWorkerAction) => {
      const {
        action,
        input: {tempFilePath, userId, projectId, modelId},
        payload,
      } = data;
      if (action === "onError") {
        await this.updateModel({projectId, modelId, userId}, payload);
      } else if (action === "onSuccess") {
        const {
          propertyStorageFiles,
          propertyServerData,
          assets,
          geometries,
          groupBuffer,
          streamedGeometryFiles,
          modelTree,
        } = payload;
        const settings = {assets, geometries};

        try {
          await Promise.all([
            await uploadLarge(
              awsClient,
              pako.deflate(Buffer.from(JSON.stringify(modelTree))),
              projectId,
              `${modelId}/modelTree`,
              "application/octet-stream"
            ),
            await uploadSmall(
              awsClient,
              pako.deflate(Buffer.from(JSON.stringify(settings))),
              projectId,
              `${modelId}/Settings`,
              "application/octet-stream"
            ),
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
            await this.insertInChunks(propertyServerData, 10),
            await this.updateModel(
              {projectId, modelId, userId},
              "onSuccess",
              false
            ),
          ]);
        } catch (error: any) {
          console.log(error);
          await this.updateModel({projectId, modelId, userId}, error.message);
        }
      }
      this.currentModelIndex--;

      const first = this.listWaiting[0];

      if (first) {
        await this.streamFile(first);

        this.listWaiting.splice(0, 1);
      }

      this.deleteFile(tempFilePath);

      worker.terminate();
    });
    worker.on("error", (_error: any) => {
      this.currentModelIndex--;
      this.deleteFile(tempFilePath);
    });
  }
  /**
   *
   * @param tempFilePath
   * @returns
   */

  async streamFile(input: IInputStream) {
    const {tempFilePath, projectId, modelId, name, userId} = input;
    // check file exist
    const existedPath = fs.existsSync(tempFilePath);

    if (!existedPath) {
      console.log(`${tempFilePath} does not exist`);
      return;
    }
    // check checkMemory

    try {
      const data = fs.readFileSync(tempFilePath);

      const checkMemory = this.checkWorkerBusy(input);

      if (checkMemory) {
        this.runWorker(data, input);

        this.currentModelIndex++;

        await this.createModel({projectId, modelId, name, userId});
        // upload ifc file
        await uploadLarge(
          awsClient,
          data,
          projectId,
          `${modelId}/${name}`,
          "application/octet-stream"
        );
        // create model in server
      }
    } catch (error: any) {
      console.log(error.message);
      this.deleteFile(tempFilePath);
    }
  }

  /**
   *
   * @param input
   * @returns
   */
  private checkWorkerBusy(input: IInputStream): boolean {
    if (this.currentModelIndex <= ParserManager.maxModel) return true;

    this.listWaiting.push(input);

    return false; // Worker not busy
  }
  /**
   *
   * @param filePath
   */
  private async deleteFile(filePath: string) {
    try {
      fs.unlinkSync(filePath);
      console.log(`File ${filePath} has been deleted.`);
    } catch (err) {
      console.error(err);
    }
  }
  /**
   *
   * @param token
   * @param data
   * @returns
   */
  private createModel = async (data: {
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
  private updateModel = async (
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
  private async insertInChunks(data: any[], chunkSize: number) {
    const promises = [];
    const setProperty = async (data: any[]) => {
      return await axios({
        url: `${PROPERTY_API}/v1/models`,
        method: "POST",
        responseType: "json",
        data,
      });
    };
    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.slice(i, i + chunkSize);
      promises.push(setProperty(chunk));
    }
    await Promise.all(promises);
  }
}
