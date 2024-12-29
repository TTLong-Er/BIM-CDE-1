import {Request, Response, NextFunction} from "express";
import {ParserManager} from "./ParserManager";
import {v4 as uuidv4} from "uuid";
import {UploadedFile} from "express-fileupload";
import {IInputStream} from "./types";

export class Parser {
  private static workerManager = new ParserManager();
  static ifcParser = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      if (!req.files) {
        return next("File's not found");
      }

      const {ifcFile} = req.files;
      const {projectId, userId} = req.body;
      if (!ifcFile || !projectId || !userId) {
        return next(`File key must be "ifcFile"`);
      }
      const listFiles = !Array.isArray(ifcFile)
        ? [ifcFile]
        : (ifcFile as UploadedFile[]);
      await Promise.all(
        listFiles.map(async (file) => {
          const {tempFilePath, name} = file as UploadedFile;
          const modelId = uuidv4();
          const inputStream = {
            tempFilePath,
            name,
            modelId,
            projectId,
            userId,
          } as IInputStream;

          await this.workerManager.streamFile(inputStream);
        })
      );

      return res.status(200).json({
        fileName: listFiles.map((f) => f.name),
        mode: "onProcess",
      });
    } catch (error) {
      return next(error);
    }
  };
}
