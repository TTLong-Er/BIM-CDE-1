import os from "os";
import {Worker} from "worker_threads";
import {resolve} from "path";
import * as fs from "fs";
import {IInputStream, IWorkerAction} from "./types";

const suffix = process.env.NODE_ENV === "development" ? ".ts" : ".js";
const workerPath = "IfcWorker";

export class ParserManager {
  // Determine the maximum number of workers based on available CPU cores.
  // We reserve 1 core for the system, 1 for Docker, and 1 for the main thread.
  private static readonly maxModel = Math.max(os.cpus().length - 3, 1);

  private listWaiting: IInputStream[] = []; // Queue for pending tasks
  private currentModelIndex = 0; // Number of active workers

  /**
   * Launch a worker to process a given file
   * @param data File data as a Uint8Array
   * @param input Input metadata
   */
  private runWorker(data: Uint8Array, input: IInputStream) {
    const {tempFilePath} = input;
    const worker = new Worker(resolve(__dirname, `${workerPath}${suffix}`));

    // Send data to the worker
    worker.postMessage({
      action: "onLoad",
      input,
      payload: data,
    } as IWorkerAction);

    // Handle worker completion
    worker.on("message", (_data: IWorkerAction) => {
      this.currentModelIndex--; // Reduce active worker count
      this.deleteFile(tempFilePath); // Delete the processed file
      worker.terminate(); // Terminate worker to free memory
      this.processNextInQueue(); // Check and process the next task in the queue
    });

    // Handle worker errors
    worker.on("error", (error) => {
      console.error("Worker error:", error);
      this.currentModelIndex--;
      this.deleteFile(tempFilePath);
      this.processNextInQueue();
    });
  }

  /**
   * Process a file and delegate it to a worker
   * @param input Input metadata
   */
  async streamFile(input: IInputStream) {
    const {tempFilePath} = input;

    // Check if the file exists
    if (!fs.existsSync(tempFilePath)) {
      console.log(`${tempFilePath} does not exist`);
      return;
    }

    try {
      const data = fs.readFileSync(tempFilePath);

      // Check if a worker is available
      if (this.checkWorkerBusy(input)) {
        this.runWorker(data, input);
        this.currentModelIndex++; // Increase active worker count
      }
    } catch (error: any) {
      console.error("Error reading file:", error.message);
      this.deleteFile(tempFilePath);
    }
  }

  /**
   * Check if there is an available worker
   * @param input Input metadata
   * @returns true if a worker is available, false if the task needs to be queued
   */
  private checkWorkerBusy(input: IInputStream): boolean {
    if (this.currentModelIndex < ParserManager.maxModel) {
      return true; // A worker is available
    }

    // Add the task to the queue if all workers are busy
    this.listWaiting.push(input);
    return false;
  }

  /**
   * Process the next task in the queue if a worker is available
   */
  private processNextInQueue() {
    if (
      this.listWaiting.length > 0 &&
      this.currentModelIndex < ParserManager.maxModel
    ) {
      const nextTask = this.listWaiting.shift(); // Get the first task from the queue
      if (nextTask) {
        this.streamFile(nextTask);
      }
    }
  }

  /**
   * Delete a file after it has been processed
   * @param filePath Path of the file to delete
   */
  private deleteFile(filePath: string) {
    try {
      fs.unlinkSync(filePath);
      console.log(`File ${filePath} has been deleted.`);
    } catch (err) {
      console.error("Error deleting file:", err);
    }
  }
}
