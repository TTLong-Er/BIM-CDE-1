import {Request, Response, NextFunction} from "express";
import {BaseController} from "./BaseController";
import {configRedis, db, redisClient} from "../db";
import {WithAuthProp} from "@clerk/clerk-sdk-node";
import {getUserInfo} from "./ProjectController";
import {models} from "../db/schema";
import {eq} from "drizzle-orm";
import {onNotify} from "../socket";

export class ModelController extends BaseController<
  typeof models.$inferInsert
> {
  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {projectId, modelId, name, userId} = req.body;
      if (!projectId || !modelId || !name || !userId)
        return next({
          statusCode: 403,
          message: "Missing Data",
        });
      await this.db
        .insert(models)
        .values({name, projectId, id: modelId, status: "processing"});

      const userProjects = await getUserInfo(userId);
      await redisClient.set(userId, JSON.stringify(userProjects), configRedis);
      const project = userProjects.find((p) => p.id === projectId);
      if (project !== undefined) onNotify(userId, project);
      res.status(200).json({projects: userProjects});
    } catch (error: any) {
      next(error);
    }
  };
  /**
   *
   * @param req
   * @param res
   * @param next
   */
  read = async (_req: Request, _res: Response, _next: NextFunction) => {};
  /**
   *
   * @param req
   * @param res
   * @param next
   */
  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {projectId, modelId, userId} = req.body;
      if (!projectId || !modelId || !userId)
        return next({
          statusCode: 403,
          message: "Missing Data",
        });
      // update
      await this.db
        .update(models)
        .set({status: "success"})
        .where(eq(models.id, modelId));
      const userProjects = await getUserInfo(userId);

      await redisClient.set(userId, JSON.stringify(userProjects), configRedis);

      const {message} = req.query;

      if (message) {
        const project = userProjects.find((p) => p.id === projectId);
        if (project !== undefined) onNotify(userId, project);
      }
      res.status(200).json({projects: userProjects});
    } catch (error: any) {
      next(error);
    }
  };
  /**
   *
   * @param req
   * @param res
   * @param next
   * @returns
   */
  delete = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {projectId, modelId, userId} = req.body;
      if (!projectId || !modelId || !userId)
        return next({
          statusCode: 403,
          message: "Missing Data",
        });

      await this.db.delete(models).where(eq(models.id, modelId));

      const userProjects = await getUserInfo(userId);

      await redisClient.set(userId, JSON.stringify(userProjects), configRedis);
      const {message} = req.query;
      if (message) {
        const project = userProjects.find((p) => p.id === projectId);
        if (project !== undefined) onNotify(userId, project);
      }
      res.status(200).json({projects: userProjects});
    } catch (error: any) {
      next(error);
    }
  };
  /**
   *
   * @param req
   * @param res
   * @param next
   */
  bulkInsert = async (_req: Request, _res: Response, next: NextFunction) => {
    try {
    } catch (error: any) {
      next(error);
    }
  };
  /**
   *
   * @param req
   * @param res
   * @param next
   */
  findById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {id} = req.params;
      res.status(200).json({
        id,
      });
    } catch (error: any) {
      next(error);
    }
  };
  /**
   *
   * @param req
   * @param res
   * @param next
   */
  findByDynamicQuery = async (
    _req: Request,
    _res: Response,
    next: NextFunction
  ) => {
    try {
    } catch (error: any) {
      next(error);
    }
  };
}
export const modelController = new ModelController(db);
