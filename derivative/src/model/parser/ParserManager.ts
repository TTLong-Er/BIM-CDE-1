import {Worker} from "worker_threads";
import {resolve} from "path";
import * as fs from "fs";
import {IInputStream, IWorkerAction} from "./types";
import axios, {AxiosResponse} from "axios";

const suffix = process.env.NODE_ENV === "development" ? ".ts" : ".js";
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

    worker.on("message", async (_data: IWorkerAction) => {
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
    const {tempFilePath} = input;
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
}
